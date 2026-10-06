import assert from 'assert';
import crypto from 'crypto';
import { test, describe, before, after, beforeEach } from 'node:test';
import { NextRequest } from 'next/server';
import { fakePostgrest, resetTables, tables } from './helpers/fake-postgrest';
import { speakWithFallback, transcribeWithFallback, setVoiceSecretGetterForTests, PLATFORM_VOICE_PROFILE, listProviderVoices } from '../lib/voice/engine';
import { pcmToWav } from '../lib/voice/providers/gemini';
import { splitSentences, toSpeakable } from '../lib/voice/spoken';
import { DEFAULT_REPLY_STYLE } from '../lib/voice/profile-spec';
import { archiveVoiceProfile, createVoiceProfile, getVoiceProfile, resolveVoiceProfile, updateVoiceProfile } from '../lib/services/voice-profiles';
import { speakBody } from '../lib/services/voice-api';
import { createSession, updateSession } from '../lib/services/agent-sessions';
import { createTeam, createTeamSession, getTeam } from '../lib/services/teams';
import { startTurn } from '../lib/services/agent-run-api';
import { listConversations, getConversation } from '../lib/services/conversations';
import { testProviderConnection } from '../lib/secrets/secrets-service';
import { POST as TRANSCRIBE } from '../app/api/v1/voice/transcribe/route';
import { POST as SPEAK } from '../app/api/v1/voice/speak/route';
import { GET as LIST_CONVERSATIONS } from '../app/api/v1/conversations/route';
import type { LLMGenerateOptions, LLMGenerateResult } from '../lib/agent/providers/llm-adapter';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ctx = { tenantId: TENANT, userId: crypto.randomUUID(), authMode: 'session' as const, scopes: ['*'] };
const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

/** Keys this org has, per BYOK provider. */
let keys: Record<string, string> = {};

/** Fake voice providers. */
const providers = {
  calls: [] as string[],
  elevenlabsStatus: 200,
  geminiTts: 'ok' as 'ok' | '429',
};

async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.hostname === 'api.elevenlabs.io') {
    providers.calls.push(`elevenlabs ${url.pathname}`);
    if (providers.elevenlabsStatus !== 200) return new Response('{"detail":"quota_exceeded"}', { status: providers.elevenlabsStatus });
    if (url.pathname === '/v1/speech-to-text') return Response.json({ text: 'hello from eleven' });
    if (url.pathname === '/v1/voices') return Response.json({ voices: [{ voice_id: 'v1', name: 'My Clone', category: 'cloned', preview_url: 'https://x/p.mp3', labels: {} }] });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'audio/mpeg' } });
  }
  if (url.hostname === 'generativelanguage.googleapis.com') {
    const model = url.pathname.split('/models/')[1].split(':')[0];
    providers.calls.push(`gemini ${model}`);
    const body = JSON.parse(String(init?.body));
    if (body.generationConfig?.responseModalities) {
      if (providers.geminiTts === '429') return new Response('{"error":{"status":"RESOURCE_EXHAUSTED"}}', { status: 429 });
      assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Kore');
      return Response.json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: Buffer.alloc(480).toString('base64') } }] } }] });
    }
    assert.ok(body.contents[0].parts[0].inline_data.data, 'audio is sent inline');
    return Response.json({ candidates: [{ content: { parts: [{ text: 'hello from gemini' }] } }] });
  }
  if (url.hostname === 'api.x.ai' && url.pathname === '/v1/models') {
    const ok = (init?.headers as Record<string, string>)?.Authorization === 'Bearer xai-good';
    return ok ? Response.json({ data: [] }) : new Response('bad key', { status: 401 });
  }
  return fakePostgrest(input, init);
}

