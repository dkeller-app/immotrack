-- P0-C2 — Tâche 1/5 : catalogue GLOBAL des paliers d'abonnement (§12-1, invariant 13).
-- HOOK seulement : aucun trigger de quota ici (enforcement = P5). Table NON multi-tenant
-- (pas d'espace_id) : c'est un catalogue lisible par tous les authentifiés ; l'écriture
-- est réservée au back-office (service_role / futur RPC admin) → aucune policy d'écriture
-- pour authenticated. RLS FORCE + 1 policy SELECT = conforme à check:rls.

create table public.plans (
  id                 text primary key,            -- 'free','solo','co_detenteur','agence','beta'...
  nom                text not null,
  limite_biens       int,                         -- unité de quota = logement ; NULL = illimité
  limite_membres     int,                         -- NULL = illimité
  limite_stockage_mo bigint,                       -- en Mo ; NULL = illimité
  features           jsonb not null default '{}'::jsonb,
  prix_cents         int,                          -- prix mensuel en centimes ; NULL = non commercialisé
  devise             text not null default 'EUR',
  actif              boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  version            bigint not null default 1
);

create trigger trg_touch_plans
  before update on public.plans
  for each row execute function public.touch_row();

-- Seed AVANT la RLS (DML de migration sous rôle privilégié). Deux paliers indispensables :
--   - 'free' : plancher TOUJOURS présent (sinon la résolution des droits casse à l'expiration
--     d'un trial, §12-6) — solo 1 bien / 1 membre.
--   - 'beta' : mode actuel (§12-7), illimité, toutes features.
insert into public.plans (id, nom, limite_biens, limite_membres, limite_stockage_mo, features, prix_cents) values
  ('free', 'Gratuit',       1,    1,    100,  '{}'::jsonb,                              0),
  ('beta', 'Bêta illimité', null, null, null, '{"all": true}'::jsonb,                   null);

alter table public.plans enable row level security;
alter table public.plans force  row level security;

-- Catalogue lisible par tout authentifié (UI : afficher paliers/limites/upsell).
create policy plans_select on public.plans
  for select to authenticated using (true);
-- AUCUNE policy insert/update/delete pour authenticated : écriture réservée au back-office
-- (service_role contourne la RLS ; un RPC admin viendra en P5).
