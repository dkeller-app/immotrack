-- P1 — Partage par SCI (scope intra-espace). SOCLE : backfill entite_id + flag membre
-- plein/scopé + table entite_membre + helpers d'accès par entité.
-- La RÉÉCRITURE des policies RLS par-SCI est en 0030 (séparée : 0029 doit s'appliquer en
-- entier — surtout le backfill — AVANT que 0030 ne fasse dépendre l'isolation de entite_id).
--
-- ⚠ CRITIQUE SÉCURITÉ. Modèle (décidé, non rediscuté ici) :
--   • « membre plein » = appartenance active à l'espace AVEC espace_members.full_espace = true.
--     Il voit/écrit TOUT l'espace (comportement P0 INCHANGÉ). C'est le cas du propriétaire et
--     de tous les membres existants (la colonne est rétro-remplie à true → zéro régression).
--   • « membre scopé » = appartenance active AVEC full_espace = false. Il NE voit/écrit QUE les
--     entités (SCI) qui lui sont explicitement octroyées dans public.entite_membre. Sans aucune
--     ligne entite_membre → il ne voit RIEN (fail-closed).
--   Le rôle effectif d'un membre scopé sur une entité vient de entite_membre.role
--   (gestionnaire | lecture_seule), PAS de son rôle d'espace. Un membre scopé NE DOIT JAMAIS
--   être traité comme un membre plein : c'est pourquoi has_entite_access exige full_espace=true
--   pour la branche « plein » et NE se contente PAS de has_role(espace, …).
--
-- Append-only. Idempotent là où c'est sensé (add column if not exists ; backfill borné aux NULL).
-- Ordre interne IMPORTANT : helpers « membre plein » d'abord (ne dépendent que de espace_members),
-- puis la table entite_membre, puis les helpers par-entité (référencent entite_membre →
-- check_function_bodies exige que la table existe), enfin les policies de entite_membre
-- (référencent is_full_manager).

begin;

-- ════════════════════════════════════════════════════════════════════════════
-- 1) BACKFILL entite_id (résoudre l'entité de la ligne là où c'est possible mais NULL)
--    Transactionnel, idempotent, NE TOUCHE QUE entite_id IS NULL. Aucune ligne déplacée
--    d'espace (espace_id figé par 0009). On reste STRICTEMENT intra-espace dans chaque jointure
--    (… and X.espace_id = Y.espace_id) → un backfill ne peut PAS rattacher une ligne à une
--    entité d'un autre tenant.
-- ════════════════════════════════════════════════════════════════════════════

-- mouvements : « qui » = logement (logement_id rempli) → entité du logement.
--   CONTRAINTE mouvements_qui_exclusif (0011) : interdit (logement_id IS NOT NULL AND
--   entite_id IS NOT NULL). Donc si logement_id est rempli, on NE remplit PAS entite_id :
--   l'entité est dérivable à la volée via le logement (et c'est ce que fera la policy 0030).
--   On ne remplit entite_id QUE pour les mouvements SANS logement (qui = 'SCI:'+nom) résolus
--   depuis legacy_raw. Cela respecte le CHECK (entite_id seul) et évite de figer une dérivation.
update public.mouvements mv
set entite_id = e.id
from public.entites e
where mv.entite_id is null
  and mv.logement_id is null
  and mv.deleted_at is null
  and e.espace_id = mv.espace_id
  and e.deleted_at is null
  -- legacy_raw.qui de forme 'SCI:<nom>' → entité dont le nom matche (intra-espace, insensible
  -- à la casse + trim, cohérent avec l'index unique entites_nom_unique de 0008).
  and mv.legacy_raw ? 'qui'
  and mv.legacy_raw->>'qui' like 'SCI:%'
  and lower(trim(substring(mv.legacy_raw->>'qui' from 5))) = lower(trim(e.nom));

-- assurances : entité dérivée du logement → la table n'a PAS de colonne entite_id ; sa policy
--   0030 remontera via logement_id. Rien à backfiller ici.

-- agenda : a entite_id + immeuble_id + logement_id. La policy 0030 dérive à la volée
--   (entite_id direct, sinon via logement_id, sinon via immeuble_id). On NE backfille PAS
--   entite_id pour ne pas figer une dérivation qui divergerait si le logement/immeuble change
--   d'entité. (Décision : dérivation à la volée only.)

-- baux / baux_historique / quittances : entite_id nullable mais logement_id présent → la policy
--   0030 remonte via logement_id si entite_id est NULL. Backfill OPPORTUNISTE (cohérence des
--   données, sans risque cross-tenant) : entite_id := entité du logement, strictement intra-espace.
update public.baux b
set entite_id = l.entite_id
from public.logements l
where b.entite_id is null
  and b.logement_id is not null
  and l.id = b.logement_id
  and l.espace_id = b.espace_id;

update public.baux_historique bh
set entite_id = l.entite_id
from public.logements l
where bh.entite_id is null
  and bh.logement_id is not null
  and l.id = bh.logement_id
  and l.espace_id = bh.espace_id;

update public.quittances q
set entite_id = l.entite_id
from public.logements l
where q.entite_id is null
  and q.logement_id is not null
  and l.id = q.logement_id
  and l.espace_id = q.espace_id;

-- Compteur d'audit : combien de mouvements restent SANS entité résoluble (ni logement_id,
--   ni entite_id). Ces lignes sont INVISIBLES d'un membre scopé (fail-closed) et ne sont
--   visibles QUE des membres pleins. C'est un GAP DE COUVERTURE de scope documenté (cf rapport),
--   PAS une fuite : aucune donnée d'une SCI ne fuit vers un membre scopé d'une autre SCI.
--   On émet un NOTICE pour que l'humain le voie à l'apply.
do $audit$
declare
  n_mvt int;
