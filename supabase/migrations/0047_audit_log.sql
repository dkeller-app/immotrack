-- P0-4 (audit sécurité) — Journal d'audit APPEND-ONLY côté serveur, inviolable.
--
-- AVANT : DB.auditTrail = tableau CLIENT, embarqué dans le blob `config` réécrit en entier à
-- chaque save (store-sync.js) → aucune table serveur. Conséquence : n'importe quel membre peut
-- renvoyer un `config` avec des entrées SUPPRIMÉES ou MODIFIÉES (effacer ses traces), et la RLS
-- ne distingue pas une MAJ config légitime d'une falsification d'audit. De plus l'auteur (`userId`)
-- est une chaîne générée côté client (`DB.params.userId`), donc usurpable. Échec art.30 RGPD + CRG.
--
-- ICI : vraie table `audit_log`, append-only, avec :
--   • user_id + ts FORCÉS par trigger à auth.uid()/now() → non falsifiables par le client ;
--   • AUCUNE policy UPDATE ni DELETE → une fois écrite, une entrée ne peut plus être ni modifiée
--     ni supprimée (même par le propriétaire / même par le rôle propriétaire de table grâce à FORCE) ;
--   • revoke update/delete/truncate en plus (défense en profondeur au niveau privilèges) ;
--   • SELECT réservé aux membres PLEINS (is_full_member) — la compliance/CRG est l'outil du gérant ;
--     un membre scopé n'accède pas au journal (fail-closed, cohérent avec le modèle par-SCI) ;
--   • effacement RGPD = cascade via FK espace_id (purge_mon_espace / purge_espace).
--
-- Dépend de 0001 (espaces), 0029 (is_full_member), 0007 (gel search_path convention).

begin;

create table public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  espace_id    uuid not null references public.espaces(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id),  -- FORCÉ par trigger (fait foi)
  ts           timestamptz not null default now(),                          -- FORCÉ par trigger (fait foi)
  client_ts    timestamptz, -- heure d'ACTION déclarée par le client (informative, NON fiable). Sert
                            -- l'affichage "action faite le…" pour une action hors-ligne synchronisée
                            -- plus tard (et l'ETL des entrées historiques). `ts` (serveur) fait foi.
  user_name    text,        -- nom d'affichage fourni par le client (cosmétique ; l'identité = user_id)
  action       text not null,                 -- create | update | delete | restore
  entity_type  text not null,                 -- entite | logement | bail | mouvement | quittance | …
  entity_id    text,                          -- id (numérique ou string) — libre, non-FK (hétérogène)
  entity_ref   text,                          -- ref user-facing (ex 'F-001')
  diff         jsonb,                         -- diff superficiel tronqué côté client (optionnel)
  source       text not null default 'ui'     -- ui | drive_sync | import | migration
);

create index audit_log_by_espace_ts on public.audit_log (espace_id, ts desc);
create index audit_log_by_entity    on public.audit_log (espace_id, entity_type, entity_id);

-- ── Trigger : forcer l'identité de l'auteur et l'horodatage (anti-usurpation / anti-antidatage) ──
-- BEFORE INSERT : écrase toute valeur client de user_id/ts par l'identité JWT vérifiée et l'heure serveur.
create or replace function public.audit_log_stamp()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.user_id := auth.uid();      -- ignore toute valeur fournie par le client
  new.ts      := now();           -- ignore tout horodatage fourni par le client
  return new;
end;
$$;

create trigger trg_audit_log_stamp
  before insert on public.audit_log
  for each row execute function public.audit_log_stamp();

-- ── RLS : ENABLE + FORCE (FORCE = l'append-only vaut AUSSI pour le rôle propriétaire de table) ──
alter table public.audit_log enable row level security;
alter table public.audit_log force  row level security;

-- SELECT : membres PLEINS de l'espace uniquement (pas les scopés).
create policy audit_log_select on public.audit_log
  for select to authenticated
  using ( public.is_full_member(espace_id) );

-- INSERT : tout membre de l'espace peut APPEND une entrée pour son espace.
-- (user_id/ts sont forcés par le trigger → un membre ne peut ni usurper un autre auteur ni antidater.)
create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check ( public.is_member(espace_id) );

-- Volontairement AUCUNE policy UPDATE ni DELETE → interdits par la RLS (append-only).

-- Défense en profondeur au niveau privilèges : retirer toute mutation/suppression même hors RLS.
revoke update, delete, truncate on public.audit_log from authenticated, anon;

commit;
