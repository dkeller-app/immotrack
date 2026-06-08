-- P0-B — Tâche 3/6 : tables « mouvements » + « quittances ».
-- mouvements.qui polymorphe (logement.ref XOR 'SCI:'+entité.nom) → 2 FK exclusives + CHECK.
-- mouvements.pjId → pj_document_id FK composite vers documents.
-- quittances : 1 par (logement, mois) actif (unique partiel).

-- ── mouvements ──────────────────────────────────────────────────────────────────
create table public.mouvements (
  id             uuid primary key default gen_random_uuid(),
  espace_id      uuid not null references public.espaces(id) on delete cascade,
  legacy_id      text,
  date_mouvement date not null,
  libelle        text,
  immeuble_id    uuid,
  categorie      text,
  logement_id    uuid,                       -- « qui » = un logement…
  entite_id      uuid,                       -- … OU une SCI (entité), jamais les deux
  debit          numeric not null default 0,
  credit         numeric not null default 0,
  facture        text,
  compteur_cc_id text,                       -- ref legacy compteur charges communes
  pj_document_id uuid,                        -- pièce jointe (justificatif)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  version        bigint not null default 1,
  created_by     uuid default auth.uid() references auth.users(id),
  constraint mouvements_id_espace_unique unique (id, espace_id),
  constraint mouvements_logement_fk foreign key (logement_id, espace_id)
    references public.logements (id, espace_id),
  constraint mouvements_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id),
  constraint mouvements_immeuble_fk foreign key (immeuble_id, espace_id)
    references public.immeubles (id, espace_id),
  constraint mouvements_pj_fk foreign key (pj_document_id, espace_id)
    references public.documents (id, espace_id),
  -- « qui » cible AU PLUS une entité métier (logement xor SCI)
  constraint mouvements_qui_exclusif check (
    not (logement_id is not null and entite_id is not null)
  )
);

create index mouvements_by_espace_date     on public.mouvements (espace_id, date_mouvement);
create index mouvements_by_espace_logement on public.mouvements (espace_id, logement_id);
create index mouvements_by_espace_entite   on public.mouvements (espace_id, entite_id);

create trigger trg_touch_mouvements
  before update on public.mouvements
  for each row execute function public.touch_row();

-- ── quittances ──────────────────────────────────────────────────────────────────
create table public.quittances (
  id            uuid primary key default gen_random_uuid(),
  espace_id     uuid not null references public.espaces(id) on delete cascade,
  legacy_id     text,
  logement_id   uuid not null,
  entite_id     uuid,
  locataire     text,                         -- snapshot du nom locataire à l'émission
  mois          text not null,                -- 'AAAA-MM'
  hc            numeric not null default 0,
  ch            numeric not null default 0,
  date_paiement date,
  date_quittance date,
  payment_matched_mvt_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  version       bigint not null default 1,
  created_by    uuid default auth.uid() references auth.users(id),
  constraint quittances_id_espace_unique unique (id, espace_id),
  constraint quittances_logement_fk foreign key (logement_id, espace_id)
    references public.logements (id, espace_id),
  constraint quittances_entite_fk foreign key (entite_id, espace_id)
    references public.entites (id, espace_id),
  constraint quittances_mvt_fk foreign key (payment_matched_mvt_id, espace_id)
    references public.mouvements (id, espace_id)
);

create unique index quittances_logement_mois_unique
  on public.quittances (espace_id, logement_id, mois) where deleted_at is null;
create index quittances_by_espace_logement on public.quittances (espace_id, logement_id);

create trigger trg_touch_quittances
  before update on public.quittances
  for each row execute function public.touch_row();

-- ── RLS FORCE + 4 policies par commande (uniformes) ───────────────────────────
do $rls$
declare
  t       text;
  writers constant text := $w$array['owner','gestionnaire']::public.espace_role[]$w$;
begin
  foreach t in array array['mouvements','quittances'] loop
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
