export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { HOSTED_MCP_SERVERS } from '@/Backend/hosted-servers';
import { OAuthManager } from '@/Backend/oauth-manager';
import { OAuthProvider } from '@/Backend/types';

export async function GET() {
  const connections = OAuthManager.getAllConnections();

  const servers = HOSTED_MCP_SERVERS.map((server) => {
    const conn = server.oauthProvider ? connections[server.oauthProvider as OAuthProvider] : undefined;
    return {
      ...server,
      isConnected: server.requiresOAuth ? (conn?.isConnected ?? false) : true,
      connectedUser: conn?.isConnected
        ? {
            name: conn.accountName,
            email: conn.accountEmail,
            avatarUrl: conn.avatarUrl,
          }
        : undefined,
    };
  });

  return NextResponse.json({ servers });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { serverId, action } = body;

    const server = HOSTED_MCP_SERVERS.find((s) => s.id === serverId || s.slug === serverId);
    if (!server) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 });
    }

    if (action === 'toggle-subscribe') {
      server.isSubscribed = !server.isSubscribed;
    } else if (action === 'disconnect' && server.oauthProvider) {
      OAuthManager.disconnect(server.oauthProvider);
      server.isConnected = false;
      server.connectedUser = undefined;
    }

    return NextResponse.json({ success: true, server });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
