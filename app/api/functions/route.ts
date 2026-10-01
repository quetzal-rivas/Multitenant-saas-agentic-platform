import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { ServerlessFunction } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // In a real authenticated scenario, you would extract the token and use a server-side Supabase client.
    // For this prototype, we're using the mock tenant ID from the request or a default.
    const org = searchParams.get('organizationId') || 'acme-corp';
    
    // Convert mock org name to a mock UUID for the prototype if necessary, 
    // or just assume org ID matches tenant_id format.
    const tenantId = org === 'acme-corp' ? '00000000-0000-0000-0000-000000000001' : org;

    const { data, error } = await supabase
      .from('custom_functions')
      .select('*')
      .eq('tenant_id', tenantId);

    if (error) throw error;

    // Map database rows back to the frontend ServerlessFunction format
    const mappedFunctions = data.map(row => ({
      id: row.id,
      name: row.name,
      function_slug: row.function_slug,
      code: row.code,
      inputSchema: row.input_schema,
      status: row.status,
      tenant_id: row.tenant_id,
      // Map other fields needed by the UI
      endpoint: `https://api.contextcontrol.io/v1/tenants/${row.tenant_id}/tools/${row.function_slug}`,
      mcpToolName: `org_tool_${row.function_slug}`
    }));

    return NextResponse.json({
      functions: mappedFunctions,
      total: mappedFunctions.length,
      organization: tenantId,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      name,
      organizationId = 'acme-corp',
      code = '',
      inputSchema = { type: 'object', properties: {} },
    } = body;

    if (!name || !code) {
      return NextResponse.json({ error: 'Function name and code are required' }, { status: 400 });
    }

    const tenantId = organizationId === 'acme-corp' ? '00000000-0000-0000-0000-000000000001' : organizationId;
    const functionSlug = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    const { data, error } = await supabase
      .from('custom_functions')
      .upsert({
        tenant_id: tenantId,
        function_slug: functionSlug,
        name: name.trim(),
        code: code,
        input_schema: inputSchema,
        status: 'active'
      }, { onConflict: 'tenant_id, function_slug' })
      .select()
      .single();

    if (error) throw error;

    const endpoint = `https://api.contextcontrol.io/v1/tenants/${tenantId}/tools/${functionSlug}`;
    const mcpToolName = `org_tool_${functionSlug}`;

    return NextResponse.json({
      success: true,
      function: {
        id: data.id,
        name: data.name,
        code: data.code,
        inputSchema: data.input_schema,
        status: data.status,
        endpoint,
        mcpToolName
      },
      mcpToolRegistered: mcpToolName,
      endpoint,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
