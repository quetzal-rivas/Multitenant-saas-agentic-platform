/**
 * Twilio errors as concrete next steps. Keyed by Twilio's numeric error code (stable and
 * documented at https://www.twilio.com/docs/api/errors/<code>); each entry was checked
 * against that page. Unknown codes keep Twilio's own message plus the link to its page.
 */

export interface TwilioErrorHelp {
  code: number | null;
  /** What happened, in plain words. */
  problem: string;
  /** What the account owner does about it (null when there is nothing specific to do). */
  fix: string | null;
  link: string | null;
  /** The account owner must act in their Twilio account (not a temporary failure). */
  needsOwner: boolean;
}

const GEO_CALLS = {
  problem: "Your Twilio account isn't allowed to call this country.",
  fix: 'In the Twilio Console, open Voice → Settings → Geo permissions, enable the destination country, then try again.',
  needsOwner: true,
};

const BLOCKED_CALL = {
  problem: 'Twilio blocked this call before connecting it.',
  fix: 'For +1 (US/Canada) numbers your account needs an approved Primary Customer Profile: Twilio Console → Trust Hub → Customer Profiles. If the profile is approved and calls are still blocked, contact Twilio Support.',
  needsOwner: true,
};

const BY_CODE: Record<number, Omit<TwilioErrorHelp, 'code' | 'link'>> = {
  20005: {
    problem: 'Your Twilio account is not active (usually the balance reached $0, or it is a trial that needs upgrading).',
    fix: 'Add funds in the Twilio Console (Billing). If it is a trial account, upgrade it.',
    needsOwner: true,
  },
  10003: {
    problem: 'Twilio rejected the incoming call because the account is inactive (balance at $0 or below).',
    fix: 'Add funds in the Twilio Console (Billing). A low-balance alert or auto-recharge avoids this.',
    needsOwner: true,
  },
  20404: { problem: 'Twilio could not find that resource (the number or call may have been removed from the account).', fix: 'Sync your numbers again from Live Calls → Twilio & numbers.', needsOwner: false },
  20429: { problem: 'Twilio is receiving too many requests from this account right now.', fix: null, needsOwner: false },
  21211: { problem: "The phone number to call isn't valid.", fix: 'Use the full international format: + country code and number, no spaces (for example +5215512345678).', needsOwner: false },
  21215: GEO_CALLS,
  13227: GEO_CALLS,
  21216: BLOCKED_CALL,
  13225: BLOCKED_CALL,
  21219: {
    problem: 'This is a Twilio trial account, which can only call verified numbers.',
    fix: 'Verify the number in the Twilio Console (Phone Numbers → Verified Caller IDs), or upgrade the account.',
    needsOwner: true,
  },
  21608: {
    problem: 'Your Twilio account can only message verified numbers until it has an approved Primary Compliance Profile.',
    fix: 'Twilio Console → Trust Hub → Customer Profiles: complete the profile and wait for approval (up to 48 hours).',
    needsOwner: true,
  },
  21610: { problem: 'This person opted out of your messages (they replied STOP).', fix: 'They can opt back in by texting START to your number.', needsOwner: false },
  21408: {
    problem: "Your Twilio account isn't allowed to send messages to this country.",
    fix: 'In the Twilio Console, open Messaging → Settings → Geo permissions and enable the destination country.',
    needsOwner: true,
  },
  30034: {
    problem: 'US carriers block texts from US local numbers that are not registered for A2P 10DLC.',
    fix: 'Register a Brand and a Campaign (Twilio Console → Messaging → Regulatory Compliance → A2P 10DLC) and add the number to its Messaging Service, or send from a verified toll-free number.',
    needsOwner: true,
  },
};

/** Twilio's 20003 covers wrong credentials and, with a different message, compliance or a suspended account. */
function permissionDenied(message: string): Omit<TwilioErrorHelp, 'code' | 'link'> {
  if (/compliance profile|trust ?hub|kyc/i.test(message)) {
    return {
      problem: "Your Twilio account's Primary Compliance Profile isn't approved yet, so Twilio blocks this action.",
      fix: 'Twilio Console → Trust Hub → Customer Profiles: complete and submit the Primary Customer Profile. Review can take up to 48 hours.',
      needsOwner: true,
    };
  }
  if (/suspend|closed/i.test(message)) {
    return { problem: 'Your Twilio account is suspended or closed.', fix: 'Contact Twilio Support before trying again.', needsOwner: true };
  }
  if (/addendum/i.test(message)) {
    return { problem: "Twilio requires accepting its AI/ML Features Addendum for this feature.", fix: 'Accept the AI/ML Features Addendum in the Twilio Console, then try again.', needsOwner: true };
  }
  return {
    problem: 'Twilio rejected the Account SID / Auth Token.',
    fix: 'Copy both again from the Twilio Console home page (no spaces) and reconnect in Live Calls → Twilio & numbers. If you rotated the Auth Token, use the new one.',
    needsOwner: true,
  };
}

export function explainTwilioError(code: number | null | undefined, message: string): TwilioErrorHelp {
  const clean = message.replace(/^Twilio \d{3}: /, '');
  const link = code ? `https://www.twilio.com/docs/api/errors/${code}` : null;
  if (code === 20003) return { code, link, ...permissionDenied(clean) };
  if (code && BY_CODE[code]) return { code, link, ...BY_CODE[code] };
  return { code: code ?? null, link, problem: clean || 'Twilio request failed.', fix: null, needsOwner: false };
}

/** One line for the UI: problem, what to do, and Twilio's code. */
export function twilioErrorText(help: TwilioErrorHelp): string {
  return [help.problem, help.fix, help.code ? `(Twilio error ${help.code})` : null].filter(Boolean).join(' ');
}
