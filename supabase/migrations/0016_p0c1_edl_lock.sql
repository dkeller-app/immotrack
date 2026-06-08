-- P0-C1 — Tâche 3/6 : verrou d'immutabilité sur edl (§9, invariant 10).
-- Append-only : ne modifie pas 0013. Même verrou que baux, SANS amends_id/baux_evenements
-- (chaînage juridique propre au bail).

alter table public.edl
  add column locked           boolean not null default false,
  add column content_hash     text,
  add column signature_source text;

alter table public.edl
  add constraint edl_signature_source_chk
  check (signature_source is null or signature_source in ('immotrack','externe'));

alter table public.edl
  add constraint edl_locked_provenance_chk
  check (not locked or signature_source is not null);

alter table public.edl
  add constraint edl_immotrack_hash_chk
  check (signature_source is distinct from 'immotrack' or content_hash is not null);

create trigger trg_prevent_locked_mutation
  before update or delete on public.edl
  for each row execute function public.prevent_locked_mutation();
