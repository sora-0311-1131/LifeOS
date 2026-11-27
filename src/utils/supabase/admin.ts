import 'server-only';

import { createClient } from '@supabase/supabase-js';

/**
 * Creates a server-only Supabase client with the Service Role / Secret key.
 * Bypasses RLS — MUST only be used on the server after explicit caller authentication
 * and authorization checks (e.g., api_tokens issuance, Bearer token verification,
 * and Bearer-authenticated Study API operations).
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing environment variable: NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!serviceRoleKey) {
    throw new Error('Missing environment variable: SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
