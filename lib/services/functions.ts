import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionConfigurationCommand,
  InvokeCommand,
  LambdaClient,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
} from '@aws-sdk/client-lambda';
import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { envelopeDecryptSecret, envelopeEncryptSecret, type EncryptedSecretPayload } from '@/lib/secrets/envelope-encryption';
import { buildPackage, deployHash, type FunctionResult } from '@/lib/functions/runtime-wrappers';
import {
  DAILY_INVOCATION_CAP,
  MAX_FUNCTIONS_PER_ORG,
  functionSaveSchema,
  functionSlug,
  secretNameSchema,
  validateInput,
} from '@/lib/functions/function-spec';
import { boardActor } from './board';
import { ServiceError } from './errors';

/**
 * AI Function Studio. Each deployed function is its own AWS Lambda
 * (`ccfn-<function id>`) running under an execution role that can only write logs,
 * so user code never runs on the platform and cannot reach platform resources.
 * The tenant always comes from the caller's credentials.
 */

export type FunctionCtx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode' | 'apiKeyId'> & { teamId?: string | null };
export type InvocationSource = 'test' | 'agent' | 'mcp';
type Row = Record<string, any>;

const COLUMNS =
  'id, tenant_id, name, function_slug, description, language, code, input_schema, status, lambda_name, deployed_code_hash, deployed_version, deployed_at, last_error, timeout_seconds, memory_mb, archived_at, created_at, updated_at';

// ---------------------------------------------------------------------------
// Lambda client (injectable for tests)
// ---------------------------------------------------------------------------

export interface LambdaLike {
  send(command: any): Promise<any>;
}
let lambdaClient: LambdaLike | null = null;
let waitMs = 1000;

/** Tests swap in a fake Lambda and a zero wait. */
export function setLambdaClientForTests(client: LambdaLike | null, pollWaitMs = 0) {
  lambdaClient = client;
  waitMs = pollWaitMs;
}
function lambda(): LambdaLike {
  return (lambdaClient ||= new LambdaClient({ region: process.env.AWS_REGION || 'us-east-2' }));
}

function execRoleArn(): string {
  const arn = process.env.FUNCTION_EXEC_ROLE_ARN;
  if (!arn) throw new ServiceError('Function deployment is not configured on this server (FUNCTION_EXEC_ROLE_ARN is missing).', 'CONFLICT');
  return arn;
}

export const lambdaNameFor = (functionId: string) => `ccfn-${functionId.replace(/-/g, '')}`;

/**
 * Create the Lambda. In production this goes through the `cc-function-deployer` Lambda
 * (infra/function-deployer): Amplify's compute role may not pass IAM roles, which
 * CreateFunction requires. Without a deployer configured (local/tests) it calls Lambda directly.
 */
async function createLambda(config: Row, zip: Uint8Array, tags: Record<string, string>) {
  const deployer = process.env.FUNCTION_DEPLOYER_NAME;
  if (!deployer) {
    await lambda().send(new CreateFunctionCommand({ ...config, Role: execRoleArn(), Code: { ZipFile: zip }, Architectures: ['arm64'], Tags: tags } as any));
    return;
  }
  const res = await lambda().send(
    new InvokeCommand({
      FunctionName: deployer,
      InvocationType: 'RequestResponse',
      Payload: new TextEncoder().encode(JSON.stringify({ ...config, Tags: tags, ZipFileBase64: Buffer.from(zip).toString('base64') })),
    })
  );
  if (res.FunctionError) {
    const payload = JSON.parse(res.Payload ? new TextDecoder().decode(res.Payload) : '{}');
    throw new ServiceError(`Could not create the Lambda: ${payload?.errorMessage || res.FunctionError}`, 'CONFLICT');
  }
}

const isNotFound = (err: any) => err?.name === 'ResourceNotFoundException' || err?.$metadata?.httpStatusCode === 404;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

interface SecretMeta {
  name: string;
  updated_at: string;
}

/** Function plus derived fields: whether the deployed Lambda is out of date, and secret names (never values). */
export type FunctionRecord = Row & { secret_names: string[]; needs_deploy: boolean };

