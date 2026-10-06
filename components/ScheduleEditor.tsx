'use client';

import React, { useMemo } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import {
  MIN_HEARTBEAT_MINUTES,
  describeSchedule,
  heartbeatScheduleSchema,
  previewRuns,
  type HeartbeatSchedule,
} from '@/lib/agent/heartbeat-schedule';

/**
 * Shared editor for repeating schedules (team heartbeats and scheduled tasks):
 * every N minutes/hours/days with optional active hours and days, specific days & times,
 * or a cron expression, always in an explicit time zone, with a preview of the next runs.
 */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CRON_PRESETS = [
  { label: 'Weekdays 09:00', expression: '0 9 * * 1-5' },
  { label: 'Every hour', expression: '0 * * * *' },
  { label: 'Mondays 08:00', expression: '0 8 * * 1' },
  { label: 'Every 30 min, office hours', expression: '*/30 9-17 * * 1-5' },
];
const inputCls = 'w-full bg-[#090b0f] border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500';
const labelCls = 'block text-xs font-semibold text-zinc-400 mb-1';

export function timeZones(): string[] {
  try {
    return (Intl as any).supportedValuesOf('timeZone') as string[];
  } catch {
    return ['UTC', 'America/Mexico_City', 'America/New_York', 'America/Los_Angeles', 'Europe/Madrid'];
  }
}

export function formatWhen(iso: string | null, tz?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const DayPicker: React.FC<{ label: string; value: number[]; onChange: (days: number[]) => void }> = ({ label, value, onChange }) => (
  <div>
    <span className={labelCls}>{label}</span>
    <div className="flex flex-wrap gap-1.5">
      {DAY_LABELS.map((d, i) => {
        const on = value.includes(i);
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== i) : [...value, i].sort())}
            className={`w-11 py-1 rounded-md text-xs border ${on ? 'bg-emerald-600 border-emerald-500 text-white' : 'border-zinc-700 text-zinc-400'}`}
          >
            {d}
          </button>
        );
      })}
      <button type="button" onClick={() => onChange([1, 2, 3, 4, 5])} className="text-[11px] text-zinc-400 hover:text-white ml-1">Weekdays</button>
      <button type="button" onClick={() => onChange([0, 1, 2, 3, 4, 5, 6])} className="text-[11px] text-zinc-400 hover:text-white">Every day</button>
    </div>
  </div>
);

