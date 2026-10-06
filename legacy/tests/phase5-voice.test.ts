import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { isVoiceEnabled, verifyTwilioSignature } from '../lib/voice/voice-service';

describe('Phase 5 Voice Integration & Compliance Verification', () => {
  test('Feature Flag: isVoiceEnabled defaults to false in production', () => {
    delete process.env.ENABLE_VOICE_CALLS;
    assert.equal(isVoiceEnabled(), false, 'Voice feature flag must default to false');
  });

  test('Twilio Signature Verification: validates X-Twilio-Signature against authToken', () => {
    const url = 'https://app.contextcontrol.io/api/twilio/live-calls';
    const params = { CallSid: 'CA123456789', From: '+15551234567' };
    const authToken = '1234567890abcdef1234567890abcdef';

    // Calculate valid expected signature
    const data = 'CallSidCA123456789From+15551234567';
    const fullStr = url + data;
    const crypto = require('crypto');
    const validSignature = crypto.createHmac('sha1', authToken).update(Buffer.from(fullStr, 'utf8')).digest('base64');

    assert.equal(verifyTwilioSignature(url, params, validSignature, authToken), true, 'Valid signature must pass verification');
    assert.equal(verifyTwilioSignature(url, params, 'invalid_sig', authToken), false, 'Invalid signature must fail verification');
  });
});
