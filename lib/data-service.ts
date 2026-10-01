import { supabase } from './supabase';
import { INITIAL_PROFILES, INITIAL_SOURCES, INITIAL_LOGS, INITIAL_API_KEYS } from './mock-data';
import { ContextProfile, ContextSource, RequestLog, ApiKey } from './types';

export async function getProfiles(): Promise<ContextProfile[]> {
  try {
    const { data, error } = await supabase.from('context_profiles').select('*');
    if (error || !data || data.length === 0) {
      return INITIAL_PROFILES;
    }
    return data as ContextProfile[];
  } catch (err) {
    console.warn('[data-service] Failed to fetch context profiles from Supabase. Falling back to initial data.', err);
    return INITIAL_PROFILES;
  }
}

export async function getSources(): Promise<ContextSource[]> {
  try {
    const { data, error } = await supabase.from('context_sources').select('*');
    if (error || !data || data.length === 0) {
      return INITIAL_SOURCES;
    }
    return data as ContextSource[];
  } catch (err) {
    console.warn('[data-service] Failed to fetch context sources from Supabase. Falling back to initial data.', err);
    return INITIAL_SOURCES;
  }
}

export async function getLogs(): Promise<RequestLog[]> {
  try {
    const { data, error } = await supabase
      .from('ephemeral_context')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
      
    if (error || !data || data.length === 0) {
      return INITIAL_LOGS;
    }
    
    return data.map((item: any) => ({
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
        tenant_id: item.org_id || item.tenant_id || 'tenant_default',
        user_id: item.user_id || 'user_default'
      },
      input: { query: item.query || item.payload?.message || 'Context turn execution' },
      sourcesUsed: ['instructions', 'tenant', 'memory'],
      outputFormat: 'markdown'
    })) as RequestLog[];
  } catch (err) {
    console.warn('[data-service] Failed to fetch logs from Supabase. Falling back to initial logs.', err);
    return INITIAL_LOGS;
  }
}

export async function getApiKeys(): Promise<ApiKey[]> {
  try {
    const { data, error } = await supabase.from('api_keys').select('*');
    if (error || !data || data.length === 0) {
      return INITIAL_API_KEYS;
    }
    return data as ApiKey[];
  } catch (err) {
    console.warn('[data-service] Failed to fetch API keys from Supabase. Falling back to initial keys.', err);
    return INITIAL_API_KEYS;
  }
}
