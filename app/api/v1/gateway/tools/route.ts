export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { demoOnlyGuard } from '@/lib/http/demo-only';
import { teamBlueprintManager } from '@/lib/demo/legacy_mocks/team-blueprint-manager';
import { vaultManagerStore } from '@/lib/demo/legacy_mocks/vault-manager';

/** Legacy mock tool catalog for the demo sandbox tenant; the request cannot pick a tenant. */
export async function GET() {
  const blocked = demoOnlyGuard('GET /api/v1/connections');
  if (blocked) return blocked;
  const tenantId = 'tenant_enterprise_corp';

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