describe('Voice: engine, profiles, voice turns, conversations', () => {
  const realFetch = globalThis.fetch;
  before(() => {
    globalThis.fetch = fakeFetch as typeof fetch;
    setVoiceSecretGetterForTests(async (tenantId, provider) => (tenantId === TENANT ? keys[provider] ?? null : null));
  });
  after(() => {
    globalThis.fetch = realFetch;
    setVoiceSecretGetterForTests(null);
  });
  beforeEach(() => {
    keys = { gemini: 'g-key' };
    providers.calls = [];
    providers.elevenlabsStatus = 200;
    providers.geminiTts = 'ok';
    resetTables(['voice_profiles', 'voice_usage', 'agent_sessions', 'agent_teams', 'team_workers', 'agent_runs', 'checkpoints', 'run_events', 'encrypted_secrets', 'supervisor_tasks', 'mcp_profiles', 'context_profiles']);
    tables.encrypted_secrets.push({ tenant_id: TENANT, provider: 'gemini', updated_at: '2026-01-01', encrypted_payload: {} });
  });

  test('the chosen provider serves the request; a quota error falls back to Gemini; no keys at all → browser', async () => {
    keys.elevenlabs = 'el-key';
    const profile = { ...PLATFORM_VOICE_PROFILE, stt: { provider: 'elevenlabs' as const }, tts: { provider: 'elevenlabs' as const, voice_id: 'v1' } };
    const heard = await transcribeWithFallback(TENANT, profile, Buffer.from('audio'), 'audio/webm', 4);
    assert.deepEqual(heard, { text: 'hello from eleven', provider: 'elevenlabs', attempts: [] });

    providers.elevenlabsStatus = 429;
    const spoken = await speakWithFallback(TENANT, profile, 'Hi there.');
    assert.ok(!('fallback' in spoken));
    if (!('fallback' in spoken)) {
      assert.equal(spoken.provider, 'gemini');
      assert.equal(spoken.mime, 'audio/wav');
      assert.match(spoken.attempts[0].error, /quota/);
    }

    keys = {};
    assert.deepEqual(await speakWithFallback(TENANT, PLATFORM_VOICE_PROFILE, 'Hi'), {
      fallback: 'browser',
      attempts: [{ provider: 'gemini', error: 'no key for this organization' }],
    });
    // Without fallback, a failure is an error instead of a silent switch.
    await assert.rejects(speakWithFallback(TENANT, { ...profile, fallback: false }, 'Hi'), /No text-to-speech provider/);
  });

  test('daily caps skip a provider and usage is counted per day and provider', async () => {
    const capped = { ...PLATFORM_VOICE_PROFILE, daily_caps: { gemini: { tts_chars: 10 } } };
    const first = await speakWithFallback(TENANT, capped, 'Short one');
    assert.equal('provider' in first && first.provider, 'gemini');
    assert.equal(tables.voice_usage[0].tts_chars, 9);
    const second = await speakWithFallback(TENANT, capped, 'Over the cap now');
    assert.deepEqual(second, { fallback: 'browser', attempts: [{ provider: 'gemini', error: 'daily cap reached' }] });

    await transcribeWithFallback(TENANT, PLATFORM_VOICE_PROFILE, Buffer.from('a'), 'audio/webm', 7);
    await transcribeWithFallback(TENANT, PLATFORM_VOICE_PROFILE, Buffer.from('a'), 'audio/webm', 5);
    assert.equal(tables.voice_usage.find((u) => u.provider === 'gemini')!.stt_seconds, 12);
  });

  test('Gemini PCM becomes a valid WAV; replies become speakable sentences', () => {
    const wav = pcmToWav(Buffer.alloc(100), 24_000);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.readUInt32LE(24), 24_000);
    assert.equal(wav.readUInt32LE(40), 100);
    assert.equal(wav.length, 144);

    const spoken = toSpeakable('## Board\n- **Two** tasks are open: see [the board](https://x.y/z).\n```js\nconsole.log(1)\n```\nCall `list_tasks` next.');
    assert.ok(!/[#*`\[\]]|https?:/.test(spoken), spoken);
    assert.match(spoken, /Two tasks are open: see the board/);
    const chunks = splitSentences('One. Two is a bit longer. Three! Four?', 20);
    assert.ok(chunks.length >= 2 && chunks.every((c) => c.length <= 20));
  });

  test('profiles: CRUD, tenant isolation, session over team resolution, archive detaches', async () => {
    const profile = await createVoiceProfile(ctx, {
      name: 'Support voice',
      stt: { provider: 'gemini' },
      tts: { provider: 'xai', voice_id: 'ara' },
      reply_style: 'Be brief.',
    });
    assert.equal(profile.fallback, true);
    await assert.rejects(createVoiceProfile(ctx, { name: 'x', stt: { provider: 'nope' }, tts: { provider: 'gemini' } }));
    await assert.rejects(getVoiceProfile({ tenantId: OTHER }, profile.id), /not found/i);
    const updated = await updateVoiceProfile(ctx, profile.id, { name: 'Support', stt: profile.stt, tts: profile.tts });
    assert.equal(updated.name, 'Support');

    const team = await createTeam(ctx, { name: 'Desk', llm: { provider: 'gemini' }, supervisor: { tools: [] }, voice: { profile_id: profile.id } });
    assert.equal((await getTeam(ctx, team.id)).voice_profile_id, profile.id);
    await assert.rejects(createTeam(ctx, { name: 'Bad', llm: { provider: 'gemini' }, supervisor: { tools: [] }, voice: { profile_id: crypto.randomUUID() } }), /not found/i);
    const session = await createTeamSession(ctx, team.id);
    assert.equal((await resolveVoiceProfile(ctx, session.id))?.id, profile.id, 'inherits the team profile');

    const own = await createVoiceProfile(ctx, { name: 'Own', stt: { provider: 'gemini' }, tts: { provider: 'gemini' } });
    await updateSession(ctx, session.id, { voice_profile_id: own.id });
    assert.equal((await resolveVoiceProfile(ctx, session.id))?.id, own.id, 'the instance profile wins');

    await archiveVoiceProfile(ctx, own.id);
    assert.equal((await resolveVoiceProfile(ctx, session.id))?.id, profile.id, 'archived profile is detached');
    await assert.rejects(resolveVoiceProfile({ tenantId: OTHER }, session.id), /not found/i);
  });

  test('a voice turn is a normal run marked voice; the reply style reaches the model only then', async () => {
    const prompts: string[] = [];
    const deps = {
      getSecret: async () => 'k',
      generate: async (o: LLMGenerateOptions) => {
        prompts.push(o.systemPrompt || '');
        return { text: 'Two tasks are open.', usage, finishReason: 'stop' } as LLMGenerateResult;
      },
    };
    const session = await createSession(ctx, { name: 'Helper', provider: 'gemini' });
    const profile = await createVoiceProfile(ctx, { name: 'Brief', stt: { provider: 'gemini' }, tts: { provider: 'gemini' }, reply_style: 'Answer in one sentence.' });
    await updateSession(ctx, session.id, { voice_profile_id: profile.id });

    const spoken = await startTurn(ctx, session.id, 'what is on the board', { deps, channel: 'voice', voice: { stt_provider: 'gemini', audio_seconds: 3 } });
    assert.equal(spoken.status, 200);
    assert.equal((spoken.body as any).channel, 'voice');
    assert.match(prompts[0], /voice conversation[\s\S]*Answer in one sentence\./);
    const run = tables.agent_runs[0];
    assert.equal(run.channel, 'voice');
    assert.deepEqual(run.voice, { stt_provider: 'gemini', audio_seconds: 3 });

    await startTurn(ctx, session.id, 'thanks', { deps });
    assert.ok(!/voice conversation/.test(prompts[1]), 'typed turns are unchanged');
    assert.equal(tables.agent_runs[1].channel, 'text');

    // No profile: the default spoken style.
    const plain = await createSession(ctx, { name: 'Plain', provider: 'gemini' });
    await startTurn(ctx, plain.id, 'hi', { deps, channel: 'voice' });
    assert.ok(prompts[2].includes(DEFAULT_REPLY_STYLE));
  });

  test('conversations list every instance with its kind and voice badge; details show runs; orgs are isolated', async () => {
    const deps = { getSecret: async () => 'k', generate: async () => ({ text: 'ok', usage, finishReason: 'stop' }) as LLMGenerateResult };
    const chat = await createSession(ctx, { name: 'Chat', provider: 'gemini' });
    const team = await createTeam(ctx, { name: 'Crew', llm: { provider: 'gemini' }, supervisor: { tools: [] } });
    const teamSession = await createTeamSession(ctx, team.id, 'Crew · morning');
    const heartbeat = await createTeamSession(ctx, team.id, 'Crew · Heartbeat');
    tables.agent_teams.find((t) => t.id === team.id)!.heartbeat_session_id = heartbeat.id;
    const taskSession = await createTeamSession(ctx, team.id, 'Task · digest');
    tables.supervisor_tasks.push({ id: crypto.randomUUID(), tenant_id: TENANT, title: 'digest', session_id: taskSession.id, status: 'scheduled' });
    await startTurn(ctx, chat.id, 'hello by voice', { deps, channel: 'voice', voice: { stt_provider: 'browser' } });
    await startTurn(ctx, teamSession.id, 'typed', { deps });

    const { conversations, counts } = await listConversations(ctx);
    const byName = Object.fromEntries(conversations.map((c) => [c.name, c]));
    assert.equal(byName.Chat.kind, 'agent');
    assert.equal(byName.Chat.voice, true);
    assert.equal(byName['Crew · morning'].kind, 'team');
    assert.equal(byName['Crew · morning'].voice, false);
    assert.equal(byName['Crew · Heartbeat'].kind, 'heartbeat');
    assert.equal(byName['Task · digest'].kind, 'task');
    assert.equal(counts.voice, 1);
    assert.equal((await listConversations(ctx, { voice: true })).conversations.length, 1);
    assert.equal((await listConversations(ctx, { kind: 'heartbeat' })).conversations[0].name, 'Crew · Heartbeat');
    assert.equal((await listConversations(ctx, { q: 'digest' })).conversations.length, 1);

    const detail = await getConversation(ctx, chat.id);
    assert.equal(detail.runs[0].channel, 'voice');
    assert.equal(detail.transcript[0].content, 'hello by voice');
    assert.equal(detail.transcript[1].content, 'ok');
    assert.equal((await listConversations({ ...ctx, tenantId: OTHER })).conversations.length, 0);
    await assert.rejects(getConversation({ ...ctx, tenantId: OTHER }, chat.id), /not found/i);
  });

  test('voices list includes cloned ElevenLabs voices; xAI keys are verified; routes need auth; speak input is capped', async () => {
    keys.elevenlabs = 'el';
    const { voices, configured } = await listProviderVoices(TENANT, 'elevenlabs');
    assert.equal(configured, true);
    assert.deepEqual(voices[0], { id: 'v1', name: 'My Clone', description: undefined, previewUrl: 'https://x/p.mp3', custom: true });
    assert.equal((await listProviderVoices(TENANT, 'xai')).voices.length, 5);

    assert.equal((await testProviderConnection('xai', 'xai-good')).success, true);
    assert.equal((await testProviderConnection('xai', 'xai-bad')).success, false);

    assert.equal(speakBody.safeParse({ text: 'x'.repeat(601) }).success, false);
    assert.equal(speakBody.safeParse({ text: 'hello', session_id: crypto.randomUUID() }).success, true);

    const prev = { a: process.env.DEMO_MODE, b: process.env.NEXT_PUBLIC_DEMO_MODE };
    process.env.DEMO_MODE = 'false';
    process.env.NEXT_PUBLIC_DEMO_MODE = 'false';
    try {
      const form = new FormData();
      form.append('audio', new Blob([new Uint8Array([1])], { type: 'audio/webm' }), 'a');
      assert.equal((await TRANSCRIBE(new NextRequest('https://app.test/api/v1/voice/transcribe', { method: 'POST', body: form }))).status, 401);
      assert.equal((await SPEAK(new NextRequest('https://app.test/api/v1/voice/speak', { method: 'POST', body: JSON.stringify({ text: 'hi' }) }))).status, 401);
      assert.equal((await LIST_CONVERSATIONS(new NextRequest('https://app.test/api/v1/conversations'))).status, 401);
    } finally {
      process.env.DEMO_MODE = prev.a;
      process.env.NEXT_PUBLIC_DEMO_MODE = prev.b;
    }
  });
});
