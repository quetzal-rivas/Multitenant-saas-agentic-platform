export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { createPlatformApiKey } from '@/lib/auth/api-keys';
import { errorResponse } from '@/lib/http/route-errors';
import * as profiles from '@/lib/services/profiles';

/** Map a DB profile row to the shape the dashboard components expect. */
function toDashboardProfile(p: any, apiKey?: string) {
  return {
    id: p.id,
    name: p.name,
    slug: p.settings?.slug || p.id,
    description: p.description,
    tokenBudget: p.token_budget,
    selectedToolNames: p.settings?.selectedToolNames || [],
    selectedSkillNames: p.settings?.selectedSkillNames || [],
    boundContextProfileSlugs: p.settings?.boundContextProfileSlugs || [],
    functionIds: p.settings?.function_ids || [],
    connectorTools: p.settings?.connector_tools || [],
    apiKey,
    isActive: p.is_active,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    lastActive: p.settings?.lastActive || 'Never',
  };
}

const createBody = z.object({
  name: z.string().trim().min(1).max(120).default('Custom MCP Profile'),
  description: z.string().max(2000).optional(),
  tokenBudget: z.number().int().min(256).max(2_000_000).default(10_000),
  slug: z.string().max(120).optional(),
  selectedToolNames: z.array(z.string()).default([]),
  selectedSkillNames: z.array(z.string()).default([]),
  boundContextProfileSlugs: z.array(z.string()).default([]),
  issueApiKey: z.boolean().default(true),
});

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const { profiles: rows } = await profiles.listProfiles(auth, { limit: 100 });
    return NextResponse.json({ profiles: rows.map((p) => toDashboardProfile(p)) });
  } catch (err) {
    return errorResponse(err, 'mcp-profiles:list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const body = await req.json();

    if (body.action === 'update' && body.id) {
      const { profile: existing } = await profiles.getProfile(auth, { profile_id: body.id });
      const settings = { ...(existing.settings || {}), ...(body.data || {}) };
      const { profile } = await profiles.updateProfile(auth, { profile_id: body.id, settings });
      return NextResponse.json({ profile: toDashboardProfile(profile) });
    }

    if (body.action === 'delete' && body.id) {
      // Soft delete: keeps task history and audit references intact.
      await profiles.archiveProfile(auth, { profile_id: body.id });
      return NextResponse.json({ success: true });
    }

    const input = createBody.parse(body);
    const { profile } = await profiles.createProfile(auth, {
      name: input.name,
      description: input.description,
      token_budget: input.tokenBudget,
      settings: {
        slug: input.slug || `mcp-${Date.now()}`,
        selectedToolNames: input.selectedToolNames,
        selectedSkillNames: input.selectedSkillNames,
        boundContextProfileSlugs: input.boundContextProfileSlugs,
        lastActive: 'Never',
      },
    });

    let rawKey: string | undefined;
    if (input.issueApiKey) {
      const key = await createPlatformApiKey(auth.tenantId, {
        name: `${profile.name} Key`,
        createdBy: auth.userId,
        profileId: profile.id,
      });
      rawKey = key.rawKey; // returned once
    }

    return NextResponse.json({ profile: toDashboardProfile(profile, rawKey) }, { status: 201 });
  } catch (err) {
    return errorResponse(err, 'mcp-profiles:write');
  }
}
