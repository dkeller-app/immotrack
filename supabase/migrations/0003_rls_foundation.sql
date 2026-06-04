-- Isolation tenant en base (spec §4, §11, §16, §17-6/7).
-- FORCE : s'applique même au propriétaire de la table. Seul service_role (bypassrls) échappe.

alter table public.espaces        enable row level security;
alter table public.espaces        force  row level security;
alter table public.espace_members enable row level security;
alter table public.espace_members force  row level security;

-- ── espaces ───────────────────────────────────────────────────────────────
create policy espaces_select on public.espaces
  for select to authenticated
  using ( public.is_member(id) );

-- L'insert direct sert seulement de garde ; le bootstrap réel passe par create_espace() (Tâche 6).
create policy espaces_insert on public.espaces
  for insert to authenticated
  with check ( created_by = (select auth.uid()) );

create policy espaces_update on public.espaces
  for update to authenticated
  using      ( public.has_role(id, array['owner','gestionnaire']::public.espace_role[]) )
  with check ( public.has_role(id, array['owner','gestionnaire']::public.espace_role[]) );

create policy espaces_delete on public.espaces
  for delete to authenticated
  using ( public.has_role(id, array['owner']::public.espace_role[]) );

-- ── espace_members ───────────────────────────────────────────────────────────
create policy members_select on public.espace_members
  for select to authenticated
  using ( public.is_member(espace_id) );

create policy members_insert on public.espace_members
  for insert to authenticated
  with check ( public.has_role(espace_id, array['owner']::public.espace_role[]) );

-- owner seulement, et JAMAIS sa propre ligne (anti auto-escalade de rôle, spec §18).
create policy members_update on public.espace_members
  for update to authenticated
  using      ( public.has_role(espace_id, array['owner']::public.espace_role[])
               and user_id is distinct from (select auth.uid()) )
  with check ( public.has_role(espace_id, array['owner']::public.espace_role[]) );

create policy members_delete on public.espace_members
  for delete to authenticated
  using ( public.has_role(espace_id, array['owner']::public.espace_role[])
          and user_id is distinct from (select auth.uid()) );
