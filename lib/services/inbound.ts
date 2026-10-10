import crypto from 'crypto';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { envelopeDecryptSecret, envelopeEncryptSecret, type EncryptedSecretPayload } from '@/lib/secrets/envelope-encryption';
import { PRESETS } from '@/lib/inbound/presets';
import {
  CHANNEL_LABEL,
  INBOUND_PRESETS,
  PRESET_SECRETS,
  type InboundPreset,
  type NormalizedEvent,
  type ReplyTarget,
  type RoutingRule,
} from '@/lib/inbound/types';
import { putInboundMedia } from '@/lib/voice/audio-cache';
import { createTeamSession, getTeam } from './teams';
import { dispatchRun, invokeWorker, startRun, workerConfigured, claimRun, executeRun } from './agent-runs';
import { getFunction, invokeFunction } from './functions';
import { ServiceError, isServiceError } from './errors';

/**
 * Inbound Gateway: public webhook endpoints → verified, stored events → routed (rules or
 * an AI Function Studio router) into a thread (one team instance per external
 * conversation) → a team run (origin 'inbound') → the reply goes back through the same
 * channel (WhatsApp, Messenger, Instagram, or a signed POST to your URL).
 */

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode'>;
type Row = Record<string, any>;

export const MAX_BODY_BYTES = 1024 * 1024;
/** ElevenLabs post-call audio arrives base64 in the body. */
export const MAX_AUDIO_BODY_BYTES = 6 * 1024 * 1024;
export const RATE_LIMIT_PER_MINUTE = 600;
const STORED_BODY_BYTES = 200_000;
const RETENTION_DAYS = 30;
const GRAPH = 'https://graph.facebook.com/v23.0';

const ENDPOINT_COLUMNS = 'id, tenant_id, name, preset, enabled, default_team_id, rules, router_function_id, reply, verify_settings, secrets, created_at, updated_at';
const EVENT_COLUMNS = 'id, tenant_id, endpoint_id, provider_event_id, received_at, signature_ok, status, error, normalized, thread_id, run_id, route_detail, reply_status';

/** Runs and lookups made on behalf of the organization (no member involved). */
function systemCtx(tenantId: string): AuthContext {
  return { tenantId, userId: 'inbound', role: 'system', scopes: ['*'], authMode: 'webhook_signature' };
}

// ---------------------------------------------------------------------------
// Endpoint configuration
// ---------------------------------------------------------------------------

const ruleSchema = z
  .object({
    name: z.string().trim().max(80).optional(),
    when: z
      .array(
        z.object({
          path: z.string().trim().min(1).max(200),
          op: z.enum(['equals', 'contains', 'exists', 'regex']),
          value: z.string().max(500).optional(),
        }).strict()
      )
      .max(10),
    action: z.enum(['route', 'ignore']).default('route'),
    team_id: z.string().uuid().nullable(),
    message_template: z.string().max(4000).nullable().optional(),
  })
  .strict();

export const endpointSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    preset: z.enum(INBOUND_PRESETS),
    enabled: z.boolean().default(true),
    default_team_id: z.string().uuid().nullable().default(null),
    rules: z.array(ruleSchema).max(50).default([]),
    router_function_id: z.string().uuid().nullable().default(null),
    reply: z
      .object({
        enabled: z.boolean().default(true),
        url: z.string().url().max(500).nullable().optional(),
      })
      .strict()
      .default({ enabled: true }),
    verify_settings: z
      .object({
        signature_header: z.string().trim().max(80).regex(/^[A-Za-z0-9-]+$/).nullable().optional(),
        timestamp_header: z.string().trim().max(80).regex(/^[A-Za-z0-9-]+$/).nullable().optional(),
        unsigned: z.boolean().optional(),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.verify_settings.unsigned && e.preset !== 'generic') ctx.addIssue({ code: 'custom', path: ['verify_settings', 'unsigned'], message: 'Only generic endpoints can skip signatures.' });
    if (e.reply.url && !isSafeReplyUrl(e.reply.url)) ctx.addIssue({ code: 'custom', path: ['reply', 'url'], message: 'Use a public https URL.' });
  });

/** Replies are POSTed from our servers: only public https hosts (no internal addresses). */
export function isSafeReplyUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      const [a, b] = h.split('.').map(Number);
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
    }
    if (h.startsWith('[')) return false; // IPv6 literals
    return true;
  } catch {
    return false;
  }
}

export interface EndpointView {
  id: string;
  name: string;
  preset: InboundPreset;
  enabled: boolean;
  default_team_id: string | null;
  rules: RoutingRule[];
  router_function_id: string | null;
  reply: { enabled: boolean; url?: string | null };
  verify_settings: Record<string, any>;
  /** Names of secrets that are set (values are never returned). */
  secrets_set: string[];
  created_at: string;
  updated_at: string;
}

