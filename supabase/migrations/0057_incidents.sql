-- 0057 (NUMÉRO PROVISOIRE — le pilotage fixe le numéro définitif) — TRAVAUX : QUI PAIE ?
-- Registre des incidents par logement (et par immeuble pour les parties communes).
--
-- POURQUOI UNE TABLE : le registre doit être partagé par SCI (un associé gestionnaire voit les incidents
-- des biens de sa SCI). La config de l'espace (espace_config) n'est lue que pour l'espace propre
-- (store-multi) : un registre en config serait invisible des associés. Modèle = `agenda` (rattachements
-- entite_id + logement_id + immeuble_id) avec les politiques de 0052 (`has_entite_*_all` : un droit est
-- exigé sur CHAQUE rattachement renseigné ; aucun rattachement → membres pleins seulement, fail-closed).
--
-- L'incident complet vit dans legacy_raw (hydrate = legacy_raw, comme candidats / agenda). Les colonnes
-- statut et date_signalement servent aux requêtes futures ; elles ne sont jamais relues par l'app.
--
-- AUSSI : nouveau parent_type 'incident' pour les pièces jointes (dossier de preuves) :
--   • documents_parent_type_check élargi (élargissement STRICT : aucune ligne existante ne devient invalide) ;
--   • entite_of_document : branche 'incident' qui résout l'entité par la ligne incident (comme 'mouvement'),
--     avec la même garde has_entite_access que 0053. Corps 0053 repris à l'identique pour le reste.
--
-- ORDRE DE DÉPLOIEMENT : cette migration AVANT le front qui synchronise `incidents` (sinon l'upsert échoue).
-- Le front lit la table de façon TOLÉRANTE (table absente → registre vide, chargement cloud intact).
--
-- Dépend de 0001 (espaces, touch_row), 0008 (entites), 0009 (freeze_espace_id), 0011 (logements),
-- 0012 (immeubles), 0029/0030 (has_entite_*, entite_of_logement, entite_of_immeuble), 0052 (has_entite_*_all),
-- 0053 (entite_of_document gardée).

begin;

create table public.incidents (
  id                uuid primary key default gen_random_uuid(),
  espace_id         uuid not null references public.espaces(id) on delete cascade,
  legacy_id         text,
  entite_id         uuid,                       -- incident.entity (SCI) — nullable
  immeuble_id       uuid,                       -- incident.imm (immeuble, parties communes) — nullable
  logement_id       uuid,                       -- incident.logRef — nullable (partie commune)
  statut            text,
  date_signalement  date,
  legacy_raw        jsonb,                      -- incident complet (verdict, décision, artisan, preuves…)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  version           bigint not null default 1,
  created_by        uuid default auth.uid() references auth.users(id),
  constraint incidents_id_espace_unique unique (id, espace_id),
  constraint incidents_statut_chk check (statut is null or statut in ('signale', 'en_cours', 'resolu')),
  -- FK composites (id, espace_id) = anti-kidnapping cross-tenant ; nullable (MATCH SIMPLE : NULL = OK).
  constraint incidents_entite_fk   foreign key (entite_id, espace_id)   references public.entites   (id, espace_id),
  constraint incidents_immeuble_fk foreign key (immeuble_id, espace_id) references public.immeubles (id, espace_id),
  constraint incidents_logement_fk foreign key (logement_id, espace_id) references public.logements (id, espace_id)
);

create index incidents_by_espace_logement on public.incidents (espace_id, logement_id);
create index incidents_by_espace_immeuble on public.incidents (espace_id, immeuble_id);
create index incidents_by_espace_entite   on public.incidents (espace_id, entite_id);

create trigger trg_touch_incidents
  before update on public.incidents
  for each row execute function public.touch_row();
create trigger trg_freeze_espace_id
  before update on public.incidents
  for each row execute function public.freeze_espace_id();

-- ── RLS FORCE + par SCI, sur CHAQUE rattachement (modèle 0052) ─────────────────────────────────────────
alter table public.incidents enable row level security;
alter table public.incidents force  row level security;

create policy incidents_select on public.incidents for select to authenticated
  using ( public.has_entite_access_all(espace_id, entite_id, logement_id, immeuble_id) );
create policy incidents_insert on public.incidents for insert to authenticated
  with check ( public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id) );
create policy incidents_update on public.incidents for update to authenticated
  using      ( public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id) )
  with check ( public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id) );
create policy incidents_delete on public.incidents for delete to authenticated
  using ( public.has_entite_write_all(espace_id, entite_id, logement_id, immeuble_id) );

-- ── Pièces jointes : parent_type 'incident' ─────────────────────────────────────────────────────────────
alter table public.documents drop constraint if exists documents_parent_type_check;
alter table public.documents
  add constraint documents_parent_type_check
  check (parent_type is null or parent_type in (
    'mouvement','immeuble','logement','entite','bail',          -- 0026 (historiques)
    'assurance','mrh','equipement','quittance','candidat',      -- 0040
    'incident'                                                  -- 0057 (dossier de preuves d'un incident)
  ));

create or replace function public.entite_of_document(p_espace_id uuid, p_parent_type text, p_parent_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_parent_type
    when 'entite' then (
      select e.id from public.entites e
      where e.id = p_parent_id and e.espace_id = p_espace_id
        and public.has_entite_access(p_espace_id, e.id)
    )
    when 'immeuble' then public.entite_of_immeuble(p_espace_id, p_parent_id)
    when 'logement' then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'bail' then public.entite_of_bail(p_espace_id, p_parent_id)
    when 'mouvement' then (
      select x.ent from (
        select coalesce(mv.entite_id, public.entite_of_logement(p_espace_id, mv.logement_id),
                        public.entite_of_immeuble(p_espace_id, mv.immeuble_id)) as ent
        from public.mouvements mv
        where mv.id = p_parent_id and mv.espace_id = p_espace_id
      ) x
      where public.has_entite_access(p_espace_id, x.ent)
    )
    when 'assurance'  then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'mrh'        then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'equipement' then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'quittance'  then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'candidat'   then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'incident' then (
      -- Garde ALIGNÉE sur la ligne incident (0052) : un droit sur CHAQUE rattachement renseigné. Une garde
      -- sur la seule entité « coalesce » laissait voir les preuves d'un incident à rattachements mélangés
      -- (SCI A + logement de SCI B) à un membre scopé de A, qui ne voit pas l'incident (relecture Fable I4).
      select x.ent from (
        select coalesce(inc.entite_id, public.entite_of_logement(p_espace_id, inc.logement_id),
                        public.entite_of_immeuble(p_espace_id, inc.immeuble_id)) as ent,
               inc.entite_id as e, inc.logement_id as l, inc.immeuble_id as i
        from public.incidents inc
        where inc.id = p_parent_id and inc.espace_id = p_espace_id
      ) x
      where public.has_entite_access_all(p_espace_id, x.e, x.l, x.i)
    )
    else null
  end;
$$;

commit;
