import assert from 'assert';
import { test } from 'node:test';
import { explainTwilioError, twilioErrorText } from '../lib/rooms/twilio-errors';
import { TwilioError } from '../lib/rooms/adapters/twilio';
import { friendly } from '../lib/services/telephony';

test('the KYC block (20003 with a compliance message) becomes the Trust Hub step', () => {
  // The exact error Twilio returned on 2026-10-18 for an outbound call.
  const text = friendly(new TwilioError(401, 'Twilio 401: Primary compliance profile is not approved. Please refer to documentation and complete the KYC process in Trust Hub to gain access.', 20003));
  assert.match(text, /Primary Compliance Profile isn't approved/);
  assert.match(text, /Trust Hub → Customer Profiles/);
  assert.match(text, /\(Twilio error 20003\)/);
});

test('20003 without a compliance message means wrong credentials', () => {
  const help = explainTwilioError(20003, 'Twilio 401: Authenticate');
  assert.match(help.problem, /rejected the Account SID \/ Auth Token/);
  assert.equal(help.needsOwner, true);
  assert.match(friendly(new TwilioError(401, 'Twilio 401: Authenticate')), /Account SID \/ Auth Token/, 'a bare 401 is treated as 20003');
});

test('known codes map to concrete steps', () => {
  assert.match(twilioErrorText(explainTwilioError(21215, 'x')), /Geo permissions/);
  assert.match(twilioErrorText(explainTwilioError(13227, 'x')), /Geo permissions/);
  assert.match(twilioErrorText(explainTwilioError(30034, 'x')), /A2P 10DLC/);
  assert.match(twilioErrorText(explainTwilioError(20005, 'x')), /Add funds/);
  assert.match(twilioErrorText(explainTwilioError(21216, 'x')), /Primary Customer Profile/);
  assert.equal(explainTwilioError(21211, 'x').needsOwner, false);
});

test('unknown codes keep Twilio\'s message and link to its page', () => {
  const help = explainTwilioError(99999, 'Twilio 400: Something new happened');
  assert.equal(help.problem, 'Something new happened');
  assert.equal(help.fix, null);
  assert.equal(help.link, 'https://www.twilio.com/docs/api/errors/99999');
  assert.equal(twilioErrorText(help), 'Something new happened (Twilio error 99999)');
});