function present(fn: Row, secrets: SecretMeta[] = []): FunctionRecord {
  const secretsChanged = !!fn.deployed_at && secrets.some((s) => s.updated_at > fn.deployed_at);
  const needsDeploy = fn.status !== 'deployed' || fn.deployed_code_hash !== deployHash(fn) || secretsChanged;
  const { tenant_id: _t, ...rest } = fn;
  return { ...rest, secret_names: secrets.map((s) => s.name).sort(), needs_deploy: needsDeploy };
}

async function loadFunction(ctx: FunctionCtx, id: string): Promise<Row> {
  const { data, error } = await getSupabaseAdminClient()
    .from('custom_functions')
    .select(COLUMNS)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .maybeSingle();
  if (error) throw new Error(`Could not load function: ${error.message}`);
  if (!data) throw new ServiceError('Function not found in this organization.', 'NOT_FOUND');
  return data;
}

async function secretMeta(ctx: FunctionCtx, functionIds: string[]): Promise<Map<string, SecretMeta[]>> {
  const out = new Map<string, SecretMeta[]>();
  if (!functionIds.length) return out;
  const { data } = await getSupabaseAdminClient()
    .from('function_secrets')
    .select('function_id, name, updated_at')
    .eq('tenant_id', ctx.tenantId);
  for (const s of data || []) {
    if (!functionIds.includes(s.function_id)) continue;
    out.set(s.function_id, [...(out.get(s.function_id) || []), { name: s.name, updated_at: s.updated_at }]);
  }
  return out;
}

export async function listFunctions(ctx: FunctionCtx, opts: { deployedOnly?: boolean } = {}) {
  let query = getSupabaseAdminClient()
    .from('custom_functions')
    .select(COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null)
    .order('name', { ascending: true });
  if (opts.deployedOnly) query = query.eq('status', 'deployed');
  const { data, error } = await query;
  if (error) throw new Error(`Could not list functions: ${error.message}`);
  const rows = data || [];
  const secrets = await secretMeta(ctx, rows.map((r) => r.id));
  return { functions: rows.map((r) => present(r, secrets.get(r.id))) };
}

