export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { demoOnlyGuard } from '@/lib/http/demo-only';
import { teamBlueprintManager } from '@/lib/demo/legacy_mocks/team-blueprint-manager';

export async function POST(req: NextRequest) {
  const blocked = demoOnlyGuard('/api/v1/agent-sessions');
  if (blocked) return blocked;
  try {
    const body = await req.json();
    const { profile_id = 'team_front_desk_automation', title } = body;
    // Legacy mock blueprints live under the demo sandbox tenant; a body tenant_id is ignored.
    const tenant_id = 'tenant_enterprise_corp';

    // Spawns a brand new, unique thread_id bound to this profile blueprint
    const instance = teamBlueprintManager.spawnThreadInstance(profile_id, tenant_id, title);

    return NextResponse.json({
      success: true,
      instance,
      thread_id: instance.threadId,
      profile_id: instance.profileId,
      message: `Spawned dynamic thread instance '${instance.threadId}' bound to profile '${instance.profileId}'.`,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
