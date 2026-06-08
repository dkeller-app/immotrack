-- P0-B — Tâche 4/6 : tables « baux » (bail courant) + « baux_historique » (archives).
-- Dict JS baux[ref] → table avec 1 bail courant par logement (unique partiel actif).
-- Verrous de signature extraits en colonnes (signed_at, signed_*_at) → P0-C branche
--   l'immutabilité dessus ; AUCUNE contrainte d'immutabilité posée ici.
-- Détail imbriqué (locataires, garants, mobilier, descriptif, irl_historique, signatures-images,
--   snapshots) → jsonb. baux_historique = enregistrement figé → bail_snapshot jsonb.

-- ── baux (bail courant) ──────────────────────────────────────────────────────────
create table public.baux (
  id                  uuid primary key default gen_random_uuid(),
  espace_id           uuid not null references public.espaces(id) on delete cascade,
  legacy_ref          text,                    -- ancienne clé du dict baux[ref]
  logement_id         uuid not null,
  entite_id           uuid,
  type_bail           text check (type_bail in ('nu','meuble','etudiant','mobilite','garage','autre')),
  hc                  numeric,
  ch                  numeric,
  dg                  numeric,
  jour_paiement       int,
  date_debut          date,
  date_fin            date,
  date_fin_effective  date,
  locataires          jsonb not null default '[]'::jsonb,
  garants             jsonb,
  mobilier            jsonb,
  descriptif          jsonb,                   -- adrBien/ftype/surf
  irl                 jsonb,
  irl_historique      jsonb not null default '[]'::jsonb,
  signed_at           timestamptz,             -- verrou (immutabilité branchée en P0-C)
  signed_bailleur_at  timestamptz,
  signed_locataire_at timestamptz,
  signatures          jsonb,                   -- mode, nbParaphes, dataURLs, bailSnapshot, edlSnapshot, driveWebViewLink
  cloture             jsonb,
  quitt_auto_gen      boolean not null default false,
  notes               text,
  archived            boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  version             bigint not null default 1,
  created_by          uuid default auth.uid() references auth.users(id),
  constraint baux_id_espace_unique unique (id, espace_id),
  constraint baux_logement_fk foreign key (logement_id, espace_id)
    references public.logements (id, espace_id),
  constraint baux_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id)
);

-- un seul bail courant (non archivé, non supprimé) par logement — reflète baux[ref]
create unique index baux_one_active_per_logement
  on public.baux (espace_id, logement_id) where deleted_at is null and archived = false;
create index baux_by_espace_logement on public.baux (espace_id, logement_id);

create trigger trg_touch_baux
  before update on public.baux
  for each row execute function public.touch_row();

-- ── baux_historique (archives figées) ─────────────────────────────────────────────
create table public.baux_historique (
  id            uuid primary key default gen_random_uuid(),
  espace_id     uuid not null references public.espaces(id) on delete cascade,
  legacy_ref    text,
  logement_id   uuid,
  entite_id     uuid,
  archived_at   timestamptz not null default now(),
  archived_auto boolean not null default false,
  bail_snapshot jsonb not null,               -- copie figée du bail à l'archivage (auto-contenu)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  version       bigint not null default 1,
  created_by    uuid default auth.uid() references auth.users(id),
  constraint baux_hist_id_espace_unique unique (id, espace_id),
  constraint baux_hist_logement_fk foreign key (logement_id, espace_id)
    references public.logements (id, espace_id),
  constraint baux_hist_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id)
);

create index baux_hist_by_espace_logement on public.baux_historique (espace_id, logement_id);
create index baux_hist_by_espace_archived on public.baux_historique (espace_id, archived_at);

create trigger trg_touch_baux_historique
  before update on public.baux_historique
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies par commande (uniformes) ───────────────────────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['baux','baux_historique'] loop
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
