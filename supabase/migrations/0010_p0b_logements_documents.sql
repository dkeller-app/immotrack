-- P0-B — Tâche 2/6 : tables « logements » + « documents ».
-- logement.entity (string nom) → entite_id FK ; logement.imm (string) → immeuble_id FK.
-- Champs bail courant dénormalisés legacy → legacy_bail jsonb (fidélité ré-import, déprécié).
-- documents.parent polymorphe ('mouvement'|'immeuble') → parent_type+parent_id SANS FK dure
--   (exception documentée ; cohérence espace_id par RLS).

-- ── logements ──────────────────────────────────────────────────────────────────
create table public.logements (
  id            uuid primary key default gen_random_uuid(),
  espace_id     uuid not null references public.espaces(id) on delete cascade,
  legacy_id     text,
  ref           text not null check (length(trim(ref)) > 0),  -- clé métier "F-001"
  entite_id     uuid not null,
  immeuble_id   uuid,
  type          text,
  type_usage    text,
  surface       numeric,
  etage         text,
  num_apt       text,
  adresse       text,
  npp           text,
  pieces_desc   jsonb,
  tantiemes     text,
  lot           text,
  num_fiscal    text,
  loyer_hc_ref  numeric,
  charges_ref   numeric,
  chauffage     jsonb,
  ecs           jsonb,
  diagnostics   jsonb,
  equipements   jsonb,
  mobilier      jsonb,
  presentation  jsonb,
  drive_folders jsonb,
  legacy_bail   jsonb,    -- anciens champs bail courant (locataire/hc/ch/dg/irl) — fidélité ré-import
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  version       bigint not null default 1,
  created_by    uuid default auth.uid() references auth.users(id),
  constraint logements_id_espace_unique unique (id, espace_id),
  constraint logements_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id),
  constraint logements_immeuble_fk foreign key (immeuble_id, espace_id)
    references public.immeubles (id, espace_id)
);

create unique index logements_ref_unique
  on public.logements (espace_id, ref) where deleted_at is null;
create index logements_by_espace_entite   on public.logements (espace_id, entite_id);
create index logements_by_espace_immeuble on public.logements (espace_id, immeuble_id);

create trigger trg_touch_logements
  before update on public.logements
  for each row execute function public.touch_row();

-- ── documents ──────────────────────────────────────────────────────────────────
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  espace_id     uuid not null references public.espaces(id) on delete cascade,
  legacy_id     text,
  name          text,
  mime          text,
  size          bigint,
  idb_key       text,                -- ancienne clé IndexedDB (binaire migré vers Storage en P0-D)
  storage_path  text,                -- futur chemin objet Supabase Storage
  drive_file_id text,
  parent_type   text check (parent_type in ('mouvement','immeuble')),
  parent_id     uuid,                -- polymorphe : pas de FK dure (exception documentée)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  version       bigint not null default 1,
  created_by    uuid default auth.uid() references auth.users(id),
  constraint documents_id_espace_unique unique (id, espace_id)
);

create index documents_by_espace_parent on public.documents (espace_id, parent_type, parent_id);

create trigger trg_touch_documents
  before update on public.documents
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies par commande (uniformes) ───────────────────────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['logements','documents'] loop
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
