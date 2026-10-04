export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireSessionUser } from '@/lib/auth/require-auth';
import { errorResponse } from '@/lib/http/route-errors';
import { createOrganizationWithOwner } from '@/lib/services/organizations';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireSessionUser();
    const body = await req.json();
    const org = await createOrganizationWithOwner(userId, typeof body?.name === 'string' ? body.name : '');

    return NextResponse.json(
      { id: org.id, name: org.name, slug: org.slug, role: org.role, subscription_status: 'active', created: org.created },
      { status: org.created ? 201 : 200 }
    );
  } catch (err) {
    return errorResponse(err, 'organizations:create');
  }
}