function present(row: Row): EndpointView {
  return {
    id: row.id,
    name: row.name,
    preset: row.preset,
    enabled: row.enabled,
    default_team_id: row.default_team_id ?? null,
    rules: row.rules ?? [],
    router_function_id: row.router_function_id ?? null,
    reply: row.reply ?? { enabled: true },
    verify_settings: row.verify_settings ?? {},
    secrets_set: Object.keys(row.secrets ?? {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadEndpoint(ctx: Pick<Ctx, 'tenantId'>, id: string): Promise<Row> {
  const { data } = await getSupabaseAdminClient()
    .from('inbound_endpoints')
    .select(ENDPOINT_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .maybeSingle();
  if (!data) throw new ServiceError('Webhook endpoint not found in this organization.', 'NOT_FOUND');
  return data;
}

async function assertReferences(ctx: Ctx, spec: z.infer<typeof endpointSchema>) {
  const teams = new Set([spec.default_team_id, ...spec.rules.map((r) => r.team_id)].filter(Boolean) as string[]);
  for (const id of teams) await getTeam(ctx, id);
  if (spec.router_function_id) await getFunction(ctx, spec.router_function_id);
}

export async function listEndpoints(ctx: Pick<Ctx, 'tenantId'>) {
  const db = getSupabaseAdminClient();
  const { data, error } = await db
    .from('inbound_endpoints')
    .select(ENDPOINT_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Could not list webhook endpoints: ${error.message}`);
  const endpoints = (data || []).map(present);
  const last = await Promise.all(
    endpoints.map(async (e) => {
      const { data: ev } = await db.from('inbound_events').select('received_at, status').eq('endpoint_id', e.id).order('received_at', { ascending: false }).limit(1);
      return ev?.[0] ?? null;
    })
  );
  return endpoints.map((e, i) => ({ ...e, last_event_at: last[i]?.received_at ?? null, last_event_status: last[i]?.status ?? null }));
}

export async function getEndpoint(ctx: Pick<Ctx, 'tenantId'>, id: string) {
  return present(await loadEndpoint(ctx, id));
}

export async function createEndpoint(ctx: Ctx, raw: unknown) {
  const spec = endpointSchema.parse(raw);
  await assertReferences(ctx, spec);
  const now = new Date().toISOString();
  const { data, error } = await getSupabaseAdminClient()
    .from('inbound_endpoints')
    .insert({ tenant_id: ctx.tenantId, ...spec, secrets: {}, created_by: ctx.authMode === 'session' ? ctx.userId : null, created_at: now, updated_at: now })
    .select(ENDPOINT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not create webhook endpoint: ${error?.message}`);
  return present(data);
}

export async function updateEndpoint(ctx: Ctx, id: string, raw: unknown) {
  const existing = await loadEndpoint(ctx, id);
  const spec = endpointSchema.parse(raw);
  if (spec.preset !== existing.preset) throw new ServiceError('The source preset cannot change; create a new endpoint instead.', 'INVALID');
  await assertReferences(ctx, spec);
  const { data, error } = await getSupabaseAdminClient()
    .from('inbound_endpoints')
    .update({ ...spec, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select(ENDPOINT_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not update webhook endpoint: ${error?.message}`);
  return present(data);
}

export async function archiveEndpoint(ctx: Ctx, id: string) {
  await loadEndpoint(ctx, id);
  await getSupabaseAdminClient().from('inbound_endpoints').update({ archived_at: new Date().toISOString(), enabled: false }).eq('id', id).eq('tenant_id', ctx.tenantId);
}

const secretContext = (endpointId: string, name: string) => `inbound:${endpointId}:${name}`;

export async function setEndpointSecret(ctx: Ctx, id: string, name: string, value: string) {
  const endpoint = await loadEndpoint(ctx, id);
  const allowed = PRESET_SECRETS[endpoint.preset as InboundPreset].map((s) => s.name);
  if (!allowed.includes(name)) throw new ServiceError(`Unknown secret "${name}" for this source. Expected one of: ${allowed.join(', ')}.`, 'INVALID');
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4000) throw new ServiceError('Secret value must be 1-4000 characters.', 'INVALID');
  const payload = await envelopeEncryptSecret(trimmed, ctx.tenantId, secretContext(endpoint.id, name));
  const secrets = { ...(endpoint.secrets ?? {}), [name]: payload };
  await getSupabaseAdminClient().from('inbound_endpoints').update({ secrets, updated_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', ctx.tenantId);
  return getEndpoint(ctx, id);
}

export async function deleteEndpointSecret(ctx: Ctx, id: string, name: string) {
  const endpoint = await loadEndpoint(ctx, id);
  const { [name]: _removed, ...rest } = endpoint.secrets ?? {};
  await getSupabaseAdminClient().from('inbound_endpoints').update({ secrets: rest, updated_at: new Date().toISOString() }).eq('id', id).eq('tenant_id', ctx.tenantId);
  return getEndpoint(ctx, id);
}

async function decryptSecrets(endpoint: Row): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, payload] of Object.entries(endpoint.secrets ?? {})) {
    try {
      out[name] = await envelopeDecryptSecret(payload as EncryptedSecretPayload, endpoint.tenant_id, secretContext(endpoint.id, name));
    } catch (err) {
      console.error('[inbound] could not decrypt secret', endpoint.id, name, (err as Error)?.message);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Receiving (public route)
// ---------------------------------------------------------------------------

type Dispatcher = (eventIds: string[]) => Promise<boolean>;
let inboundDispatcher: Dispatcher | null = null;
export function setInboundDispatcherForTests(d: Dispatcher | null) {
  inboundDispatcher = d;
}

const HEADER_ALLOWLIST = ['content-type', 'user-agent', 'x-request-id', 'x-github-event', 'x-event-type'];

async function loadPublicEndpoint(id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await getSupabaseAdminClient().from('inbound_endpoints').select(ENDPOINT_COLUMNS).eq('id', id).is('archived_at', null).maybeSingle();
  return data && data.enabled ? data : null;
}

export function bodyLimitFor(preset: string | undefined): number {
  return preset === 'elevenlabs' ? MAX_AUDIO_BODY_BYTES : MAX_BODY_BYTES;
}

/** GET handshake (Meta subscription challenge). */
export async function verifyChallenge(id: string, params: URLSearchParams): Promise<{ status: number; body: string }> {
  const endpoint = await loadPublicEndpoint(id);
  if (!endpoint) return { status: 404, body: 'Not found' };
  if (endpoint.preset !== 'meta') return { status: 405, body: 'This endpoint only accepts POST.' };
  const secrets = await decryptSecrets(endpoint);
  if (params.get('hub.mode') === 'subscribe' && secrets.verify_token && params.get('hub.verify_token') === secrets.verify_token) {
    return { status: 200, body: params.get('hub.challenge') ?? '' };
  }
  return { status: 403, body: 'Verify token does not match.' };
}

export interface ReceiveResult {
  status: number;
  body: Record<string, unknown>;
}

/** POST: verify, store (idempotently), hand to the worker. Must answer fast. */
export async function receiveWebhook(id: string, rawBody: string, headers: Headers, url: string): Promise<ReceiveResult> {
  const endpoint = await loadPublicEndpoint(id);
  if (!endpoint) return { status: 404, body: { error: 'Unknown or disabled endpoint.' } };
  if (Buffer.byteLength(rawBody) > bodyLimitFor(endpoint.preset)) return { status: 413, body: { error: 'Payload too large.' } };

  const preset = PRESETS[endpoint.preset as InboundPreset];
  const secrets = await decryptSecrets(endpoint);
  const check = preset.verify({ rawBody, headers, url, secrets, settings: endpoint.verify_settings ?? {} });
  if (!check.ok) return { status: 401, body: { error: check.reason } };

  const db = getSupabaseAdminClient();
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count } = await db.from('inbound_events').select('id', { count: 'exact' }).eq('endpoint_id', endpoint.id).gte('received_at', minuteAgo).limit(1);
  if ((count ?? 0) >= RATE_LIMIT_PER_MINUTE) return { status: 429, body: { error: 'Rate limit reached for this endpoint.' } };

  let parsed: { body: unknown; events: NormalizedEvent[] };
  try {
    parsed = preset.parse(rawBody);
  } catch {
    return { status: 400, body: { error: 'The body is not valid for this source.' } };
  }

  // ElevenLabs call audio: store the recording, keep only a reference in the event.
  let storedBody: unknown = parsed.body;
  const audioEvent = parsed.events.find((e) => e.type === 'call_audio');
  if (audioEvent) {
    const b64 = (parsed.body as any)?.data?.full_audio;
    if (typeof b64 === 'string' && b64) {
      const key = await putInboundMedia(endpoint.tenant_id, `elevenlabs/${audioEvent.meta?.conversation_id || audioEvent.event_id}.mp3`, { audio: Buffer.from(b64, 'base64'), mime: 'audio/mpeg' });
      audioEvent.meta = { ...audioEvent.meta, audio_key: key };
    }
    storedBody = { ...(parsed.body as any), data: { ...(parsed.body as any)?.data, full_audio: '[stored in S3]' } };
  }
  const bodyJson = JSON.stringify(storedBody ?? null);
  if (bodyJson.length > STORED_BODY_BYTES) storedBody = { truncated: true, bytes: bodyJson.length };

  const headerSubset = Object.fromEntries(HEADER_ALLOWLIST.map((h) => [h, headers.get(h)]).filter(([, v]) => v));
  const now = new Date().toISOString();
  const ids: string[] = [];
  let duplicates = 0;
  for (const event of parsed.events) {
    const { data: existing } = await db.from('inbound_events').select('id').eq('endpoint_id', endpoint.id).eq('provider_event_id', event.event_id).maybeSingle();
    if (existing) {
      duplicates++;
      continue;
    }
    const { data: row, error } = await db
      .from('inbound_events')
      .insert({
        tenant_id: endpoint.tenant_id,
        endpoint_id: endpoint.id,
        provider_event_id: event.event_id.slice(0, 300),
        received_at: now,
        signature_ok: true,
        headers: headerSubset,
        body: storedBody,
        normalized: event,
        status: event.type === 'status' ? 'ignored' : 'received',
        error: event.type === 'status' ? 'Delivery/status update (recorded, not routed).' : null,
        updated_at: now,
      })
      .select('id, status')
      .single();
    if (error?.code === '23505') {
      duplicates++;
      continue;
    }
    if (error || !row) throw new Error(`Could not store inbound event: ${error?.message}`);
    if (row.status === 'received') ids.push(row.id);
  }

  if (ids.length) {
    try {
      const dispatched = inboundDispatcher ? await inboundDispatcher(ids) : await invokeWorker({ inbound_event_ids: ids });
      if (!dispatched) await processInboundEvents(ids); // local development: no worker
    } catch (err) {
      // The minute tick picks up events left in 'received'.
      console.error('[inbound] dispatch failed; the sweeper will retry', err);
    }
  }
  return { status: 200, body: { received: parsed.events.length, accepted: ids.length, duplicates } };
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export const routerDecisionSchema = z
  .object({
    action: z.enum(['route', 'ignore']),
    team_id: z.string().uuid().optional(),
    conversation_key: z.string().trim().min(1).max(300).optional(),
    message: z.string().max(20_000).optional(),
    reply: z.boolean().optional(),
    reason: z.string().max(500).optional(),
  })
  .passthrough();

function getPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<any>((cur, key) => (cur === null || cur === undefined ? undefined : cur[/^\d+$/.test(key) ? Number(key) : key]), root);
}

function conditionHolds(scope: unknown, c: RoutingRule['when'][number]): boolean {
  const v = getPath(scope, c.path);
  if (c.op === 'exists') return v !== undefined && v !== null && v !== '';
  const s = typeof v === 'string' ? v : v === undefined || v === null ? '' : JSON.stringify(v);
  if (c.op === 'equals') return s === (c.value ?? '');
  if (c.op === 'contains') return s.toLowerCase().includes((c.value ?? '').toLowerCase());
  try {
    return new RegExp(c.value ?? '', 'i').test(s);
  } catch {
    return false;
  }
}

export function renderTemplate(template: string, scope: unknown): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path) => {
    const v = getPath(scope, path);
    return v === undefined || v === null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  });
}

export function defaultMessage(e: NormalizedEvent): string {
  if (e.type === 'call_result') return e.text;
  const who = e.sender.name ? `${e.sender.name} (${e.sender.id})` : e.sender.id;
  const attachments = e.attachments?.length ? `\n[attachments: ${e.attachments.map((a) => a.type).join(', ')}]` : '';
  return `New ${CHANNEL_LABEL[e.channel]} message from ${who}:\n${e.text}${attachments}`;
}

export interface RouteDecision {
  action: 'route' | 'ignore' | 'fail';
  decided_by: 'router_function' | 'rule' | 'default_team' | 'none';
  rule?: string | number;
  team_id?: string;
  conversation_key: string;
  message: string;
  reply: boolean;
  reason?: string;
  function_ms?: number;
}

/** Decide where an event goes (no side effects besides the router function call). */
export async function decideRoute(endpoint: Row, event: NormalizedEvent, raw: unknown): Promise<RouteDecision> {
  const ctx = systemCtx(endpoint.tenant_id);
  const base = { conversation_key: event.conversation_key, message: defaultMessage(event), reply: event.reply_target.kind !== 'none' };

  if (endpoint.router_function_id) {
    let result;
    try {
      result = await invokeFunction(
        ctx,
        endpoint.router_function_id,
        { event, raw, endpoint: { id: endpoint.id, name: endpoint.name, preset: endpoint.preset } },
        'inbound'
      );
    } catch (err) {
      return { ...base, action: 'fail', decided_by: 'router_function', reason: `Router function could not run: ${(err as Error).message}` };
    }
    if (result.status !== 'ok') return { ...base, action: 'fail', decided_by: 'router_function', reason: `Router function ${result.status}: ${result.error ?? 'no detail'}`, function_ms: result.duration_ms };
    const parsed = routerDecisionSchema.safeParse(result.output);
    if (!parsed.success) {
      return { ...base, action: 'fail', decided_by: 'router_function', reason: `Router function returned an invalid decision: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` };
    }
    const d = parsed.data;
    if (d.action === 'ignore') return { ...base, action: 'ignore', decided_by: 'router_function', reason: d.reason ?? 'Ignored by the router function.', function_ms: result.duration_ms };
    const teamId = d.team_id ?? endpoint.default_team_id;
    if (!teamId) return { ...base, action: 'fail', decided_by: 'router_function', reason: 'The router function routed the event but gave no team_id, and the endpoint has no default team.' };
    return {
      action: 'route',
      decided_by: 'router_function',
      team_id: teamId,
      conversation_key: d.conversation_key ?? base.conversation_key,
      message: d.message ?? base.message,
      reply: d.reply ?? base.reply,
      reason: d.reason,
      function_ms: result.duration_ms,
    };
  }

  const scope = { event, raw };
  const rules: RoutingRule[] = endpoint.rules ?? [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule.when.every((c) => conditionHolds(scope, c))) continue;
    if (rule.action === 'ignore') return { ...base, action: 'ignore', decided_by: 'rule', rule: rule.name || i + 1, reason: `Ignored by rule ${rule.name || i + 1}.` };
    const teamId = rule.team_id ?? endpoint.default_team_id;
    if (!teamId) return { ...base, action: 'ignore', decided_by: 'rule', rule: rule.name || i + 1, reason: 'The matching rule has no team.' };
    return { ...base, action: 'route', decided_by: 'rule', rule: rule.name || i + 1, team_id: teamId, message: rule.message_template ? renderTemplate(rule.message_template, scope) : base.message };
  }
  if (endpoint.default_team_id) return { ...base, action: 'route', decided_by: 'default_team', team_id: endpoint.default_team_id };
  return { ...base, action: 'ignore', decided_by: 'none', reason: 'No rule matched and the endpoint has no default team.' };
}

async function setEvent(id: string, fields: Row) {
  await getSupabaseAdminClient().from('inbound_events').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', id);
}

/** Find or create the thread (and its own team instance) for an external conversation. */
async function ensureThread(endpoint: Row, event: NormalizedEvent, decision: RouteDecision): Promise<Row> {
  const db = getSupabaseAdminClient();
  const ctx = systemCtx(endpoint.tenant_id);
  const find = async () =>
    (await db.from('inbound_threads').select('*').eq('tenant_id', endpoint.tenant_id).eq('conversation_key', decision.conversation_key).maybeSingle()).data as Row | null;
  let thread = await find();
  const now = new Date().toISOString();
  if (!thread) {
    const { data, error } = await db
      .from('inbound_threads')
      .insert({
        tenant_id: endpoint.tenant_id,
        endpoint_id: endpoint.id,
        conversation_key: decision.conversation_key,
        channel: event.channel,
        contact: event.sender,
        team_id: decision.team_id,
        reply_target: event.reply_target,
        pending_count: 0,
        last_event_at: now,
        created_at: now,
      })
      .select('*')
      .single();
    thread = data ?? (error?.code === '23505' ? await find() : null);
    if (!thread) throw new Error(`Could not create the thread: ${error?.message}`);
  }
  // A different team now (rules changed) gets a fresh instance; otherwise keep the conversation.
  const teamChanged = thread.team_id !== decision.team_id;
  let sessionId: string | null = teamChanged ? null : thread.session_id;
  if (!sessionId) {
    const label = event.sender.name || event.sender.id;
    sessionId = (await createTeamSession(ctx, decision.team_id!, `${CHANNEL_LABEL[event.channel]} · ${label}`.slice(0, 120))).id;
  }
  const patch = {
    session_id: sessionId,
    team_id: decision.team_id,
    endpoint_id: endpoint.id,
    contact: { ...(thread.contact ?? {}), ...event.sender, name: event.sender.name ?? thread.contact?.name ?? null },
    reply_target: event.reply_target.kind === 'none' ? thread.reply_target : event.reply_target,
    last_event_at: now,
  };
  await db.from('inbound_threads').update(patch).eq('id', thread.id);
  return { ...thread, ...patch };
}

function isBusy(err: unknown): boolean {
  return isServiceError(err) && err.code === 'CONFLICT' && /still working/i.test(err.message);
}

/** Start the thread's run, or queue the events when the instance is busy. */
async function startThreadRun(endpoint: Row, thread: Row, eventIds: string[], message: string): Promise<string | null> {
  const ctx = systemCtx(endpoint.tenant_id);
  try {
    const run = await startRun(ctx, thread.session_id, message, { origin: 'inbound', teamId: thread.team_id, inboundThreadId: thread.id });
    for (const id of eventIds) await setEvent(id, { status: 'routed', run_id: run.id, thread_id: thread.id });
    if (workerConfigured()) {
      await dispatchRun(run.id);
    } else {
      const owner = `inline-inbound:${run.id}`;
      if (await claimRun(run.id, owner, 30 * 60_000)) await executeRun(run.id, { owner, deadlineAt: Date.now() + 25 * 60_000 });
    }
    return run.id;
  } catch (err) {
    if (!isBusy(err)) throw err;
    for (const id of eventIds) await setEvent(id, { status: 'queued', thread_id: thread.id });
    await getSupabaseAdminClient().from('inbound_threads').update({ pending_count: (thread.pending_count ?? 0) + eventIds.length }).eq('id', thread.id);
    return null;
  }
}

/** Worker / inline entry: route stored events. Safe to call twice (claims by status). */
export async function processInboundEvents(ids: string[]): Promise<Array<{ id: string; status: string }>> {
  const db = getSupabaseAdminClient();
  const out: Array<{ id: string; status: string }> = [];
  for (const id of ids) {
    // Claim: only one processor moves an event out of 'received'.
    const { data: claimed } = await db
      .from('inbound_events')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'received')
      .select(`${EVENT_COLUMNS}, body`);
    const ev = claimed?.[0] as Row | undefined;
    if (!ev) continue;
    try {
      const { data: endpoint } = await db.from('inbound_endpoints').select(ENDPOINT_COLUMNS).eq('id', ev.endpoint_id).maybeSingle();
      if (!endpoint) throw new ServiceError('The endpoint was deleted.', 'NOT_FOUND');
      const event = ev.normalized as NormalizedEvent;
      // Live Rooms calls: ElevenLabs post-call results belong to the call's room, not a new thread.
      if (await attachToRoom(endpoint, event, ev.id)) {
        out.push({ id, status: 'routed' });
        continue;
      }
      if (event.type === 'call_audio') {
        await attachCallAudio(endpoint, event, ev.id);
        out.push({ id, status: 'routed' });
        continue;
      }
      const decision = await decideRoute(endpoint, event, ev.body);
      if (decision.action !== 'route') {
        await setEvent(id, { status: decision.action === 'ignore' ? 'ignored' : 'failed', error: decision.reason ?? null, route_detail: decision });
        out.push({ id, status: decision.action === 'ignore' ? 'ignored' : 'failed' });
        continue;
      }
      const thread = await ensureThread(endpoint, event, decision);
      await setEvent(id, { route_detail: decision, thread_id: thread.id });
      if (event.type === 'call_result' && event.meta?.conversation_id) await linkEarlierRecording(endpoint, event, thread.id);
      const runId = await startThreadRun(endpoint, thread, [id], decision.message);
      out.push({ id, status: runId ? 'routed' : 'queued' });
    } catch (err) {
      const message = (err as Error)?.message || 'Routing failed.';
      if (!isServiceError(err)) console.error('[inbound] routing failed', id, err);
      await setEvent(id, { status: 'failed', error: message.slice(0, 2000) });
      out.push({ id, status: 'failed' });
    }
  }
  return out;
}

async function addRecording(threadId: string, key: string) {
  const db = getSupabaseAdminClient();
  const { data: thread } = await db.from('inbound_threads').select('id, contact').eq('id', threadId).maybeSingle();
  if (!thread) return;
  const recordings = [...new Set([...((thread.contact as any)?.recordings ?? []), key])];
  await db.from('inbound_threads').update({ contact: { ...(thread.contact as any), recordings } }).eq('id', thread.id);
}

/**
 * A call recording: the audio webhook carries no caller number, so it is linked to the
 * call's thread through the transcript event of the same ElevenLabs conversation. If the
 * audio arrives first, the transcript picks it up when it is routed.
 */
async function attachCallAudio(endpoint: Row, event: NormalizedEvent, eventId: string) {
  const db = getSupabaseAdminClient();
  const conversationId = String(event.meta?.conversation_id ?? '');
  const { data: transcript } = await db.from('inbound_events').select('thread_id').eq('endpoint_id', endpoint.id).eq('provider_event_id', `transcription:${conversationId}`).maybeSingle();
  const threadId: string | null = transcript?.thread_id ?? null;
  const key = event.meta?.audio_key as string | undefined;
  if (threadId && key) await addRecording(threadId, key);
  await setEvent(eventId, {
    status: 'routed',
    thread_id: threadId,
    route_detail: { decided_by: 'none', action: 'route', reason: !key ? 'Recording could not be stored (no media bucket).' : threadId ? 'Recording stored and linked to the call.' : 'Recording stored; it is linked when the transcript arrives.' },
  });
}

async function attachToRoom(endpoint: Row, event: NormalizedEvent, eventId: string): Promise<boolean> {
  let roomId = (event.meta?.room_id as string | null) ?? null;
  if (!roomId && event.type === 'call_audio' && event.meta?.conversation_id) {
    const { data: t } = await getSupabaseAdminClient().from('inbound_events').select('normalized').eq('endpoint_id', endpoint.id).eq('provider_event_id', `transcription:${event.meta.conversation_id}`).maybeSingle();
    roomId = ((t?.normalized as NormalizedEvent | undefined)?.meta?.room_id as string | null) ?? null;
  }
  if (!roomId) return false;
  const { attachPostCall } = await import('./rooms');
  const attached = await attachPostCall(endpoint.tenant_id, roomId, {
    summary: event.type === 'call_result' ? ((event.meta?.summary as string | null) ?? null) : null,
    audioKey: event.type === 'call_audio' ? ((event.meta?.audio_key as string | null) ?? null) : null,
  });
  if (!attached) return false;
  await setEvent(eventId, { status: 'routed', route_detail: { decided_by: 'none', action: 'route', reason: `Attached to live call ${roomId}.` } });
  return true;
}

/** Transcript routed: pick up a recording that arrived before it. */
async function linkEarlierRecording(endpoint: Row, event: NormalizedEvent, threadId: string) {
  const { data: audio } = await getSupabaseAdminClient()
    .from('inbound_events')
    .select('id, normalized')
    .eq('endpoint_id', endpoint.id)
    .eq('provider_event_id', `audio:${String(event.meta?.conversation_id ?? '')}`)
    .maybeSingle();
  const key = (audio?.normalized as NormalizedEvent | undefined)?.meta?.audio_key as string | undefined;
  if (audio && key) {
    await addRecording(threadId, key);
    await setEvent(audio.id, { thread_id: threadId });
  }
}

// ---------------------------------------------------------------------------
// Replies (after the team's run)
// ---------------------------------------------------------------------------

function chunks(text: string, size: number): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > size) {
    const cut = Math.max(rest.lastIndexOf('\n', size), rest.lastIndexOf('. ', size));
    const at = cut > size * 0.5 ? cut + 1 : size;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

async function graphPost(url: string, token: string, body: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const err = data?.error || {};
    const hint = err.code === 131047 || /24.?hour|re-engagement/i.test(err.message || '') ? ' (outside the 24-hour reply window: the customer must write first, or use an approved template)' : '';
    throw new Error(`Meta API ${res.status}: ${err.message || 'request failed'}${hint}`);
  }
}

async function sendReply(endpoint: Row, thread: Row, text: string, eventIds: string[]): Promise<{ sent: boolean; channel: string; error?: string; skipped?: string }> {
  const target = thread.reply_target as ReplyTarget | null;
  if (!endpoint.reply?.enabled) return { sent: false, channel: 'none', skipped: 'Replies are off for this endpoint.' };
  if (!text.trim()) return { sent: false, channel: 'none', skipped: 'The agent gave no reply text.' };
  const secrets = await decryptSecrets(endpoint);
  try {
    if (target?.kind === 'whatsapp') {
      if (!secrets.access_token) return { sent: false, channel: 'whatsapp', error: 'No access token set for replies.' };
      for (const part of chunks(text, 4000)) {
        await graphPost(`${GRAPH}/${encodeURIComponent(target.phone_number_id)}/messages`, secrets.access_token, {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: target.to,
          type: 'text',
          text: { preview_url: false, body: part },
        });
      }
      return { sent: true, channel: 'whatsapp' };
    }
    if (target?.kind === 'messenger' || target?.kind === 'instagram') {
      if (!secrets.access_token) return { sent: false, channel: target.kind, error: 'No page access token set for replies.' };
      for (const part of chunks(text, 1900)) {
        await graphPost(`${GRAPH}/me/messages`, secrets.access_token, { recipient: { id: target.recipient_id }, messaging_type: 'RESPONSE', message: { text: part } });
      }
      return { sent: true, channel: target.kind };
    }
    if (target?.kind === 'webhook' && endpoint.reply?.url) {
      if (!isSafeReplyUrl(endpoint.reply.url)) return { sent: false, channel: 'webhook', error: 'The reply URL is not a public https URL.' };
      const payload = JSON.stringify({ conversation_key: thread.conversation_key, thread_id: thread.id, text, in_reply_to: eventIds, sent_at: new Date().toISOString() });
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (secrets.reply_secret) headers['X-Signature'] = `sha256=${crypto.createHmac('sha256', secrets.reply_secret).update(payload).digest('hex')}`;
      const res = await fetch(endpoint.reply.url, { method: 'POST', headers, body: payload, redirect: 'manual', signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`Reply URL answered ${res.status}`);
      return { sent: true, channel: 'webhook' };
    }
    return { sent: false, channel: target?.kind ?? 'none', skipped: 'This source has no reply channel (the result stays in the conversation).' };
  } catch (err) {
    return { sent: false, channel: target?.kind ?? 'none', error: (err as Error).message.slice(0, 500) };
  }
}

/** Hook from agent-runs when an inbound run ends: reply, then run queued messages. */
export async function onInboundRunFinished(run: Row, status: 'ok' | 'error', detail: string | null, message?: string | null) {
  if (!run.inbound_thread_id) return;
  const db = getSupabaseAdminClient();
  const { data: thread } = await db.from('inbound_threads').select('*').eq('id', run.inbound_thread_id).maybeSingle();
  if (!thread) return;
  const { data: events } = await db.from('inbound_events').select('id, endpoint_id, route_detail').eq('run_id', run.id);
  const endpointId = events?.[0]?.endpoint_id ?? thread.endpoint_id;
  const { data: endpoint } = endpointId ? await db.from('inbound_endpoints').select(ENDPOINT_COLUMNS).eq('id', endpointId).maybeSingle() : { data: null };
  const wantsReply = (events || []).some((e) => (e.route_detail as any)?.reply !== false);
  const replyStatus =
    status !== 'ok'
      ? { sent: false, error: `The team run failed: ${detail ?? 'unknown error'}` }
      : endpoint && wantsReply
        ? await sendReply(endpoint, thread, message ?? '', (events || []).map((e) => e.id))
        : { sent: false, skipped: 'No reply requested.' };
  for (const e of events || []) await setEvent(e.id, { reply_status: { ...replyStatus, at: new Date().toISOString() } });
  if (endpoint) await startQueued(endpoint, thread);
}

/** Messages that arrived while the thread was busy go to the agent together, in order. */
async function startQueued(endpoint: Row, thread: Row): Promise<string | null> {
  const db = getSupabaseAdminClient();
  const { data: queued } = await db
    .from('inbound_events')
    .select('id, normalized, route_detail')
    .eq('thread_id', thread.id)
    .eq('status', 'queued')
    .order('received_at', { ascending: true })
    .limit(20);
  if (!queued?.length) return null;
  const message =
    queued.length === 1
      ? (queued[0].route_detail as any)?.message ?? defaultMessage(queued[0].normalized as NormalizedEvent)
      : `${queued.length} new messages arrived while you were answering:\n\n${queued.map((q) => (q.route_detail as any)?.message ?? defaultMessage(q.normalized as NormalizedEvent)).join('\n\n')}`;
  await db.from('inbound_threads').update({ pending_count: 0 }).eq('id', thread.id);
  return startThreadRun(endpoint, thread, queued.map((q) => q.id), message);
}

// ---------------------------------------------------------------------------
// Maintenance (minute tick)
// ---------------------------------------------------------------------------

export async function sweepInbound(now = Date.now()) {
  const db = getSupabaseAdminClient();
  const stale = new Date(now - 2 * 60_000).toISOString();
  const { data: received } = await db.from('inbound_events').select('id').eq('status', 'received').lte('received_at', stale).limit(20);
  const routed = received?.length ? await processInboundEvents(received.map((r) => r.id)) : [];

  // Queued events whose thread is no longer busy (e.g. a run ended before they queued).
  const { data: queued } = await db.from('inbound_events').select('thread_id, endpoint_id').eq('status', 'queued').lte('updated_at', stale).limit(20);
  let resumed = 0;
  for (const threadId of new Set((queued || []).map((q) => q.thread_id).filter(Boolean))) {
    const { data: thread } = await db.from('inbound_threads').select('*').eq('id', threadId).maybeSingle();
    const endpointId = queued!.find((q) => q.thread_id === threadId)?.endpoint_id;
    const { data: endpoint } = await db.from('inbound_endpoints').select(ENDPOINT_COLUMNS).eq('id', endpointId).maybeSingle();
    if (thread && endpoint && (await startQueued(endpoint, thread))) resumed++;
  }

  const { data: purged } = await db.from('inbound_events').delete().lte('received_at', new Date(now - RETENTION_DAYS * 86_400_000).toISOString()).select('id');
  return { routed: routed.length, resumed, purged: purged?.length ?? 0 };
}

// ---------------------------------------------------------------------------
// Event log, replay, dry run
// ---------------------------------------------------------------------------

export async function listEvents(ctx: Pick<Ctx, 'tenantId'>, endpointId: string, opts: { status?: string; limit?: number } = {}) {
  await loadEndpoint(ctx, endpointId);
  let query = getSupabaseAdminClient()
    .from('inbound_events')
    .select(EVENT_COLUMNS)
    .eq('endpoint_id', endpointId)
    .eq('tenant_id', ctx.tenantId)
    .order('received_at', { ascending: false })
    .limit(Math.min(opts.limit ?? 50, 200));
  if (opts.status) query = query.eq('status', opts.status);
  const { data } = await query;
  return { events: (data || []).map(({ tenant_id: _t, ...e }: Row) => e) };
}

export async function replayEvent(ctx: Pick<Ctx, 'tenantId'>, endpointId: string, eventId: string) {
  await loadEndpoint(ctx, endpointId);
  const { data } = await getSupabaseAdminClient()
    .from('inbound_events')
    .update({ status: 'received', error: null, run_id: null, reply_status: null, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('endpoint_id', endpointId)
    .eq('tenant_id', ctx.tenantId)
    .select('id');
  if (!data?.length) throw new ServiceError('Event not found for this endpoint.', 'NOT_FOUND');
  const [result] = await processInboundEvents([eventId]);
  return result ?? { id: eventId, status: 'received' };
}

/** Show how a sample payload would be routed: no signature check, no thread, no run. */
export async function dryRun(ctx: Pick<Ctx, 'tenantId'>, endpointId: string, rawBody: string) {
  const endpoint = await loadEndpoint(ctx, endpointId);
  let parsed;
  try {
    parsed = PRESETS[endpoint.preset as InboundPreset].parse(rawBody);
  } catch {
    throw new ServiceError('The sample is not valid for this source (expected JSON for this preset).', 'INVALID');
  }
  const results = [];
  for (const event of parsed.events) {
    const decision = event.type === 'message' || event.type === 'call_result' ? await decideRoute(endpoint, event, parsed.body) : null;
    let teamName: string | null = null;
    if (decision?.team_id) teamName = (await getTeam(systemCtx(endpoint.tenant_id), decision.team_id).catch(() => null))?.name ?? null;
    results.push({ event, decision: decision ? { ...decision, team_name: teamName } : { action: 'ignore', reason: 'Status updates are recorded, not routed.' } });
  }
  return { events: results };
}

/** Threads for Conversations (channel and contact per session). */
export async function threadsBySession(tenantId: string): Promise<Map<string, Row>> {
  const { data } = await getSupabaseAdminClient().from('inbound_threads').select('id, session_id, channel, contact, conversation_key, endpoint_id').eq('tenant_id', tenantId);
  return new Map((data || []).filter((t: Row) => t.session_id).map((t: Row) => [t.session_id, t]));
}
