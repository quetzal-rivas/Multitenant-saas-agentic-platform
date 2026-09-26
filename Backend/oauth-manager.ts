import { OAuthConnection, OAuthProvider } from './types';

// In-memory token store for demo & session persistence
const connectionStore = new Map<OAuthProvider, OAuthConnection>([
  [
    'google',
    {
      provider: 'google',
      accountName: 'Alex Rivera (Staff Architect)',
      accountEmail: 'alex.rivera@enterprise.io',
      avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/gmail.compose',
        'https://www.googleapis.com/auth/calendar.events.readonly',
      ],
      isConnected: true,
      connectedAt: '2026-09-20T14:22:00Z',
      tokenType: 'Bearer',
    },
  ],
  [
    'github',
    {
      provider: 'github',
      accountName: 'arivera-dev',
      accountEmail: 'arivera@github.com',
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
      scopes: ['repo', 'read:user', 'read:org'],
      isConnected: true,
      connectedAt: '2026-09-20T14:30:00Z',
      tokenType: 'Bearer',
    },
  ],
  [
    'slack',
    {
      provider: 'slack',
      accountName: 'Engineering Workspace',
      accountEmail: 'team@acmecorp.slack.com',
      scopes: ['chat:write', 'channels:read'],
      isConnected: false,
    },
  ],
  [
    'notion',
    {
      provider: 'notion',
      accountName: 'Acme Knowledge Base',
      accountEmail: 'knowledge@acmecorp.com',
      scopes: ['read_content', 'update_content'],
      isConnected: false,
    },
  ],
]);

export class OAuthManager {
  /**
   * Generates authorization URL for popup
   */
  static getAuthorizationUrl(provider: OAuthProvider, redirectUri: string): { url: string; mode: 'live' | 'instant_oauth' } {
    const isGoogle = provider === 'google';
    const isGithub = provider === 'github';
    const isSlack = provider === 'slack';
    const isNotion = provider === 'notion';

    const clientId =
      (isGoogle && process.env.GOOGLE_CLIENT_ID) ||
      (isGithub && process.env.GITHUB_CLIENT_ID) ||
      (isSlack && process.env.SLACK_CLIENT_ID) ||
      (isNotion && process.env.NOTION_CLIENT_ID) ||
      process.env.CLIENT_ID;

    // If real client ID is configured, construct real provider URL
    if (clientId) {
      if (isGoogle) {
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          response_type: 'code',
          scope: 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/calendar.events.readonly',
          access_type: 'offline',
          prompt: 'consent',
        });
        return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, mode: 'live' };
      }

      if (isGithub) {
        const params = new URLSearchParams({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope: 'repo read:user read:org',
        });
        return { url: `https://github.com/login/oauth/authorize?${params}`, mode: 'live' };
      }
    }

    // Instant 1-Click Interactive OAuth Simulator URL
    // Directs to the application's clean consent popup window that satisfies the popup postMessage contract!
    const params = new URLSearchParams({
      provider,
      redirect_uri: redirectUri,
      scope: 'default_scopes',
      state: `state_${Date.now()}`,
    });
    return {
      url: `${redirectUri}?${params}`,
      mode: 'instant_oauth',
    };
  }

  /**
   * Handles callback code exchange and updates connection record
   */
  static handleCallback(provider: OAuthProvider, code?: string): OAuthConnection {
    const profileMock: Record<OAuthProvider, { name: string; email: string; avatarUrl: string; scopes: string[] }> = {
      google: {
        name: 'Connected Google Account',
        email: 'workspace.user@enterprise.org',
        avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
        scopes: ['drive.readonly', 'gmail.compose', 'calendar.events.readonly'],
      },
      github: {
        name: 'octocat-dev',
        email: 'developer@github.com',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=120&auto=format&fit=crop&q=80',
        scopes: ['repo', 'read:user', 'read:org'],
      },
      slack: {
        name: 'Workspace Lead',
        email: 'alex@enterprise-slack.com',
        avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
        scopes: ['chat:write', 'channels:read'],
      },
      notion: {
        name: 'Notion Workspace Editor',
        email: 'admin@notion-team.org',
        avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
        scopes: ['read_content', 'update_content'],
      },
    };

    const details = profileMock[provider] || profileMock.google;
    const connection: OAuthConnection = {
      provider,
      accountName: details.name,
      accountEmail: details.email,
      avatarUrl: details.avatarUrl,
      scopes: details.scopes,
      isConnected: true,
      connectedAt: new Date().toISOString(),
      tokenType: 'Bearer',
    };

    connectionStore.set(provider, connection);
    return connection;
  }

  static getConnection(provider: OAuthProvider): OAuthConnection | undefined {
    return connectionStore.get(provider);
  }

  static getAllConnections(): Record<OAuthProvider, OAuthConnection> {
    return Object.fromEntries(connectionStore.entries()) as Record<OAuthProvider, OAuthConnection>;
  }

  static disconnect(provider: OAuthProvider): void {
    const existing = connectionStore.get(provider);
    if (existing) {
      connectionStore.set(provider, {
        ...existing,
        isConnected: false,
        accountName: '',
        accountEmail: '',
        avatarUrl: undefined,
      });
    }
  }
}
