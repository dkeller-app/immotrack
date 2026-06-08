-- P0-B — Tâche 5/6 : table « edl » (états des lieux entrée/sortie).
-- Détail profondément imbriqué (pieces[].elements[].{etatE,obsE,photosE[],etatS,…}, compteurs,
--   chauffage, technologies, clés, daaf, mobilier) → jsonb (modélisation hybride validée).
-- Verrou de signature signed_at extrait en colonne → P0-C branche l'immutabilité.
-- edl_photos : binaires hors-base (IndexedDB → Storage P0-D) ; métadonnées dans pieces jsonb.

create table public.edl (
  id               uuid primary key default gen_random_uuid(),
  espace_id        uuid not null references public.espaces(id) on delete cascade,
  legacy_id        text,
  type_edl         text check (type_edl in ('Entrée','Sortie')),
  date_edl         date,
  logement_id      uuid not null,
  identite         jsonb,                       -- {locataire, bailleur} (snapshot)
  pieces           jsonb not null default '[]'::jsonb,
  compteurs        jsonb,
  compteurs_sortie jsonb,
  compteurs_photos jsonb,
  chauffage        jsonb,
  technologies     jsonb,
  cles             jsonb,
  daaf             jsonb,
  mobilier         jsonb,
  signed_at        timestamptz,                 -- verrou (immutabilité branchée en P0-C)
  signatures       jsonb,                       -- bailleur, locataire, edlSnapshot
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  version          bigint not null default 1,
  created_by       uuid default auth.uid() references auth.users(id),
  constraint edl_id_espace_unique unique (id, espace_id),
  constraint edl_logement_fk foreign key (logement_id, espace_id)
    references public.logements (id, espace_id)
);

create index edl_by_espace_logement on public.edl (espace_id, logement_id);
create index edl_by_espace_type     on public.edl (espace_id, type_edl);

create trigger trg_touch_edl
  before update on public.edl
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies par commande (uniformes) ───────────────────────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['edl'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
    -- §17-4b : espace_id figé (anti-kidnapping cross-tenant) — fonction définie en 0009
    execute format('create trigger trg_freeze_espace_id before update on public.%I for each row execute function public.freeze_espace_id()', t);
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
