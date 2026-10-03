import { supabase } from './supabase';
import { isDemoMode, INITIAL_PROFILES, INITIAL_SOURCES, INITIAL_LOGS, INITIAL_API_KEYS } from './demo';
import { ContextProfile, ContextSource, RequestLog, ApiKey } from './types';

export async function getProfiles(): Promise<ContextProfile[]> {
  if (isDemoMode()) {
    return INITIAL_PROFILES;
  }
  const { data, error } = await supabase.from('context_profiles').select('*');
  if (error) {
    console.error('[data-service] Failed to fetch context profiles from Supabase:', error);
    return [];
  }
  return (data || []) as ContextProfile[];
}

export async function getSources(): Promise<ContextSource[]> {
  if (isDemoMode()) {
    return INITIAL_SOURCES;
  }
  const { data, error } = await supabase.from('context_sources').select('*');
  if (error) {
    console.error('[data-service] Failed to fetch context sources from Supabase:', error);
    return [];
  }
  return (data || []) as ContextSource[];
}

export async function getLogs(): Promise<RequestLog[]> {
  if (isDemoMode()) {
    return INITIAL_LOGS;
  }
  const { data, error } = await supabase
    .from('ephemeral_context')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
    
  if (error) {
    console.error('[data-service] Failed to fetch logs from Supabase:', error);
    return [];
  }
  
  return (data || []).map((item: any) => ({
    id: item.task_id || item.id || `log_${Math.random().toString(36).substr(2, 9)}`,
    eventType: item.event_type || 'LANGGRAPH_EXECUTION',
    profileSlug: item.profile_slug || 'sales-agent',
    profileName: item.profile_name || 'Enterprise Sales Pipeline Agent',
    timestamp: item.created_at ? new Date(item.created_at).toLocaleTimeString() : 'Just now',
    latencyMs: item.latency_ms || 24,
    tokenCount: item.token_count || 1250,
    statusCode: item.status_code || 200,
    statusLabel: item.status || 'SUCCESS',
    identity: {
      tenant_id: item.org_id || item.tenant_id,
      user_id: item.user_id
    },
    input: { query: item.query || item.payload?.message || 'Context turn execution' },
    sourcesUsed: ['instructions', 'tenant', 'memory'],
    outputFormat: 'markdown'
  })) as RequestLog[];
}

export async function getApiKeys(): Promise<ApiKey[]> {
  if (isDemoMode()) {
    return INITIAL_API_KEYS;
  }
  const { data, error } = await supabase.from('api_keys').select('*');
  if (error) {
    console.error('[data-service] Failed to fetch API keys from Supabase:', error);
    return [];
  }
  return (data || []) as ApiKey[];
}

