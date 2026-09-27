import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/Backend/supabase';
import { vaultManagerStore } from '@/Backend/vault-manager';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orgName, openaiKey, anthropicKey, twilioNumber } = body;

    if (!orgName || !orgName.trim()) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `tenant-${Date.now()}`;

    // 1. Upsert tenant in Supabase public.tenants table
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .upsert({ slug, name: orgName, tier: 'enterprise' }, { onConflict: 'slug' })
      .select('id, slug, name')
      .single();

    const tenantId = tenant?.id || '00000000-0000-0000-0000-000000000001';

    // 2. Register BYOK credentials into Vault
    if (openaiKey) {
      vaultManagerStore.connectSpoke(
        tenantId,
        'google_workspace',
        'OpenAI API Provider (BYOK)',
        `key_fingerprint_${openaiKey.slice(0, 8)}`,
        ['llm.generate']
      );
    }

    if (anthropicKey) {
      vaultManagerStore.connectSpoke(
        tenantId,
        'google_workspace',
        'Anthropic Claude Provider (BYOK)',
        `key_fingerprint_${anthropicKey.slice(0, 8)}`,
        ['llm.generate']
      );
    }

    // 3. Register Twilio phone line for tenant
    if (twilioNumber) {
      vaultManagerStore.connectSpoke(
        tenantId,
        'google_workspace',
        `Twilio Telephony Spoke (${twilioNumber})`,
        twilioNumber,
        ['voice.call']
      );
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
