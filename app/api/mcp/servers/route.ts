export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth/require-auth';
import { listTenantSecrets, deleteTenantSecret, BYOKProvider } from '@/lib/secrets/secrets-service';

const CATALOG_SERVERS = [
  {
    id: 'server-google-workspace',
    name: 'Google Workspace MCP',
    slug: 'google-workspace',
    category: 'Productivity',
    description: 'Gmail, Google Calendar, Google Drive, and Docs tools for agent automation.',
    requiresOAuth: true,
    oauthProvider: 'google',
    toolsCount: 14,
    status: 'online',
  },
  {
    id: 'server-slack-enterprise',
    name: 'Slack Communication MCP',
    slug: 'slack-communication',
    category: 'Communication',
    description: 'Post channel updates, send direct messages, read thread histories.',
    requiresOAuth: true,
    oauthProvider: 'slack',
    toolsCount: 8,
    status: 'online',
  },
  {
    id: 'server-supabase-postgres',
    name: 'Tenant Supabase Spoke',
    slug: 'tenant-supabase',
    category: 'Database',
    description: 'Execute SQL queries, vector searches, and manage tenant-owned database tables.',
    requiresOAuth: false,
    toolsCount: 6,
    status: 'online',
  },
];

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const secrets = await listTenantSecrets(auth.tenantId);
    const configuredProviders = new Set(secrets.map((s) => s.provider));

    const servers = CATALOG_SERVERS.map((server) => {
      const providerKey = (server.oauthProvider ? `${server.oauthProvider}_oauth` : 'tenant_supabase') as BYOKProvider;
      const isConnected = configuredProviders.has(providerKey);

      return {
        ...server,
        isConnected,
        isSubscribed: isConnected,
      };
    });

    return NextResponse.json({ servers });
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
    const body = await req.json();
    const { serverId, action } = body;

    const server = CATALOG_SERVERS.find((s) => s.id === serverId || s.slug === serverId);
    if (!server) {
      return NextResponse.json({ error: 'Server not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    if (action === 'disconnect' && server.oauthProvider) {
      const providerKey = `${server.oauthProvider}_oauth` as BYOKProvider;
      await deleteTenantSecret(auth.tenantId, providerKey);
    }

    return NextResponse.json({ success: true, server });
  } catch (err: any) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
