import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import type { ContextProfile } from '@/lib/types';
import { slugify } from './organizations';
import { ServiceError } from './errors';

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode'>;

const COLUMNS = 'id, slug, name, description, definition, version, created_at, updated_at';

/** The full ContextProfile is stored as JSON; only name/slug are validated strictly. */
export const contextProfileBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().max(120).optional(),
    description: z.string().max(2000).optional(),
  })
  .passthrough();

export interface ContextProfileRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  definition: Partial<ContextProfile>;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Shape the dashboard works with: the stored definition, with DB-owned fields on top. */
export function toContextProfile(row: ContextProfileRow): ContextProfile {
  const def = row.definition || {};
  return {
    environment: 'development',
    avgTokens: 0,
    lastRequestAt: '',
    contract: { required: [], optional: [] },
    pipeline: [],
    budget: { maxTokens: 8000, strategy: 'truncate_lowest_priority', outputFormat: 'markdown' },
    tags: [],
    publishedAt: '',
    ...def,
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description || '',
    version: row.version,
    createdAt: row.created_at,
  } as ContextProfile;
}

/** Fields owned by the database row, stripped before storing the definition. */
function definitionOf(body: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, slug: _slug, name: _name, description: _d, version: _v, createdAt: _c, ...rest } = body;
  return rest;
}

/**
 * Authored instructions to inject into an agent's system prompt: the static text of
 * enabled system / agent instruction / policy steps, highest priority first.
 * Retrieval steps are skipped on purpose (lib/compiler.ts fills those with sample data).
 */
export function contextProfileInstructions(profile: Pick<ContextProfile, 'name' | 'pipeline'>): string {
  const steps = (profile.pipeline || [])
    .filter(
      (s) =>
        s.enabled &&
        ['system_instructions', 'agent_instructions', 'policy'].includes(s.type) &&
        typeof s.config?.staticContent === 'string' &&
        s.config.staticContent.trim()
    )
    .sort((a, b) => b.priority - a.priority);
  if (steps.length === 0) return '';
  return steps.map((s) => `### ${s.title}\n${s.config.staticContent!.trim()}`).join('\n\n');
}

export async function listContextProfiles(ctx: Ctx) {
  const { data, error } = await getSupabaseAdminClient()
    .from('context_profiles')
    .select(COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Could not list context profiles: ${error.message}`);
  return ((data || []) as ContextProfileRow[]).map(toContextProfile);
}

export async function getContextProfile(ctx: Ctx, id: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from('context_profiles')
    .select(COLUMNS)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw new Error(`Could not load context profile: ${error.message}`);
  if (!data) throw new ServiceError('Context profile not found in this organization.', 'NOT_FOUND');
  return toContextProfile(data as ContextProfileRow);
}

export async function createContextProfile(ctx: Ctx, raw: unknown) {
  const body = contextProfileBody.parse(raw) as Record<string, any>;
  const { data, error } = await getSupabaseAdminClient()
    .from('context_profiles')
    .insert({
      tenant_id: ctx.tenantId,
      slug: slugify(body.slug || body.name),
      name: body.name,
      description: body.description || null,
      definition: definitionOf(body),
      created_by: ctx.authMode === 'session' ? ctx.userId : null,
    })
    .select(COLUMNS)
    .single();
  if (error?.code === '23505') throw new ServiceError(`A context profile with slug '${body.slug || body.name}' already exists.`, 'CONFLICT');
  if (error || !data) throw new Error(`Could not create context profile: ${error?.message}`);
  return toContextProfile(data as ContextProfileRow);
}

export async function updateContextProfile(ctx: Ctx, id: string, raw: unknown) {
  const body = contextProfileBody.parse(raw) as Record<string, any>;
  const current = await getContextProfile(ctx, id);
  const { data, error } = await getSupabaseAdminClient()
    .from('context_profiles')
    .update({
      name: body.name,
      ...(body.slug ? { slug: slugify(body.slug) } : {}),
      description: body.description ?? null,
      definition: definitionOf(body),
      version: current.version + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select(COLUMNS)
    .maybeSingle();
  if (error?.code === '23505') throw new ServiceError('Another context profile already uses that slug.', 'CONFLICT');
  if (error) throw new Error(`Could not update context profile: ${error.message}`);
  if (!data) throw new ServiceError('Context profile not found in this organization.', 'NOT_FOUND');
  return toContextProfile(data as ContextProfileRow);
}

export async function archiveContextProfile(ctx: Ctx, id: string) {
  const { data, error } = await getSupabaseAdminClient()
    .from('context_profiles')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .select('id');
  if (error) throw new Error(`Could not archive context profile: ${error.message}`);
  if (!data?.length) throw new ServiceError('Context profile not found in this organization.', 'NOT_FOUND');
}