export async function getFunction(ctx: FunctionCtx, id: string) {
  const fn = await loadFunction(ctx, id);
  const secrets = await secretMeta(ctx, [fn.id]);
  return { function: present(fn, secrets.get(fn.id)) };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createFunction(ctx: FunctionCtx, body: unknown) {
  const spec = functionSaveSchema.parse(body);
  const db = getSupabaseAdminClient();
  const { data: existing } = await db
    .from('custom_functions')
    .select('id, function_slug')
    .eq('tenant_id', ctx.tenantId)
    .is('archived_at', null);
  if ((existing || []).length >= MAX_FUNCTIONS_PER_ORG) {
    throw new ServiceError(`An organization can have up to ${MAX_FUNCTIONS_PER_ORG} functions. Archive one first.`, 'CONFLICT');
  }
  const slug = functionSlug(spec.name);
  if ((existing || []).some((f) => f.function_slug === slug)) {
    throw new ServiceError(`A function named "${slug}" already exists. Pick another name.`, 'CONFLICT');
  }
  // An archived function may still hold the slug (unique per tenant); free it.
  await db.from('custom_functions').delete().eq('tenant_id', ctx.tenantId).eq('function_slug', slug).not('archived_at', 'is', null);

  const { data, error } = await db
    .from('custom_functions')
    .insert({ tenant_id: ctx.tenantId, function_slug: slug, ...spec, status: 'draft' })
    .select(COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not create function: ${error?.message}`);
  return { function: present(data) };
}

/** Update a function's draft. The slug (tool name) stays fixed after creation. */
export async function updateFunction(ctx: FunctionCtx, id: string, body: unknown) {
  const current = await loadFunction(ctx, id);
  const spec = functionSaveSchema.parse(body);
  const { data, error } = await getSupabaseAdminClient()
    .from('custom_functions')
    .update({ ...spec, updated_at: new Date().toISOString() })
    .eq('id', current.id)
    .eq('tenant_id', ctx.tenantId)
    .select(COLUMNS)
    .single();
  if (error || !data) throw new Error(`Could not save function: ${error?.message}`);
  const secrets = await secretMeta(ctx, [id]);
  return { function: present(data, secrets.get(id)) };
}

export async function archiveFunction(ctx: FunctionCtx, id: string) {
  const fn = await loadFunction(ctx, id);
  if (fn.lambda_name) {
    try {
      await lambda().send(new DeleteFunctionCommand({ FunctionName: fn.lambda_name }));
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
  await getSupabaseAdminClient()
    .from('custom_functions')
    .update({ archived_at: new Date().toISOString(), status: 'draft', lambda_name: null, updated_at: new Date().toISOString() })
    .eq('id', fn.id)
    .eq('tenant_id', ctx.tenantId);
  return { archived: true };
}

const secretContext = (functionId: string, name: string) => `fn:${functionId}:${name}`;

export async function setFunctionSecret(ctx: FunctionCtx, id: string, name: string, value: string) {
  const fn = await loadFunction(ctx, id);
  const secretName = secretNameSchema.parse(name);
  if (!value || value.length > 4000) throw new ServiceError('Secret value must be 1-4000 characters.', 'INVALID');
  const payload = await envelopeEncryptSecret(value, ctx.tenantId, secretContext(fn.id, secretName));
  const db = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from('function_secrets')
    .select('id')
    .eq('function_id', fn.id)
    .eq('tenant_id', ctx.tenantId)
    .eq('name', secretName)
    .maybeSingle();
  const { error } = existing
    ? await db.from('function_secrets').update({ encrypted_payload: payload, updated_at: now }).eq('id', existing.id)
    : await db.from('function_secrets').insert({ function_id: fn.id, tenant_id: ctx.tenantId, name: secretName, encrypted_payload: payload, updated_at: now });
  if (error) throw new Error(`Could not store secret: ${error.message}`);
  return getFunction(ctx, fn.id);
}

export async function deleteFunctionSecret(ctx: FunctionCtx, id: string, name: string) {
  const fn = await loadFunction(ctx, id);
  await getSupabaseAdminClient().from('function_secrets').delete().eq('function_id', fn.id).eq('tenant_id', ctx.tenantId).eq('name', name);
  // Removing a variable also needs a redeploy; mark the deployment stale.
  await getSupabaseAdminClient().from('custom_functions').update({ deployed_code_hash: null }).eq('id', fn.id).eq('tenant_id', ctx.tenantId);
  return getFunction(ctx, fn.id);
}

async function decryptedSecrets(ctx: FunctionCtx, functionId: string): Promise<Record<string, string>> {
  const { data } = await getSupabaseAdminClient()
    .from('function_secrets')
    .select('name, encrypted_payload')
    .eq('function_id', functionId)
    .eq('tenant_id', ctx.tenantId);
  const env: Record<string, string> = {};
  for (const s of data || []) {
    env[s.name] = await envelopeDecryptSecret(s.encrypted_payload as EncryptedSecretPayload, ctx.tenantId, secretContext(functionId, s.name));
  }
  return env;
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

async function waitUntilReady(name: string): Promise<Row> {
  for (let i = 0; i < 40; i++) {
    const conf = await lambda().send(new GetFunctionConfigurationCommand({ FunctionName: name }));
    if (conf.State === 'Failed' || conf.LastUpdateStatus === 'Failed') {
      throw new ServiceError(`Lambda reported a failure: ${conf.StateReason || conf.LastUpdateStatusReason || 'unknown reason'}`, 'CONFLICT');
    }
    if (conf.State === 'Active' && conf.LastUpdateStatus !== 'InProgress') return conf;
    if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
  }
  throw new ServiceError('Lambda is still updating; try again in a moment.', 'CONFLICT');
}

export async function deployFunction(ctx: FunctionCtx, id: string) {
  const fn = await loadFunction(ctx, id);
  const db = getSupabaseAdminClient();
  const name = lambdaNameFor(fn.id);
  let pkg;
  try {
    pkg = buildPackage(fn.language, fn.code);
  } catch (err) {
    throw new ServiceError((err as Error).message, 'INVALID');
  }
  const env = await decryptedSecrets(ctx, fn.id);
  const config = {
    FunctionName: name,
    Runtime: pkg.runtime,
    Handler: pkg.handler,
    Timeout: fn.timeout_seconds,
    MemorySize: fn.memory_mb,
    Environment: { Variables: env },
    Description: `Context Control function ${fn.function_slug}`.slice(0, 256),
  };

  await db.from('custom_functions').update({ status: 'deploying', last_error: null }).eq('id', fn.id).eq('tenant_id', ctx.tenantId);
  try {
    let exists = true;
    try {
      await lambda().send(new GetFunctionConfigurationCommand({ FunctionName: name }));
    } catch (err) {
      if (!isNotFound(err)) throw err;
      exists = false;
    }
    if (!exists) {
      await createLambda(config, pkg.zip, { 'context-control:tenant': ctx.tenantId, 'context-control:function': fn.id });
    } else {
      await waitUntilReady(name);
      await lambda().send(new UpdateFunctionConfigurationCommand(config));
      await waitUntilReady(name);
      await lambda().send(new UpdateFunctionCodeCommand({ FunctionName: name, ZipFile: pkg.zip }));
    }
    const ready = await waitUntilReady(name);
    const now = new Date().toISOString();
    const { data } = await db
      .from('custom_functions')
      .update({
        status: 'deployed',
        lambda_name: name,
        deployed_code_hash: deployHash(fn),
        deployed_version: ready.CodeSha256 ?? ready.RevisionId ?? null,
        deployed_at: now,
        last_error: null,
        updated_at: now,
      })
      .eq('id', fn.id)
      .eq('tenant_id', ctx.tenantId)
      .select(COLUMNS)
      .single();
    if (!data) throw new Error('Deployed, but the function row could not be updated.');
    const secrets = await secretMeta(ctx, [fn.id]);
    return { function: present(data, secrets.get(fn.id)) };
  } catch (err) {
    const message = (err as Error).message || 'Deployment failed';
    await db.from('custom_functions').update({ status: 'failed', last_error: message.slice(0, 2000) }).eq('id', fn.id).eq('tenant_id', ctx.tenantId);
    if (err instanceof ServiceError) throw err;
    console.error('[functions] deploy failed', err);
    throw new ServiceError(`Deployment failed: ${message}`, 'CONFLICT');
  }
}

// ---------------------------------------------------------------------------
// Invoke
// ---------------------------------------------------------------------------

export type InvocationResult = Omit<FunctionResult, 'status'> & { status: 'ok' | 'error' | 'timeout' };

async function invocationsToday(ctx: FunctionCtx): Promise<number> {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const { count } = await getSupabaseAdminClient()
    .from('function_invocations')
    .select('id', { count: 'exact' })
    .eq('tenant_id', ctx.tenantId)
    .gte('created_at', midnight.toISOString())
    .limit(1);
  return count ?? 0;
}

/** Run a deployed function. Records every invocation; enforces the org's daily cap. */
export async function invokeFunction(ctx: FunctionCtx, fnOrId: string | Row, input: unknown, source: InvocationSource): Promise<InvocationResult> {
  const fn = typeof fnOrId === 'string' ? await loadFunction(ctx, fnOrId) : fnOrId;
  if (fn.tenant_id && fn.tenant_id !== ctx.tenantId) throw new ServiceError('Function not found in this organization.', 'NOT_FOUND');
  if (fn.status !== 'deployed' || !fn.lambda_name) {
    throw new ServiceError(`Function "${fn.function_slug}" is not deployed yet. Deploy it in AI Function Studio first.`, 'CONFLICT');
  }
  const problems = validateInput(fn.input_schema, input ?? {});
  if (problems.length) throw new ServiceError(`Invalid input for ${fn.function_slug}: ${problems.join(' ')}`, 'INVALID');
  if ((await invocationsToday(ctx)) >= DAILY_INVOCATION_CAP) {
    throw new ServiceError(`Daily limit of ${DAILY_INVOCATION_CAP} function calls reached for this organization. It resets at 00:00 UTC.`, 'CONFLICT');
  }

  const started = Date.now();
  let result: InvocationResult;
  try {
    const res = await lambda().send(
      new InvokeCommand({
        FunctionName: fn.lambda_name,
        InvocationType: 'RequestResponse',
        Payload: new TextEncoder().encode(JSON.stringify({ input: input ?? {} })),
      })
    );
    const payloadText = res.Payload ? new TextDecoder().decode(res.Payload) : 'null';
    const payload = JSON.parse(payloadText || 'null');
    if (res.FunctionError) {
      const message = String(payload?.errorMessage || res.FunctionError);
      result = {
        status: /timed out/i.test(message) ? 'timeout' : 'error',
        output: null,
        error: /timed out/i.test(message) ? `Timed out after ${fn.timeout_seconds}s.` : `${payload?.errorType ? `${payload.errorType}: ` : ''}${message}`,
        logs: '',
        duration_ms: Date.now() - started,
      };
    } else {
      result = { status: payload?.status === 'ok' ? 'ok' : 'error', output: payload?.output ?? null, error: payload?.error ?? null, logs: payload?.logs ?? '', duration_ms: payload?.duration_ms ?? Date.now() - started };
    }
  } catch (err) {
    if (isNotFound(err)) {
      await getSupabaseAdminClient().from('custom_functions').update({ status: 'draft', lambda_name: null }).eq('id', fn.id).eq('tenant_id', ctx.tenantId);
      throw new ServiceError(`Function "${fn.function_slug}" is no longer deployed. Deploy it again.`, 'CONFLICT');
    }
    console.error('[functions] invoke failed', err);
    result = { status: 'error', output: null, error: `Could not run the function: ${(err as Error).message}`, logs: '', duration_ms: Date.now() - started };
  }

  await getSupabaseAdminClient().from('function_invocations').insert({
    function_id: fn.id,
    tenant_id: ctx.tenantId,
    caller: boardActor(ctx),
    source,
    status: result.status,
    duration_ms: result.duration_ms,
    error: result.error ? String(result.error).slice(0, 2000) : null,
    created_at: new Date().toISOString(),
  });
  return result;
}

/** Test from the Studio: redeploys first when the draft changed, so tests run the real Lambda. */
export async function testFunction(ctx: FunctionCtx, id: string, input: unknown) {
  const { function: fn } = await getFunction(ctx, id);
  let redeployed = false;
  if (fn.needs_deploy) {
    await deployFunction(ctx, id);
    redeployed = true;
  }
  const result = await invokeFunction(ctx, id, input, 'test');
  const { function: after } = await getFunction(ctx, id);
  return { result, redeployed, function: after };
}

export async function listInvocations(ctx: FunctionCtx, id: string, limit = 20) {
  const fn = await loadFunction(ctx, id);
  const { data, error } = await getSupabaseAdminClient()
    .from('function_invocations')
    .select('id, caller, source, status, duration_ms, error, created_at')
    .eq('function_id', fn.id)
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) throw new Error(`Could not list invocations: ${error.message}`);
  return { invocations: data || [] };
}

// ---------------------------------------------------------------------------
// Tools (agents and MCP)
// ---------------------------------------------------------------------------

/** Function ids grouped in the given MCP profiles (settings.function_ids). */
export async function functionIdsForProfiles(ctx: FunctionCtx, profileIds: Array<string | null | undefined>): Promise<string[]> {
  const ids = [...new Set(profileIds.filter(Boolean) as string[])];
  if (!ids.length) return [];
  const { data } = await getSupabaseAdminClient().from('mcp_profiles').select('id, settings').eq('org_id', ctx.tenantId);
  const out = new Set<string>();
  for (const p of data || []) {
    if (!ids.includes(p.id)) continue;
    for (const fid of ((p.settings as Row)?.function_ids as string[]) || []) out.add(fid);
  }
  return [...out];
}

/** Deployed functions (raw rows) by id, or all deployed ones when ids is null. */
export async function deployedFunctionRows(ctx: FunctionCtx, ids: string[] | null): Promise<Row[]> {
  if (ids && !ids.length) return [];
  const { data, error } = await getSupabaseAdminClient()
    .from('custom_functions')
    .select(COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .eq('status', 'deployed')
    .is('archived_at', null)
    .order('name', { ascending: true });
  if (error) throw new Error(`Could not load functions: ${error.message}`);
  return (data || []).filter((f) => !ids || ids.includes(f.id));
}
