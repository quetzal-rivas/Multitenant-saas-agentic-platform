import { getSupabaseAdminClient } from '@/lib/supabase';
import type { AuthContext } from '@/lib/auth/require-auth';
import { envelopeDecryptSecret, envelopeEncryptSecret, type EncryptedSecretPayload } from '@/lib/secrets/envelope-encryption';
import { twilio, TwilioError, voiceAccessToken, type TwilioCreds } from '@/lib/rooms/adapters/twilio';
import { createEndpoint, setEndpointSecret } from './inbound';
import { ServiceError } from './errors';

/**
 * The organization's own telephony account (Twilio first). Connecting verifies the
 * credentials, creates an API key + TwiML App for browser calls, and stores everything
 * encrypted. Numbers are the ones already in the account (synced, never bought here).
 */

type Ctx = Pick<AuthContext, 'tenantId' | 'userId' | 'authMode'>;
type Row = Record<string, any>;

export const CONNECTION_COLUMNS = 'id, tenant_id, provider, account_sid, public_origin, secrets, status, last_error, created_at, updated_at';
const NUMBER_COLUMNS = 'id, tenant_id, connection_id, provider, provider_sid, e164, friendly_name, capabilities, voice_agent_id, sms_endpoint_id, configured, created_at, updated_at';

const secretContext = (connectionId: string, name: string) => `tel:${connectionId}:${name}`;

/** Webhook URL for one Twilio action of a connection. */
export const twilioHookUrl = (conn: { id: string; public_origin: string } | Row, action: string, query?: Record<string, string>) =>
  `${conn.public_origin}/api/voice/twilio/${conn.id}/${action}${query ? `?${new URLSearchParams(query)}` : ''}`;

export function presentConnection(row: Row | null) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    account_sid: `${String(row.account_sid).slice(0, 6)}…${String(row.account_sid).slice(-4)}`,
    status: row.status,
    last_error: row.last_error,
    browser_calls: !!row.secrets?.api_key_secret,
    created_at: row.created_at,
  };
}

export async function getConnectionRow(tenantId: string): Promise<Row | null> {
  const { data } = await getSupabaseAdminClient().from('telephony_connections').select(CONNECTION_COLUMNS).eq('tenant_id', tenantId).eq('provider', 'twilio').maybeSingle();
  return data ?? null;
}

export async function loadConnectionById(id: string): Promise<Row | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await getSupabaseAdminClient().from('telephony_connections').select(CONNECTION_COLUMNS).eq('id', id).maybeSingle();
  return data ?? null;
}

export async function connectionSecrets(conn: Row): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [name, payload] of Object.entries(conn.secrets ?? {})) {
    out[name] = await envelopeDecryptSecret(payload as EncryptedSecretPayload, conn.tenant_id, secretContext(conn.id, name));
  }
  return out;
}

export async function credsFor(conn: Row): Promise<TwilioCreds> {
  const s = await connectionSecrets(conn);
  if (!s.auth_token) throw new ServiceError('The Twilio connection has no auth token. Reconnect Twilio.', 'CONFLICT');
  return { accountSid: conn.account_sid, authToken: s.auth_token };
}

export async function requireConnection(tenantId: string): Promise<{ conn: Row; creds: TwilioCreds }> {
  const conn = await getConnectionRow(tenantId);
  if (!conn) throw new ServiceError('Connect a Twilio account first (Voice → Calls → Connect Twilio).', 'CONFLICT');
  return { conn, creds: await credsFor(conn) };
}

function friendly(err: unknown): string {
  if (err instanceof TwilioError) return err.status === 401 ? 'Twilio rejected the Account SID / Auth Token.' : err.message;
  return (err as Error)?.message || 'Twilio request failed.';
}

