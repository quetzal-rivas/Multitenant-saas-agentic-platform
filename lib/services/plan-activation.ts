import { getSupabaseAdminClient } from '@/lib/supabase';
import { LIMIT_LABELS, PLANS } from '@/lib/billing/plans';
import { effectivePlan, RESOURCE_COUNTERS, SCHEDULE_SLOT_STATUSES } from './plan-limits';
import { LimitError, ServiceError } from './errors';

/**
 * What runs after a downgrade. Nothing is deleted: when an organization has more agents,
 * teams or scheduled items than its plan allows, the ones beyond the limit are paused (they
 * cannot run). The active ones are the organization's own choices (most recent first), then
 * the oldest. It is computed on every check, so upgrading reactivates everything at once.
 */

export type PausableKind = 'agents' | 'teams' | 'schedules';
export const PAUSABLE_KINDS: PausableKind[] = ['agents', 'teams', 'schedules'];

export interface ActivationItem {
  id: string;
  name: string;
  created_at: string;
  pinned: boolean;
  active: boolean;
}

type Item = Omit<ActivationItem, 'pinned' | 'active'>;
const db = () => getSupabaseAdminClient();

async function listItems(tenantId: string, kind: PausableKind): Promise<Item[]> {
  if (kind === 'agents') {
    const { data, error } = await db().from('agent_sessions').select('id, name, created_at').eq('tenant_id', tenantId).eq('agent_type', 'single').is('archived_at', null);
    if (error) throw new Error(`Could not list agents: ${error.message}`);
    return (data || []) as Item[];
  }
  if (kind === 'teams') {
    const { data, error } = await db().from('agent_teams').select('id, name, created_at').eq('tenant_id', tenantId).is('archived_at', null);
    if (error) throw new Error(`Could not list teams: ${error.message}`);
    return (data || []) as Item[];
  }
  // Scheduled tasks and team heartbeats share one limit (the same ones the schedules counter counts).
  const [tasks, heartbeats] = await Promise.all([
    db().from('supervisor_tasks').select('id, title, created_at').eq('tenant_id', tenantId).in('status', [...SCHEDULE_SLOT_STATUSES]).eq('paused', false),
    db().from('agent_teams').select('id, name, created_at').eq('tenant_id', tenantId).eq('heartbeat_enabled', true).is('archived_at', null),
  ]);
  if (tasks.error || heartbeats.error) throw new Error(`Could not list scheduled items: ${(tasks.error || heartbeats.error)!.message}`);
  return [
    ...((tasks.data || []) as Array<{ id: string; title: string; created_at: string }>).map((t) => ({ id: `task:${t.id}`, name: t.title, created_at: t.created_at })),
    ...((heartbeats.data || []) as Item[]).map((h) => ({ id: `heartbeat:${h.id}`, name: `${h.name} (heartbeat)`, created_at: h.created_at })),
  ];
}

/** Every item of a kind with whether it is active under the current plan. */
export async function activation(tenantId: string, kind: PausableKind): Promise<{ limit: number; items: ActivationItem[] }> {
  const [plan, items, { data: pins }] = await Promise.all([
    effectivePlan(tenantId),
    listItems(tenantId, kind),
    db().from('resource_activation').select('resource_id, pinned_at').eq('tenant_id', tenantId).eq('kind', kind),
  ]);
  const pinnedAt = new Map(((pins || []) as Array<{ resource_id: string; pinned_at: string }>).map((p) => [p.resource_id, p.pinned_at]));
  const limit = plan.limits[kind];
  const ordered = [...items].sort((a, b) => {
    const pa = pinnedAt.get(a.id);
    const pb = pinnedAt.get(b.id);
    if (pa && pb) return pb.localeCompare(pa); // the most recent choice wins a place first
    if (pa || pb) return pa ? -1 : 1;
    return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id); // then the oldest
  });
  return { limit, items: ordered.map((it, i) => ({ ...it, pinned: pinnedAt.has(it.id), active: i < limit })) };
}

/** Whether an item may run. Cheap when the organization is within its limit (one count). */
export async function isActive(tenantId: string, kind: PausableKind, id: string): Promise<boolean> {
  const plan = await effectivePlan(tenantId);
  if ((await RESOURCE_COUNTERS[kind]!(tenantId)) <= plan.limits[kind]) return true;
  const { items } = await activation(tenantId, kind);
  // An item that is not counted (archived, paused task) is not this check's business.
  return items.find((it) => it.id === id)?.active ?? true;
}

/** Refuse to run an item the plan has paused (402 RESOURCE_PAUSED). */
export async function assertActive(tenantId: string, kind: PausableKind, id: string): Promise<void> {
  if (await isActive(tenantId, kind, id)) return;
  const plan = await effectivePlan(tenantId);
  throw new LimitError(
    `Paused by your plan: ${PLANS[plan.plan].name} allows ${plan.limits[kind]} active ${LIMIT_LABELS[kind]}. Choose which stay active in Account & Billing, or upgrade.`,
    'RESOURCE_PAUSED',
    { limit_key: kind, limit: plan.limits[kind], plan: plan.plan, upgrade: true }
  );
}

/** Items the plan currently pauses, per kind (only kinds over their limit). */
export async function pausedResources(tenantId: string) {
  const out: Array<{ kind: PausableKind; label: string; limit: number; total: number; active: ActivationItem[]; paused: ActivationItem[] }> = [];
  for (const kind of PAUSABLE_KINDS) {
    const { limit, items } = await activation(tenantId, kind);
    if (items.length <= limit) continue;
    out.push({ kind, label: LIMIT_LABELS[kind], limit, total: items.length, active: items.filter((i) => i.active), paused: items.filter((i) => !i.active) });
  }
  return out;
}

/** The organization chooses to keep an item active; the least recently chosen/newest one pauses instead. */
export async function keepActive(ctx: { tenantId: string; userId: string }, kindRaw: unknown, idRaw: unknown) {
  const kind = kindRaw as PausableKind;
  if (!PAUSABLE_KINDS.includes(kind)) throw new ServiceError('kind must be agents, teams or schedules.', 'INVALID');
  const id = typeof idRaw === 'string' ? idRaw : '';
  const { items } = await activation(ctx.tenantId, kind);
  if (!items.some((it) => it.id === id)) throw new ServiceError('That item was not found in this organization.', 'NOT_FOUND');
  const { error } = await db()
    .from('resource_activation')
    .upsert(
      { tenant_id: ctx.tenantId, kind, resource_id: id, pinned_at: new Date().toISOString(), pinned_by: /^[0-9a-f-]{36}$/i.test(ctx.userId) ? ctx.userId : null },
      { onConflict: 'tenant_id,kind,resource_id' }
    );
  if (error) throw new Error(`Could not save the choice: ${error.message}`);
  return pausedResources(ctx.tenantId);
}
