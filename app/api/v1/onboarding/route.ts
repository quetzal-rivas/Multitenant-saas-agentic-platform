export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { createOrganizationWithOwner, storeOnboardingSecrets } from '@/lib/services/organizations';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireSessionUser();
    const body = await req.json();
    const { orgName, apiKeys, twilioNumber } = body || {};

    const org = await createOrganizationWithOwner(userId, typeof orgName === 'string' ? orgName : '');
    const secrets = Array.isArray(apiKeys) && org.role !== 'member'
      ? await storeOnboardingSecrets(org.id, apiKeys)
      : { stored: [], failed: [] };

    return NextResponse.json({
      success: true,
      message: org.created
        ? `Organization '${org.name}' successfully onboarded and workspace provisioned.`
        : `You already belong to '${org.name}'.`,
      tenantId: org.id,
      slug: org.slug,
      created: org.created,
      secretsStored: secrets.stored,
      secretsFailed: secrets.failed,
      twilioNumber: typeof twilioNumber === 'string' && twilioNumber ? twilioNumber : null,
    }, { status: org.created ? 201 : 200 });
  } catch (err) {
    return errorResponse(err, 'onboarding');
  }
}
