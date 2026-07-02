-- Hook « Before User Created » : refuse toute inscription dont l'email n'est pas dans beta_allowlist.
-- Doc : https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
-- Dépend de 0038 (beta_allowlist). Activation = dashboard Supabase (Auth → Hooks), voir plan Task 4.
begin;

create or replace function public.hook_restrict_signup(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_email text := lower(trim(event->'user'->>'email'));
  v_ok    boolean;
begin
  if v_email is null or v_email = '' then
    return jsonb_build_object('error', jsonb_build_object(
      'message', 'Email manquant.', 'http_code', 400));
  end if;
  select exists (select 1 from public.beta_allowlist where email = v_email) into v_ok;
  if not v_ok then
    return jsonb_build_object('error', jsonb_build_object(
      'message', 'Cet email n''est pas encore autorisé pour la bêta Propryo.', 'http_code', 403));
  end if;
  -- Autorisé : laisse passer. Le marquage « inscrit » (registered_at) est fait par le trigger
  -- trg_beta_mark_registered sur auth.users (0038) → le hook reste READ-ONLY (stable, pas d'effet).
  return '{}'::jsonb;
end;
$$;

-- Le hook est appelé par le rôle Auth ; il ne doit PAS être exécutable par les rôles clients.
grant execute on function public.hook_restrict_signup(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_restrict_signup(jsonb) from authenticated, anon, public;

commit;
