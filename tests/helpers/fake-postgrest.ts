import crypto from 'crypto';

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

export async function fakePostgrest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  const table = url.pathname.split('/rest/v1/')[1];
  const headers = new Headers(init?.headers);
  const accept = headers.get('Accept');
  const method = (init?.method || 'GET').toUpperCase();
  const rows = (tables[table] ||= []);
  const select = url.searchParams.get('select');

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
