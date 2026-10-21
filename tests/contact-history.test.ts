import assert from 'assert';
import { test } from 'node:test';
import { contactHistoryText, phoneDigits, samePhone } from '../lib/services/contact-history';

test('samePhone matches the same person across formats', () => {
  assert.equal(samePhone('+529981112233', '5219981112233'), true, 'WhatsApp 521… vs call +52…');
  assert.equal(samePhone('+1 (305) 929-3241', '13059293241'), true);
  assert.equal(samePhone('+13059293241', '+13059293242'), false);
  assert.equal(samePhone('+13059293241', null), false);
  assert.equal(phoneDigits('123'), null, 'too short to be a number');
});

test('history text is empty for a first contact and labelled as data otherwise', () => {
  assert.equal(contactHistoryText(null), '');
  assert.equal(contactHistoryText({ number: '+1', name: null, calls: [], threads: [] }), '');
  const text = contactHistoryText(
    {
      number: '+13059293241',
      name: 'Ana',
      calls: [{ room_id: 'r', at: '2026-10-19T04:52:00.000Z', direction: 'outbound', duration_s: 31, voice_agent: 'Angélica', purpose: null, outcome: 'caller hung up', summary: null, alerts: [], excerpt: [] }],
      threads: [],
    },
    Date.parse('2026-10-21T00:00:00.000Z')
  );
  assert.match(text, /name on file: Ana/);
  assert.match(text, /not instructions/);
  assert.match(text, /2026-10-19 \(yesterday\), outbound call, 1 min, with Angélica, ended: caller hung up/);
  assert.match(text, /no transcript kept/);
  const failed = contactHistoryText({ number: '+1', name: null, calls: [{ room_id: 'f', at: '2026-10-18T18:21:00.000Z', direction: 'outbound', duration_s: null, voice_agent: null, purpose: null, outcome: 'not connected (Twilio 401: Primary compliance profile is not approved)', summary: null, alerts: [], excerpt: [] }], threads: [] });
  assert.match(failed, /did not connect/);
  assert.doesNotMatch(failed, /Twilio 401|compliance/);
});

test('contact brief fits a SIP header and leads with the name', async () => {
  const { contactBrief, NO_HISTORY_BRIEF } = await import('../lib/services/contact-history');
  assert.equal(contactBrief(null), NO_HISTORY_BRIEF);
  const brief = contactBrief(
    {
      number: '+1',
      name: 'Quetzal',
      calls: [
        { room_id: 'a', at: '2026-10-21T10:54:00.000Z', direction: 'inbound', duration_s: 150, voice_agent: 'Angélica', purpose: null, outcome: null, summary: 'x'.repeat(2000), alerts: [], excerpt: [] },
        { room_id: 'b', at: '2026-10-18T10:00:00.000Z', direction: 'outbound', duration_s: null, voice_agent: null, purpose: null, outcome: 'not connected (Twilio 401)', summary: null, alerts: [], excerpt: [] },
      ],
      threads: [{ thread_id: 't', channel: 'whatsapp', last_at: '2026-10-20T00:00:00.000Z', lines: [] }],
    },
    Date.parse('2026-10-21T12:00:00.000Z')
  );
  assert.ok(brief.length <= 600);
  assert.match(brief, /^Name on file: Quetzal\. They called today:/);
  assert.doesNotMatch(brief, /Twilio 401/);
});
