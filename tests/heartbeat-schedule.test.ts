import assert from 'assert';
import { test, describe } from 'node:test';
import { describeSchedule, heartbeatScheduleSchema, localParts, nextRun, previewRuns } from '../lib/agent/heartbeat-schedule';

const TZ = 'America/Mexico_City'; // UTC-6, no DST since 2022
const at = (iso: string) => new Date(iso);
const iso = (d: Date) => d.toISOString().replace('.000Z', 'Z');

describe('heartbeat schedules', () => {
  test('plain interval steps from the last run', () => {
    const s = heartbeatScheduleSchema.parse({ mode: 'interval', every: 15, unit: 'minutes', timezone: TZ });
    assert.equal(iso(nextRun(s, at('2026-10-05T15:00:00Z'), at('2026-10-05T14:50:00Z'))), '2026-10-05T15:05:00Z');
    assert.deepEqual(previewRuns(s, at('2026-10-05T15:00:00Z'), 3).map(iso), [
      '2026-10-05T15:15:00Z', '2026-10-05T15:30:00Z', '2026-10-05T15:45:00Z',
    ]);
  });

  test('interval with business hours skips nights and weekends', () => {
    const s = heartbeatScheduleSchema.parse({
      mode: 'interval', every: 2, unit: 'hours', timezone: TZ,
      active_hours: { start: '09:00', end: '18:00' }, active_days: [1, 2, 3, 4, 5],
    });
    // Friday 17:00 local (23:00Z): +2h lands 19:00 local, outside -> Monday 09:00 local (15:00Z).
    const next = nextRun(s, at('2026-10-09T23:00:00Z'), at('2026-10-09T23:00:00Z'));
    assert.equal(iso(next), '2026-10-12T15:00:00Z');
    assert.deepEqual(localParts(next, TZ), { date: '2026-10-12', weekday: 1, minutes: 540 });
    assert.equal(describeSchedule(s), `Every 2 hours, Mon–Fri 09:00–18:00 (${TZ})`);
  });

  test('windows can cross midnight', () => {
    const s = heartbeatScheduleSchema.parse({ mode: 'interval', every: 30, unit: 'minutes', timezone: TZ, active_hours: { start: '22:00', end: '06:00' } });
    // 06:10 local (12:10Z) is outside; next opening is 22:00 local (04:00Z next day).
    assert.equal(iso(nextRun(s, at('2026-10-05T12:10:00Z'), at('2026-10-05T11:40:00Z'))), '2026-10-06T04:00:00Z');
  });

  test('weekly picks the soonest of several times', () => {
    const s = heartbeatScheduleSchema.parse({ mode: 'weekly', days: [1, 3], times: ['18:30', '08:00'], timezone: TZ });
    // Monday 10:00 local -> Monday 18:30 local (00:30Z Tue).
    assert.equal(iso(nextRun(s, at('2026-10-05T16:00:00Z'))), '2026-10-06T00:30:00Z');
    assert.equal(describeSchedule(s), `Mon, Wed at 18:30, 08:00 (${TZ})`);
  });

  test('cron runs in the team time zone', () => {
    const s = heartbeatScheduleSchema.parse({ mode: 'cron', expression: '0 9 * * 1-5', timezone: TZ });
    assert.equal(iso(nextRun(s, at('2026-10-04T12:00:00Z'))), '2026-10-05T15:00:00Z');
  });

  test('budget guard: nothing more frequent than every 5 minutes', () => {
    assert.equal(heartbeatScheduleSchema.safeParse({ mode: 'interval', every: 2, unit: 'minutes', timezone: TZ }).success, false);
    assert.equal(heartbeatScheduleSchema.safeParse({ mode: 'cron', expression: '* * * * *', timezone: TZ }).success, false);
    assert.equal(heartbeatScheduleSchema.safeParse({ mode: 'cron', expression: '*/5 * * * *', timezone: TZ }).success, true);
  });

  test('rejects bad input', () => {
    assert.equal(heartbeatScheduleSchema.safeParse({ mode: 'interval', every: 15, unit: 'minutes', timezone: 'Mars/Olympus' }).success, false);
    assert.equal(heartbeatScheduleSchema.safeParse({ mode: 'weekly', days: [1], times: ['25:00'], timezone: TZ }).success, false);
    assert.equal(heartbeatScheduleSchema.safeParse({ mode: 'cron', expression: '0 9 * *', timezone: TZ }).success, false);
  });
});
