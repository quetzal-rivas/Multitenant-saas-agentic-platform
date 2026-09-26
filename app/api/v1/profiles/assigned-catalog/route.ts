import { NextRequest, NextResponse } from 'next/server';
import { McpProfileManager } from '@/Backend/profile-manager';
import { INITIAL_PROFILES } from '@/lib/mock-data';
import { PLATFORM_MCP_TOOLS_CATALOG } from '@/Backend/team-blueprint-manager';

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
