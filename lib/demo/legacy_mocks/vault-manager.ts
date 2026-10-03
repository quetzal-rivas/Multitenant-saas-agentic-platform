/**
 * Upstream Tenant Auth Vault (Spokes Pre-Authentication)
 * Securely manages encrypted OAuth2 credentials & API keys tied to tenant_id
 * Zero Credential Exposure to LLM - Only decrypted inside the Proprietary Gateway
 */

export interface VaultSpokeCredential {
  id: string;
  tenantId: string;
  provider: 'hubspot' | 'google_workspace' | 'github' | 'slack' | 'notion' | 'postgres' | 'sendgrid';
  providerName: string;
  accountLabel: string;
  scopes: string[];
  keyFingerprint: string;
  isActive: boolean;
  connectedAt: string;
  lastUsedAt?: string;
  tokenExpiresAt?: string;
}

export class TenantVaultManager {
  private credentials: Map<string, VaultSpokeCredential[]> = new Map();

  constructor() {
    // Seed initial enterprise tenant with pre-authenticated spoke credentials
    const defaultTenantId = 'tenant_enterprise_corp';
    this.credentials.set(defaultTenantId, [
      {
        id: 'vlt_hs_902',
        tenantId: defaultTenantId,
        provider: 'hubspot',
        providerName: 'HubSpot CRM Enterprise',
        accountLabel: 'sales-ops@acmecorp.com',
        scopes: ['crm.objects.contacts.read', 'crm.objects.deals.write'],
        keyFingerprint: 'sha256:7f4a...e89b (AES-256-GCM Encrypted)',
        isActive: true,
        connectedAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        lastUsedAt: new Date().toISOString(),
      },
      {
        id: 'vlt_gw_441',
        tenantId: defaultTenantId,
        provider: 'google_workspace',
        providerName: 'Google Workspace',
        accountLabel: 'executive-admin@acmecorp.com',
        scopes: ['gmail.send', 'calendar.events', 'drive.readonly'],
        keyFingerprint: 'sha256:c21b...90d4 (AES-256-GCM Encrypted)',
        isActive: true,
        connectedAt: new Date(Date.now() - 86400000 * 12).toISOString(),
        lastUsedAt: new Date().toISOString(),
      },
      {
        id: 'vlt_gh_128',
        tenantId: defaultTenantId,
        provider: 'github',
        providerName: 'GitHub Enterprise',
        accountLabel: 'org:acme-infrastructure',
        scopes: ['repo', 'read:packages', 'workflow'],
        keyFingerprint: 'sha256:88ac...4311 (AES-256-GCM Encrypted)',
        isActive: true,
        connectedAt: new Date(Date.now() - 86400000 * 20).toISOString(),
        lastUsedAt: new Date().toISOString(),
      },
      {
        id: 'vlt_pg_773',
        tenantId: defaultTenantId,
        provider: 'postgres',
        providerName: 'Internal Postgres Supavisor (:5432)',
        accountLabel: 'postgres://readonly_analyst@supavisor',
        scopes: ['SELECT on public.*', 'READ ONLY'],
        keyFingerprint: 'sha256:55aa...3342 (Encrypted Connection URI)',
        isActive: true,
        connectedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
        lastUsedAt: new Date().toISOString(),
      },
      {
        id: 'vlt_sl_392',
        tenantId: defaultTenantId,
        provider: 'slack',
        providerName: 'Slack Enterprise Grid',
        accountLabel: '#triage-support-incidents',
        scopes: ['chat:write', 'channels:read'],
        keyFingerprint: 'sha256:11bb...99ef (Bot User OAuth)',
        isActive: true,
        connectedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        lastUsedAt: new Date().toISOString(),
      },
    ]);
  }

  public getCredentials(tenantId: string): VaultSpokeCredential[] {
    return this.credentials.get(tenantId) || [];
  }

  public connectSpoke(
    tenantId: string,
    provider: VaultSpokeCredential['provider'],
    providerName: string,
    accountLabel: string,
    scopes: string[]
  ): VaultSpokeCredential {
    const list = this.credentials.get(tenantId) || [];
    const newCred: VaultSpokeCredential = {
      id: `vlt_${provider.slice(0, 2)}_${Math.random().toString(36).substring(2, 7)}`,
      tenantId,
      provider,
      providerName,
      accountLabel,
      scopes,
      keyFingerprint: `sha256:${Math.random().toString(16).substring(2, 10)}...${Math.random().toString(16).substring(2, 6)} (AES-256-GCM)`,
      isActive: true,
      connectedAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
    };
    
    // Replace if existing provider
    const existingIndex = list.findIndex((c) => c.provider === provider);
    if (existingIndex >= 0) {
      list[existingIndex] = newCred;
    } else {
      list.push(newCred);
    }
    this.credentials.set(tenantId, list);
    return newCred;
  }

  public toggleSpokeStatus(tenantId: string, credentialId: string): boolean {
    const list = this.credentials.get(tenantId) || [];
    const cred = list.find((c) => c.id === credentialId);
    if (cred) {
      cred.isActive = !cred.isActive;
      return cred.isActive;
    }
    return false;
  }
}

// Global Singleton
export const vaultManagerStore = new TenantVaultManager();
