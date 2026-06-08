-- P0-D — Tâche 1/3 : isolation Storage par espace (§16, invariant 16).
-- La RLS Postgres ne couvre PAS Storage par défaut → on pose des policies sur
-- storage.objects ANCRÉES sur le 1er segment du chemin (<espace_id>/…). Bucket privé
-- unique 'espace-files' (public=false → tout accès via RLS + URLs signées).

-- Parse uuid tolérant : NULL si non-uuid (jamais d'exception en évaluation de policy).
create or replace function public.safe_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p::uuid;
exception when others then
  return null;
end;
$$;

-- Bucket privé (idempotent). public=false → pas d'accès anonyme, tout passe par la RLS.
insert into storage.buckets (id, name, public)
values ('espace-files', 'espace-files', false)
on conflict (id) do nothing;

-- Policies sur storage.objects, ancrées sur le 1er segment du chemin = espace_id.
-- Lecture = membre ; écriture (insert/update/delete) = owner|gestionnaire.
-- storage.objects a déjà la RLS activée par Supabase ; on ajoute les policies.
create policy "espace-files: lecture membre"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'espace-files'
    and public.is_member( public.safe_uuid( split_part(name, '/', 1) ) )
  );

create policy "espace-files: insert writer"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'espace-files'
    and public.has_role( public.safe_uuid( split_part(name, '/', 1) ), array['owner','gestionnaire']::public.espace_role[] )
  );

create policy "espace-files: update writer"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'espace-files'
    and public.has_role( public.safe_uuid( split_part(name, '/', 1) ), array['owner','gestionnaire']::public.espace_role[] )
  )
  with check (
    bucket_id = 'espace-files'
    and public.has_role( public.safe_uuid( split_part(name, '/', 1) ), array['owner','gestionnaire']::public.espace_role[] )
  );

create policy "espace-files: delete writer"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'espace-files'
    and public.has_role( public.safe_uuid( split_part(name, '/', 1) ), array['owner','gestionnaire']::public.espace_role[] )
  );
