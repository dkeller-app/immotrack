-- Fondation multi-tenant : conteneur de partage (espace) + appartenance.
-- Aucune table métier ici ; uniquement le socle d'isolation (spec §4, §17).

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Conteneur de partage + facturation + membres.
create table public.espaces (
  id          uuid primary key default gen_random_uuid(),
  nom         text not null check (length(trim(nom)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     bigint not null default 1,
  created_by  uuid not null references auth.users(id)
);

-- Rôle PAR appartenance (≠ par utilisateur). Extensible : ajouter une valeur d'enum.
-- 'proprietaire' (spec §4, D13, §17-1) : accès consultation d'un seul espace = propriétaire
-- en gestion déléguée par une agence. Posé DÈS P0 : rétro-ajouter un rôle = migration
-- d'enum + réécriture RLS. Lecture seule + jamais de gestion de membres (Tâche 5/8).
create type public.espace_role  as enum ('owner', 'gestionnaire', 'lecture_seule', 'proprietaire');
create type public.invite_status as enum ('pending', 'active', 'revoked');

create table public.espace_members (
  id            uuid primary key default gen_random_uuid(),
  espace_id     uuid not null references public.espaces(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,  -- null tant que l'invité n'a pas de compte
  invite_email  text,
  role          public.espace_role  not null default 'lecture_seule',
  invite_status public.invite_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  version       bigint not null default 1,
  -- au plus une appartenance par (espace, user) réel
  constraint espace_members_unique_user unique (espace_id, user_id),
  -- soit un membre réel (user_id), soit une invitation en attente (invite_email)
  constraint espace_members_user_or_email check (user_id is not null or invite_email is not null)
);

-- au plus une invitation pending par (espace, email)
create unique index espace_members_unique_pending_email
  on public.espace_members (espace_id, lower(invite_email))
  where invite_status = 'pending' and invite_email is not null;

-- la RLS filtre toujours par espace en premier (spec §17-5)
create index espace_members_by_espace on public.espace_members (espace_id);
create index espace_members_by_user   on public.espace_members (user_id) where user_id is not null;
