-- P1 — Partage par SCI : INVITATIONS (lien/email) + acceptation. Active concrètement le partage.
-- Dépend de 0001 (espaces/espace_members/enums), 0008 (entites), 0029 (entite_membre + full_espace
-- + is_full_member/is_full_manager), 0009 (freeze_espace_id), touch_row.
--
-- Flux : un MANAGER PLEIN crée une invitation (RLS) avec des « grants » = [{entite_id, mode}] (mode
-- écriture|lecture, par périmètre). Il partage le LIEN (token) — même modale que le bail. L'invité
-- ouvre le lien → s'authentifie → appelle accept_invitation(token) → devient membre SCOPÉ (full_espace
-- =false) avec EXACTEMENT les octrois de l'invitation. Aucun autre chemin ne crée d'accès scopé.
--
-- 🔐 ANTI-ESCALADE : accept_invitation est SECURITY DEFINER (l'invité n'est pas encore membre → ne peut
-- pas insérer sous RLS), mais il lit les grants depuis la LIGNE invitation (créée par un manager), JAMAIS
-- depuis un argument de l'invité. L'invité ne fournit que le token. Donc il obtient au plus ce que le
-- manager a accordé. Le token est imprévisible (uuid 122 bits). Refus si déjà membre PLEIN (pas de
-- downgrade), si révoquée/expirée, ou si déjà acceptée par un autre.

begin;

-- Statut dédié (≠ invite_status des membres : sémantique « acceptée » et non « active »).
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');

create table public.invitations (
  id           uuid primary key default gen_random_uuid(),
  espace_id    uuid not null references public.espaces(id) on delete cascade,
  token        text not null unique default gen_random_uuid()::text,  -- bearer, imprévisible
  grants       jsonb not null,            -- [{ "entite_id": "<uuid>", "mode": "ecriture"|"lecture" }]
  invite_email text,                       -- null = invitation par lien seul (le token est le porteur)
  status       public.invitation_status not null default 'pending',
  expires_at   timestamptz,               -- null = pas d'expiration
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  version      bigint not null default 1,
  created_by   uuid not null default auth.uid() references auth.users(id),
  accepted_by  uuid references auth.users(id),
  accepted_at  timestamptz
);

create index invitations_by_espace on public.invitations (espace_id);
-- token déjà unique (index implicite) → lookup O(1) par le RPC.

-- ── Validation des grants à l'écriture (défense en profondeur) ────────────────────────────────
-- grants = tableau non vide ; chaque élément a un mode ∈ {ecriture,lecture} et un entite_id qui
-- appartient à CET espace. Empêche un manager de forger un grant vers une entité d'un autre tenant.
create or replace function public.invitations_validate_grants()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  g       jsonb;
  v_ent   uuid;
  v_mode  text;
begin
  if jsonb_typeof(new.grants) is distinct from 'array' or jsonb_array_length(new.grants) = 0 then
    raise exception 'GRANTS_EMPTY';
  end if;
  for g in select value from jsonb_array_elements(new.grants) as t(value) loop
    v_mode := g->>'mode';
    if v_mode is null or v_mode not in ('ecriture', 'lecture') then
      raise exception 'GRANT_MODE_INVALID';
    end if;
    begin
      v_ent := (g->>'entite_id')::uuid;
    exception when others then
      raise exception 'GRANT_ENTITE_INVALID';
    end;
    if not exists (
      select 1 from public.entites e where e.id = v_ent and e.espace_id = new.espace_id
    ) then
      raise exception 'GRANT_ENTITE_NOT_IN_ESPACE';
    end if;
  end loop;
  return new;
end;
$$;

create trigger trg_invitations_validate_grants
  before insert or update on public.invitations
  for each row execute function public.invitations_validate_grants();

create trigger trg_touch_invitations
  before update on public.invitations
  for each row execute function public.touch_row();

create trigger trg_freeze_espace_id_invitations
  before update on public.invitations
  for each row execute function public.freeze_espace_id();

-- ── RLS : gestion réservée au MANAGER PLEIN de l'espace ───────────────────────────────────────
-- L'invité n'accède JAMAIS à la table en direct ; accept_invitation/invitation_preview (SECURITY
-- DEFINER) franchissent la RLS pour lui. Donc table = managers seulement.
alter table public.invitations enable row level security;
alter table public.invitations force row level security;