/** Connect (or reconnect) the org's Twilio account. */
export async function connectTwilio(ctx: Ctx, input: { account_sid: string; auth_token: string }, publicOrigin: string) {
  const accountSid = input.account_sid.trim();
  const authToken = input.auth_token.trim();
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid)) throw new ServiceError('The Account SID starts with AC followed by 32 characters.', 'INVALID');
  if (authToken.length < 16) throw new ServiceError('The Auth Token looks too short.', 'INVALID');
  const creds = { accountSid, authToken };
  try {
    await twilio.verify(creds);
  } catch (err) {
    throw new ServiceError(friendly(err), 'INVALID');
  }
  const db = getSupabaseAdminClient();
  const now = new Date().toISOString();
  let conn = await getConnectionRow(ctx.tenantId);
  if (!conn) {
    const { data, error } = await db
      .from('telephony_connections')
      .insert({ tenant_id: ctx.tenantId, provider: 'twilio', account_sid: accountSid, public_origin: publicOrigin, secrets: {}, status: 'connected', created_by: ctx.authMode === 'session' ? ctx.userId : null, created_at: now, updated_at: now })
      .select(CONNECTION_COLUMNS)
      .single();
    if (error || !data) throw new Error(`Could not save the connection: ${error?.message}`);
    conn = data;
  }
  const secrets: Record<string, EncryptedSecretPayload> = {};
  const put = async (name: string, value: string) => (secrets[name] = await envelopeEncryptSecret(value, ctx.tenantId, secretContext(conn!.id, name)));
  await put('auth_token', authToken);

  // Browser calls (listen in): reuse the existing key/app for the same account, else create them.
  const previous = conn.account_sid === accountSid ? await connectionSecrets(conn).catch(() => ({} as Record<string, string>)) : {};
  const voiceUrl = twilioHookUrl({ id: conn.id, public_origin: publicOrigin }, 'client');
  let browser = previous.api_key_secret && previous.twiml_app_sid ? { apiKeySid: previous.api_key_sid, apiKeySecret: previous.api_key_secret, twimlAppSid: previous.twiml_app_sid } : null;
  let lastError: string | null = null;
  try {
    if (browser) await twilio.updateTwimlApp(creds, browser.twimlAppSid, voiceUrl);
    else browser = await twilio.createBrowserCredentials(creds, voiceUrl);
  } catch (err) {
    lastError = `Browser listen-in is unavailable: ${friendly(err)}`;
    browser = null;
  }
  if (browser) {
    await put('api_key_sid', browser.apiKeySid);
    await put('api_key_secret', browser.apiKeySecret);
    await put('twiml_app_sid', browser.twimlAppSid);
  }
  const { data } = await db
    .from('telephony_connections')
    .update({ account_sid: accountSid, public_origin: publicOrigin, secrets, status: 'connected', last_error: lastError, updated_at: now })
    .eq('id', conn.id)
    .select(CONNECTION_COLUMNS)
    .single();
  await syncNumbers(ctx);
  return presentConnection(data);
}

export async function disconnectTwilio(ctx: Ctx) {
  const conn = await getConnectionRow(ctx.tenantId);
  if (!conn) return;
  await getSupabaseAdminClient().from('telephony_connections').delete().eq('id', conn.id);
}

