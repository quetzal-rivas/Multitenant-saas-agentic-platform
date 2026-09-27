export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { teamBlueprintManager } from '@/Backend/team-blueprint-manager';
import { vaultManagerStore } from '@/Backend/vault-manager';

export async function GET(req: NextRequest) {
  let tenantId = 'tenant_enterprise_corp';
  try {
    if (req && req.url) {
      const { searchParams } = new URL(req.url);
      tenantId = searchParams.get('tenant_id') || 'tenant_enterprise_corp';
    }
  } catch (e) {}

  // 1. Ask Proprietary MCP Gateway: "What tools does this tenant have authenticated?"
  const tools = teamBlueprintManager.getTenantAuthenticatedTools(tenantId);
  const vaultCredentials = vaultManagerStore.getCredentials(tenantId);
  const activeSpokes = vaultCredentials.filter((c) => c.isActive).map((c) => c.provider);

  // Mark tools with their active tenant authentication status
  const annotatedTools = tools.map((tool) => ({
    ...tool,
    isAuthenticated: activeSpokes.includes(tool.spoke as any),
  }));

  return NextResponse.json({
    tenant_id: tenantId,
    total_tools: annotatedTools.length,
    authenticated_spokes: activeSpokes,
    tools: annotatedTools,
    gateway_status: 'online',
    encryption: 'AES-256-GCM Zero-Exposure Runtime',
  });
}
