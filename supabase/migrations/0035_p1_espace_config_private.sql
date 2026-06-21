-- P1 — Partage par SCI : config PROPRIÉTAIRE-PRIVÉ (hors du blob `espace_config` partagé).
--
-- `espace_config` (RLS `is_member`) est lu par TOUT membre, y compris un membre SCOPÉ → fuite des clés
-- propriétaire-privé qui y vivaient : `auditTrail` (journal d'activité toutes-SCI), `candidatLinks`
-- (jetons ownerToken des liens candidats), et dans `params` : `bankAccounts` (comptes bancaires/IBAN),
-- `userProfile` (profil propriétaire). Cette table MIROIR a une RLS `is_full_member` : seuls les membres
-- PLEINS (owner inclus) lisent ; les MANAGERS pleins écrivent. Un membre SCOPÉ n'y a AUCUN accès.
--
-- Le Store écrit la config en DEUX blobs : partagé → espace_config (is_member), privé → ici. L'hydrate
-- lit les deux et fusionne (un scopé ne reçoit que le partagé). Dépend de 0001 (touch_row), 0009
-- (freeze_espace_id), 0029 (is_full_member / is_full_manager).

begin;

create table public.espace_config_private (
  espace_id  uuid primary key references public.espaces(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    bigint not null default 1
);

create trigger trg_touch_espace_config_private
  before update on public.espace_config_private
  for each row execute function public.touch_row();
create trigger trg_freeze_espace_id_ecp
  before update on public.espace_config_private
  for each row execute function public.freeze_espace_id();

-- ── RLS FORCE : lecture = membre PLEIN, écriture = manager PLEIN (scopé = aucun accès) ────────────
alter table public.espace_config_private enable row level security;
alter table public.espace_config_private force  row level security;

create policy ecp_select on public.espace_config_private for select to authenticated
  using ( public.is_full_member(espace_id) );
create policy ecp_insert on public.espace_config_private for insert to authenticated
  with check ( public.is_full_manager(espace_id) );
create policy ecp_update on public.espace_config_private for update to authenticated
  using ( public.is_full_manager(espace_id) ) with check ( public.is_full_manager(espace_id) );
create policy ecp_delete on public.espace_config_private for delete to authenticated
  using ( public.is_full_manager(espace_id) );

commit;
