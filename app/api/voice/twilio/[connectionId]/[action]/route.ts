export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { publicOrigin } from '@/lib/http/public-origin';
import { verify as verifyTwilioSignature } from '@/lib/inbound/presets/twilio';
import { connectionSecrets, loadConnectionById } from '@/lib/services/telephony';
import {
  handleClientJoin,
  handleConferenceEvent,
  handleIncoming,
  handleOutboundAnswered,
  handleParticipantStatus,
  handleTranscription,
  handleTurn,
} from '@/lib/services/rooms';
import { response, say } from '@/lib/rooms/twiml';

type Params = { params: Promise<{ connectionId: string; action: string }> };

const xml = (body: string) => new NextResponse(body, { headers: { 'Content-Type': 'text/xml' } });

/** The URL forms Twilio may have signed for this request (deduplicated). */
function signedUrlCandidates(req: NextRequest): Array<{ form: string; url: string }> {
  const origin = publicOrigin(req);
  const parsed = `${origin}${req.nextUrl.pathname}${req.nextUrl.search}`;
  // The query exactly as it arrived, before any re-serialization.
  const rawPathAndQuery = req.url.replace(/^[a-z]+:\/\/[^/]+/i, '');
  const asReceived = `${origin}${rawPathAndQuery}`;
  const list = [
    { form: 'parsed', url: parsed },
    { form: 'raw', url: asReceived },
    { form: 'xml-escaped', url: parsed.replace(/&/g, '&amp;') },
    { form: 'decoded', url: (() => { try { return decodeURIComponent(asReceived); } catch { return asReceived; } })() },
  ];
  return list.filter((c, i) => list.findIndex((o) => o.url === c.url) === i);
}

/**
 * Twilio voice webhooks for one organization's connection. Every request must carry a
 * valid X-Twilio-Signature for that account; TwiML answers drive the call.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { connectionId, action } = await params;
  const conn = await loadConnectionById(connectionId);
  if (!conn) return new NextResponse('Not found', { status: 404 });
  const raw = await req.text();
  const secrets = await connectionSecrets(conn);
  // Twilio signs the exact URL it requested. Proxies and frameworks can re-serialize the query
  // (or Twilio may sign a <Redirect> URL as written), so try the equivalent forms; each one
  // still needs the HMAC with this account's auth token.
  const candidates = signedUrlCandidates(req);
  const matched = candidates.find((c) => verifyTwilioSignature({ rawBody: raw, headers: req.headers, url: c.url, secrets: { auth_token: secrets.auth_token }, settings: {} }).ok);
  if (!matched) {
    console.warn(
      `[voice:twilio:${action}] invalid signature`,
      JSON.stringify({ tried: candidates.map((c) => c.url), raw_url: req.url, has_signature: !!req.headers.get('x-twilio-signature'), params: [...new URLSearchParams(raw).keys()].length })
    );
    return new NextResponse('Invalid signature', { status: 403 });
  }
  if (matched.form !== 'parsed') console.info(`[voice:twilio:${action}] signature matched the ${matched.form} URL form`);

  const p = Object.fromEntries(new URLSearchParams(raw));
  const q = req.nextUrl.searchParams;
  const roomId = q.get('room') || '';
  try {
    switch (action) {
      case 'incoming':
        return xml(await handleIncoming(conn, p));
      case 'outbound':
        return xml(await handleOutboundAnswered(conn, roomId, p));
      case 'turn':
        return xml(await handleTurn(conn, roomId, p, q));
      case 'client':
        return xml(await handleClientJoin(conn, p));
      case 'conference':
        await handleConferenceEvent(conn, roomId, p);
        return new NextResponse(null, { status: 204 });
      case 'participant':
        await handleParticipantStatus(conn, roomId, q.get('role') || 'customer', p);
        return new NextResponse(null, { status: 204 });
      case 'transcription':
        await handleTranscription(conn, roomId, p);
        return new NextResponse(null, { status: 204 });
      default:
        return new NextResponse('Unknown action', { status: 404 });
    }
  } catch (err) {
    console.error(`[voice:twilio:${action}]`, err);
    if (['incoming', 'outbound', 'turn', 'client'].includes(action)) {
      return xml(response(say('Sorry, something went wrong. Please call again later.', 'en'), '<Hangup/>'));
    }
    return new NextResponse(null, { status: 500 });
  }
}
