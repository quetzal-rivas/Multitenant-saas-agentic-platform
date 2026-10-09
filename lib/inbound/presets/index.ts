import type { InboundPreset, NormalizedEvent } from '../types';
import type { VerifyInput, VerifyResult } from './common';
import * as meta from './meta';
import * as elevenlabs from './elevenlabs';
import * as twilio from './twilio';
import * as telnyx from './telnyx';
import * as generic from './generic';

export type { VerifyInput, VerifyResult } from './common';

/** Verify, then parse the raw body and turn it into normalized events. */
export const PRESETS: Record<InboundPreset, { verify: (i: VerifyInput) => VerifyResult; parse: (raw: string) => { body: unknown; events: NormalizedEvent[] } }> = {
  meta: { verify: meta.verify, parse: (raw) => withJson(raw, (b) => meta.normalize(b)) },
  elevenlabs: { verify: elevenlabs.verify, parse: (raw) => withJson(raw, (b) => elevenlabs.normalize(b)) },
  twilio: {
    verify: twilio.verify,
    parse: (raw) => {
      const body = twilio.parseBody(raw);
      return { body, events: twilio.normalize(body) };
    },
  },
  telnyx: { verify: telnyx.verify, parse: (raw) => withJson(raw, (b) => telnyx.normalize(b)) },
  generic: {
    verify: generic.verify,
    parse: (raw) => {
      let body: unknown = null;
      try {
        body = JSON.parse(raw);
      } catch {
        body = null;
      }
      return { body: body ?? { text: raw }, events: generic.normalize(body, raw) };
    },
  },
};

function withJson(raw: string, fn: (body: any) => NormalizedEvent[]) {
  const body = JSON.parse(raw);
  return { body, events: fn(body) };
}
