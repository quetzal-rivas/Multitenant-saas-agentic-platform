import { getSupabaseAdminClient } from '@/lib/supabase';
import { ServiceError } from './errors';

/**
 * Logs & Tracing: one feed of what happened in the organization, read from the real
 * tables: agent runs (with their step timeline from run_events), webhook deliveries
 * (inbound_events) and Function Studio calls (function_invocations).
 */

export type ActivityKind = 'run' | 'webhook' | 'function';
export type ActivityStatus = 'ok' | 'error' | 'active' | 'other';

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  at: string;
  status: ActivityStatus;
  /** The raw status of the source row (done, routed, timeout...). */
  detail_status: string;
  title: string;
  subtitle: string;
  duration_ms: number | null;
  tokens: number | null;
  error: string | null;
}

export interface TimelineEvent {
  at: string;
  type: string;
  name: string;
  status: string;
  worker: string | null;
  latency_ms: number | null;
  error: string | null;
}

type Row = Record<string, any>;
const db = () => getSupabaseAdminClient();
const SOURCE_LIMIT = 200;

const RUN_STATUS: Record<string, ActivityStatus> = { done: 'ok', error: 'error', queued: 'active', running: 'active', cancelled: 'other' };
const HOOK_STATUS: Record<string, ActivityStatus> = { routed: 'ok', failed: 'error', received: 'active', processing: 'active', queued: 'active', ignored: 'other' };
const FN_STATUS: Record<string, ActivityStatus> = { ok: 'ok', error: 'error', timeout: 'error' };
const ORIGIN_LABEL: Record<string, string> = { chat: 'Chat', heartbeat: 'Heartbeat', task: 'Scheduled task', inbound: 'Webhook', room: 'Live call' };

function ms(from?: string | null, to?: string | null): number | null {
  if (!from || !to) return null;
  const d = new Date(to).getTime() - new Date(from).getTime();
  return Number.isFinite(d) && d >= 0 ? d : null;
}

async function namesById(table: string, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data } = await db().from(table).select('id, name').in('id', unique);
  return new Map((data || []).map((r: Row) => [r.id, r.name]));
}