create policy "invitations: select manager" on public.invitations for select to authenticated
  using ( public.is_full_manager(espace_id) );
create policy "invitations: insert manager" on public.invitations for insert to authenticated
  with check ( public.is_full_manager(espace_id) and created_by = (select auth.uid()) );
create policy "invitations: update manager" on public.invitations for update to authenticated
  using ( public.is_full_manager(espace_id) )
  with check ( public.is_full_manager(espace_id) );
create policy "invitations: delete manager" on public.invitations for delete to authenticated
  using ( public.is_full_manager(espace_id) );

-- ── RPC d'acceptation (SECURITY DEFINER) ──────────────────────────────────────────────────────
-- Renvoie l'espace_id rejoint. Idempotent (re-accept par le même user = no-op). Voir 🔐 ci-dessus.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_inv   public.invitations;
  v_grant jsonb;
  v_role  public.entite_membre_role;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_inv from public.invitations where token = p_token;
  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  if v_inv.status = 'revoked' then raise exception 'INVITATION_REVOKED'; end if;
  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED';
  end if;
  -- déjà acceptée : idempotent pour le même user, refus sinon (token déjà consommé)
  if v_inv.status = 'accepted' then
    if v_inv.accepted_by = v_uid then return v_inv.espace_id; end if;
    raise exception 'INVITATION_ALREADY_USED';
  end if;

  -- pas de downgrade d'un membre PLEIN existant (l'invité voit déjà tout)
  if exists (
    select 1 from public.espace_members m
    where m.espace_id = v_inv.espace_id and m.user_id = v_uid
      and m.invite_status = 'active' and m.full_espace = true
  ) then
    raise exception 'ALREADY_FULL_MEMBER';
  end if;

  -- appartenance SCOPÉE (full_espace=false) — le rôle d'ESPACE reste lecture_seule (l'accès réel
  -- est porté par entite_membre ; is_full_manager exige full_espace=true → un scopé ne gère rien).
  insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace)
  values (v_inv.espace_id, v_uid, 'lecture_seule', 'active', false)
  on conflict (espace_id, user_id) do update set invite_status = 'active';

  -- un octroi entite_membre par grant (mode → rôle par-entité)
  for v_grant in select value from jsonb_array_elements(v_inv.grants) as t(value) loop
    v_role := case when v_grant->>'mode' = 'ecriture' then 'gestionnaire'
                   else 'lecture_seule' end::public.entite_membre_role;
    insert into public.entite_membre (espace_id, entite_id, user_id, role)
    values (v_inv.espace_id, (v_grant->>'entite_id')::uuid, v_uid, v_role)
    on conflict (espace_id, entite_id, user_id) do update set role = excluded.role;
  end loop;

  update public.invitations
    set status = 'accepted', accepted_by = v_uid, accepted_at = now()
    where id = v_inv.id;

  return v_inv.espace_id;
end;
$$;
revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

-- ── RPC d'aperçu (lecture seule) : ce que l'invité voit AVANT d'accepter ───────────────────────
-- Renvoie {espace_nom, grants:[{entite_id,mode,entite_nom}], status, expired} ou null si token inconnu.
create or replace function public.invitation_preview(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv        public.invitations;
  v_espace_nom text;
  v_grants     jsonb;
begin
  select * into v_inv from public.invitations where token = p_token;
  if not found then return null; end if;
  select nom into v_espace_nom from public.espaces where id = v_inv.espace_id;
  select jsonb_agg(jsonb_build_object(
           'entite_id', g->>'entite_id',
           'mode',      g->>'mode',
           'entite_nom', (select e.nom from public.entites e where e.id = (g->>'entite_id')::uuid)
         ))
    into v_grants
    from jsonb_array_elements(v_inv.grants) as t(g);
  return jsonb_build_object(
    'espace_nom', v_espace_nom,
    'grants',     coalesce(v_grants, '[]'::jsonb),
    'status',     v_inv.status,
    'expired',    (v_inv.expires_at is not null and v_inv.expires_at <= now())
  );
end;
$$;
revoke all on function public.invitation_preview(text) from public;
grant execute on function public.invitation_preview(text) to authenticated;

commit;