begin
  select count(*) into n_mvt
  from public.mouvements
  where deleted_at is null and entite_id is null and logement_id is null;
  raise notice 'P1-PARTAGE-SCI backfill : % mouvement(s) sans entite resoluble (ni logement_id ni entite_id) -> invisibles des membres scopes (fail-closed, documente).', n_mvt;
end
$audit$;

-- ════════════════════════════════════════════════════════════════════════════
-- 2) FLAG « membre plein » sur espace_members
--    full_espace = true  → voit/écrit tout l'espace (comportement P0, défaut rétro-rempli)
--    full_espace = false → membre SCOPÉ : accès borné par entite_membre uniquement
-- ════════════════════════════════════════════════════════════════════════════
alter table public.espace_members
  add column if not exists full_espace boolean not null default true;

comment on column public.espace_members.full_espace is
  'true = membre plein (voit/ecrit tout l''espace, comportement P0). false = membre SCOPE : acces borne aux entites octroyees dans entite_membre (fail-closed sans octroi).';

-- ════════════════════════════════════════════════════════════════════════════
-- 3) HELPERS « membre plein » (ne dépendent que de espace_members → créés AVANT entite_membre).
--    SECURITY DEFINER + search_path='' (homogène 0002/0009/0014) : contournent la RLS de
--    espace_members → pas de récursion policy↔table.
-- ════════════════════════════════════════════════════════════════════════════

-- Membre PLEIN de l'espace ? (active + full_espace=true). Base de tout le comportement P0.
create or replace function public.is_full_member(p_espace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.espace_members m
    where m.espace_id = p_espace_id
      and m.user_id = (select auth.uid())
      and m.invite_status = 'active'
      and m.full_espace = true
  );
$$;
revoke all on function public.is_full_member(uuid) from public;
grant execute on function public.is_full_member(uuid) to authenticated;

-- Membre PLEIN avec rôle de gestion (owner|gestionnaire) ? → gère les octrois entite_membre
-- ET écrit partout (branche « plein » des write-policies). full_espace=true requis :
-- un membre scopé promu gestionnaire SUR UNE SCI ne doit pas devenir gestionnaire de l'espace.
create or replace function public.is_full_manager(p_espace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.espace_members m
    where m.espace_id = p_espace_id
      and m.user_id = (select auth.uid())
      and m.invite_status = 'active'
      and m.full_espace = true
      and m.role in ('owner', 'gestionnaire')
  );
$$;
revoke all on function public.is_full_manager(uuid) from public;
grant execute on function public.is_full_manager(uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) TABLE entite_membre : octroi d'accès d'un user à UNE entité (SCI) précise
--    Réutilise le patron P0-B : espace_id NOT NULL + FK composite (entite_id, espace_id) →
--    entites + RLS FORCE + freeze espace_id + touch + version.
-- ════════════════════════════════════════════════════════════════════════════

-- Rôle PAR octroi d'entité. Volontairement SANS 'owner' : la propriété est un fait d'ESPACE,
-- pas d'entité. Un membre scopé est au mieux gestionnaire d'une SCI donnée.
create type public.entite_membre_role as enum ('gestionnaire', 'lecture_seule');

create table public.entite_membre (
  id          uuid primary key default gen_random_uuid(),
  espace_id   uuid not null references public.espaces(id) on delete cascade,
  entite_id   uuid not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.entite_membre_role not null default 'lecture_seule',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     bigint not null default 1,
  created_by  uuid default auth.uid() references auth.users(id),
  -- §17-4 : l'octroi et l'entité visée vivent dans le MÊME espace (FK composite).
  constraint entite_membre_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id) on delete cascade,
  -- au plus un octroi par (espace, entité, user)
  constraint entite_membre_unique unique (espace_id, entite_id, user_id)
);

-- §17-5 : la RLS / les helpers filtrent par (user, …) et par (espace, entité).
create index entite_membre_by_user        on public.entite_membre (user_id);
create index entite_membre_by_espace_user on public.entite_membre (espace_id, user_id);
create index entite_membre_by_espace_ent  on public.entite_membre (espace_id, entite_id);