export const ScheduleEditor: React.FC<{
  value: HeartbeatSchedule;
  onChange: (next: HeartbeatSchedule) => void;
  /** Extra fields shown next to the time zone (e.g. a budget guard). */
  extra?: React.ReactNode;
}> = ({ value: schedule, onChange, extra }) => {
  const preview = useMemo(() => {
    const parsed = heartbeatScheduleSchema.safeParse(schedule);
    if (!parsed.success) return { runs: [] as Date[], error: parsed.error.issues[0]?.message ?? 'Invalid schedule' };
    try {
      return { runs: previewRuns(parsed.data, new Date(), 5), error: null as string | null };
    } catch (err: any) {
      return { runs: [] as Date[], error: err?.message || 'Invalid schedule' };
    }
  }, [schedule]);

  return (
    <div className="space-y-3">
      <label className={labelCls}>Schedule</label>
      <div className="inline-flex rounded-lg border border-zinc-700 overflow-hidden text-xs">
        {(['interval', 'weekly', 'cron'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => {
              const tz = schedule.timezone;
              onChange(
                mode === 'interval'
                  ? { mode, every: 15, unit: 'minutes', timezone: tz }
                  : mode === 'weekly'
                  ? { mode, days: [1, 2, 3, 4, 5], times: ['09:00'], timezone: tz }
                  : { mode, expression: '0 9 * * 1-5', timezone: tz }
              );
            }}
            className={`px-3 py-1.5 ${schedule.mode === mode ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:bg-zinc-800'}`}
          >
            {mode === 'interval' ? 'Repeat every…' : mode === 'weekly' ? 'Days & times' : 'Cron'}
          </button>
        ))}
      </div>

      {schedule.mode === 'interval' && (
        <div className="space-y-3 p-4 rounded-xl border border-zinc-800">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-400">Every</span>
            <input type="number" min={1} className={`${inputCls} w-24`} value={schedule.every} onChange={(e) => onChange({ ...schedule, every: Math.max(1, Number(e.target.value) || 1) })} />
            <select className={`${inputCls} w-32`} value={schedule.unit} onChange={(e) => onChange({ ...schedule, unit: e.target.value as 'minutes' | 'hours' | 'days' })}>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={!!schedule.active_hours}
              onChange={(e) => onChange({ ...schedule, active_hours: e.target.checked ? { start: '09:00', end: '18:00' } : undefined })}
              className="rounded bg-zinc-900 border-zinc-700 text-emerald-500"
            />
            Only during active hours
          </label>
          {schedule.active_hours && (
            <div className="flex items-center gap-2 text-sm">
              <input type="time" className={`${inputCls} w-32`} value={schedule.active_hours.start} onChange={(e) => onChange({ ...schedule, active_hours: { ...schedule.active_hours!, start: e.target.value } })} />
              <span className="text-zinc-500">to</span>
              <input type="time" className={`${inputCls} w-32`} value={schedule.active_hours.end} onChange={(e) => onChange({ ...schedule, active_hours: { ...schedule.active_hours!, end: e.target.value } })} />
            </div>
          )}
          <DayPicker
            label="Only on these days"
            value={schedule.active_days ?? [0, 1, 2, 3, 4, 5, 6]}
            onChange={(days) => onChange({ ...schedule, active_days: days.length === 7 ? undefined : days })}
          />
        </div>
      )}

      {schedule.mode === 'weekly' && (
        <div className="space-y-3 p-4 rounded-xl border border-zinc-800">
          <DayPicker label="Days" value={schedule.days} onChange={(days) => days.length && onChange({ ...schedule, days })} />
          <div>
            <span className={labelCls}>Times</span>
            <div className="flex flex-wrap items-center gap-2">
              {schedule.times.map((t, i) => (
                <span key={i} className="flex items-center gap-1">
                  <input type="time" className={`${inputCls} w-28`} value={t} onChange={(e) => onChange({ ...schedule, times: schedule.times.map((x, j) => (j === i ? e.target.value : x)) })} />
                  {schedule.times.length > 1 && (
                    <button type="button" onClick={() => onChange({ ...schedule, times: schedule.times.filter((_, j) => j !== i) })} className="text-zinc-500 hover:text-rose-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </span>
              ))}
              <button type="button" onClick={() => onChange({ ...schedule, times: [...schedule.times, '14:00'] })} className="text-xs text-emerald-400 hover:text-emerald-300">+ time</button>
            </div>
          </div>
        </div>
      )}

      {schedule.mode === 'cron' && (
        <div className="space-y-2 p-4 rounded-xl border border-zinc-800">
          <input className={`${inputCls} font-mono`} value={schedule.expression} onChange={(e) => onChange({ ...schedule, expression: e.target.value })} placeholder="minute hour day month weekday" />
          <div className="flex flex-wrap gap-2">
            {CRON_PRESETS.map((p) => (
              <button key={p.expression} type="button" onClick={() => onChange({ ...schedule, expression: p.expression })} className="text-[11px] px-2 py-1 rounded-md border border-zinc-800 text-zinc-400 hover:text-white">{p.label}</button>
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Time zone</label>
          <select className={inputCls} value={schedule.timezone} onChange={(e) => onChange({ ...schedule, timezone: e.target.value })}>
            {timeZones().map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </div>
        {extra}
      </div>

      <div className="p-4 rounded-xl border border-zinc-800 bg-[#0d1017] space-y-2">
        <div className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-emerald-400" /> {preview.error ? 'Schedule problem' : describeSchedule(schedule)}</div>
        {preview.error ? (
          <p className="text-xs text-rose-400">{preview.error}</p>
        ) : (
          <ol className="text-xs text-zinc-400 space-y-0.5 list-decimal list-inside">
            {preview.runs.map((r) => <li key={r.toISOString()}>{formatWhen(r.toISOString(), schedule.timezone)}</li>)}
          </ol>
        )}
        <p className="text-[11px] text-zinc-500">Minimum spacing is {MIN_HEARTBEAT_MINUTES} minutes. Times are in {schedule.timezone}.</p>
      </div>
    </div>
  );
};