async function runEntries(tenantId: string, before?: string): Promise<ActivityEntry[]> {
  let q = db()
    .from('agent_runs')
    .select('id, session_id, origin, kind, status, input_message, error, tokens_used, progress, started_at, finished_at, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(SOURCE_LIMIT);
  if (before) q = q.lte('created_at', before);
  const { data } = await q;
  const rows = data || [];
  const names = await namesById('agent_sessions', rows.map((r: Row) => r.session_id));
  return rows.map((r: Row) => ({
    id: r.id,
    kind: 'run' as const,
    at: r.created_at,
    status: RUN_STATUS[r.status] ?? 'other',
    detail_status: r.status,
    title: names.get(r.session_id) ?? 'Agent run',
    subtitle: `${ORIGIN_LABEL[r.origin] ?? r.origin}${r.kind === 'external' ? ' · external' : ''} · ${String(r.input_message ?? '').slice(0, 140)}`,
    duration_ms: ms(r.started_at ?? r.created_at, r.finished_at),
    tokens: r.tokens_used ?? null,
    error: r.error ?? null,
  }));
}

async function webhookEntries(tenantId: string, before?: string): Promise<ActivityEntry[]> {
  let q = db()
    .from('inbound_events')
    .select('id, endpoint_id, provider_event_id, received_at, updated_at, signature_ok, status, error')
    .eq('tenant_id', tenantId)
    .order('received_at', { ascending: false })
    .limit(SOURCE_LIMIT);
  if (before) q = q.lte('received_at', before);
  const { data } = await q;
  const rows = data || [];
  const names = await namesById('inbound_endpoints', rows.map((r: Row) => r.endpoint_id));
  return rows.map((r: Row) => ({
    id: r.id,
    kind: 'webhook' as const,
    at: r.received_at,
    status: HOOK_STATUS[r.status] ?? 'other',
    detail_status: r.status,
    title: names.get(r.endpoint_id) ?? 'Webhook',
    subtitle: `${r.signature_ok ? 'Signature verified' : 'Signature not verified'} · event ${String(r.provider_event_id).slice(0, 60)}`,
    duration_ms: ms(r.received_at, r.updated_at),
    tokens: null,
    error: r.error ?? null,
  }));
}

async function functionEntries(tenantId: string, before?: string): Promise<ActivityEntry[]> {
  let q = db()
    .from('function_invocations')
    .select('id, function_id, caller, source, status, duration_ms, error, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(SOURCE_LIMIT);
  if (before) q = q.lte('created_at', before);
  const { data } = await q;
  const rows = data || [];
  const names = await namesById('custom_functions', rows.map((r: Row) => r.function_id));
  const SOURCE: Record<string, string> = { test: 'Test from the studio', agent: 'Called by an agent', mcp: 'Called over MCP' };
  return rows.map((r: Row) => ({
    id: r.id,
    kind: 'function' as const,
    at: r.created_at,
    status: FN_STATUS[r.status] ?? 'other',
    detail_status: r.status,
    title: names.get(r.function_id) ?? 'Function',
    subtitle: SOURCE[r.source] ?? r.source,
    duration_ms: r.duration_ms ?? null,
    tokens: null,
    error: r.error ?? null,
  }));
}

export async function listActivity(
  tenantId: string,
  opts: { kind?: ActivityKind; status?: ActivityStatus; before?: string; limit?: number } = {},
): Promise<{ entries: ActivityEntry[]; next_before: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);
  const sources: Promise<ActivityEntry[]>[] = [];
  if (!opts.kind || opts.kind === 'run') sources.push(runEntries(tenantId, opts.before));
  if (!opts.kind || opts.kind === 'webhook') sources.push(webhookEntries(tenantId, opts.before));
  if (!opts.kind || opts.kind === 'function') sources.push(functionEntries(tenantId, opts.before));
  let entries = (await Promise.all(sources)).flat();
  // The cursor is inclusive (lte), so drop the entry the previous page ended on.
  if (opts.before) entries = entries.filter((e) => e.at < opts.before!);
  if (opts.status) entries = entries.filter((e) => e.status === opts.status);
  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const page = entries.slice(0, limit);
  return { entries: page, next_before: entries.length > limit ? page[page.length - 1].at : null };
}

/** One run's step timeline: start, tool calls (with worker and latency), messages, errors, end. */
export async function getRunTimeline(tenantId: string, runId: string) {
  const { data: run } = await db()
    .from('agent_runs')
    .select('id, session_id, origin, kind, status, input_message, result, error, tokens_used, usage_by_worker, labels, started_at, finished_at, created_at')
    .eq('id', runId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!run) throw new ServiceError('Run not found', 'NOT_FOUND');
  const [{ data: events }, names] = await Promise.all([
    db()
      .from('run_events')
      .select('event_type, step_name, status, payload, created_at')
      .eq('run_id', runId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true })
      .limit(500),
    namesById('agent_sessions', [run.session_id]),
  ]);
  const timeline: TimelineEvent[] = (events || []).map((e: Row) => ({
    at: e.created_at,
    type: e.event_type,
    name: e.payload?.toolName ?? e.step_name,
    status: e.status,
    worker: e.payload?.worker ?? null,
    latency_ms: typeof e.payload?.latencyMs === 'number' ? e.payload.latencyMs : null,
    error: e.payload?.error ? String(e.payload.error).slice(0, 2000) : null,
  }));
  return {
    run: {
      id: run.id,
      agent: names.get(run.session_id) ?? 'Agent',
      agent_id: run.session_id,
      origin: ORIGIN_LABEL[run.origin] ?? run.origin,
      kind: run.kind ?? 'internal',
      status: run.status,
      input: String(run.input_message ?? '').slice(0, 4000),
      answer: run.result?.message ? String(run.result.message).slice(0, 4000) : null,
      error: run.error ?? null,
      tokens_used: run.tokens_used ?? 0,
      usage_by_worker: run.usage_by_worker ?? {},
      labels: run.labels ?? {},
      created_at: run.created_at,
      started_at: run.started_at ?? null,
      finished_at: run.finished_at ?? null,
      queue_ms: ms(run.created_at, run.started_at),
      duration_ms: ms(run.started_at ?? run.created_at, run.finished_at),
    },
    timeline,
  };
}
