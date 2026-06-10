-- Compléter le modèle : tables métier dédiées « assurances » (depuis legacy `mrh`) +
-- « agenda ». Pattern P0-B : espace_id NOT NULL + RLS FORCE + 4 policies + freeze/touch +
-- soft-delete + legacy_id + legacy_raw (no-loss). FK composites (parent_id, espace_id)
-- vers les tables existantes (nullables : un événement/assurance peut ne cibler personne).
--
-- assurances : 1 ligne = un contrat MRH (legacy mrh : compagnie/echeance/numContrat/prime/
--   locataire/logement-ref/notes). `echeance` gardée en text (format legacy non garanti ISO).
-- agenda : événements/rappels (titre/date/dateFin/cat/couleur/refs/done/rappels/recurrence).

-- ── assurances ───────────────────────────────────────────────────────────────
create table public.assurances (
  id           uuid primary key default gen_random_uuid(),
  espace_id    uuid not null references public.espaces(id) on delete cascade,
  legacy_id    text,
  logement_id  uuid,
  compagnie    text,
  num_contrat  text,
  echeance     text,                       -- date d'échéance (format legacy, parsé plus tard)
  prime        numeric,
  locataire    text,                        -- snapshot nom locataire
  notes        text,
  legacy_raw   jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  version      bigint not null default 1,
  created_by   uuid default auth.uid() references auth.users(id),
  constraint assurances_id_espace_unique unique (id, espace_id),
  constraint assurances_logement_fk foreign key (logement_id, espace_id)
    references public.logements (id, espace_id)
);
create index assurances_by_espace_logement on public.assurances (espace_id, logement_id);
create trigger trg_touch_assurances before update on public.assurances
  for each row execute function public.touch_row();

-- ── agenda ───────────────────────────────────────────────────────────────────
create table public.agenda (
  id           uuid primary key default gen_random_uuid(),
  espace_id    uuid not null references public.espaces(id) on delete cascade,
  legacy_id    text,
  entite_id    uuid,
  immeuble_id  uuid,
  logement_id  uuid,
  titre        text,
  date_evt     date,
  date_fin     date,
  categorie    text,
  couleur      text,
  done         boolean not null default false,
  rappels      jsonb,
  recurrence   jsonb,
  notes        text,
  legacy_raw   jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  version      bigint not null default 1,
  created_by   uuid default auth.uid() references auth.users(id),
  constraint agenda_id_espace_unique unique (id, espace_id),
  constraint agenda_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id),
  constraint agenda_immeuble_fk foreign key (immeuble_id, espace_id)
    references public.immeubles (id, espace_id),
  constraint agenda_logement_fk foreign key (logement_id, espace_id)
    references public.logements (id, espace_id)
);
create index agenda_by_espace_date on public.agenda (espace_id, date_evt);
create trigger trg_touch_agenda before update on public.agenda
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies + espace_id figé (uniforme) ────────────────────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['assurances','agenda'] loop
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
