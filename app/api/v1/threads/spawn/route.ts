export const dynamic = 'force-static';
import { NextRequest, NextResponse } from 'next/server';
import { teamBlueprintManager } from '@/Backend/team-blueprint-manager';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      profile_id = 'team_front_desk_automation',
      tenant_id = 'tenant_enterprise_corp',
      title,
    } = body;

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
