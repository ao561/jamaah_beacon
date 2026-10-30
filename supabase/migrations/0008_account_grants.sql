-- Jama'ah Beacon: account-only functions are for signed-in users only. Safe to re-run.
--
-- Supabase grants EXECUTE on new public functions to anon by default. These already refuse
-- or return nothing without a signed-in user, so this is tidiness rather than a fix.

revoke execute on function public.restart_regular_prayer(uuid) from anon;
revoke execute on function public.my_memberships() from anon;
revoke execute on function public.my_jamaahs() from anon;
revoke execute on function public.save_profile(text, boolean) from anon;
revoke execute on function public.delete_my_account() from anon;
