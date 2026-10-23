import crypto from 'crypto';
import { setPlanWithoutEntitlementForTests } from '../../lib/services/plan-limits';

// Suites written before plans existed run without limits; plan tests seed entitlements explicitly.
setPlanWithoutEntitlementForTests('unlimited');

/**
 * In-memory PostgREST stand-in for end-to-end tests through the real supabase-js
 * client. Supports the filters the services use: eq, is.null, lte, gte, order, limit.
 */

export type Row = Record<string, any>;
export const tables: Record<string, Row[]> = {};

function matches(row: Row, params: URLSearchParams): boolean {
  for (const [col, expr] of params) {
    if (['select', 'order', 'limit', 'offset', 'columns'].includes(col)) continue;
    const dot = expr.indexOf('.');
    const op = expr.slice(0, dot);
    const raw = expr.slice(dot + 1);
    const value = row[col];
    if (op === 'eq' && String(value) !== raw) return false;
    if (op === 'is' && raw === 'null' && value !== null && value !== undefined) return false;
    if (op === 'lte' && !(value !== null && value !== undefined && String(value) <= raw)) return false;
    if (op === 'gte' && !(value !== null && value !== undefined && String(value) >= raw)) return false;
    if (op === 'in') {
      const list = raw.replace(/^\(|\)$/g, '').split(',').map((v) => v.replace(/^"|"$/g, ''));
      if (!list.includes(String(value))) return false;
    }
  }
  return true;
}

function project(row: Row, select: string | null): Row {
  if (!select || select === '*') return { ...row };
  const out: Row = {};
  for (const col of select.split(',').map((c) => c.trim())) out[col] = row[col];
  return out;
}

function sortRows(rows: Row[], order: string | null): Row[] {
  if (!order) return rows;
  const [col, dir] = order.split('.');
  return [...rows].sort((a, b) => {
    const cmp = a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0;
    return dir === 'desc' ? -cmp : cmp;
  });
}

