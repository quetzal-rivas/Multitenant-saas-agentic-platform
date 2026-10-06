import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { previewRuns } from '@/lib/agent/heartbeat-schedule';
import { TASK_COLUMNS } from './tasks';

/**
 * Everything timed in an organization for a date range: scheduled task occurrences (past
 * runs and upcoming), team heartbeats, and Supervisor Board due dates.
 */

type Ctx = Pick<AuthContext, 'tenantId'>;
type Row = Record<string, any>;
const MAX_PER_SOURCE = 300;

export interface CalendarItem {
  kind: 'task' | 'task_run' | 'heartbeat' | 'board_due';
  id: string;
  ref_id: string;
  title: string;
  at: string;
  status?: string;
  team_id?: string | null;
}

function upcoming(schedule: any, from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let cursor = from;
  while (out.length < MAX_PER_SOURCE) {
    const batch = previewRuns(schedule, cursor, 50);
    for (const d of batch) {
      if (d > to) return out;
      out.push(d);
    }
    cursor = batch[batch.length - 1];
  }
  return out;
}

export async function calendarItems(ctx: Ctx, from: Date, to: Date) {
  const db = getSupabaseAdminClient();
  const now = new Date();
  const items: CalendarItem[] = [];
  let truncated = false;

  // Scheduled tasks: upcoming occurrences.
  const { data: tasks } = await db.from('supervisor_tasks').select(TASK_COLUMNS).eq('tenant_id', ctx.tenantId);
  for (const t of tasks || []) {
    if (t.status !== 'scheduled' || t.paused) continue;
    const start = from > now ? from : now;
    const times = t.schedule ? upcoming(t.schedule, new Date(start.getTime() - 1), to) : t.next_run_at ? [new Date(t.next_run_at)] : [];
    if (times.length >= MAX_PER_SOURCE) truncated = true;
    for (const d of times) {
      if (d < from || d > to) continue;
      items.push({ kind: 'task', id: `${t.id}:${d.toISOString()}`, ref_id: t.id, title: t.title, at: d.toISOString(), status: 'scheduled', team_id: t.team_id });
    }
  }

  // Past and running task runs.
  const { data: runs } = await db
    .from('agent_runs')
    .select('id, task_id, status, created_at')
    .eq('tenant_id', ctx.tenantId)
    .eq('origin', 'task')
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .limit(MAX_PER_SOURCE);
  const titles = new Map((tasks || []).map((t: Row) => [t.id, t.title]));
  for (const r of runs || []) {
    items.push({ kind: 'task_run', id: r.id, ref_id: r.task_id, title: titles.get(r.task_id) || 'Task run', at: r.created_at, status: r.status });
  }

  // Team heartbeats.
  const { data: teams } = await db
    .from('agent_teams')
    .select('id, name, heartbeat_enabled, heartbeat_schedule')
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null);
  for (const team of teams || []) {
    if (!team.heartbeat_enabled || !team.heartbeat_schedule) continue;
    const start = from > now ? from : now;
    const times = upcoming(team.heartbeat_schedule, new Date(start.getTime() - 1), to);
    if (times.length >= MAX_PER_SOURCE) truncated = true;
    for (const d of times) {
      items.push({ kind: 'heartbeat', id: `${team.id}:${d.toISOString()}`, ref_id: team.id, title: `${team.name} heartbeat`, at: d.toISOString(), team_id: team.id });
    }
  }

  // Board due dates.
  const { data: board } = await db
    .from('board_tasks')
    .select('id, title, status, due_at, assigned_team_id')
    .eq('tenant_id', ctx.tenantId)
    .gte('due_at', from.toISOString())
    .lte('due_at', to.toISOString())
    .limit(MAX_PER_SOURCE);
  for (const b of board || []) {
    if (b.status === 'cancelled') continue;
    items.push({ kind: 'board_due', id: b.id, ref_id: b.id, title: b.title, at: b.due_at, status: b.status, team_id: b.assigned_team_id });
  }

  items.sort((a, b) => a.at.localeCompare(b.at));
  return { from: from.toISOString(), to: to.toISOString(), items, truncated };
}
