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
