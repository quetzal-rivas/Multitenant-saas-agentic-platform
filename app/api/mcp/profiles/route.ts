export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { McpProfileManager } from '@/Backend/legacy_ts_mocks/profile-manager';

export async function GET() {
  const profiles = McpProfileManager.listProfiles();
  return NextResponse.json({ profiles });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.action === 'update' && body.id) {
      const updated = McpProfileManager.updateProfile(body.id, body.data);
      if (!updated) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      return NextResponse.json({ profile: updated });
    }

    if (body.action === 'delete' && body.id) {
      const success = McpProfileManager.deleteProfile(body.id);
      return NextResponse.json({ success });
    }

    // Create new
    const created = McpProfileManager.createProfile({
      name: body.name || 'Custom MCP Profile',
      slug: body.slug || `mcp-${Date.now()}`,
      description: body.description || '',
      apiKey: `mcp_live_sec_${Math.random().toString(36).substring(2, 15)}`,
      tokenBudget: body.tokenBudget || 10000,
      selectedToolNames: body.selectedToolNames || [],
      selectedSkillNames: body.selectedSkillNames || [],
      boundContextProfileSlugs: body.boundContextProfileSlugs || [],
    });

    return NextResponse.json({ profile: created });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
