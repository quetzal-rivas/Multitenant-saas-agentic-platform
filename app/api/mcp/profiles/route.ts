export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import crypto from 'crypto';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profiles, error } = await supabase
      .from('mcp_profiles')
      .select('*, mcp_api_keys(key_prefix)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Map to the format expected by the frontend
    const formattedProfiles = profiles.map(p => ({
      id: p.id,
      name: p.name,
      slug: p.settings?.slug || p.id,
      description: p.description,
      tokenBudget: p.token_budget,
      selectedToolNames: p.settings?.selectedToolNames || [],
      selectedSkillNames: p.settings?.selectedSkillNames || [],
      boundContextProfileSlugs: p.settings?.boundContextProfileSlugs || [],
      apiKey: p.mcp_api_keys?.[0]?.key_prefix + '...', // Masked key for UI
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      lastActive: p.settings?.lastActive || 'Never'
    }));

    return NextResponse.json({ profiles: formattedProfiles });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();

    if (body.action === 'update' && body.id) {
      const { data: existing } = await supabase.from('mcp_profiles').select('settings').eq('id', body.id).single();
      const updatedSettings = { ...(existing?.settings || {}), ...body.data };
      
      const { data, error } = await supabase
        .from('mcp_profiles')
        .update({ settings: updatedSettings, updated_at: new Date().toISOString() })
        .eq('id', body.id)
        .select()
        .single();
        
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ profile: data });
    }

    if (body.action === 'delete' && body.id) {
      const { error } = await supabase.from('mcp_profiles').delete().eq('id', body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    // CREATE NEW PROFILE
    // 1. Get user's primary org_id
    const { data: orgMember, error: orgError } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
      
    if (orgError || !orgMember) return NextResponse.json({ error: 'No organization found' }, { status: 400 });
    const orgId = orgMember.organization_id;

    // 2. Insert Profile
    const { data: profile, error: profileError } = await supabase
      .from('mcp_profiles')
      .insert({
        org_id: orgId,
        created_by: user.id,
        name: body.name || 'Custom MCP Profile',
        description: body.description || '',
        token_budget: body.tokenBudget || 10000,
        settings: {
          slug: body.slug || `mcp-${Date.now()}`,
          selectedToolNames: body.selectedToolNames || [],
          selectedSkillNames: body.selectedSkillNames || [],
          boundContextProfileSlugs: body.boundContextProfileSlugs || [],
          lastActive: 'Never'
        }
      })
      .select()
      .single();

    if (profileError) throw profileError;

    // 3. Generate API Key
    const rawKey = `cc_live_${crypto.randomBytes(16).toString('hex')}`;
    const keyPrefix = rawKey.substring(0, 14);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest();

    const { error: keyError } = await supabase
      .from('mcp_api_keys')
      .insert({
        profile_id: profile.id,
        org_id: orgId,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        label: `${body.name || 'Custom'} Key`,
        created_by: user.id
      });

    if (keyError) throw keyError;

    return NextResponse.json({ 
      profile: {
        id: profile.id,
        name: profile.name,
        slug: profile.settings.slug,
        description: profile.description,
        tokenBudget: profile.token_budget,
        selectedToolNames: profile.settings.selectedToolNames,
        selectedSkillNames: profile.settings.selectedSkillNames,
        boundContextProfileSlugs: profile.settings.boundContextProfileSlugs,
        apiKey: rawKey, // Return raw key ONCE
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        lastActive: 'Never'
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
