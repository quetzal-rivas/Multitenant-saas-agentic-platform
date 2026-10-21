export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { PROVIDER_PRESETS } from '@/lib/agent/providers/registry';
import { agentsLockedTo, createCustomProvider, listOrgProviders, orgLlmSettings, setLlmSettings } from '@/lib/services/llm-providers';

/**
 * The organization's LLM providers (built-in and its own) in its order, with key status,
 * on/off, and the agents locked to each. Never returns keys.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const providers = await listOrgProviders(auth.tenantId);
    const locked = await Promise.all(providers.map((p) => agentsLockedTo(auth.tenantId, p.id)));
    return NextResponse.json({
      providers: providers.map((p, i) => ({ ...p, defaultModel: p.defaultModel, locked_by: locked[i] })),
      settings: await orgLlmSettings(auth.tenantId),
      presets: PROVIDER_PRESETS,
    });
  } catch (err) {
    return errorResponse(err, 'llm-providers');
  }
}

/** Order and on/off: { order: [ids], disabled: [ids] } (owner/admin). */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json({ settings: await setLlmSettings(auth, await req.json()) });
  } catch (err) {
    return errorResponse(err, 'llm-providers:settings');
  }
}

/** Add an OpenAI-compatible provider: { slug, label, base_url, default_model, fast_model?, api_key } (checked before saving). */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    return NextResponse.json(await createCustomProvider(auth, await req.json()), { status: 201 });
  } catch (err) {
    return errorResponse(err, 'llm-providers:create');
  }
}
