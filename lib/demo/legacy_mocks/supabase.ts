/**
 * Backend/supabase.ts
 * Supabase client configuration for server-side persistence and RLS isolation
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://zguuksjxomrfhkzpubgx.supabase.co';
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN0dGFzemx5cG1ldXNxdHFxcXl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MjIwMjAsImV4cCI6MjEwNTk5ODAyMH0.o2Awd6rBHVTlD-QlAza_7JAqmxH1KKtawaeHP21Jl3w';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
