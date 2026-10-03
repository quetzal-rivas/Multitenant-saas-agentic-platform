export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/require-auth';
import { isVoiceEnabled, hasVoiceComplianceAttestation } from '@/lib/voice/voice-service';
import { isDemoMode } from '@/lib/demo';

export async function GET(req: NextRequest) {
  try {
    if (!isVoiceEnabled() && !isDemoMode()) {
      return NextResponse.json(
        { error: 'Voice call integration is currently disabled in production.', code: 'VOICE_FEATURE_DISABLED' },
        { status: 403 }
      );
    }

    const auth = await requireAuth(req, 'session');

    return NextResponse.json({
      success: true,
      tenantId: auth.tenantId,
      calls: [],
      activeCount: 0,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message || 'Failed to fetch live calls' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!isVoiceEnabled() && !isDemoMode()) {
      return NextResponse.json(
        { error: 'Voice call integration is currently disabled in production.', code: 'VOICE_FEATURE_DISABLED' },
        { status: 403 }
      );
    }

    const auth = await requireAuth(req, 'session');
    const body = await req.json();
    const { action } = body;

    if (action === 'simulate_outbound' || action === 'outbound') {
      const isAttested = await hasVoiceComplianceAttestation(auth.tenantId);
      if (!isAttested && !isDemoMode()) {
        return NextResponse.json(
          {
            error: 'Compliance Attestation Required: Tenant must accept TCPA and AI voice recording consent before initiating outbound calls.',
            code: 'COMPLIANCE_ATTESTATION_REQUIRED',
          },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: `Voice action '${action}' processed for tenant ${auth.tenantId}`,
      status: 'initiated',
    });
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message || 'Voice operation failed' }, { status: 500 });
  }
}
