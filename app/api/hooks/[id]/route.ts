export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextRequest, NextResponse } from 'next/server';
import { publicOrigin } from '@/lib/http/public-origin';
import { MAX_AUDIO_BODY_BYTES, receiveWebhook, verifyChallenge } from '@/lib/services/inbound';

type Params = { params: Promise<{ id: string }> };

/**
 * Public Inbound Gateway endpoint (no session). Every request is checked against the
 * endpoint's source signature before anything is stored; events are processed by the
 * worker after this answers.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const length = Number(req.headers.get('content-length') || 0);
    if (length > MAX_AUDIO_BODY_BYTES) return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
    const raw = await req.text();
    const url = `${publicOrigin(req)}${req.nextUrl.pathname}${req.nextUrl.search}`;
    const result = await receiveWebhook((await params).id, raw, req.headers, url);
    return NextResponse.json(result.body, { status: result.status });
  } catch (err) {
    console.error('[hooks] failed', err);
    // A 500 makes the provider retry later; the event was not stored.
    return NextResponse.json({ error: 'Temporary error, retry later.' }, { status: 500 });
  }
}

/** Meta subscription handshake: echoes hub.challenge when hub.verify_token matches. */
export async function GET(req: NextRequest, { params }: Params) {
  const result = await verifyChallenge((await params).id, req.nextUrl.searchParams).catch(() => ({ status: 500, body: 'Temporary error' }));
  return new NextResponse(result.body, { status: result.status, headers: { 'Content-Type': 'text/plain' } });
}
