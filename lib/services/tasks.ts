import type { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import type { cancelTaskArgs, getTaskArgs, listTasksArgs, scheduleTaskArgs } from '@/lib/mcp/tool-catalog';
import { assertActiveProfile } from './profiles';
import { ServiceError } from './errors';

const TASK_COLUMNS = 'id, title, description, status, target_time, metadata, created_at';

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'>;

export async function listTasks(ctx: Ctx, args: z.infer<typeof listTasksArgs>) {
  let query = getSupabaseAdminClient()
    .from('supervisor_tasks')
    .select(TASK_COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .order('target_time', { ascending: true })
    .limit(args.limit || 20);
  if (args.status) query = query.eq('status', args.status);
  const { data, error } = await query;
  if (error) throw new Error(`Could not list scheduled tasks: ${error.message}`);
  return { tasks: data || [] };
}

export async function getTask(ctx: Ctx, args: z.infer<typeof getTaskArgs>) {
  const { data, error } = await getSupabaseAdminClient()
    .from('supervisor_tasks')
    .select(TASK_COLUMNS)
    .eq('id', args.task_id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (error) throw new Error(`Could not load task: ${error.message}`);
  if (!data) throw new ServiceError('Task not found in this organization.', 'NOT_FOUND');
  return { task: data };
}

export async function scheduleTask(ctx: Ctx, args: z.infer<typeof scheduleTaskArgs>) {
  const targetTime = new Date(args.target_time);
  if (targetTime.getTime() <= Date.now()) {
    throw new ServiceError('target_time must be in the future.', 'INVALID');
  }
  if (args.profile_id) await assertActiveProfile(ctx, args.profile_id);

  const { data, error } = await getSupabaseAdminClient()
    .from('supervisor_tasks')
    .insert({
      tenant_id: ctx.tenantId,
      title: args.title,
      description: args.instructions,
      status: 'scheduled',
      target_time: targetTime.toISOString(),
      metadata: {
        source: ctx.authMode === 'api_key' ? 'platform_mcp' : ctx.authMode,
        profile_id: args.profile_id || null,
        created_by: ctx.userId,
      },
    })
    .select(TASK_COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not create scheduled task: ${error?.message || 'no task returned'}`);
  return { task: data };
}

export async function cancelTask(ctx: Ctx, args: z.infer<typeof cancelTaskArgs>) {
  const { data, error } = await getSupabaseAdminClient()
    .from('supervisor_tasks')
    .update({ status: 'cancelled' })
    .eq('id', args.task_id)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'scheduled')
    .select(TASK_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(`Could not cancel task: ${error.message}`);
  if (!data) throw new ServiceError('No scheduled (not yet started) task with that id in this organization.', 'NOT_FOUND');
  return { task: data };
}
