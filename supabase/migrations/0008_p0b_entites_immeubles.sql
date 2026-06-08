-- P0-B — Tâche 1/6 : tables métier socle « entités » + « immeubles ».
-- Modélisation hybride (validée porteur) : colonnes+FK pour les liens, jsonb pour le détail imbriqué.
-- Immeubles = table dédiée (référencés partout : logement.imm, mouvements.imm).
-- Invariants §17 appliqués à chaque table métier :
--   §17-3 espace_id non nul ; §17-4 FK composite (parent_id, espace_id) ;
--   §17-5 index composite (espace_id, …) ; §17-6 FORCE RLS + policies ;
--   §17-8 version+updated_at via touch_row() (0005) ; §17-9 soft-delete deleted_at.
-- Suppression : espace_id ON DELETE CASCADE (offboarding) ; FK parent intra-espace NO ACTION.
-- pgcrypto (gen_random_uuid) déjà activé en 0001.

-- ── entités ──────────────────────────────────────────────────────────────────
create table public.entites (
  id              uuid primary key default gen_random_uuid(),
  espace_id       uuid not null references public.espaces(id) on delete cascade,
  legacy_id       text,                                  -- ancien id numérique nid() (mapping P0-E)
  nom             text not null check (length(trim(nom)) > 0),
  type            text,                                  -- SCI, SARL, nom propre…
  siren           text,
  rcs             text,
  gerant          text,                                  -- gérant principal (affichage)
  gerants         jsonb not null default '[]'::jsonb,    -- liste des gérants (détail auto-contenu)
  siege           text,
  iban            text,
  bic             text,
  email_envoi     text,
  signature       jsonb,                                 -- dataURL signature + méta
  logo            text,                                  -- dataURL logo
  drive_folder_id text,
  archived        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  version         bigint not null default 1,
  created_by      uuid default auth.uid() references auth.users(id),
  constraint entites_id_espace_unique unique (id, espace_id)  -- requis pour FK composite enfant
);

create index entites_by_espace on public.entites (espace_id);
create unique index entites_nom_unique
  on public.entites (espace_id, lower(nom)) where deleted_at is null;

create trigger trg_touch_entites
  before update on public.entites
  for each row execute function public.touch_row();

-- ── immeubles ──────────────────────────────────────────────────────────────────
create table public.immeubles (
  id          uuid primary key default gen_random_uuid(),
  espace_id   uuid not null references public.espaces(id) on delete cascade,
  entite_id   uuid not null,
  legacy_id   text,
  nom         text not null check (length(trim(nom)) > 0),
  adresse     text,
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     bigint not null default 1,
  created_by  uuid default auth.uid() references auth.users(id),
  constraint immeubles_id_espace_unique unique (id, espace_id),
  -- §17-4 : l'immeuble et son entité parente vivent dans le MÊME espace (déclaratif)
  constraint immeubles_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id)
);

create index immeubles_by_espace_entite on public.immeubles (espace_id, entite_id);

create trigger trg_touch_immeubles
  before update on public.immeubles
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies par commande (uniformes) ───────────────────────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['entites','immeubles'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member(espace_id))',
                   t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_role(espace_id, %s))',
                   t || '_insert', t, writers);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_role(espace_id, %s)) with check (public.has_role(espace_id, %s))',
                   t || '_update', t, writers, writers);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_role(espace_id, %s))',
                   t || '_delete', t, writers);
  end loop;
end
$rls$;
