export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { compileContext } from '@/lib/compiler';
import { requireAuth, requireScope } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { profileForResolve } from '@/lib/services/context-profiles';
import type { ResolveRequest } from '@/lib/types';

const resolveBody = z.object({
  profile: z.string().trim().min(1).max(120),
  identity: z.record(z.string(), z.any()).optional(),
  input: z.record(z.string(), z.any()).optional(),
  options: z
    .object({ format: z.enum(['markdown', 'json', 'structured']).optional(), max_tokens: z.number().int().positive().max(200_000).optional() })
    .passthrough()
    .optional(),
});

/** Credentials first: callers without them learn nothing about the request format. */
async function authenticate(req: NextRequest) {
  const auth = await requireAuth(req, ['session', 'api_key', 'client_token']);
  if (auth.authMode === 'api_key') requireScope(auth, 'mcp:profiles:read');
  return auth;
}

async function resolve(auth: Awaited<ReturnType<typeof authenticate>>, body: ResolveRequest) {
  const { profile, organization } = await profileForResolve(auth, body.profile);
  // The organization comes from the credentials, never from the request body.
  const compiled = compileContext(profile, { ...body, identity: { ...(body.identity || {}), tenant_id: auth.tenantId } }, { organization });
  return NextResponse.json(compiled, {
    headers: {
      'x-context-control-version': String(profile.version),
      'x-context-tokens': String(compiled.metadata.token_count),
      'x-context-resolution-time': `${compiled.metadata.resolution_time_ms}ms`,
    },
  });
}

/** Compile one of the organization's context profiles (session, API key with mcp:profiles:read, or client token). */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    return await resolve(auth, resolveBody.parse(await req.json()) as ResolveRequest);
  } catch (err) {
    return errorResponse(err, 'context:resolve');
  }
}

/** Same as POST with query parameters: ?profile=…&query=…&user_id=…&conversation_id=…&format=… */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    const p = new URL(req.url).searchParams;
    const body = resolveBody.parse({
      profile: p.get('profile') ?? '',
      identity: { ...(p.get('user_id') ? { user_id: p.get('user_id') } : {}), ...(p.get('conversation_id') ? { conversation_id: p.get('conversation_id') } : {}) },
      input: p.get('query') ? { query: p.get('query') } : {},
      options: p.get('format') ? { format: p.get('format') } : undefined,
    });
    return await resolve(auth, body as ResolveRequest);
  } catch (err) {
    return errorResponse(err, 'context:resolve');
  }
}