create trigger trg_touch_entite_membre
  before update on public.entite_membre
  for each row execute function public.touch_row();

-- §17-4b : espace_id figé (anti-kidnapping cross-tenant) — fonction définie en 0009.
create trigger trg_freeze_espace_id
  before update on public.entite_membre
  for each row execute function public.freeze_espace_id();

-- Durcissement : identité de l'octroi (espace_id + entite_id + user_id) IMMUABLE après création.
-- Sans ça, un owner pourrait UPDATE entite_id d'un octroi → rediriger silencieusement l'accès
-- d'un membre scopé vers une AUTRE SCI. On ne modifie QUE le rôle ; tout re-scope = delete+insert.
create or replace function public.entite_membre_freeze_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.espace_id is distinct from old.espace_id then
    raise exception 'ESPACE_ID_IMMUTABLE';
  end if;
  if new.entite_id is distinct from old.entite_id then
    raise exception 'ENTITE_ID_IMMUTABLE';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'USER_ID_IMMUTABLE';
  end if;
  return new;
end;
$$;

create trigger trg_entite_membre_freeze_identity
  before update on public.entite_membre
  for each row execute function public.entite_membre_freeze_identity();

-- ════════════════════════════════════════════════════════════════════════════
-- 5) HELPERS d'accès PAR ENTITÉ (référencent entite_membre → définis APRÈS la table).
-- ════════════════════════════════════════════════════════════════════════════

-- LECTURE par entité. Helper central des policies SELECT.
--   • Membre PLEIN (full_espace=true) → true TOUJOURS, MÊME si p_entite_id IS NULL. Indispensable :
--     une ligne dont l'entité n'est pas résoluble (mouvement orphelin, document sans parent, etc.)
--     doit RESTER visible du propriétaire EXACTEMENT comme en P0. Le membre plein voit tout.
--   • Membre SCOPÉ → true seulement si p_entite_id n'est pas NULL ET fait l'objet d'un octroi
--     entite_membre (n'importe quel rôle) pour cet utilisateur. NULL ⇒ false (fail-closed) :
--     un scopé ne voit jamais une ligne dont l'entité est indéterminée.
-- ⚠ Ne JAMAIS court-circuiter par has_role(espace,…) seul : un membre scopé ne passe la branche
--   « plein » que si full_espace=true.
create or replace function public.has_entite_access(p_espace_id uuid, p_entite_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_full_member(p_espace_id)
    or (
      p_entite_id is not null
      and exists (
        select 1 from public.entite_membre em
        where em.espace_id = p_espace_id
          and em.entite_id = p_entite_id
          and em.user_id = (select auth.uid())
      )
    );
$$;
revoke all on function public.has_entite_access(uuid, uuid) from public;
grant execute on function public.has_entite_access(uuid, uuid) to authenticated;

-- ÉCRITURE par entité. Helper central des policies write. Même logique :
--   • Manager PLEIN (full_espace=true + owner|gestionnaire) → true TOUJOURS (même p_entite_id NULL),
--     comportement d'écriture P0 strictement inchangé pour le propriétaire.
--   • Membre SCOPÉ → true seulement si octroi entite_membre de rôle 'gestionnaire' sur l'entité.
create or replace function public.has_entite_write(p_espace_id uuid, p_entite_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_full_manager(p_espace_id)
    or (
      p_entite_id is not null
      and exists (
        select 1 from public.entite_membre em
        where em.espace_id = p_espace_id
          and em.entite_id = p_entite_id
          and em.user_id = (select auth.uid())
          and em.role = 'gestionnaire'
      )
    );
$$;
revoke all on function public.has_entite_write(uuid, uuid) from public;
grant execute on function public.has_entite_write(uuid, uuid) to authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 6) RLS FORCE + policies de gestion de entite_membre (gérable par un manager PLEIN UNIQUEMENT).
--    PAS un membre scopé : sinon un invité pourrait s'auto-octroyer d'autres SCIs (escalade).
-- ════════════════════════════════════════════════════════════════════════════
alter table public.entite_membre enable row level security;
alter table public.entite_membre force  row level security;

-- SELECT : un manager plein voit tous les octrois ; un user voit AUSSI ses propres octrois
-- (utile à l'app pour afficher « vos SCIs »). Jamais ceux des autres s'il est scopé.
create policy entite_membre_select on public.entite_membre
  for select to authenticated
  using (
    public.is_full_manager(espace_id)
    or user_id = (select auth.uid())
  );

create policy entite_membre_insert on public.entite_membre
  for insert to authenticated
  with check ( public.is_full_manager(espace_id) );

create policy entite_membre_update on public.entite_membre
  for update to authenticated
  using      ( public.is_full_manager(espace_id) )
  with check ( public.is_full_manager(espace_id) );

create policy entite_membre_delete on public.entite_membre
  for delete to authenticated
  using ( public.is_full_manager(espace_id) );

commit;