function respond(rows: Row[], accept: string | null, status = 200, total?: number, offset = 0): Response {
  if (accept?.includes('vnd.pgrst.object+json')) {
    if (rows.length !== 1) {
      return new Response(JSON.stringify({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' }), { status: 406 });
    }
    return new Response(JSON.stringify(rows[0]), { status });
  }
  const headers: Record<string, string> = {};
  if (total !== undefined) {
    headers['content-range'] = rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}`;
  }
  return new Response(JSON.stringify(rows), { status, headers });
}

let clock = 0;

/** Unique constraints the services rely on (a duplicate insert returns Postgres error 23505). */
const UNIQUE_KEYS: Record<string, string[]> = {
  trial_grants: ['tenant_id', 'tier'],
  entitlements: ['tenant_id'],
};

/**
 * Database functions emulated in JS (single-threaded, so as atomic as the real ones).
 * Keep in sync with supabase/migrations (scripts/ci/sql-tests checks the real SQL).
 */
const RPC: Record<string, (args: Row) => unknown> = {
  start_agent_run({ p_run, p_max_concurrent, p_max_tokens_day, p_max_runs_month, p_global_max_concurrent }: Row) {
    const runs = (tables.agent_runs ||= []);
    const tenant = p_run.tenant_id;
    if (p_run.client_ref) {
      const existing = runs.find((r) => r.tenant_id === tenant && r.client_ref === p_run.client_ref);
      if (existing) return { outcome: 'reused', run_id: existing.id };
    }
    if ((tables.platform_settings ||= []).some((s) => s.key === 'runs_paused' && s.value === 'true')) return { outcome: 'platform_paused' };
    const org = (tables.organizations ||= []).find((o) => o.id === tenant);
    if (org?.agents_paused_at) return { outcome: 'paused', paused_at: org.agents_paused_at };
    const isActive = (r: Row) => r.status === 'queued' || r.status === 'running';
    const active = runs.filter((r) => r.tenant_id === tenant && isActive(r));
    if (active.length >= p_max_concurrent) return { outcome: 'concurrency', active: active.length, limit: p_max_concurrent };
    if (p_global_max_concurrent != null) {
      const all = runs.filter(isActive).length;
      if (all >= p_global_max_concurrent) return { outcome: 'platform_capacity', active: all, limit: p_global_max_concurrent };
    }
    const now = new Date();
    if (p_max_runs_month != null) {
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
      const month = runs.filter((r) => r.tenant_id === tenant && String(r.created_at) >= monthStart).length;
      if (month >= p_max_runs_month) return { outcome: 'monthly_quota', used: month, limit: p_max_runs_month };
    }
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
    const used = runs.filter((r) => r.tenant_id === tenant && String(r.created_at) >= dayStart).reduce((n, r) => n + (r.tokens_used ?? 0), 0);
    if (used >= p_max_tokens_day) return { outcome: 'daily_cap', used, limit: p_max_tokens_day };
    if (active.some((r) => r.session_id === p_run.session_id)) return { outcome: 'busy' };
    runs.push({ ...p_run });
    return { outcome: 'created', run_id: p_run.id };
  },
  consume_api_request({ p_tenant, p_month, p_minute, p_ops_limit, p_rpm_limit }: Row) {
    const counters = (tables.usage_counters ||= []);
    const get = (metric: string, period: string) => counters.find((c) => c.tenant_id === p_tenant && c.metric === metric && c.period === period);
    const ops = get('api_ops', p_month)?.used ?? 0;
    if (ops >= p_ops_limit) return { outcome: 'monthly_quota', used: ops, limit: p_ops_limit };
    const rpm = get('api_rpm', p_minute)?.used ?? 0;
    if (rpm >= p_rpm_limit) return { outcome: 'rate_limited', used: rpm, limit: p_rpm_limit };
    for (const [metric, period] of [['api_ops', p_month], ['api_rpm', p_minute]]) {
      const row = get(metric, period);
      if (row) row.used += 1;
      else counters.push({ tenant_id: p_tenant, metric, period, used: 1 });
    }
    return { outcome: 'ok', used: ops + 1, limit: p_ops_limit };
  },
  /** auth.users is emulated as tables.auth_users ({ id, email }). */
  user_id_by_email({ p_email }: Row) {
    return (tables.auth_users || []).find((u) => String(u.email).toLowerCase() === String(p_email).toLowerCase())?.id ?? null;
  },
  org_member_emails({ p_org }: Row) {
    return (tables.organization_members || [])
      .filter((m) => m.organization_id === p_org)
      .map((m) => ({ user_id: m.user_id, email: (tables.auth_users || []).find((u) => u.id === m.user_id)?.email ?? null }));
  },
};

export async function fakePostgrest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const table = url.pathname.split('/rest/v1/')[1];
  const headers = new Headers(init?.headers);
  const accept = headers.get('Accept');
  const method = (init?.method || 'GET').toUpperCase();
  const rows = (tables[table] ||= []);
  const select = url.searchParams.get('select');

  if (table.startsWith('rpc/')) {
    const fn = RPC[table.slice(4)];
    if (!fn) return new Response(JSON.stringify({ message: `unknown function ${table}` }), { status: 404 });
    return new Response(JSON.stringify(fn(JSON.parse(String(init?.body || '{}')))), { status: 200 });
  }
  if (method === 'GET') {
    const all = sortRows(rows.filter((r) => matches(r, url.searchParams)), url.searchParams.get('order'));
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = url.searchParams.get('limit');
    const found = all.slice(offset, limit ? offset + Number(limit) : undefined);
    const wantsCount = (headers.get('Prefer') || '').includes('count=exact');
    return respond(found.map((r) => project(r, select)), accept, 200, wantsCount ? all.length : undefined, offset);
  }
  if (method === 'POST') {
    const body = JSON.parse(String(init?.body));
    const unique = UNIQUE_KEYS[table];
    if (unique) {
      const clash = (Array.isArray(body) ? body : [body]).some((r: Row) => rows.some((x) => unique.every((k) => String(x[k]) === String(r[k]))));
      if (clash) return new Response(JSON.stringify({ code: '23505', message: `duplicate key value violates unique constraint on ${table}` }), { status: 409 });
    }
    const inserted = (Array.isArray(body) ? body : [body]).map((r: Row) => ({
      id: crypto.randomUUID(),
      created_at: new Date(Date.UTC(2026, 0, 1) + clock * 1000).toISOString(),
      updated_at: new Date(Date.UTC(2026, 0, 1) + clock++ * 1000).toISOString(),
      revoked_at: null,
      archived_at: null,
      is_active: true,
      ...r,
    }));
    rows.push(...inserted);
    return respond(inserted.map((r) => project(r, select)), accept, 201);
  }
  if (method === 'PATCH') {
    const patch = JSON.parse(String(init?.body));
    const updated = rows.filter((r) => matches(r, url.searchParams));
    updated.forEach((r) => Object.assign(r, patch));
    return respond(updated.map((r) => project(r, select)), accept);
  }
  if (method === 'DELETE') {
    const removed = rows.filter((r) => matches(r, url.searchParams));
    tables[table] = rows.filter((r) => !removed.includes(r));
    return respond(removed.map((r) => project(r, select)), accept);
  }
  return new Response('unsupported', { status: 500 });
}

export function resetTables(names: string[]) {
  for (const name of names) tables[name] = [];
}
