-- Compléter le modèle Supabase : CONFIG par espace.
-- Les collections du DB legacy qui sont de la CONFIGURATION (pas des données relationnelles
-- à intégrité référentielle) vivent ici, en jsonb, une ligne par espace :
--   params, categories, catConfig, irlTable, irlHistorique, templates, edlTemplates,
--   piecesEDL, importRules, equipements.
-- Pas de FK enfant vers cette table → espace_id en PK suffit (1 config par espace).
-- RLS uniforme (membre lit / writer écrit), comme les tables métier P0-B.
--
-- NB : irlTable = barème IRL INSEE = donnée de RÉFÉRENCE GLOBALE (identique pour tous).
--   Au 1er jet on l'embarque ici (copie par espace) ; à dédupliquer en table globale
--   (comme `plans`) plus tard. Documenté, non bloquant.

create table public.espace_config (
  espace_id  uuid primary key references public.espaces(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  legacy_raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version    bigint not null default 1
);

create trigger trg_touch_espace_config
  before update on public.espace_config
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies + espace_id figé (uniforme tables métier) ───────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['espace_config'] loop
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
