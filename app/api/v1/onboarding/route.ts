export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { orgName, apiKeys, twilioNumber } = body;

    if (!orgName || !orgName.trim()) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `tenant-${Date.now()}`;

    // 1. Insert organization
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .insert({ slug, name: orgName, subscription_status: 'active' })
      .select('id, slug, name')
      .single();

    if (orgError) {
      return NextResponse.json({ error: `Failed to create organization: ${orgError.message}` }, { status: 500 });
    }

    const tenantId = organization.id;

    // 2. Insert organization member
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: tenantId,
        user_id: user.id,
        role: 'owner'
      });

    if (memberError) {
      // Rollback org would be ideal here if in a real transaction
      return NextResponse.json({ error: `Failed to assign organization owner: ${memberError.message}` }, { status: 500 });
    }

    // 3. Register BYOK credentials into tenant_api_keys table
    if (Array.isArray(apiKeys) && apiKeys.length > 0) {
      const keysToInsert = apiKeys
        .filter((k: any) => k.name && k.value && k.value.trim() !== '')
        .map((k: any) => ({
          organization_id: tenantId,
          key_name: k.name,
          key_value: k.value,
        }));

      if (keysToInsert.length > 0) {
        const { error: keysError } = await supabase
          .from('tenant_api_keys')
          .insert(keysToInsert);

        if (keysError) {
          console.error('Failed to store BYOK keys:', keysError.message);
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Organization '${orgName}' successfully onboarded and workspace provisioned.`,
      tenantId,
      slug,
      twilioNumber: twilioNumber || '+1 (555) 839-2041',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Onboarding registration failed' },
      { status: 500 }
    );
  }
}
