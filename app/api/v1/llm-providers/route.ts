export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { DEFAULT_MODELS } from '@/lib/agent/providers/llm-adapter';
import { LLM_PROVIDERS, configuredProviders } from '@/lib/services/agent-sessions';

/** Which BYOK LLM providers this organization has keys for. Never returns secrets. */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const configured = await configuredProviders(auth.tenantId);
    return NextResponse.json({
      providers: LLM_PROVIDERS.map((id) => ({ id, configured: configured.includes(id), defaultModel: DEFAULT_MODELS[id] })),
    });
  } catch (err) {
    return errorResponse(err, 'llm-providers');
  }
}
