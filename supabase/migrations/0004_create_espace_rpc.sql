-- Bootstrap atomique : crée l'espace ET l'appartenance owner active de l'appelant.
-- SECURITY DEFINER pour franchir members_insert (l'appelant n'est pas encore owner).
-- Transactionnel (fonction = une transaction) → jamais d'espace orphelin sans owner.

create or replace function public.create_espace(p_nom text)
returns public.espaces
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_espace public.espaces;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_nom is null or length(trim(p_nom)) = 0 then
    raise exception 'NOM_REQUIRED';
  end if;

  insert into public.espaces (nom, created_by)
  values (trim(p_nom), v_uid)
  returning * into v_espace;

  insert into public.espace_members (espace_id, user_id, role, invite_status)
  values (v_espace.id, v_uid, 'owner', 'active');

  return v_espace;
end;
$$;

revoke all on function public.create_espace(text) from public;
grant execute on function public.create_espace(text) to authenticated;
