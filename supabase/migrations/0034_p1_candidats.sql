-- P1 — Partage par SCI : table « candidats » (candidatures locataires), sortie du blob espace_config.
--
-- AVANT : les candidats vivaient dans espace_config.data.candidats. RLS espace_config = is_member
-- (niveau espace) → un membre SCOPÉ lisait TOUS les candidats, toutes SCI confondues (fuite confirmée
-- au test partage 2026-06-21). ICI : vraie table par-SCI.
--
-- Scope (modèle identique à `mouvements` en 0030) : entite_id (candidat.entity = SCI directe) sinon via
-- logement_id (candidat.logRef → logement) ; si les deux sont NULL → fail-closed (has_entite_access
-- renvoie faux pour un scopé → membres PLEINS seulement). Le garant est EMBARQUÉ dans legacy_raw
-- (DB.cautions n'existe pas → pas de table séparée). Base = P0-B (cf edl 0013).
--
-- Dépend de 0001 (espaces, touch_row), 0008 (entites), 0009 (freeze_espace_id), 0011 (logements),
-- 0029 (has_entite_access/has_entite_write), 0030 (entite_of_logement).

begin;

create table public.candidats (
  id           uuid primary key default gen_random_uuid(),
  espace_id    uuid not null references public.espaces(id) on delete cascade,
  legacy_id    text,
  entite_id    uuid,                          -- candidat.entity (SCI directe) — nullable
  logement_id  uuid,                          -- candidat.logRef → logement — nullable
  legacy_raw   jsonb,                         -- candidat complet (garant embarqué inclus)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  version      bigint not null default 1,
  created_by   uuid default auth.uid() references auth.users(id),
  constraint candidats_id_espace_unique unique (id, espace_id),
  -- FK composites (id, espace_id) = anti-kidnapping cross-tenant ; nullable (MATCH SIMPLE : NULL = OK).
  constraint candidats_entite_fk   foreign key (entite_id, espace_id)   references public.entites   (id, espace_id),
  constraint candidats_logement_fk foreign key (logement_id, espace_id) references public.logements (id, espace_id)
);

create index candidats_by_espace_entite   on public.candidats (espace_id, entite_id);
create index candidats_by_espace_logement on public.candidats (espace_id, logement_id);

create trigger trg_touch_candidats
  before update on public.candidats
  for each row execute function public.touch_row();
create trigger trg_freeze_espace_id
  before update on public.candidats
  for each row execute function public.freeze_espace_id();

-- ── RLS FORCE + per-SCI (entite_id sinon via logement_id ; sinon NULL → fail-closed) ──────────────
alter table public.candidats enable row level security;
alter table public.candidats force  row level security;

create policy candidats_select on public.candidats
  for select to authenticated
  using ( public.has_entite_access(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy candidats_insert on public.candidats
  for insert to authenticated
  with check ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy candidats_update on public.candidats
  for update to authenticated
  using      ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) )
  with check ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );
create policy candidats_delete on public.candidats
  for delete to authenticated
  using ( public.has_entite_write(espace_id, coalesce(entite_id, public.entite_of_logement(espace_id, logement_id))) );

commit;