export async function getTelephonyStatus(ctx: Pick<Ctx, 'tenantId'>) {
  const conn = await getConnectionRow(ctx.tenantId);
  const { data: org } = await getSupabaseAdminClient().from('organizations').select('voice_compliance_attested_at').eq('id', ctx.tenantId).maybeSingle();
  return { connection: presentConnection(conn), compliance_attested_at: org?.voice_compliance_attested_at ?? null };
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

export async function listNumbers(ctx: Pick<Ctx, 'tenantId'>) {
  const { data } = await getSupabaseAdminClient().from('phone_numbers').select(NUMBER_COLUMNS).eq('tenant_id', ctx.tenantId).order('e164', { ascending: true });
  return data || [];
}

/** Pull the numbers that exist in the Twilio account. */
export async function syncNumbers(ctx: Pick<Ctx, 'tenantId'>) {
  const { conn, creds } = await requireConnection(ctx.tenantId);
  let remote;
  try {
    remote = await twilio.listNumbers(creds);
  } catch (err) {
    throw new ServiceError(friendly(err), 'CONFLICT');
  }
  const db = getSupabaseAdminClient();
  const existing = await listNumbers(ctx);
  const now = new Date().toISOString();
  for (const n of remote) {
    const row = existing.find((e: Row) => e.e164 === n.e164);
    if (row) await db.from('phone_numbers').update({ provider_sid: n.sid, friendly_name: n.friendly_name, capabilities: n.capabilities, connection_id: conn.id, updated_at: now }).eq('id', row.id);
    else await db.from('phone_numbers').insert({ tenant_id: ctx.tenantId, connection_id: conn.id, provider: 'twilio', provider_sid: n.sid, e164: n.e164, friendly_name: n.friendly_name, capabilities: n.capabilities, configured: false, created_at: now, updated_at: now });
  }
  // Numbers released in Twilio disappear here too.
  for (const row of existing) if (!remote.some((n) => n.e164 === row.e164)) await db.from('phone_numbers').delete().eq('id', row.id);
  return listNumbers(ctx);
}

/**
 * Assign a number's duties: which voice agent answers calls, and whether SMS go to an
 * Inbound Gateway endpoint. Points the number's webhooks at us.
 */
export async function configureNumber(ctx: Ctx, numberId: string, input: { voice_agent_id: string | null; sms_to_webhooks?: boolean; sms_team_id?: string | null }) {
  const { conn, creds } = await requireConnection(ctx.tenantId);
  const db = getSupabaseAdminClient();
  const { data: number } = await db.from('phone_numbers').select(NUMBER_COLUMNS).eq('id', numberId).eq('tenant_id', ctx.tenantId).maybeSingle();
  if (!number) throw new ServiceError('Number not found in this organization.', 'NOT_FOUND');
  if (input.voice_agent_id) {
    const { data: agent } = await db.from('voice_agents').select('id').eq('id', input.voice_agent_id).eq('tenant_id', ctx.tenantId).is('archived_at', null).maybeSingle();
    if (!agent) throw new ServiceError('Voice agent not found in this organization.', 'NOT_FOUND');
  }
  let smsEndpointId: string | null = number.sms_endpoint_id;
  if (input.sms_to_webhooks && !smsEndpointId) {
    const endpoint = await createEndpoint(ctx, { name: `SMS ${number.e164}`, preset: 'twilio', default_team_id: input.sms_team_id ?? null });
    const secrets = await connectionSecrets(conn);
    await setEndpointSecret(ctx, endpoint.id, 'auth_token', secrets.auth_token);
    smsEndpointId = endpoint.id;
  }
  if (input.sms_to_webhooks === false) smsEndpointId = null;
  try {
    await twilio.configureNumber(creds, number.provider_sid, {
      voiceUrl: input.voice_agent_id ? twilioHookUrl(conn, 'incoming') : '',
      ...(input.sms_to_webhooks !== undefined ? { smsUrl: smsEndpointId ? `${conn.public_origin}/api/hooks/${smsEndpointId}` : '' } : {}),
    });
  } catch (err) {
    throw new ServiceError(friendly(err), 'CONFLICT');
  }
  const { data } = await db
    .from('phone_numbers')
    .update({ voice_agent_id: input.voice_agent_id, sms_endpoint_id: smsEndpointId, configured: !!input.voice_agent_id || !!smsEndpointId, updated_at: new Date().toISOString() })
    .eq('id', numberId)
    .select(NUMBER_COLUMNS)
    .single();
  return data;
}

/** Voice SDK token so a member's browser can join rooms (muted listen-in, coaching). */
export async function browserToken(ctx: Pick<Ctx, 'tenantId' | 'userId'>) {
  const { conn } = await requireConnection(ctx.tenantId);
  const s = await connectionSecrets(conn);
  if (!s.api_key_secret || !s.twiml_app_sid) throw new ServiceError('Browser calls are not set up for this Twilio account. Reconnect Twilio.', 'CONFLICT');
  const identity = `u_${ctx.userId.replace(/[^a-zA-Z0-9_]/g, '')}`.slice(0, 120);
  return { token: voiceAccessToken({ accountSid: conn.account_sid, apiKeySid: s.api_key_sid, apiKeySecret: s.api_key_secret, twimlAppSid: s.twiml_app_sid, identity, ttlSeconds: 3600 }), identity };
}

// ---------------------------------------------------------------------------
// Compliance (recorded / AI calls)
// ---------------------------------------------------------------------------

export async function hasCallCompliance(tenantId: string): Promise<boolean> {
  const { data } = await getSupabaseAdminClient().from('organizations').select('voice_compliance_attested_at').eq('id', tenantId).maybeSingle();
  return !!data?.voice_compliance_attested_at;
}

export async function attestCallCompliance(ctx: Pick<Ctx, 'tenantId' | 'userId'>) {
  await getSupabaseAdminClient()
    .from('organizations')
    .update({ voice_compliance_attested_at: new Date().toISOString(), voice_compliance_attested_by: ctx.userId })
    .eq('id', ctx.tenantId);
}
