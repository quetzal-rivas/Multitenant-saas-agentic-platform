export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/require-auth';
import {
  BYOKProvider,
  listTenantSecrets,
  setTenantSecret,
  deleteTenantSecret,
  testProviderConnection,
} from '@/lib/secrets/secrets-service';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const secrets = await listTenantSecrets(auth.tenantId);
    return NextResponse.json({ secrets });
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    if (auth.role !== 'owner' && auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only tenant owners and admins can configure API secrets', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { provider, secretValue, testFirst = true } = body;

    if (!provider || !secretValue) {
      return NextResponse.json(
        { error: 'Missing required parameters: provider and secretValue', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    if (testFirst) {
      const testResult = await testProviderConnection(provider as BYOKProvider, secretValue);
      if (!testResult.success) {
        return NextResponse.json(
          { error: testResult.message, code: 'CONNECTION_TEST_FAILED' },
          { status: 400 }
        );
      }
    }

    const metadata = await setTenantSecret(auth.tenantId, provider as BYOKProvider, secretValue);
    return NextResponse.json({ message: 'Secret securely stored', metadata });
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    if (auth.role !== 'owner' && auth.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only tenant owners and admins can delete API secrets', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    const url = new URL(req.url);
    const provider = url.searchParams.get('provider') as BYOKProvider;

    if (!provider) {
      return NextResponse.json(
        { error: 'Missing required query parameter: provider', code: 'INVALID_REQUEST' },
        { status: 400 }
      );
    }

    await deleteTenantSecret(auth.tenantId, provider);
    return NextResponse.json({ message: `Secret for provider ${provider} deleted` });
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
