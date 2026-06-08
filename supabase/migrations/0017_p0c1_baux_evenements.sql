-- P0-C1 — Tâche 5/6 : table baux_evenements (§9 l.178, invariant 21).
-- Résiliation / congé / révision = ÉVÉNEMENT rattaché au bail, SANS toucher la ligne
-- signée verrouillée. L'état « résilié » est dérivé de la présence d'un événement.
-- Pattern RLS/triggers strictement identique aux tables métier P0-B.

create table public.baux_evenements (
  id             uuid primary key default gen_random_uuid(),
  espace_id      uuid not null references public.espaces(id) on delete cascade,
  bail_id        uuid not null,
  type_evenement text not null
    check (type_evenement in ('resiliation','conge','renouvellement','revision_loyer','autre')),
  date_evenement date not null,
  motif          text,
  payload        jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  version        bigint not null default 1,
  created_by     uuid default auth.uid() references auth.users(id),
  constraint baux_evenements_id_espace_unique unique (id, espace_id),
  -- ON DELETE RESTRICT : on ne supprime pas un bail qui porte des événements (invariant 11).
  constraint baux_evenements_bail_fk foreign key (bail_id, espace_id)
    references public.baux (id, espace_id) on delete restrict
);

create index baux_evenements_by_espace_bail on public.baux_evenements (espace_id, bail_id);
create index baux_evenements_by_type on public.baux_evenements (espace_id, type_evenement);

create trigger trg_touch_baux_evenements
  before update on public.baux_evenements
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies par commande (uniformes P0-B) ───────────────────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['baux_evenements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
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
