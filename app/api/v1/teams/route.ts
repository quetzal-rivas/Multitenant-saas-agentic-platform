export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { demoOnlyGuard } from '@/lib/http/demo-only';
import { teamBlueprintManager } from '@/lib/demo/legacy_mocks/team-blueprint-manager';

// Legacy in-memory team blueprints for the demo playground. The tenant is fixed to the
// demo sandbox; a tenant_id in the request is never honoured. Real teams: /api/v1/agent-teams.
const DEMO_TENANT = 'tenant_enterprise_corp';
const REPLACEMENT = '/api/v1/agent-teams';

export async function GET(req: NextRequest) {
  const blocked = demoOnlyGuard(REPLACEMENT);
  if (blocked) return blocked;
  try {
    const tenantId = DEMO_TENANT;
    const profileId = req.nextUrl.searchParams.get('profile_id');

    if (profileId) {
      const profile = teamBlueprintManager.getProfile(profileId);
      if (!profile) {
        return NextResponse.json({ error: 'Team profile blueprint not found' }, { status: 404 });
      }
      const instances = teamBlueprintManager.getInstancesForProfile(profileId, tenantId);
      return NextResponse.json({ profile, instances });
    }

    const profiles = teamBlueprintManager.getAllProfiles(tenantId);
    const allInstances = teamBlueprintManager.getAllInstances(tenantId);

    return NextResponse.json({
      tenant_id: tenantId,
      teams_count: profiles.length,
      teams: profiles,
      all_instances: allInstances,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const blocked = demoOnlyGuard(REPLACEMENT);
  if (blocked) return blocked;
  try {
    const body = await req.json();
    const tenant_id = DEMO_TENANT;
    const {
      name,
      supervisor_prompt = '',
      supervisor_skills = [],
      supervisor_mcp_profile_id,
      supervisor_context_profile_slug,
      routing_strategy = 'supervisor_router',
      workers,
    } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Missing required field: team name is required.' },
        { status: 400 }
      );
    }

    if (!workers || !Array.isArray(workers) || workers.length === 0) {
      return NextResponse.json(
        { error: 'At least one specialist worker must be assigned to the team.' },
        { status: 400 }
      );
    }

    const newProfile = teamBlueprintManager.createProfile({
      tenantId: tenant_id,
      name,
      supervisorPrompt: supervisor_prompt,
      supervisorSkills: supervisor_skills,
      supervisorMcpProfileId: supervisor_mcp_profile_id,
      supervisorContextProfileSlug: supervisor_context_profile_slug,
      routingStrategy: routing_strategy,
      workers: workers.map((w: any) => ({
        name: w.name || 'Specialist Worker',
        role: w.role || 'Operational Agent',
        systemPrompt: w.system_prompt || w.systemPrompt || '',
        mcpTools: w.skills || w.mcp_tools || w.mcpTools || [],
        skills: w.skills || w.mcp_tools || w.mcpTools || [],
        mcpProfileId: w.mcp_profile_id || w.mcpProfileId || '',
        contextProfileSlug: w.context_profile_slug || w.contextProfileSlug || '',
        avatarIcon: w.avatar_icon || w.avatarIcon || 'bot',
      })),
    });

    return NextResponse.json({
      success: true,
      message: `Team blueprint '${newProfile.name}' successfully published to Supabase under tenant ${tenant_id}.`,
      profile: newProfile,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const blocked = demoOnlyGuard(REPLACEMENT);
  if (blocked) return blocked;
  try {
    const { searchParams } = new URL(req?.url || 'http://localhost');
    const profileId = searchParams.get('profile_id');

    if (!profileId) {
      return NextResponse.json({ error: 'profile_id is required.' }, { status: 400 });
    }

    const success = teamBlueprintManager.deleteProfile(profileId);
    return NextResponse.json({ success, profile_id: profileId });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
