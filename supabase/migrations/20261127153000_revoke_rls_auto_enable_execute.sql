-- public.rls_auto_enable() is the SECURITY DEFINER function behind the
-- `ensure_rls` event trigger (auto-enables RLS on new public tables).
-- It was callable via /rest/v1/rpc/rls_auto_enable by anon/authenticated
-- (Supabase advisor lints 0028/0029). Event triggers do not need EXECUTE
-- at fire time, so revoking it keeps the auto-RLS behavior intact.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
