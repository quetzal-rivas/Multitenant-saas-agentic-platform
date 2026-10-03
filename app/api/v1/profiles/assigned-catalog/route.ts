export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { McpProfileManager } from '@/lib/demo/legacy_mocks/profile-manager';
import { INITIAL_PROFILES } from '@/lib/demo';
import { PLATFORM_MCP_TOOLS_CATALOG } from '@/lib/demo/legacy_mocks/team-blueprint-manager';


export async function GET(req: NextRequest) {
  try {
    const mcpProfiles = McpProfileManager.listProfiles();
    const contextProfiles = INITIAL_PROFILES;
    const skills = PLATFORM_MCP_TOOLS_CATALOG;

    return NextResponse.json({
      mcp_profiles: mcpProfiles,
      context_profiles: contextProfiles,
      skills_catalog: skills,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
