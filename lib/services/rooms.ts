import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { twilio, isE164 } from '@/lib/rooms/adapters/twilio';
import { attrs, esc, response, say, speechLanguage } from '@/lib/rooms/twiml';
import { elevenLabsSipUri } from '@/lib/rooms/elevenlabs';
import { TURN_BASED_CAPABILITIES, TWILIO_CONFERENCE_CAPABILITIES, type Trigger } from '@/lib/rooms/types';
import { speakWithFallback, PLATFORM_VOICE_PROFILE } from '@/lib/voice/engine';
import { presignedAudioUrl } from '@/lib/voice/audio-cache';
import { splitSentences, toSpeakable } from '@/lib/voice/spoken';
import { createTeamSession, getTeam } from './teams';
import { updateSession } from './agent-sessions';
import { getContextProfile, contextProfileInstructions } from './context-profiles';
import { getVoiceProfile } from './voice-profiles';
import { claimRun, dispatchRun, executeRun, getRun, startRun, waitForRun, workerConfigured } from './agent-runs';
import { credsFor, hasCallCompliance, requireConnection, twilioHookUrl, connectionSecrets } from './telephony';
import { loadVoiceAgent, voiceAgentSecrets, withinCallingHours } from './voice-agents';
import { ServiceError, isServiceError } from './errors';

/**
 * Live Rooms: one room per live conversation on the org's own Twilio account.
 *  - Ear: Twilio real-time transcription posts each final sentence per track → utterances.
 *  - Voice Front: an ElevenLabs agent dialed into the conference over SIP (X-Room-Id),
 *    or the platform's turn-based loop (<Gather> → team run → our TTS via <Play>).
 *  - Listener team: triggers (keywords, silence, cadence) start runs that post notes.
 *  - People listen in from the browser (muted conference participant).
 * All handlers are short requests; Twilio and ElevenLabs carry the audio.
 */

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode'> & { apiKeyId?: string | null; teamId?: string | null };
type Row = Record<string, any>;

const ROOM_COLUMNS =
  'id, tenant_id, provider, provider_room_sid, conference_name, kind, status, voice_agent_id, mode, session_id, listener_session_id, customer_number, agent_number, purpose, capabilities, trigger_state, summary, recording_key, end_reason, started_at, ended_at, created_at, updated_at';
const PARTICIPANT_COLUMNS = 'id, room_id, tenant_id, role, call_sid, label, address, muted, coaching_call_sid, status, joined_at, left_at, created_at';

export const DAILY_OUTBOUND_CAP = 200;
export const CONCURRENT_CALL_CAP = 10;
const ASK_TEAM_WAIT_MS = 8_000;
const TURN_WAIT_MS = 8_000;
const TRIGGER_COOLDOWN_MS = 60_000;
const UTTERANCE_RETENTION_DAYS = 90;

const DEFAULT_CONSENT: Record<string, string> = {
  es: 'Esta llamada puede ser grabada y atendida por un asistente de inteligencia artificial.',
  en: 'This call may be recorded and is handled by an AI assistant.',
};
const consentText = (agent: Row) => agent.consent_message || DEFAULT_CONSENT[String(agent.language).slice(0, 2)] || DEFAULT_CONSENT.en;
const HOLD: Record<string, string> = { es: 'Un momento, por favor.', en: 'One moment, please.' };
const holdText = (lang: string) => HOLD[lang.slice(0, 2)] ?? HOLD.en;

function systemCtx(tenantId: string): AuthContext {
  return { tenantId, userId: 'rooms', role: 'system', scopes: ['*'], authMode: 'webhook_signature' };
}

const db = () => getSupabaseAdminClient();

async function updateRoom(id: string, fields: Row) {
  await db().from('rooms').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);
}

export async function loadRoom(id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db().from('rooms').select(ROOM_COLUMNS).eq('id', id).maybeSingle();
  return data ?? null;
}

async function roomForTenant(tenantId: string, id: string | undefined | null): Promise<Row> {
  if (!id) throw new ServiceError('room_id is required (it is filled in automatically during a live call).', 'INVALID');
  const room = await loadRoom(id);
  if (!room || room.tenant_id !== tenantId) throw new ServiceError('Call not found in this organization.', 'NOT_FOUND');
  return room;
}

// ---------------------------------------------------------------------------
// Rooms, participants, utterances, notes
// ---------------------------------------------------------------------------

