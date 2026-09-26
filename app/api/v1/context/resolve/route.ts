import { NextRequest, NextResponse } from 'next/server';
import { compileContext } from '@/lib/compiler';
import { INITIAL_PROFILES } from '@/lib/mock-data';
import { ResolveRequest } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body: ResolveRequest = await req.json();
    const profileSlug = body.profile || 'sales-agent';

    const profile = INITIAL_PROFILES.find(
      (p) => p.slug === profileSlug || p.id === profileSlug
    );

    if (!profile) {
      return NextResponse.json(
        {
          error: 'ProfileNotFound',
          message: `Context profile '${profileSlug}' was not found. Available profiles: ${INITIAL_PROFILES.map((p) => p.slug).join(', ')}`,
        },
        { status: 404 }
      );
    }

    const compiledResponse = compileContext(profile, body);

    // If contract validation failed for required fields, we can still return 200 with warnings or 400 if strictly enforced
    return NextResponse.json(compiledResponse, {
      status: 200,
      headers: {
        'x-context-control-version': String(profile.version),
        'x-context-tokens': String(compiledResponse.metadata.token_count),
        'x-context-resolution-time': `${compiledResponse.metadata.resolution_time_ms}ms`,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'ContextResolutionError',
        message: err.message || 'Failed to compile context profile',
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const profileSlug = searchParams.get('profile') || 'sales-agent';
  const tenantId = searchParams.get('tenant_id') || 'tenant_123';
  const userId = searchParams.get('user_id') || 'user_456';
  const conversationId = searchParams.get('conversation_id') || 'conversation_789';
  const query = searchParams.get('query') || undefined;
  const format = (searchParams.get('format') as 'markdown' | 'json' | 'structured') || 'markdown';

  const profile = INITIAL_PROFILES.find(
    (p) => p.slug === profileSlug || p.id === profileSlug
  );

  if (!profile) {
    return NextResponse.json(
      {
        error: 'ProfileNotFound',
        message: `Context profile '${profileSlug}' was not found.`,
      },
      { status: 404 }
    );
  }

  const resolveReq: ResolveRequest = {
    profile: profileSlug,
    identity: {
      tenant_id: tenantId,
      user_id: userId,
      conversation_id: conversationId,
    },
    input: query ? { query } : undefined,
    options: {
      format,
    },
  };

  const compiled = compileContext(profile, resolveReq);
  return NextResponse.json(compiled);
}
