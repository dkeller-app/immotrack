-- P0-C1 — Tâche 2/6 : verrou d'immutabilité sur baux (§9, invariants 10 & 21).
-- Append-only : ne modifie pas 0012. Ajoute les colonnes de verrou, les CHECKs de
-- cohérence, la self-FK amends_id (avenant) ON DELETE RESTRICT, et branche le trigger.

alter table public.baux
  add column locked           boolean not null default false,
  add column content_hash     text,
  add column signature_source text,
  add column amends_id        uuid;

-- signature_source ∈ {immotrack, externe} (invariant 21).
alter table public.baux
  add constraint baux_signature_source_chk
  check (signature_source is null or signature_source in ('immotrack','externe'));

-- Un bail verrouillé DOIT déclarer sa provenance (pas de verrou anonyme).
alter table public.baux
  add constraint baux_locked_provenance_chk
  check (not locked or signature_source is not null);

-- Un signé ImmoTrack DOIT porter un hash de contenu ; un signé 'externe' importé
-- peut ne pas en avoir (pas de faux hash d'origine, §9 l.181). Sur lignes non
-- verrouillées (P0-B existant : source NULL) la contrainte passe (NULL <> 'immotrack').
alter table public.baux
  add constraint baux_immotrack_hash_chk
  check (signature_source is distinct from 'immotrack' or content_hash is not null);

-- Avenant : nouveau bail portant amends_id → bail original (même espace). ON DELETE
-- RESTRICT (invariant 11) : on ne peut pas supprimer un bail référencé par un avenant.
-- FK composite (amends_id, espace_id) → baux(id, espace_id) : réutilise baux_id_espace_unique.
alter table public.baux
  add constraint baux_amends_fk foreign key (amends_id, espace_id)
    references public.baux (id, espace_id) on delete restrict;

create index baux_by_amends on public.baux (amends_id) where amends_id is not null;

-- Trigger d'immutabilité (fonction définie en 0014). BEFORE UPDATE OR DELETE.
create trigger trg_prevent_locked_mutation
  before update or delete on public.baux
  for each row execute function public.prevent_locked_mutation();
