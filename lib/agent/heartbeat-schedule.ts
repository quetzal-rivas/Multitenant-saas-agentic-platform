import { z } from 'zod';
import { CronExpressionParser } from 'cron-parser';

/**
 * Team heartbeat schedules. Shared by the Team Builder (preview) and the heartbeat
 * tick endpoint (execution), so what the UI shows is exactly what runs.
 */

/** Never wake a team more often than this; protects the tenant's LLM budget. */
export const MIN_HEARTBEAT_MINUTES = 5;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24h)');
const weekday = z.number().int().min(0).max(6); // 0 = Sunday
const timezone = z.string().min(1).refine(isValidTimeZone, { message: 'Unknown time zone' });

export const heartbeatScheduleSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('interval'),
    every: z.number().int().min(1).max(10_000),
    unit: z.enum(['minutes', 'hours', 'days']),
    timezone,
    /** Optional window: only run between these local times... */
    active_hours: z.object({ start: hhmm, end: hhmm }).optional(),
    /** ...and only on these local weekdays. */
    active_days: z.array(weekday).min(1).max(7).optional(),
  }).strict(),
  z.object({
    mode: z.literal('weekly'),
    days: z.array(weekday).min(1).max(7),
    times: z.array(hhmm).min(1).max(24),
    timezone,
  }).strict(),
  z.object({
    mode: z.literal('cron'),
    expression: z.string().trim().min(9).max(120),
    timezone,
  }).strict(),
]).superRefine((s, ctx) => {
  if (s.mode === 'interval' && intervalMinutes(s) < MIN_HEARTBEAT_MINUTES) {
    ctx.addIssue({ code: 'custom', path: ['every'], message: `Minimum interval is ${MIN_HEARTBEAT_MINUTES} minutes` });
  }
  if (s.mode === 'cron') {
    const fields = s.expression.trim().split(/\s+/);
    if (fields.length !== 5) {
      ctx.addIssue({ code: 'custom', path: ['expression'], message: 'Use 5 fields: minute hour day month weekday' });
      return;
    }
    try {
      const runs = previewRuns(s as HeartbeatSchedule, new Date(), 12);
      for (let i = 1; i < runs.length; i++) {
        if (runs[i].getTime() - runs[i - 1].getTime() < MIN_HEARTBEAT_MINUTES * 60_000) {
          ctx.addIssue({ code: 'custom', path: ['expression'], message: `Runs must be at least ${MIN_HEARTBEAT_MINUTES} minutes apart` });
          break;
        }
      }
    } catch (err) {
      ctx.addIssue({ code: 'custom', path: ['expression'], message: `Invalid cron expression: ${(err as Error).message}` });
    }
  }
});

export type HeartbeatSchedule = z.infer<typeof heartbeatScheduleSchema>;

export const DEFAULT_HEARTBEAT_SCHEDULE: HeartbeatSchedule = {
  mode: 'interval',
  every: 15,
  unit: 'minutes',
  timezone: 'America/Mexico_City',
};

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function intervalMinutes(s: { every: number; unit: 'minutes' | 'hours' | 'days' }): number {
  return s.every * (s.unit === 'minutes' ? 1 : s.unit === 'hours' ? 60 : 1440);
}

/** Local calendar parts of an instant in a time zone. */
export function localParts(date: Date, tz: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
  const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdayIndex,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

function nextCron(expression: string, after: Date, tz: string): Date {
  return CronExpressionParser.parse(expression, { currentDate: after, tz }).next().toDate();
}

function insideWindow(s: Extract<HeartbeatSchedule, { mode: 'interval' }>, date: Date): boolean {
  const local = localParts(date, s.timezone);
  if (s.active_days && !s.active_days.includes(local.weekday)) return false;
  if (!s.active_hours) return true;
  const start = toMinutes(s.active_hours.start);
  const end = toMinutes(s.active_hours.end);
  // Windows may cross midnight, e.g. 22:00–06:00.
  return start <= end ? local.minutes >= start && local.minutes < end : local.minutes >= start || local.minutes < end;
}

/**
 * Next run strictly after `after`. For intervals, `lastRun` anchors the cadence
 * (falls back to `after`); runs landing outside the active window move to the
 * window's next opening.
 */
export function nextRun(s: HeartbeatSchedule, after: Date, lastRun?: Date | null): Date {
  if (s.mode === 'cron') return nextCron(s.expression, after, s.timezone);

  if (s.mode === 'weekly') {
    const days = s.days.join(',');
    return s.times
      .map((t) => nextCron(`${Number(t.slice(3, 5))} ${Number(t.slice(0, 2))} * * ${days}`, after, s.timezone))
      .reduce((a, b) => (a < b ? a : b));
  }

  const step = intervalMinutes(s) * 60_000;
  let candidate = new Date(Math.max((lastRun ?? after).getTime() + step, after.getTime() + 60_000));
  if (!s.active_hours && !s.active_days) return candidate;

  const openAt = s.active_hours ? s.active_hours.start : '00:00';
  const openCron = `${Number(openAt.slice(3, 5))} ${Number(openAt.slice(0, 2))} * * ${s.active_days?.join(',') ?? '*'}`;
  for (let guard = 0; guard < 400 && !insideWindow(s, candidate); guard++) {
    candidate = nextCron(openCron, candidate, s.timezone);
  }
  return candidate;
}

/** The next `count` runs, as the scheduler would execute them back to back. */
export function previewRuns(s: HeartbeatSchedule, from: Date, count = 5): Date[] {
  const runs: Date[] = [];
  let after = from;
  let last: Date | null = null;
  for (let i = 0; i < count; i++) {
    const next = nextRun(s, after, last);
    runs.push(next);
    after = next;
    last = next;
  }
  return runs;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Human summary, e.g. "Every 15 minutes, Mon–Fri 09:00–18:00 (America/Mexico_City)". */
export function describeSchedule(s: HeartbeatSchedule): string {
  const days = (list?: number[]) =>
    !list || list.length === 7
      ? 'every day'
      : list.join(',') === '1,2,3,4,5'
      ? 'Mon–Fri'
      : list.map((d) => DAY_NAMES[d]).join(', ');
  if (s.mode === 'cron') return `Cron "${s.expression}" (${s.timezone})`;
  if (s.mode === 'weekly') return `${days(s.days)} at ${s.times.join(', ')} (${s.timezone})`;
  const unit = s.every === 1 ? s.unit.slice(0, -1) : s.unit;
  const window = s.active_hours ? ` ${s.active_hours.start}–${s.active_hours.end}` : '';
  const scope = s.active_days || s.active_hours ? `, ${days(s.active_days)}${window}` : '';
  return `Every ${s.every} ${unit}${scope} (${s.timezone})`;
}
