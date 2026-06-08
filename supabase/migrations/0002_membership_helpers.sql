-- Helpers d'appartenance bornés (spec §17-7, §17-17).
-- SECURITY DEFINER : exécutés avec les droits du créateur → ne déclenchent PAS
-- la RLS de espace_members → cassent la récursion policy <-> table.
-- search_path='' : tout objet doit être schéma-qualifié (anti-hijack).

create or replace function public.is_member(p_espace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.espace_members m
    where m.espace_id = p_espace_id
      and m.user_id = (select auth.uid())
      and m.invite_status = 'active'
  );
$$;

revoke all on function public.is_member(uuid) from public;
grant execute on function public.is_member(uuid) to authenticated;

create or replace function public.has_role(p_espace_id uuid, p_roles public.espace_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.espace_members m
    where m.espace_id = p_espace_id
      and m.user_id = (select auth.uid())
      and m.invite_status = 'active'
      and m.role = any(p_roles)
  );
$$;

revoke all on function public.has_role(uuid, public.espace_role[]) from public;
grant execute on function public.has_role(uuid, public.espace_role[]) to authenticated;
