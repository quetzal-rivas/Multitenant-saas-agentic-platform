export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole } from '@/lib/auth/require-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { errorResponse } from '@/lib/http/route-errors';

/**
 * Stored function definitions for AI Function Studio. Deployment and execution are
 * not available yet; this route only lists and saves definitions for the caller's
 * organization (taken from the session, never from the request).
 */

const saveBody = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().min(1).max(100_000),
  inputSchema: z.record(z.string(), z.unknown()).default({ type: 'object', properties: {} }),
}).passthrough(); // the editor sends extra UI fields; only the ones above are stored

function slugOf(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 64);
}

function toClient(row: any) {
  return {
    id: row.id,
    name: row.name,
    function_slug: row.function_slug,
    code: row.code,
    inputSchema: row.input_schema,
    status: row.status,
    deployed: false,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    const { data, error } = await getSupabaseAdminClient()
      .from('custom_functions')
      .select('id, name, function_slug, code, input_schema, status')
      .eq('tenant_id', auth.tenantId)
      .order('name', { ascending: true });
    if (error) throw new Error(`Could not list functions: ${error.message}`);
    const functions = (data || []).map(toClient);
    return NextResponse.json({ functions, total: functions.length });
  } catch (err) {
    return errorResponse(err, 'functions:list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req, 'session');
    requireRole(auth, ['owner', 'admin']);
    const body = saveBody.parse(await req.json());
    const { data, error } = await getSupabaseAdminClient()
      .from('custom_functions')
      .upsert(
        {
          tenant_id: auth.tenantId,
          function_slug: slugOf(body.name),
          name: body.name,
          code: body.code,
          input_schema: body.inputSchema,
          status: 'draft',
        },
        { onConflict: 'tenant_id,function_slug' }
      )
      .select('id, name, function_slug, code, input_schema, status')
      .single();
    if (error || !data) throw new Error(`Could not save function: ${error?.message}`);
    return NextResponse.json({ success: true, function: toClient(data) });
  } catch (err) {
    return errorResponse(err, 'functions:save');
  }
}
