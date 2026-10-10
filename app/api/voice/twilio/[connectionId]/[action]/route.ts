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

/**
 * Twilio voice webhooks for one organization's connection. Every request must carry a
 * valid X-Twilio-Signature for that account; TwiML answers drive the call.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { connectionId, action } = await params;
  const conn = await loadConnectionById(connectionId);
  if (!conn) return new NextResponse('Not found', { status: 404 });
  const raw = await req.text();
  const url = `${publicOrigin(req)}${req.nextUrl.pathname}${req.nextUrl.search}`;
  const secrets = await connectionSecrets(conn);
  const check = verifyTwilioSignature({ rawBody: raw, headers: req.headers, url, secrets: { auth_token: secrets.auth_token }, settings: {} });
  if (!check.ok) return new NextResponse('Invalid signature', { status: 403 });

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
