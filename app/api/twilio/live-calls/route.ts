export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { twilioConferenceManager } from '@/Backend/twilio-conference-manager';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req?.url || 'http://localhost');
    const filter = url.searchParams.get('filter'); // 'active' | 'all'
    const calls = filter === 'active' 
      ? twilioConferenceManager.getActiveCalls() 
      : twilioConferenceManager.getLiveCalls();

    return NextResponse.json({
      success: true,
      calls,
      activeCount: twilioConferenceManager.getActiveCalls().length,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch live calls' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case 'simulate_inbound': {
        const call = twilioConferenceManager.initiateCall({
          direction: 'inbound',
          fromPhone: body.fromPhone || '+1 (415) 890-3321',
          toPhone: body.toPhone || '+1 (800) 555-0199',
          callerName: body.callerName || 'Alex Chen (VP Operations)',
          callerCompany: body.callerCompany || 'CloudScale Dynamics',
          elevenLabsAgentName: body.elevenLabsAgentName || 'Rachel (ElevenLabs Voice Lead)',
        });
        return NextResponse.json({
          success: true,
          message: `Inbound call connected to Twilio Conference [${call.roomTwilioId}]`,
          call,
        });
      }

      case 'simulate_outbound': {
        const call = twilioConferenceManager.initiateCall({
          direction: 'outbound',
          fromPhone: body.fromPhone || '+1 (800) 555-0199',
          toPhone: body.toPhone || '+1 (212) 555-7832',
          callerName: body.callerName || 'Elena Rostova (CTO)',
          callerCompany: body.callerCompany || 'FinTech Horizons',
          elevenLabsAgentName: body.elevenLabsAgentName || 'Rachel (ElevenLabs Voice Lead)',
        });
        return NextResponse.json({
          success: true,
          message: `Outbound call connected to Twilio Conference [${call.roomTwilioId}]`,
          call,
        });
      }

      case 'listen': {
        const { callId, listening } = body;
        const call = twilioConferenceManager.toggleSupervisorListening(callId, !!listening);
        return NextResponse.json({
          success: true,
          message: listening ? 'Joined conference room as muted monitor' : 'Disconnected monitor',
          call,
        });
      }

      case 'end_call': {
        const { callId, reason } = body;
        const call = twilioConferenceManager.endCall(callId, reason || 'Supervisor Ended Call');
        return NextResponse.json({
          success: true,
          message: 'Call terminated and conference room released. Supabase notified.',
          call,
        });
      }

      case 'add_transcript': {
        const { callId, speaker, text } = body;
        const call = twilioConferenceManager.addTranscript(callId, speaker, text);
        return NextResponse.json({
          success: true,
          call,
        });
      }

      case 'twiml': {
        const { roomTwilioId, muted } = body;
        const twiml = twilioConferenceManager.generateTwiMLConference(roomTwilioId, !!muted);
        return new NextResponse(twiml, {
          headers: { 'Content-Type': 'application/xml' },
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Twilio Conference operation failed' },
      { status: 500 }
    );
  }
}