async function createRoom(p: { tenantId: string; kind: 'phone_in' | 'phone_out' | 'browser'; agent: Row; customerNumber: string | null; agentNumber: string | null; purpose?: string | null }) {
  const ctx = systemCtx(p.tenantId);
  const id = crypto.randomUUID();
  const label = p.customerNumber ? `Call · ${p.customerNumber}` : 'Call';
  const session = await createTeamSession(ctx, p.agent.team_id, label.slice(0, 120));
  if (p.agent.voice_profile_id) await updateSession(ctx, session.id, { voice_profile_id: p.agent.voice_profile_id }).catch(() => undefined);
  const now = new Date().toISOString();
  const { data, error } = await db()
    .from('rooms')
    .insert({
      id,
      tenant_id: p.tenantId,
      provider: 'twilio',
      conference_name: `cc-${id}`,
      kind: p.kind,
      status: 'ringing',
      voice_agent_id: p.agent.id,
      mode: p.agent.mode,
      session_id: session.id,
      customer_number: p.customerNumber,
      agent_number: p.agentNumber,
      purpose: p.purpose ?? null,
      capabilities: p.agent.mode === 'turn_based' ? TURN_BASED_CAPABILITIES : TWILIO_CONFERENCE_CAPABILITIES,
      trigger_state: {},
      created_at: now,
      updated_at: now,
    })
    .select(ROOM_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not create the room: ${error?.message}`);
  return data as Row;
}

async function addParticipantRow(room: Row, p: { role: string; call_sid?: string | null; label?: string; address?: string | null; muted?: boolean; status?: string }) {
  const { data } = await db()
    .from('room_participants')
    .insert({ room_id: room.id, tenant_id: room.tenant_id, role: p.role, call_sid: p.call_sid ?? null, label: p.label ?? p.role, address: p.address ?? null, muted: !!p.muted, status: p.status ?? 'dialing', created_at: new Date().toISOString() })
    .select(PARTICIPANT_COLUMNS)
    .single();
  return data as Row;
}

async function participantByCall(roomId: string, callSid: string): Promise<Row | null> {
  const { data } = await db().from('room_participants').select(PARTICIPANT_COLUMNS).eq('room_id', roomId).eq('call_sid', callSid).maybeSingle();
  return data ?? null;
}

/** Append one utterance with the next per-room sequence number (idempotent by provider_ref). */
export async function appendUtterance(room: Row, u: { speaker_role: string; text: string; source: string; provider_ref?: string | null; start_ms?: number | null; confidence?: number | null; participant_id?: string | null }) {
  const text = u.text.trim();
  if (!text) return null;
  if (u.provider_ref) {
    const { data: dup } = await db().from('utterances').select('id').eq('room_id', room.id).eq('provider_ref', u.provider_ref).maybeSingle();
    if (dup) return null;
  }
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: last } = await db().from('utterances').select('seq').eq('room_id', room.id).order('seq', { ascending: false }).limit(1);
    const seq = (last?.[0]?.seq ?? 0) + 1;
    const { data, error } = await db()
      .from('utterances')
      .insert({ room_id: room.id, tenant_id: room.tenant_id, seq, speaker_role: u.speaker_role, participant_id: u.participant_id ?? null, text: text.slice(0, 4000), start_ms: u.start_ms ?? null, confidence: u.confidence ?? null, source: u.source, provider_ref: u.provider_ref ?? null, created_at: new Date().toISOString() })
      .select('id, seq, speaker_role, text, created_at')
      .single();
    if (!error && data) {
      await evaluateUtteranceTriggers(room, data).catch((err) => console.error('[rooms] trigger failed', err));
      return data;
    }
    if (error?.code !== '23505') throw new Error(`Could not save the utterance: ${error?.message}`);
    if (u.provider_ref) {
      const { data: dup } = await db().from('utterances').select('id').eq('room_id', room.id).eq('provider_ref', u.provider_ref).maybeSingle();
      if (dup) return null;
    }
  }
  throw new Error('Could not save the utterance (too many concurrent writes).');
}

export async function addNote(room: Row, note: { text: string; level?: 'info' | 'warn' | 'alert'; author: string; data?: Row | null }) {
  const { data } = await db()
    .from('room_notes')
    .insert({ room_id: room.id, tenant_id: room.tenant_id, level: note.level ?? 'info', text: note.text.slice(0, 2000), data: note.data ?? null, author: note.author.slice(0, 80), created_at: new Date().toISOString() })
    .select('id, level, text, author, created_at')
    .single();
  return data;
}

// ---------------------------------------------------------------------------
// Reading (UI)
// ---------------------------------------------------------------------------

export async function listRooms(ctx: Pick<Ctx, 'tenantId'>, opts: { live?: boolean; limit?: number } = {}) {
  let q = db().from('rooms').select(ROOM_COLUMNS).eq('tenant_id', ctx.tenantId).order('created_at', { ascending: false }).limit(Math.min(opts.limit ?? 50, 200));
  if (opts.live) q = q.in('status', ['ringing', 'live']);
  const { data } = await q;
  const agents = new Map<string, string>();
  const { data: va } = await db().from('voice_agents').select('id, name').eq('tenant_id', ctx.tenantId);
  for (const a of va || []) agents.set(a.id, a.name);
  return (data || []).map((r: Row) => ({ ...presentRoom(r), voice_agent_name: agents.get(r.voice_agent_id) ?? null }));
}

function presentRoom(r: Row) {
  const { tenant_id: _t, trigger_state: _ts, ...rest } = r;
  return rest;
}

export async function getRoomDetail(ctx: Pick<Ctx, 'tenantId'>, id: string) {
  const room = await roomForTenant(ctx.tenantId, id);
  const [participants, utterances, notes] = await Promise.all([
    db().from('room_participants').select(PARTICIPANT_COLUMNS).eq('room_id', room.id).order('created_at', { ascending: true }),
    db().from('utterances').select('seq, speaker_role, text, source, created_at').eq('room_id', room.id).order('seq', { ascending: true }).limit(500),
    db().from('room_notes').select('id, level, text, author, created_at').eq('room_id', room.id).order('created_at', { ascending: true }).limit(200),
  ]);
  let agent: Row | null = null;
  if (room.voice_agent_id) agent = await loadVoiceAgent(room.tenant_id, room.voice_agent_id).catch(() => null);
  return {
    room: presentRoom(room),
    voice_agent: agent ? { id: agent.id, name: agent.name, mode: agent.mode } : null,
    participants: (participants.data || []).map(({ tenant_id: _t, ...p }: Row) => p),
    utterances: utterances.data || [],
    notes: notes.data || [],
  };
}

export async function utterancesSince(ctx: Pick<Ctx, 'tenantId'>, id: string, since: number) {
  const room = await roomForTenant(ctx.tenantId, id);
  const [{ data: utterances }, { data: notes }] = await Promise.all([
    db().from('utterances').select('seq, speaker_role, text, source, created_at').eq('room_id', room.id).gte('seq', since + 1).order('seq', { ascending: true }).limit(500),
    db().from('room_notes').select('id, level, text, author, created_at').eq('room_id', room.id).order('created_at', { ascending: true }).limit(200),
  ]);
  return { status: room.status, utterances: utterances || [], notes: notes || [] };
}

/** End a live room (hang up everyone). */
export async function endRoom(ctx: Pick<Ctx, 'tenantId'>, id: string) {
  const room = await roomForTenant(ctx.tenantId, id);
  if (room.status === 'ended' || room.status === 'failed') return presentRoom(room);
  const { creds } = await requireConnection(ctx.tenantId);
  if (room.provider_room_sid) await twilio.endConference(creds, room.provider_room_sid).catch(() => undefined);
  const { data: parts } = await db().from('room_participants').select('call_sid, left_at').eq('room_id', room.id);
  for (const p of parts || []) if (p.call_sid && !p.left_at) await twilio.hangup(creds, p.call_sid).catch(() => undefined);
  await finishRoom(room, 'ended by a user');
  return presentRoom({ ...room, status: 'ended' });
}

// ---------------------------------------------------------------------------
// Twilio call flows (called by app/api/voice/twilio/[connectionId]/[action])
// ---------------------------------------------------------------------------

const hangupTwiml = (text: string, lang: string) => response(say(text, lang), '<Hangup/>');

function transcriptionTwiml(conn: Row, room: Row, agent: Row) {
  const url = twilioHookUrl(conn, 'transcription', { room: room.id });
  return `<Start><Transcription${attrs({
    statusCallbackUrl: url,
    languageCode: speechLanguage(agent.language),
    track: 'both_tracks',
    inboundTrackLabel: 'customer',
    outboundTrackLabel: 'agent',
    partialResults: 'false',
  })}/></Start>`;
}

function conferenceTwiml(conn: Row, room: Row, opts: { endOnExit: boolean; muted?: boolean }) {
  return `<Dial><Conference${attrs({
    beep: 'false',
    startConferenceOnEnter: 'true',
    endConferenceOnExit: opts.endOnExit ? 'true' : 'false',
    muted: opts.muted ? 'true' : undefined,
    waitUrl: '',
    statusCallback: twilioHookUrl(conn, 'conference', { room: room.id }),
    statusCallbackEvent: 'start end join leave',
    statusCallbackMethod: 'POST',
  })}>${esc(room.conference_name)}</Conference></Dial>`;
}

/** Incoming call to one of the org's numbers. */
export async function handleIncoming(conn: Row, p: Record<string, string>): Promise<string> {
  const { data: number } = await db().from('phone_numbers').select('id, e164, voice_agent_id').eq('tenant_id', conn.tenant_id).eq('e164', p.To).maybeSingle();
  const agent = number?.voice_agent_id ? await loadVoiceAgent(conn.tenant_id, number.voice_agent_id).catch(() => null) : null;
  if (!agent) return hangupTwiml('This number is not available right now.', 'en');
  const { data: blocked } = await db().from('call_blocklist').select('e164').eq('tenant_id', conn.tenant_id).eq('e164', p.From).maybeSingle();
  if (blocked) return response('<Reject reason="rejected"/>');
  if (!withinCallingHours(agent.calling_hours)) {
    return hangupTwiml(agent.language.startsWith('es') ? 'Gracias por llamar. En este momento estamos fuera de horario.' : 'Thanks for calling. We are closed right now.', agent.language);
  }
  const room = await createRoom({ tenantId: conn.tenant_id, kind: 'phone_in', agent, customerNumber: p.From || null, agentNumber: p.To || null });
  await addParticipantRow(room, { role: 'customer', call_sid: p.CallSid, label: p.From || 'Caller', address: p.From, status: 'answered' });
  if (agent.mode === 'turn_based') {
    await updateRoom(room.id, { status: 'live', started_at: new Date().toISOString() });
    return turnStart(conn, room, agent);
  }
  return response(say(consentText(agent), agent.language), transcriptionTwiml(conn, room, agent), conferenceTwiml(conn, room, { endOnExit: true }));
}

/** TwiML for the customer's leg of an outbound call (after it is answered). */
export async function handleOutboundAnswered(conn: Row, roomId: string, p: Record<string, string>): Promise<string> {
  const room = await loadRoom(roomId);
  if (!room || room.tenant_id !== conn.tenant_id) return response('<Hangup/>');
  const agent = await loadVoiceAgent(room.tenant_id, room.voice_agent_id);
  if (p.AnsweredBy && /^machine|^fax/.test(p.AnsweredBy)) {
    await addNote(room, { text: `Voicemail or machine answered (${p.AnsweredBy}); no message was left.`, level: 'info', author: 'Calls' });
    await finishRoom(room, 'voicemail');
    return response('<Hangup/>');
  }
  if (agent.mode === 'turn_based') {
    await updateRoom(room.id, { status: 'live', started_at: new Date().toISOString() });
    return turnStart(conn, room, agent);
  }
  return response(say(consentText(agent), agent.language), transcriptionTwiml(conn, room, agent), conferenceTwiml(conn, room, { endOnExit: true }));
}

/** Bring the ElevenLabs Voice Front into the room over SIP. */
async function addVoiceFront(conn: Row, room: Row, agent: Row) {
  const el = agent.provider_state?.elevenlabs ?? {};
  if (!el.sip_identifier) {
    await addNote(room, { text: 'The ElevenLabs agent is not set up yet (open the voice agent and save it). The caller is waiting alone.', level: 'alert', author: 'Calls' });
    return;
  }
  const secrets = await voiceAgentSecrets(agent);
  const creds = await credsFor(conn);
  try {
    const res = await twilio.addParticipant(creds, room.conference_name, {
      from: room.agent_number || room.customer_number || '+10000000000',
      to: elevenLabsSipUri(el.sip_identifier, room.id),
      label: 'agent',
      sipAuth: secrets.sip_username ? { username: secrets.sip_username, password: secrets.sip_password } : null,
      statusCallback: twilioHookUrl(conn, 'participant', { room: room.id, role: 'agent' }),
      timeLimit: agent.max_minutes * 60,
    });
    await addParticipantRow(room, { role: 'agent', call_sid: res.call_sid, label: agent.name, address: 'elevenlabs' });
  } catch (err) {
    await addNote(room, { text: `The AI agent could not join: ${(err as Error).message}`, level: 'alert', author: 'Calls' });
  }
}

/** Conference status callbacks. */
export async function handleConferenceEvent(conn: Row, roomId: string, p: Record<string, string>) {
  const room = await loadRoom(roomId);
  if (!room || room.tenant_id !== conn.tenant_id) return;
  const event = p.StatusCallbackEvent;
  if (p.ConferenceSid && !room.provider_room_sid) await updateRoom(room.id, { provider_room_sid: p.ConferenceSid });
  if (event === 'participant-join') {
    const part = p.CallSid ? await participantByCall(room.id, p.CallSid) : null;
    if (part) await db().from('room_participants').update({ status: 'joined', joined_at: new Date().toISOString() }).eq('id', part.id);
    if (part?.role === 'customer' && room.status === 'ringing') {
      await updateRoom(room.id, { status: 'live', started_at: new Date().toISOString() });
      const agent = await loadVoiceAgent(room.tenant_id, room.voice_agent_id).catch(() => null);
      if (agent?.mode === 'elevenlabs') await addVoiceFront(conn, { ...room, provider_room_sid: p.ConferenceSid ?? room.provider_room_sid }, agent);
    }
  } else if (event === 'participant-leave') {
    const part = p.CallSid ? await participantByCall(room.id, p.CallSid) : null;
    if (part) await db().from('room_participants').update({ status: 'left', left_at: new Date().toISOString() }).eq('id', part.id);
  } else if (event === 'conference-end') {
    await finishRoom(room, p.ReasonConferenceEnded || 'conference ended');
  }
}

/** Call status callbacks for legs we dialed (agent SIP leg, outbound customer leg). */
export async function handleParticipantStatus(conn: Row, roomId: string, role: string, p: Record<string, string>) {
  const room = await loadRoom(roomId);
  if (!room || room.tenant_id !== conn.tenant_id) return;
  const status = p.CallStatus;
  const part = p.CallSid ? await participantByCall(room.id, p.CallSid) : null;
  if (part) await db().from('room_participants').update({ status, ...(status === 'completed' ? { left_at: new Date().toISOString() } : {}) }).eq('id', part.id);
  if (['failed', 'busy', 'no-answer', 'canceled'].includes(status)) {
    if (role === 'agent') await addNote(room, { text: `The AI agent leg ended: ${status}${p.SipResponseCode ? ` (SIP ${p.SipResponseCode})` : ''}.`, level: 'alert', author: 'Calls' });
    if (role === 'customer') await finishRoom(room, status, 'failed');
  }
  if (status === 'completed' && role === 'customer' && room.mode === 'turn_based') await finishRoom(room, 'caller hung up');
}

/** Ear: Twilio real-time transcription → utterances. */
export async function handleTranscription(conn: Row, roomId: string, p: Record<string, string>) {
  if (p.TranscriptionEvent !== 'transcription-content' || String(p.Final).toLowerCase() !== 'true') return;
  const room = await loadRoom(roomId);
  if (!room || room.tenant_id !== conn.tenant_id) return;
  let data: { transcript?: string; confidence?: number } = {};
  try {
    data = JSON.parse(p.TranscriptionData || '{}');
  } catch {
    return;
  }
  const label = p.Track === 'inbound_track' ? p.InboundTrackLabel || 'customer' : p.OutboundTrackLabel || 'agent';
  await appendUtterance(room, {
    speaker_role: ['customer', 'agent', 'staff'].includes(label) ? label : 'customer',
    text: data.transcript ?? '',
    confidence: typeof data.confidence === 'number' ? data.confidence : null,
    source: 'twilio_rt',
    provider_ref: `${p.CallSid}:${p.Track}:${p.SequenceId}`,
  });
}

/** Browser joins a room (listen in, muted). The ticket proves a member asked to join this room. */
export async function handleClientJoin(conn: Row, p: Record<string, string>): Promise<string> {
  const roomId = p.room || '';
  const room = await loadRoom(roomId);
  if (!room || room.tenant_id !== conn.tenant_id || !['live', 'ringing'].includes(room.status)) return response(say('This call has ended.', 'en'), '<Hangup/>');
  const identity = String(p.From || '').replace(/^client:/, '');
  if (!(await verifyJoinTicket(conn, room.id, identity, p.ticket || '', p.exp || ''))) return response('<Reject/>');
  await addParticipantRow(room, { role: 'listener', call_sid: p.CallSid, label: identity, muted: true, status: 'joining' });
  return response(conferenceTwiml(conn, room, { endOnExit: false, muted: true }));
}

async function ticketSecret(conn: Row) {
  const s = await connectionSecrets(conn);
  return s.api_key_secret || s.auth_token;
}

export async function joinTicket(ctx: Pick<Ctx, 'tenantId' | 'userId'>, roomId: string) {
  const room = await roomForTenant(ctx.tenantId, roomId);
  if (!room.capabilities?.listenIn) throw new ServiceError('Listening in is not available for this call.', 'CONFLICT');
  if (!['live', 'ringing'].includes(room.status)) throw new ServiceError('This call has ended.', 'CONFLICT');
  const { conn } = await requireConnection(ctx.tenantId);
  const identity = `u_${ctx.userId.replace(/[^a-zA-Z0-9_]/g, '')}`.slice(0, 120);
  const exp = String(Math.floor(Date.now() / 1000) + 300);
  const ticket = crypto.createHmac('sha256', await ticketSecret(conn)).update(`${room.id}:${identity}:${exp}`).digest('hex');
  return { room: room.id, ticket, exp, identity };
}

async function verifyJoinTicket(conn: Row, roomId: string, identity: string, ticket: string, exp: string): Promise<boolean> {
  if (!ticket || !exp || Number(exp) * 1000 < Date.now()) return false;
  const expected = crypto.createHmac('sha256', await ticketSecret(conn)).update(`${roomId}:${identity}:${exp}`).digest('hex');
  return ticket.length === expected.length && crypto.timingSafeEqual(Buffer.from(ticket), Buffer.from(expected));
}

/** End-of-room bookkeeping: once. */
async function finishRoom(room: Row, reason: string, status: 'ended' | 'failed' = 'ended') {
  const { data } = await db()
    .from('rooms')
    .update({ status, end_reason: reason.slice(0, 200), ended_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', room.id)
    .in('status', ['ringing', 'live'])
    .select('id');
  if (!data?.length) return;
  await db().from('room_participants').update({ left_at: new Date().toISOString() }).eq('room_id', room.id).is('left_at', null);
  const agent = room.voice_agent_id ? await loadVoiceAgent(room.tenant_id, room.voice_agent_id).catch(() => null) : null;
  if (agent?.listener_team_id && status === 'ended') {
    await queueListener(room, agent, 'The call ended. Write a short summary (who called, what they wanted, outcome, risks, follow-ups) and post it with contextcontrol_room_note.', 'summary').catch((err) =>
      console.error('[rooms] summary run failed', err)
    );
  }
}

// ---------------------------------------------------------------------------
// Turn-based mode (platform speech; any team)
// ---------------------------------------------------------------------------

async function speechFor(room: Row, agent: Row, text: string): Promise<string> {
  const lang = agent.language;
  const chunks = splitSentences(toSpeakable(text), 400).slice(0, 8);
  if (!chunks.length) return '';
  let profile = PLATFORM_VOICE_PROFILE;
  if (agent.voice_profile_id) profile = await getVoiceProfile({ tenantId: room.tenant_id }, agent.voice_profile_id).catch(() => PLATFORM_VOICE_PROFILE);
  const parts: string[] = [];
  for (const chunk of chunks) {
    try {
      const spoken = await speakWithFallback(room.tenant_id, profile, chunk);
      const url = 'cache_key' in spoken ? await presignedAudioUrl(spoken.cache_key) : null;
      parts.push(url ? `<Play>${esc(url)}</Play>` : say(chunk, lang));
    } catch {
      parts.push(say(chunk, lang));
    }
  }
  return parts.join('');
}

function gatherTwiml(conn: Row, room: Row, agent: Row, inner: string, attempt = 0) {
  return `<Gather${attrs({
    input: 'speech',
    language: speechLanguage(agent.language),
    speechTimeout: 'auto',
    actionOnEmptyResult: 'true',
    action: twilioHookUrl(conn, 'turn', { room: room.id, empty: String(attempt) }),
    method: 'POST',
  })}>${inner}</Gather>`;
}

async function turnStart(conn: Row, room: Row, agent: Row): Promise<string> {
  const greeting = agent.greeting || (agent.language.startsWith('es') ? '¿En qué le puedo ayudar?' : 'How can I help you?');
  if (agent.greeting || greeting) await appendUtterance(room, { speaker_role: 'agent', text: greeting, source: 'agent' });
  return response(say(consentText(agent), agent.language), gatherTwiml(conn, room, agent, await speechFor(room, agent, greeting)));
}

async function startTeamTurn(room: Row, text: string): Promise<string> {
  const ctx = systemCtx(room.tenant_id);
  const run = await startRun(ctx, room.session_id, text, { origin: 'room', roomId: room.id, channel: 'voice' });
  if (workerConfigured()) await dispatchRun(run.id);
  else {
    const owner = `inline-room:${run.id}`;
    void (async () => {
      if (await claimRun(run.id, owner, 10 * 60_000)) await executeRun(run.id, { owner, deadlineAt: Date.now() + 9 * 60_000 });
    })();
  }
  return run.id;
}

async function replyTwiml(conn: Row, room: Row, agent: Row, runId: string, polls: number): Promise<string> {
  const run = await waitForRun(runId, TURN_WAIT_MS, 500);
  if (run && run.status === 'done') {
    const reply = String(run.result?.message || '').trim() || (agent.language.startsWith('es') ? 'Listo.' : 'Done.');
    await appendUtterance(room, { speaker_role: 'agent', text: reply, source: 'agent', provider_ref: `run:${runId}` });
    return response(gatherTwiml(conn, room, agent, await speechFor(room, agent, reply)));
  }
  if (run && (run.status === 'error' || run.status === 'cancelled')) {
    const sorry = agent.language.startsWith('es') ? 'Disculpe, tuve un problema. ¿Puede repetirlo?' : 'Sorry, I had a problem. Could you say that again?';
    return response(gatherTwiml(conn, room, agent, say(sorry, agent.language)));
  }
  if (polls >= 6) {
    return response(say(agent.language.startsWith('es') ? 'Esto está tardando; le daremos seguimiento. Gracias.' : 'This is taking longer; we will follow up. Thank you.', agent.language), '<Hangup/>');
  }
  return response(say(holdText(agent.language), agent.language), `<Redirect method="POST">${esc(twilioHookUrl(conn, 'turn', { room: room.id, poll: runId, n: String(polls + 1) }))}</Redirect>`);
}

/** <Gather> results and hold-polling for turn-based rooms. */
export async function handleTurn(conn: Row, roomId: string, p: Record<string, string>, q: URLSearchParams): Promise<string> {
  const room = await loadRoom(roomId);
  if (!room || room.tenant_id !== conn.tenant_id) return response('<Hangup/>');
  const agent = await loadVoiceAgent(room.tenant_id, room.voice_agent_id);
  if (q.get('poll')) return replyTwiml(conn, room, agent, q.get('poll')!, Number(q.get('n') || 1));
  const heard = (p.SpeechResult || '').trim();
  if (!heard) {
    const empty = Number(q.get('empty') || 0) + 1;
    if (empty >= 3) {
      await finishRoom(room, 'no speech');
      return hangupTwiml(agent.language.startsWith('es') ? 'No le escucho. Hasta luego.' : "I can't hear you. Goodbye.", agent.language);
    }
    return response(gatherTwiml(conn, room, agent, say(agent.language.startsWith('es') ? '¿Sigue ahí?' : 'Are you still there?', agent.language), empty));
  }
  await appendUtterance(room, { speaker_role: 'customer', text: heard, confidence: Number(p.Confidence) || null, source: 'gather', provider_ref: `${p.CallSid}:${heard.slice(0, 40)}:${Date.now()}` });
  try {
    const runId = await startTeamTurn(room, `${room.customer_number ? `Caller ${room.customer_number}` : 'Caller'} said: ${heard}`);
    return replyTwiml(conn, room, agent, runId, 0);
  } catch (err) {
    if (isServiceError(err) && /still working/i.test(err.message)) return response(say(holdText(agent.language), agent.language), gatherTwiml(conn, room, agent, ''));
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Outbound calls
// ---------------------------------------------------------------------------

export async function placeCall(ctx: Ctx, args: { to: string; voice_agent_id?: string; purpose?: string }) {
  if (!isE164(args.to)) throw new ServiceError('Use an E.164 number, e.g. +5215512345678.', 'INVALID');
  if (!(await hasCallCompliance(ctx.tenantId))) {
    throw new ServiceError('An owner must first confirm call consent and recording compliance (Voice → Calls).', 'CONFLICT');
  }
  const { conn, creds } = await requireConnection(ctx.tenantId);
  let agentId = args.voice_agent_id;
  if (!agentId) {
    const { data: all } = await db().from('voice_agents').select('id').eq('tenant_id', ctx.tenantId).is('archived_at', null);
    if ((all || []).length !== 1) throw new ServiceError('Pass voice_agent_id: the organization has several (or no) voice agents.', 'INVALID');
    agentId = all![0].id;
  }
  const agent = await loadVoiceAgent(ctx.tenantId, agentId!);
  const { data: blocked } = await db().from('call_blocklist').select('e164').eq('tenant_id', ctx.tenantId).eq('e164', args.to).maybeSingle();
  if (blocked) throw new ServiceError('This number is on the do-not-call list.', 'CONFLICT');
  if (!withinCallingHours(agent.calling_hours)) throw new ServiceError("Outside this voice agent's calling hours.", 'CONFLICT');
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count: today } = await db().from('rooms').select('id', { count: 'exact' }).eq('tenant_id', ctx.tenantId).eq('kind', 'phone_out').gte('created_at', since).limit(1);
  if ((today ?? 0) >= DAILY_OUTBOUND_CAP) throw new ServiceError(`Daily limit of ${DAILY_OUTBOUND_CAP} outbound calls reached.`, 'CONFLICT');
  const { count: live } = await db().from('rooms').select('id', { count: 'exact' }).eq('tenant_id', ctx.tenantId).in('status', ['ringing', 'live']).limit(1);
  if ((live ?? 0) >= CONCURRENT_CALL_CAP) throw new ServiceError(`Too many calls at once (limit ${CONCURRENT_CALL_CAP}).`, 'CONFLICT');

  const { data: numbers } = await db().from('phone_numbers').select('e164, voice_agent_id, capabilities').eq('tenant_id', ctx.tenantId);
  const from = (numbers || []).find((n: Row) => n.voice_agent_id === agent.id) ?? (numbers || []).find((n: Row) => n.capabilities?.voice);
  if (!from) throw new ServiceError('No phone number to call from. Sync your Twilio numbers first.', 'CONFLICT');

  const room = await createRoom({ tenantId: ctx.tenantId, kind: 'phone_out', agent, customerNumber: args.to, agentNumber: from.e164, purpose: args.purpose ?? null });
  try {
    const call = await twilio.createCall(creds, {
      to: args.to,
      from: from.e164,
      url: twilioHookUrl(conn, 'outbound', { room: room.id }),
      statusCallback: twilioHookUrl(conn, 'participant', { room: room.id, role: 'customer' }),
      machineDetection: true,
      timeLimit: agent.max_minutes * 60,
    });
    await addParticipantRow(room, { role: 'customer', call_sid: call.sid, label: args.to, address: args.to });
    return { room_id: room.id, status: 'ringing' };
  } catch (err) {
    await finishRoom(room, (err as Error).message, 'failed');
    throw new ServiceError(`Twilio could not place the call: ${(err as Error).message}`, 'CONFLICT');
  }
}

// ---------------------------------------------------------------------------
// Tools for voice agents and teams (contextcontrol_room_*, ask_team, place_call)
// ---------------------------------------------------------------------------

export async function roomContextTool(ctx: Ctx, args: { room_id?: string }) {
  const room = await roomForTenant(ctx.tenantId, args.room_id);
  const agent = room.voice_agent_id ? await loadVoiceAgent(room.tenant_id, room.voice_agent_id).catch(() => null) : null;
  let profileText = '';
  if (agent?.context_profile_id) {
    try {
      const profile = await getContextProfile(systemCtx(room.tenant_id), agent.context_profile_id);
      profileText = contextProfileInstructions(profile);
    } catch {
      profileText = '';
    }
  }
  const { data: notes } = await db().from('room_notes').select('level, text').eq('room_id', room.id).order('created_at', { ascending: false }).limit(5);
  const context = [
    room.kind === 'phone_out' ? `You called ${room.customer_number}.` : `${room.customer_number ? `Caller: ${room.customer_number}.` : 'Caller number unknown.'}`,
    room.purpose ? `Purpose of the call: ${room.purpose}` : '',
    profileText ? `What you should know:\n${profileText}` : '',
    notes?.length ? `Notes so far:\n${notes.map((n) => `- [${n.level}] ${n.text}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 12_000);
  return { room: { id: room.id, kind: room.kind, status: room.status, customer_number: room.customer_number, purpose: room.purpose }, context };
}

export async function roomTranscriptTool(ctx: Ctx, args: { room_id?: string; since_seq?: number }) {
  const room = await roomForTenant(ctx.tenantId, args.room_id);
  const { data } = await db().from('utterances').select('seq, speaker_role, text, created_at').eq('room_id', room.id).gte('seq', (args.since_seq ?? 0) + 1).order('seq', { ascending: true }).limit(300);
  const utterances = (data || []).map((u: Row) => ({ seq: u.seq, speaker_role: u.speaker_role, text: u.text, at: u.created_at }));
  return { utterances, last_seq: utterances.at(-1)?.seq ?? args.since_seq ?? 0, status: room.status };
}

export async function roomNoteTool(ctx: Ctx, args: { room_id?: string; text: string; level?: 'info' | 'warn' | 'alert' }) {
  const room = await roomForTenant(ctx.tenantId, args.room_id);
  const author = ctx.apiKeyId ? 'Voice agent' : ctx.teamId ? 'Team' : 'Agent';
  return { note: await addNote(room, { text: args.text, level: args.level, author }) };
}

/** The voice hands a question to its team (runs in the room's instance). */
export async function askTeamTool(ctx: Ctx, args: { room_id?: string; question: string }) {
  const room = await roomForTenant(ctx.tenantId, args.room_id);
  const sys = systemCtx(room.tenant_id);
  let runId: string;
  try {
    const run = await startRun(sys, room.session_id, `Question from the live call${room.customer_number ? ` with ${room.customer_number}` : ''}: ${args.question}\n\nAnswer briefly; the voice agent will say your answer out loud.`, { origin: 'room', roomId: room.id, channel: 'voice' });
    runId = run.id;
    if (workerConfigured()) await dispatchRun(run.id);
    else {
      const owner = `inline-ask:${run.id}`;
      void (async () => {
        if (await claimRun(run.id, owner, 10 * 60_000)) await executeRun(run.id, { owner, deadlineAt: Date.now() + 9 * 60_000 });
      })();
    }
  } catch (err) {
    if (isServiceError(err) && /still working/i.test(err.message)) {
      const { data: active } = await db().from('agent_runs').select('id').eq('session_id', room.session_id).in('status', ['queued', 'running']).limit(1);
      return { status: 'working', run_id: active?.[0]?.id ?? null, note: 'The team is still answering a previous question.' };
    }
    throw err;
  }
  return teamAnswerTool(ctx, { run_id: runId }, ASK_TEAM_WAIT_MS);
}

export async function teamAnswerTool(ctx: Ctx, args: { run_id: string }, waitMs = 4_000) {
  await waitForRun(args.run_id, waitMs, 500);
  const run = await getRun(ctx, args.run_id);
  if (run.status === 'done') return { status: 'done', answer: run.result?.message ?? '' };
  if (run.status === 'error' || run.status === 'cancelled') return { status: 'failed', error: run.error ?? 'The team could not answer.' };
  return { status: 'working', run_id: run.run_id, step: run.progress?.step ?? 0 };
}

export async function placeCallTool(ctx: Ctx, args: { to: string; voice_agent_id?: string; purpose?: string }) {
  return placeCall(ctx, args);
}

// ---------------------------------------------------------------------------
// Ear triggers → listener team
// ---------------------------------------------------------------------------

async function evaluateUtteranceTriggers(room: Row, utterance: Row) {
  if (!room.voice_agent_id) return;
  const agent = await loadVoiceAgent(room.tenant_id, room.voice_agent_id).catch(() => null);
  const triggers: Trigger[] = agent?.triggers ?? [];
  const text = String(utterance.text).toLowerCase();
  for (const t of triggers) {
    if (t.type !== 'keyword') continue;
    if (t.role && t.role !== utterance.speaker_role) continue;
    const hit = t.any.find((w) => text.includes(w.toLowerCase()));
    if (hit) await fireTrigger(room, agent!, `keyword:${hit}`, `The ${utterance.speaker_role} said "${hit}": "${utterance.text}"`, hit.length > 0 ? 'warn' : 'info');
  }
}

async function fireTrigger(room: Row, agent: Row, key: string, reason: string, level: 'info' | 'warn' | 'alert') {
  const fresh = await loadRoom(room.id);
  if (!fresh || !['live', 'ringing'].includes(fresh.status)) return;
  const state = fresh.trigger_state ?? {};
  const firedAt = state.fired?.[key];
  if (firedAt && Date.now() - new Date(firedAt).getTime() < TRIGGER_COOLDOWN_MS) return;
  await updateRoom(room.id, { trigger_state: { ...state, fired: { ...(state.fired ?? {}), [key]: new Date().toISOString() } } });
  if (!agent.listener_team_id) {
    // No listener team: the trigger itself becomes a visible note.
    if (key.startsWith('keyword:')) await addNote(fresh, { text: reason, level, author: 'Ear' });
    return;
  }
  await queueListener(fresh, agent, reason, key);
}

/** Start (or queue) a listener run with the transcript since its last read. */
async function queueListener(room: Row, agent: Row, reason: string, key: string) {
  const ctx = systemCtx(room.tenant_id);
  const fresh = (await loadRoom(room.id)) ?? room;
  const state = fresh.trigger_state ?? {};
  let sessionId = fresh.listener_session_id as string | null;
  if (!sessionId) {
    const team = await getTeam(ctx, agent.listener_team_id);
    sessionId = (await createTeamSession(ctx, team.id, `Listener · ${fresh.customer_number ?? 'call'}`.slice(0, 120))).id;
    await updateRoom(room.id, { listener_session_id: sessionId });
  }
  const sinceSeq = Number(state.listener_seq ?? 0);
  const { data: lines } = await db().from('utterances').select('seq, speaker_role, text').eq('room_id', room.id).gte('seq', sinceSeq + 1).order('seq', { ascending: true }).limit(200);
  const transcript = (lines || []).map((l: Row) => `${l.speaker_role}: ${l.text}`).join('\n') || '(nothing new was said)';
  const lastSeq = lines?.at(-1)?.seq ?? sinceSeq;
  const message = [
    `You are listening to live call ${room.id} (${room.kind === 'phone_out' ? 'outbound' : 'inbound'}${room.customer_number ? `, ${room.customer_number}` : ''}). You never speak on the call.`,
    `Why you were woken up: ${reason}`,
    `New transcript since your last check:\n${transcript}`,
    'Post what a human should know right now with contextcontrol_room_note (level alert for urgent issues). If nothing matters, do nothing. Use contextcontrol_room_transcript with room_id for earlier lines.',
  ].join('\n\n');
  try {
    const run = await startRun(ctx, sessionId!, message, { origin: 'room', roomId: room.id });
    await updateRoom(room.id, { trigger_state: { ...state, listener_seq: lastSeq, pending: [] } });
    if (workerConfigured()) await dispatchRun(run.id);
    else {
      const owner = `inline-listener:${run.id}`;
      if (await claimRun(run.id, owner, 10 * 60_000)) await executeRun(run.id, { owner, deadlineAt: Date.now() + 9 * 60_000 });
    }
  } catch (err) {
    if (!(isServiceError(err) && /still working/i.test(err.message))) throw err;
    // The listener is busy: remember why, it runs again when the current check ends.
    await updateRoom(room.id, { trigger_state: { ...state, pending: [...(state.pending ?? []), reason].slice(-10) } });
  }
}

/** Hook from agent-runs when a room run ends: run queued listener checks. */
export async function onRoomRunFinished(run: Row, _status?: string, _detail?: string | null, _message?: string | null) {
  if (!run.room_id) return;
  const room = await loadRoom(run.room_id);
  if (!room || run.session_id !== room.listener_session_id) return;
  const pending: string[] = room.trigger_state?.pending ?? [];
  if (!pending.length) return;
  const agent = await loadVoiceAgent(room.tenant_id, room.voice_agent_id).catch(() => null);
  if (agent?.listener_team_id) await queueListener(room, agent, pending.join(' · '), 'pending');
}

/** Minute tick: silence/cadence triggers, stuck rooms, retention. */
export async function sweepRooms(now = Date.now()) {
  const { data: live } = await db().from('rooms').select(ROOM_COLUMNS).in('status', ['ringing', 'live']).limit(100);
  let fired = 0;
  let closed = 0;
  for (const room of live || []) {
    // Rooms that never connected or outlived their limit are closed.
    const agent = room.voice_agent_id ? await loadVoiceAgent(room.tenant_id, room.voice_agent_id).catch(() => null) : null;
    const age = now - new Date(room.created_at).getTime();
    if ((room.status === 'ringing' && age > 5 * 60_000) || age > ((agent?.max_minutes ?? 15) + 10) * 60_000) {
      await finishRoom(room, room.status === 'ringing' ? 'never connected' : 'time limit', room.status === 'ringing' ? 'failed' : 'ended');
      closed++;
      continue;
    }
    if (!agent || room.status !== 'live') continue;
    for (const t of agent.triggers as Trigger[]) {
      if (t.type === 'every') {
        const last = room.trigger_state?.fired?.every ? new Date(room.trigger_state.fired.every).getTime() : new Date(room.started_at ?? room.created_at).getTime();
        if (now - last >= t.seconds * 1000) {
          await fireTrigger(room, agent, 'every', `Regular check-in (every ${t.seconds} s).`, 'info');
          fired++;
        }
      } else if (t.type === 'silence') {
        const { data: lastLine } = await db().from('utterances').select('created_at').eq('room_id', room.id).eq('speaker_role', t.role).order('seq', { ascending: false }).limit(1);
        const since = new Date(lastLine?.[0]?.created_at ?? room.started_at ?? room.created_at).getTime();
        if (now - since >= t.seconds * 1000) {
          await fireTrigger(room, agent, `silence:${t.role}`, `The ${t.role} has not spoken for ${Math.round((now - since) / 1000)} s.`, 'warn');
          fired++;
        }
      }
    }
  }
  const { data: purged } = await db().from('utterances').delete().lte('created_at', new Date(now - UTTERANCE_RETENTION_DAYS * 86_400_000).toISOString()).select('id');
  return { fired, closed, purged: purged?.length ?? 0 };
}

// ---------------------------------------------------------------------------
// ElevenLabs post-call results (via the Inbound Gateway) → the room
// ---------------------------------------------------------------------------

export async function attachPostCall(tenantId: string, roomId: string, p: { summary?: string | null; audioKey?: string | null; transcript?: string | null }) {
  const room = await loadRoom(roomId);
  if (!room || room.tenant_id !== tenantId) return false;
  await updateRoom(room.id, { ...(p.summary ? { summary: p.summary.slice(0, 4000) } : {}), ...(p.audioKey ? { recording_key: p.audioKey } : {}) });
  if (p.summary) await addNote(room, { text: `Call summary: ${p.summary}`, level: 'info', author: 'ElevenLabs' });
  return true;
}

