-- 0059 (NUMÉRO RÉSERVÉ — le pilotage fixe le numéro définitif) — ESPACE LOCATAIRE (accès par lien, sans mot de passe).
-- CDC : mockups/ESPACE-LOCATAIRE/CDC-ESPACE-LOCATAIRE.md (décisions D1 → D14 validées par Didier le 14/10/2026).
--
-- FRONTIÈRE D'ACCÈS (D1, option C) : le locataire n'a AUCUN compte. Il ne parle qu'au relais Cloudflare, qui calcule
-- SHA-256(jeton) puis appelle les SEULES fonctions el_* ci-dessous, sous une IDENTITÉ TECHNIQUE (un compte Supabase
-- dédié, sans espace ni SCI, inscrit dans `el_relais`). Le relais ne détient AUCUNE clé de service.
--   • Chaque fonction el_* (côté locataire) commence par _el_acces(empreinte) : accès trouvé, non révoqué, phase non
--     « fini » — sinon NULL → réponse unique « lien inactif », sans aucune donnée (pas de distinction révoqué /
--     expiré / inconnu vue de l'extérieur).
--   • Tout filtre passe par l'accès : documents du BAIL (bail_id + bail_debut : une ligne `baux` peut être réutilisée
--     par une location suivante quand le bail n'était pas signé), messages et signalements DE CET ACCÈS (D5).
--   • Un utilisateur connecté ordinaire qui appelle une fonction el_* « locataire » reçoit 42501 (_el_relais_ok).
--   • Fichiers : la politique de seau n'autorise l'identité du relais à lire QUE les chemins « ouverts » depuis moins
--     de 60 s par une fonction el_* (table locataire_ouvertures), et à déposer QUE sous ticket (5 min) sous
--     <espace>/<sci>/files/el-<accès>-<uuid>.<ext>.
--   • L'empreinte du jeton vit dans locataire_acces_jeton, SANS AUCUNE politique de lecture : personne ne la lit.
--
-- CÔTÉ PROPRIÉTAIRE (connecté, RLS par SCI existante, modèle 0052 has_entite_*_all) :
--   • émettre / renouveler / révoquer un accès : fonctions el_acces_emettre / el_acces_revoquer (le jeton est tiré dans
--     le navigateur ; seule l'empreinte arrive ici) ;
--   • lire accès (état, dernière visite, accord), messages, signalements ; publier / retirer des documents ;
--     répondre (auteur 'bailleur') ; marquer un signalement « importé au registre » ; poser fin de bail / clôture.
--   • L'ACCORD pour la quittance électronique n'est écrit QUE par le locataire (el_accord) : aucun droit d'UPDATE des
--     colonnes d'accord n'est accordé aux utilisateurs connectés.
--
-- PHASES (D4) : bail en cours → 'complet' ; après la fin, jusqu'à la clôture des comptes → 'depart' (documents,
-- messages, suivi ; plus de nouveau signalement) ; puis 6 mois de 'documents' seuls ; plafond fin + 14 mois → 'fini'.
-- Même règle en JS : js/core/espace-locataire.js (phaseAcces), testée.
--
-- ORDRE DE DÉPLOIEMENT : 0059 → identité technique (compte + ligne el_relais) → relais → front.
-- Dépend de 0001 (espaces, touch_row), 0009 (freeze_espace_id), 0011 (logements), 0012 (baux), 0024 (espace-files,
-- safe_uuid), 0029/0053 (has_entite_access/_write, entite_of_*), 0052 (has_entite_*_all). Indépendante de 0056/0058.

begin;

-- ═══════════════════════════════════════════ 1. Identité technique du relais ═══════════════════════════════════════
create table public.el_relais (
  id         boolean primary key default true check (id),          -- une seule ligne
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.el_relais enable row level security;
alter table public.el_relais force  row level security;
create policy el_relais_aucune_lecture on public.el_relais for select to authenticated using (false);
revoke all on public.el_relais from anon, authenticated;

create or replace function public._el_relais_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.el_relais r where r.user_id = (select auth.uid()));
$$;
revoke all on function public._el_relais_ok() from public, anon;
grant execute on function public._el_relais_ok() to authenticated;

-- Phase d'un accès (D4). Règle UNIQUE côté base ; miroir JS : phaseAcces (js/core/espace-locataire.js).
create or replace function public._el_phase(p_fin date, p_clos date, p_jour date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_fin is null or p_jour <= p_fin then 'complet'
    when p_jour >= (p_fin + interval '14 months')::date then 'fini'
    when p_clos is null then 'depart'
    when p_jour < (p_clos + interval '6 months')::date then 'documents'
    else 'fini'
  end;
$$;
revoke all on function public._el_phase(date, date, date) from public, anon;
grant execute on function public._el_phase(date, date, date) to authenticated;

-- ═══════════════════════════════════════════ 2. Tables ═════════════════════════════════════════════════════════════
create table public.locataire_acces (
  id                       uuid primary key default gen_random_uuid(),
  espace_id                uuid not null references public.espaces(id) on delete cascade,
  entite_id                uuid,
  logement_id              uuid not null,
  bail_id                  uuid not null,
  bail_debut               date,                                   -- distingue les locations successives d'une même ligne
  locataire_rang           smallint not null check (locataire_rang between 0 and 19),
  locataire_nom            text not null check (char_length(btrim(locataire_nom)) between 1 and 200),
  emis_le                  timestamptz not null default now(),
  emis_par                 uuid default auth.uid() references auth.users(id),
  revoque_le               timestamptz,
  revoque_par              uuid references auth.users(id),
  fin_bail                 date,                                   -- posée par l'app (fin d'occupation)
  comptes_clos_le          date,                                   -- posée par l'app (dépôt restitué / solde de tout compte)
  derniere_visite          timestamptz,                            -- journal minimal (au plus une écriture par heure)
  accord_quittance_le      timestamptz,                            -- écrit par le locataire SEULEMENT (el_accord)
  accord_quittance_version text check (accord_quittance_version is null or char_length(accord_quittance_version) <= 20),
  accord_quittance_code    boolean not null default false,         -- confirmé par code e-mail (D10, quand l'e-mail sera actif)
  accord_retire_le         timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  version                  bigint not null default 1,
  constraint locataire_acces_id_espace_unique unique (id, espace_id),
  constraint locataire_acces_bail_fk     foreign key (bail_id, espace_id)     references public.baux (id, espace_id) on delete cascade,
  constraint locataire_acces_logement_fk foreign key (logement_id, espace_id) references public.logements (id, espace_id),
  constraint locataire_acces_entite_fk   foreign key (entite_id, espace_id)   references public.entites (id, espace_id)
);
-- Un seul accès par (location, rang de colocataire) : renouveler = remplacer l'empreinte sur la MÊME ligne (D3).
-- Identité d'un colocataire = son NOM normalisé (le rang dans bail.locataires bouge quand un colocataire part) ;
-- locataire_rang n'est que le rang au moment de l'émission (information).
create or replace function public._el_cle_nom(p_nom text)
returns text
language sql
immutable
set search_path = ''
as $$ select lower(regexp_replace(btrim(coalesce(p_nom, '')), '\s+', ' ', 'g')); $$;
revoke all on function public._el_cle_nom(text) from public, anon, authenticated;
create unique index locataire_acces_un_par_locataire on public.locataire_acces (bail_id, coalesce(bail_debut, '0001-01-01'::date), public._el_cle_nom(locataire_nom));
create index locataire_acces_by_espace_logement on public.locataire_acces (espace_id, logement_id);

create table public.locataire_acces_jeton (
  acces_id      uuid primary key references public.locataire_acces(id) on delete cascade,
  jeton_sha256  bytea not null unique check (octet_length(jeton_sha256) = 32)
);

create table public.locataire_documents (
  id                uuid primary key default gen_random_uuid(),
  espace_id         uuid not null references public.espaces(id) on delete cascade,
  entite_id         uuid,
  logement_id       uuid not null,
  bail_id           uuid not null,
  bail_debut        date,
  cle               text not null check (cle ~ '^[a-z]{2,16}:[A-Za-z0-9._:-]{1,120}$'),   -- idempotence côté app
  type_doc          text not null check (type_doc in ('bail', 'avenant', 'edl', 'quittance', 'decompte', 'justificatif')),
  titre             text not null check (char_length(btrim(titre)) between 1 and 200),
  periode           text check (periode is null or char_length(periode) <= 60),
  date_doc          date,
  storage_path      text not null check (char_length(storage_path) between 40 and 600 and storage_path !~ '(^/|\.\.|//|\\)'),
  mime              text not null default 'application/pdf' check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  taille            bigint check (taille is null or taille between 0 and 104857600),
  sha256            text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  parent_id         uuid references public.locataire_documents(id) on delete cascade,  -- justificatif → décompte
  visible_jusqu_au  timestamptz,                                    -- justificatifs : envoi du décompte + 6 mois (art. 23)
  publie_le         timestamptz not null default now(),
  publie_par        uuid default auth.uid() references auth.users(id),
  retire_le         timestamptz,                                    -- retrait (D6) : masqué, le fichier reste conservé
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  version           bigint not null default 1,
  constraint locataire_documents_id_espace_unique unique (id, espace_id),
  constraint locataire_documents_bail_fk     foreign key (bail_id, espace_id)     references public.baux (id, espace_id) on delete cascade,
  constraint locataire_documents_logement_fk foreign key (logement_id, espace_id) references public.logements (id, espace_id),
  constraint locataire_documents_entite_fk   foreign key (entite_id, espace_id)   references public.entites (id, espace_id),
  constraint locataire_documents_chemin_espace check (split_part(storage_path, '/', 1) = espace_id::text)
);
create unique index locataire_documents_cle_unique on public.locataire_documents (bail_id, coalesce(bail_debut, '0001-01-01'::date), cle);
create index locataire_documents_by_espace_logement on public.locataire_documents (espace_id, logement_id);

create table public.locataire_signalements (
  id                 uuid primary key default gen_random_uuid(),
  espace_id          uuid not null references public.espaces(id) on delete cascade,
  entite_id          uuid,
  logement_id        uuid not null,
  bail_id            uuid not null,
  bail_debut         date,
  acces_id           uuid not null references public.locataire_acces(id) on delete cascade,
  piece              text not null check (piece ~ '^[a-z_]{2,30}$'),
  element            text not null check (element ~ '^[a-z_]{2,30}$'),
  urgence            text not null check (urgence in ('faible', 'importante', 'urgente')),
  description        text not null check (char_length(btrim(description)) between 3 and 2000),
  photos             jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 6),
  cree_le            timestamptz not null default now(),
  incident_legacy_id text check (incident_legacy_id is null or incident_legacy_id ~ '^[0-9]{1,20}$'),   -- posé à l'import (app)
  importe_le         timestamptz,
  importe_par        uuid references auth.users(id),
  constraint locataire_signalements_id_espace_unique unique (id, espace_id)
);
create index locataire_signalements_by_espace_logement on public.locataire_signalements (espace_id, logement_id);
create index locataire_signalements_by_acces on public.locataire_signalements (acces_id, cree_le desc);

create table public.locataire_messages (
  id              uuid primary key default gen_random_uuid(),
  espace_id       uuid not null references public.espaces(id) on delete cascade,
  entite_id       uuid,
  logement_id     uuid not null,
  bail_id         uuid not null,
  bail_debut      date,
  acces_id        uuid not null references public.locataire_acces(id) on delete cascade,
  auteur          text not null check (auteur in ('locataire', 'bailleur')),
  auteur_uid      uuid default auth.uid() references auth.users(id),
  corps           text not null check (char_length(btrim(corps)) between 1 and 4000),
  pieces          jsonb not null default '[]'::jsonb check (jsonb_typeof(pieces) = 'array' and jsonb_array_length(pieces) <= 4),
  signalement_id  uuid references public.locataire_signalements(id) on delete set null,
  cree_le         timestamptz not null default now(),
  lu_bailleur_le  timestamptz,
  lu_locataire_le timestamptz,
  constraint locataire_messages_id_espace_unique unique (id, espace_id)
);
create index locataire_messages_by_acces on public.locataire_messages (acces_id, cree_le);
create index locataire_messages_by_espace_logement on public.locataire_messages (espace_id, logement_id);

-- Ouvertures de fichiers (lecture 60 s, dépôt 5 min) : seule source d'autorisation Storage de l'identité du relais.
create table public.locataire_ouvertures (
  id            bigint generated always as identity primary key,
  acces_id      uuid not null references public.locataire_acces(id) on delete cascade,
  storage_path  text not null,
  mode          text not null check (mode in ('lecture', 'depot')),
  jusqu_au      timestamptz not null,
  sha256        text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),   -- dépôt : relevée par le relais (el_depot_fin)
  taille        bigint check (taille is null or taille between 1 and 10485760),
  cree_le       timestamptz not null default now()
);
create index locataire_ouvertures_by_path on public.locataire_ouvertures (storage_path, mode, jusqu_au);
create index locataire_ouvertures_by_acces on public.locataire_ouvertures (acces_id, mode, cree_le);

-- Jetons invalides par condensat d'IP salé du jour (calculé par le relais ; jamais l'IP en clair).
create table public.locataire_tentatives (
  id       bigint generated always as identity primary key,
  ip_hash  text not null check (ip_hash ~ '^[0-9a-f]{16,64}$'),
  at       timestamptz not null default now()
);
create index locataire_tentatives_by_ip on public.locataire_tentatives (ip_hash, at);

-- ═══════════════════════════════════════════ 3. Cohérence (triggers) ════════════════════════════════════════════════
-- Documents : rattachements DÉDUITS du bail (jamais pris du client) ; bail_id / bail_debut / espace gelés après insertion.
create or replace function public._el_doc_coherence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_log uuid; v_ent uuid;
begin
  if tg_op = 'UPDATE' and (new.bail_id <> old.bail_id or new.bail_debut is distinct from old.bail_debut
                           or new.espace_id <> old.espace_id or new.cle <> old.cle) then
    raise exception 'el:document-rattachement-gele' using errcode = '42501';
  end if;
  select b.logement_id, coalesce(b.entite_id, l.entite_id) into v_log, v_ent
  from public.baux b join public.logements l on l.id = b.logement_id and l.espace_id = b.espace_id
  where b.id = new.bail_id and b.espace_id = new.espace_id;
  if v_log is null then raise exception 'el:interdit' using errcode = '42501'; end if;
  new.logement_id := v_log;
  new.entite_id := v_ent;
  if new.parent_id is not null and not exists (
    select 1 from public.locataire_documents p
    where p.id = new.parent_id and p.bail_id = new.bail_id and p.bail_debut is not distinct from new.bail_debut) then
    raise exception 'el:parent-hors-bail' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trg_el_doc_coherence before insert or update on public.locataire_documents
  for each row execute function public._el_doc_coherence();

-- Pièces jointes et photos : chemin imposé <espace>/<sci>/files/el-<accès>-<uuid>.<ext> (le dossier files/ de l'app :
-- lisible par les membres de la SCI avec la politique 0031 et par le code existant de l'app). Rattachements déduits de l'accès.
create or replace function public._el_pieces_valides(p_pieces jsonb, p_prefixe text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- p_prefixe = <espace>/<sci|_orphelin>/files/el-<accès>- (hexadécimal, tirets, '_orphelin', 'files', 'el' : sûrs en regex).
  select coalesce(bool_and(
           jsonb_typeof(x) = 'object'
           and (x->>'path') ~ ('^' || p_prefixe || '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|pdf)$')
           and char_length(coalesce(x->>'nom', '')) <= 120
           and coalesce(x->>'mime', 'application/pdf') in ('application/pdf', 'image/jpeg', 'image/png')
         ), true)
  from jsonb_array_elements(coalesce(p_pieces, '[]'::jsonb)) x;
$$;
revoke all on function public._el_pieces_valides(jsonb, text) from public, anon, authenticated;

create or replace function public._el_prefixe(a public.locataire_acces)
returns text
language sql
immutable
set search_path = ''
as $$
  select a.espace_id::text || '/' || coalesce(a.entite_id::text, '_orphelin') || '/files/el-' || a.id::text || '-';
$$;
revoke all on function public._el_prefixe(public.locataire_acces) from public, anon, authenticated;

create or replace function public._el_fil_coherence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype;
begin
  if tg_op = 'UPDATE' then
    -- Seules des colonnes « lu » / « import » changent après coup (droits de colonnes) ; ceinture : rattachements gelés.
    if new.acces_id <> old.acces_id or new.espace_id <> old.espace_id then
      raise exception 'el:rattachement-gele' using errcode = '42501';
    end if;
    return new;
  end if;
  select * into a from public.locataire_acces where id = new.acces_id;
  if not found then raise exception 'el:interdit' using errcode = '42501'; end if;
  new.espace_id := a.espace_id; new.entite_id := a.entite_id; new.logement_id := a.logement_id;
  new.bail_id := a.bail_id; new.bail_debut := a.bail_debut;
  if tg_table_name = 'locataire_messages' then
    if not public._el_pieces_valides(new.pieces, public._el_prefixe(a)) then
      raise exception 'el:piece-invalide' using errcode = '23514';
    end if;
    if new.signalement_id is not null and not exists (
      select 1 from public.locataire_signalements s where s.id = new.signalement_id and s.acces_id = a.id) then
      raise exception 'el:signalement-hors-acces' using errcode = '23514';
    end if;
  else
    if not public._el_pieces_valides(new.photos, public._el_prefixe(a)) then
      raise exception 'el:photo-invalide' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
create trigger trg_el_messages_coherence before insert or update on public.locataire_messages
  for each row execute function public._el_fil_coherence();
create trigger trg_el_signalements_coherence before insert or update on public.locataire_signalements
  for each row execute function public._el_fil_coherence();

create trigger trg_touch_locataire_acces before update on public.locataire_acces
  for each row execute function public.touch_row();
create trigger trg_freeze_espace_locataire_acces before update on public.locataire_acces
  for each row execute function public.freeze_espace_id();
create trigger trg_touch_locataire_documents before update on public.locataire_documents
  for each row execute function public.touch_row();

-- ═══════════════════════════════════════════ 4. RLS + droits (utilisateurs connectés = propriétaire et associés) ════
alter table public.locataire_acces        enable row level security;  alter table public.locataire_acces        force row level security;
alter table public.locataire_acces_jeton  enable row level security;  alter table public.locataire_acces_jeton  force row level security;
alter table public.locataire_documents    enable row level security;  alter table public.locataire_documents    force row level security;
alter table public.locataire_signalements enable row level security;  alter table public.locataire_signalements force row level security;
alter table public.locataire_messages     enable row level security;  alter table public.locataire_messages     force row level security;
alter table public.locataire_ouvertures   enable row level security;  alter table public.locataire_ouvertures   force row level security;
alter table public.locataire_tentatives   enable row level security;  alter table public.locataire_tentatives   force row level security;

-- Tables internes : AUCUNE lecture ni écriture directe (empreintes, ouvertures, tentatives).
create policy locataire_acces_jeton_aucune on public.locataire_acces_jeton for select to authenticated using (false);
create policy locataire_ouvertures_aucune  on public.locataire_ouvertures  for select to authenticated using (false);
create policy locataire_tentatives_aucune  on public.locataire_tentatives  for select to authenticated using (false);

create policy locataire_acces_select on public.locataire_acces for select to authenticated
  using ( public.has_entite_access_all(espace_id, entite_id, logement_id, null) );
create policy locataire_acces_update on public.locataire_acces for update to authenticated
  using      ( public.has_entite_write_all(espace_id, entite_id, logement_id, null) )
  with check ( public.has_entite_write_all(espace_id, entite_id, logement_id, null) );

create policy locataire_documents_select on public.locataire_documents for select to authenticated
  using ( public.has_entite_access_all(espace_id, entite_id, logement_id, null) );
-- Publier : droit d'écriture sur le bail ET accès à la SCI du FICHIER (segment 2 du chemin) — sinon un associé
-- d'une SCI pourrait rendre lisible, par le lien d'un locataire, un fichier d'une autre SCI du même espace.
create policy locataire_documents_insert on public.locataire_documents for insert to authenticated
  with check ( public.has_entite_write_all(espace_id, entite_id, logement_id, null)
               and public.has_entite_access(espace_id, public.safe_uuid(split_part(storage_path, '/', 2))) );
create policy locataire_documents_update on public.locataire_documents for update to authenticated
  using      ( public.has_entite_write_all(espace_id, entite_id, logement_id, null) )
  with check ( public.has_entite_write_all(espace_id, entite_id, logement_id, null)
               and public.has_entite_access(espace_id, public.safe_uuid(split_part(storage_path, '/', 2))) );

create policy locataire_signalements_select on public.locataire_signalements for select to authenticated
  using ( public.has_entite_access_all(espace_id, entite_id, logement_id, null) );
create policy locataire_signalements_update on public.locataire_signalements for update to authenticated
  using      ( public.has_entite_write_all(espace_id, entite_id, logement_id, null) )
  with check ( public.has_entite_write_all(espace_id, entite_id, logement_id, null) );

create policy locataire_messages_select on public.locataire_messages for select to authenticated
  using ( public.has_entite_access_all(espace_id, entite_id, logement_id, null) );
-- Répondre : uniquement en tant que 'bailleur', sous sa propre identité, avec le droit d'écriture (D13 : le
-- locataire voit le nom du bailleur, jamais celui de l'associé).
create policy locataire_messages_insert on public.locataire_messages for insert to authenticated
  with check ( auteur = 'bailleur' and auteur_uid = (select auth.uid())
               and public.has_entite_write_all(espace_id, entite_id, logement_id, null) );
create policy locataire_messages_update on public.locataire_messages for update to authenticated
  using      ( public.has_entite_write_all(espace_id, entite_id, logement_id, null) )
  with check ( public.has_entite_write_all(espace_id, entite_id, logement_id, null) );

-- Droits de colonnes : le reste passe par les fonctions (security definer).
revoke all on public.locataire_acces, public.locataire_acces_jeton, public.locataire_documents, public.locataire_signalements,
              public.locataire_messages, public.locataire_ouvertures, public.locataire_tentatives from anon, authenticated;
grant select on public.locataire_acces, public.locataire_documents, public.locataire_signalements, public.locataire_messages to authenticated;
grant update (fin_bail, comptes_clos_le) on public.locataire_acces to authenticated;
grant insert (bail_id, bail_debut, espace_id, cle, type_doc, titre, periode, date_doc, storage_path, mime, taille, sha256,
              parent_id, visible_jusqu_au) on public.locataire_documents to authenticated;
grant update (titre, periode, date_doc, storage_path, mime, taille, sha256, visible_jusqu_au, retire_le) on public.locataire_documents to authenticated;
grant update (incident_legacy_id, importe_le, importe_par) on public.locataire_signalements to authenticated;
grant insert (acces_id, auteur, corps, pieces, signalement_id) on public.locataire_messages to authenticated;
grant update (lu_bailleur_le) on public.locataire_messages to authenticated;

-- ═══════════════════════════════════════════ 5. Fonctions côté propriétaire ══════════════════════════════════════════
-- Émettre ou RENOUVELER (D3) l'accès d'un colocataire : la même ligne garde accord et historique ; l'empreinte est
-- remplacée (l'ancien lien cesse aussitôt) ; un accès révoqué est réactivé. Rattachements déduits du bail.
create or replace function public.el_acces_emettre(p_bail_id uuid, p_rang int, p_nom text, p_jeton_sha256 text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record; v_ent uuid; v_id uuid; v_h bytea;
begin
  if p_jeton_sha256 is null or p_jeton_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'el:empreinte-invalide' using errcode = '22023'; end if;
  if p_rang is null or p_rang < 0 or p_rang > 19 then raise exception 'el:rang-invalide' using errcode = '22023'; end if;
  if p_nom is null or char_length(btrim(p_nom)) not between 1 and 200 then raise exception 'el:nom-invalide' using errcode = '22023'; end if;
  select x.id, x.espace_id, x.logement_id, x.date_debut, x.entite_id, l.entite_id as log_ent into b
  from public.baux x join public.logements l on l.id = x.logement_id and l.espace_id = x.espace_id
  where x.id = p_bail_id and x.deleted_at is null and x.archived = false;
  if not found then raise exception 'el:interdit' using errcode = '42501'; end if;
  v_ent := coalesce(b.entite_id, b.log_ent);
  if not public.has_entite_write_all(b.espace_id, v_ent, b.logement_id, null) then
    raise exception 'el:interdit' using errcode = '42501';
  end if;
  v_h := decode(p_jeton_sha256, 'hex');
  select a.id into v_id from public.locataire_acces a
   where a.bail_id = b.id and a.bail_debut is not distinct from b.date_debut and public._el_cle_nom(a.locataire_nom) = public._el_cle_nom(p_nom);
  if v_id is null then
    insert into public.locataire_acces (espace_id, entite_id, logement_id, bail_id, bail_debut, locataire_rang, locataire_nom)
    values (b.espace_id, v_ent, b.logement_id, b.id, b.date_debut, p_rang, btrim(p_nom))
    returning id into v_id;
  else
    update public.locataire_acces
       set locataire_nom = btrim(p_nom), locataire_rang = p_rang, emis_le = now(), emis_par = (select auth.uid()),
           revoque_le = null, revoque_par = null, entite_id = v_ent
     where id = v_id;
    delete from public.locataire_acces_jeton where acces_id = v_id;
  end if;
  insert into public.locataire_acces_jeton (acces_id, jeton_sha256) values (v_id, v_h);
  return v_id;
end;
$$;

create or replace function public.el_acces_revoquer(p_acces_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype;
begin
  select * into a from public.locataire_acces where id = p_acces_id;
  if not found or not public.has_entite_write_all(a.espace_id, a.entite_id, a.logement_id, null) then
    raise exception 'el:interdit' using errcode = '42501';
  end if;
  update public.locataire_acces set revoque_le = now(), revoque_par = (select auth.uid()) where id = a.id;
  delete from public.locataire_acces_jeton where acces_id = a.id;
end;
$$;

-- Renouveler un accès EXISTANT (D3), y compris après la fin du bail (phase « départ » ou « documents ») : nouvelle
-- empreinte, réactivation si révoqué. Refusé si la période d'accès est terminée.
create or replace function public.el_acces_renouveler(p_acces_id uuid, p_jeton_sha256 text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype;
begin
  if p_jeton_sha256 is null or p_jeton_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'el:empreinte-invalide' using errcode = '22023'; end if;
  select * into a from public.locataire_acces where id = p_acces_id;
  if not found or not public.has_entite_write_all(a.espace_id, a.entite_id, a.logement_id, null) then
    raise exception 'el:interdit' using errcode = '42501';
  end if;
  if public._el_phase(a.fin_bail, a.comptes_clos_le, current_date) = 'fini' then
    raise exception 'el:periode-terminee' using errcode = 'P0001';
  end if;
  update public.locataire_acces set emis_le = now(), emis_par = (select auth.uid()), revoque_le = null, revoque_par = null
   where id = a.id;
  delete from public.locataire_acces_jeton where acces_id = a.id;
  insert into public.locataire_acces_jeton (acces_id, jeton_sha256) values (a.id, decode(p_jeton_sha256, 'hex'));
  return a.id;
end;
$$;

-- Destinataire et signataire d'un e-mail envoyé par le relais à la demande d'un membre EN ÉCRITURE : jamais fournis par
-- le client (pas de relais d'e-mails ouvert). Accès révoqué ou période terminée → NULL.
create or replace function public.el_acces_contact(p_acces_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype; v_mail text; v_nom text;
begin
  select * into a from public.locataire_acces where id = p_acces_id;
  if not found or not public.has_entite_write_all(a.espace_id, a.entite_id, a.logement_id, null) then
    raise exception 'el:interdit' using errcode = '42501';
  end if;
  if a.revoque_le is not null or public._el_phase(a.fin_bail, a.comptes_clos_le, current_date) = 'fini' then return null; end if;
  v_mail := lower(btrim(coalesce(public._el_email_du_locataire(a), '')));
  if v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_mail) > 254 then v_mail := null; end if;
  select e.nom into v_nom from public.entites e where e.id = a.entite_id and e.espace_id = a.espace_id;
  return jsonb_build_object('email', v_mail, 'bailleur', coalesce(v_nom, ''));
end;
$$;

-- Le membre connecté peut-il publier pour ce bail ? (évite de générer des PDF qu'il ne pourrait pas enregistrer)
create or replace function public.el_peut_publier(p_bail_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.has_entite_write_all(b.espace_id, coalesce(b.entite_id, l.entite_id), b.logement_id, null)
                   from public.baux b join public.logements l on l.id = b.logement_id and l.espace_id = b.espace_id
                   where b.id = p_bail_id), false);
$$;

revoke all on function public.el_acces_emettre(uuid, int, text, text) from public, anon;
revoke all on function public.el_acces_revoquer(uuid) from public, anon;
grant execute on function public.el_acces_emettre(uuid, int, text, text) to authenticated;
grant execute on function public.el_acces_revoquer(uuid) to authenticated;
revoke all on function public.el_acces_renouveler(uuid, text) from public, anon;
grant execute on function public.el_acces_renouveler(uuid, text) to authenticated;
revoke all on function public.el_acces_contact(uuid) from public, anon;
grant execute on function public.el_acces_contact(uuid) to authenticated;
revoke all on function public.el_peut_publier(uuid) from public, anon;
grant execute on function public.el_peut_publier(uuid) to authenticated;

-- ═══════════════════════════════════════════ 6. Fonctions côté locataire (identité du relais SEULEMENT) ══════════════
-- Résolution UNIQUE d'un accès. NULL = « lien inactif ». Trace les jetons invalides par IP (limite 20 / heure).
create or replace function public._el_acces(p_jeton_sha256 text, p_ip_hash text)
returns public.locataire_acces
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.locataire_acces%rowtype; v_h bytea; v_ip text; v_ok boolean;
  b record;
begin
  if not public._el_relais_ok() then raise exception 'el:interdit' using errcode = '42501'; end if;
  v_ip := case when p_ip_hash ~ '^[0-9a-f]{16,64}$' then p_ip_hash else null end;
  if p_jeton_sha256 ~ '^[0-9a-f]{64}$' then
    v_h := decode(p_jeton_sha256, 'hex');
    select x.* into a from public.locataire_acces x
      join public.locataire_acces_jeton j on j.acces_id = x.id
     where j.jeton_sha256 = v_h and x.revoque_le is null;
    if found then
      v_ok := true;
      -- Ligne de bail réutilisée par une AUTRE location (bail non signé remplacé) ou supprimée, sans fin posée par
      -- l'app : prudence → inactif (l'app pose fin_bail à la fin d'occupation, ce qui ouvre la phase « départ »).
      if a.fin_bail is null then
        select x.date_debut, x.deleted_at into b from public.baux x where x.id = a.bail_id;
        if not found or b.deleted_at is not null or b.date_debut is distinct from a.bail_debut then v_ok := false; end if;
      end if;
      if v_ok and public._el_phase(a.fin_bail, a.comptes_clos_le, current_date) = 'fini' then v_ok := false; end if;
      if v_ok then return a; end if;
    end if;
  end if;
  -- Échec (jeton mal formé, inconnu, révoqué, expiré) : même réponse, compté par IP. Un jeton valide n'est jamais
  -- bloqué par les essais de ses voisins de réseau.
  if v_ip is not null then
    if (select count(*) from public.locataire_tentatives t where t.ip_hash = v_ip and t.at > now() - interval '1 hour') >= 20 then
      raise exception 'el:limite' using errcode = 'P0001';
    end if;
    insert into public.locataire_tentatives (ip_hash) values (v_ip);
    delete from public.locataire_tentatives where at < now() - interval '1 day';
  end if;
  return null;
end;
$$;
revoke all on function public._el_acces(text, text) from public, anon, authenticated;

create or replace function public.el_ouvrir(p_jeton_sha256 text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.locataire_acces%rowtype; v_ph text; r jsonb; v_fin_acces date;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return jsonb_build_object('actif', false); end if;
  v_ph := public._el_phase(a.fin_bail, a.comptes_clos_le, current_date);
  if a.derniere_visite is null or a.derniere_visite < now() - interval '1 hour' then
    update public.locataire_acces set derniere_visite = now() where id = a.id;
  end if;
  v_fin_acces := case
    when a.fin_bail is null then null
    when a.comptes_clos_le is null then (a.fin_bail + interval '14 months')::date
    else least((a.comptes_clos_le + interval '6 months')::date, (a.fin_bail + interval '14 months')::date) end;
  select jsonb_build_object(
    'actif', true,
    'phase', v_ph,
    'locataire', a.locataire_nom,
    'bailleur', coalesce(e.nom, ''),
    'logement', coalesce(nullif(btrim(l.adresse), ''), l.ref, ''),
    'bail_debut', a.bail_debut,
    'fin_bail', a.fin_bail,
    'comptes_clos_le', a.comptes_clos_le,
    'fin_acces', v_fin_acces,
    'accord', jsonb_build_object('donne_le', a.accord_quittance_le, 'retire_le', a.accord_retire_le,
                                 'version', a.accord_quittance_version, 'code', a.accord_quittance_code),
    'compteurs', jsonb_build_object(
      'documents', (select count(*) from public.locataire_documents d
                     where d.bail_id = a.bail_id and d.bail_debut is not distinct from a.bail_debut and d.retire_le is null
                       and (d.visible_jusqu_au is null or d.visible_jusqu_au > now())),
      'signalements_ouverts', (select count(*) from public.locataire_signalements s
                     left join lateral (select x.statut from public.incidents x where x.espace_id = s.espace_id and x.logement_id = s.logement_id
                                         and x.legacy_id = s.incident_legacy_id and x.deleted_at is null limit 1) i on true
                     where s.acces_id = a.id and coalesce(i.statut, 'signale') <> 'resolu'),
      'messages_non_lus', (select count(*) from public.locataire_messages m
                     where m.acces_id = a.id and m.auteur = 'bailleur' and m.lu_locataire_le is null))
  ) into r
  from public.logements l
  left join public.entites e on e.id = a.entite_id and e.espace_id = a.espace_id
  where l.id = a.logement_id and l.espace_id = a.espace_id;
  return r;
end;
$$;

create or replace function public.el_documents(p_jeton_sha256 text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'type', d.type_doc, 'titre', d.titre, 'periode', d.periode,
             'date_doc', d.date_doc, 'taille', d.taille, 'mime', d.mime, 'publie_le', d.publie_le,
             'visible_jusqu_au', d.visible_jusqu_au, 'parent_id', d.parent_id)
           order by coalesce(d.date_doc, d.publie_le::date) desc, d.titre)
    from public.locataire_documents d
    where d.bail_id = a.bail_id and d.bail_debut is not distinct from a.bail_debut and d.retire_le is null
      and (d.visible_jusqu_au is null or d.visible_jusqu_au > now())), '[]'::jsonb);
end;
$$;

-- Ouvre UN fichier (document du bail, pièce d'un message de cet accès, photo d'un signalement de cet accès) :
-- renvoie son chemin et autorise sa lecture par l'identité du relais pendant 60 s.
create or replace function public.el_fichier(p_jeton_sha256 text, p_ip_hash text, p_source text, p_id uuid, p_index int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype; v_path text; v_nom text; v_mime text; x jsonb;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  if p_source = 'document' then
    select d.storage_path, d.titre, d.mime into v_path, v_nom, v_mime from public.locataire_documents d
     where d.id = p_id and d.bail_id = a.bail_id and d.bail_debut is not distinct from a.bail_debut and d.retire_le is null
       and (d.visible_jusqu_au is null or d.visible_jusqu_au > now());
  elsif p_source = 'message' then
    if p_index is null or public._el_phase(a.fin_bail, a.comptes_clos_le, current_date) = 'documents' then return jsonb_build_object('absent', true); end if;
    select m.pieces -> p_index into x from public.locataire_messages m where m.id = p_id and m.acces_id = a.id;
    v_path := x->>'path'; v_nom := x->>'nom'; v_mime := x->>'mime';
  elsif p_source = 'signalement' then
    if p_index is null or public._el_phase(a.fin_bail, a.comptes_clos_le, current_date) = 'documents' then return jsonb_build_object('absent', true); end if;
    select s.photos -> p_index into x from public.locataire_signalements s where s.id = p_id and s.acces_id = a.id;
    v_path := x->>'path'; v_nom := x->>'nom'; v_mime := x->>'mime';
  end if;
  if v_path is null then return jsonb_build_object('absent', true); end if;
  insert into public.locataire_ouvertures (acces_id, storage_path, mode, jusqu_au) values (a.id, v_path, 'lecture', now() + interval '60 seconds');
  delete from public.locataire_ouvertures where jusqu_au < now() - interval '1 day';
  return jsonb_build_object('path', v_path, 'nom', coalesce(v_nom, 'document'),
                            'mime', case when v_mime in ('application/pdf', 'image/jpeg', 'image/png') then v_mime else 'application/pdf' end);
end;
$$;

-- Ticket de dépôt (photo ou pièce) : chemin imposé + autorisation d'écriture de 5 min ; 40 dépôts par 24 h.
create or replace function public.el_depot(p_jeton_sha256 text, p_ip_hash text, p_ext text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype; v_ph text; v_path text;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  v_ph := public._el_phase(a.fin_bail, a.comptes_clos_le, current_date);
  if v_ph not in ('complet', 'depart') then raise exception 'el:ferme' using errcode = 'P0001'; end if;
  if p_ext not in ('jpg', 'png', 'pdf') then raise exception 'el:type' using errcode = '22023'; end if;
  if (select count(*) from public.locataire_ouvertures o where o.acces_id = a.id and o.mode = 'depot'
        and o.cree_le > now() - interval '24 hours') >= 40 then
    raise exception 'el:limite' using errcode = 'P0001';
  end if;
  v_path := public._el_prefixe(a) || gen_random_uuid()::text || '.' || p_ext;
  insert into public.locataire_ouvertures (acces_id, storage_path, mode, jusqu_au) values (a.id, v_path, 'depot', now() + interval '5 minutes');
  return jsonb_build_object('path', v_path);
end;
$$;

-- Fin de dépôt : le relais enregistre l'empreinte SHA-256 et la taille du fichier qu'il vient d'écrire.
create or replace function public.el_depot_fin(p_jeton_sha256 text, p_ip_hash text, p_path text, p_sha256 text, p_taille bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  update public.locataire_ouvertures set sha256 = p_sha256, taille = p_taille
   where acces_id = a.id and storage_path = p_path and mode = 'depot' and sha256 is null and cree_le > now() - interval '1 hour';
  return found;
end;
$$;

-- Pièces / photos telles que la BASE les enregistre : chemin déposé sous ticket par CET accès (24 h), type déduit de
-- l'extension imposée, empreinte et taille relevées par le relais ; seul le nom vient du client (120 caractères au plus).
create or replace function public._el_pieces_serveur(p_acces uuid, p_pieces jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare x jsonb; o record; out jsonb := '[]'::jsonb;
begin
  for x in select * from jsonb_array_elements(coalesce(p_pieces, '[]'::jsonb)) loop
    select oo.storage_path, oo.sha256, oo.taille into o from public.locataire_ouvertures oo
     where oo.acces_id = p_acces and oo.storage_path = x->>'path' and oo.mode = 'depot' and oo.cree_le > now() - interval '24 hours'
     order by oo.cree_le desc limit 1;
    if not found then raise exception 'el:piece-invalide' using errcode = '23514'; end if;
    out := out || jsonb_build_array(jsonb_build_object(
      'path', o.storage_path, 'nom', left(coalesce(x->>'nom', 'piece'), 120),
      'mime', case when o.storage_path like '%.pdf' then 'application/pdf' when o.storage_path like '%.png' then 'image/png' else 'image/jpeg' end,
      'sha256', o.sha256, 'taille', o.taille));
  end loop;
  return out;
end;
$$;
revoke all on function public._el_pieces_serveur(uuid, jsonb) from public, anon, authenticated;

-- Un fichier déposé sous ticket par CET accès (dans les 24 h).
create or replace function public._el_depose_par(p_acces uuid, p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.locataire_ouvertures o
                 where o.acces_id = p_acces and o.storage_path = p_path and o.mode = 'depot' and o.cree_le > now() - interval '24 hours');
$$;
revoke all on function public._el_depose_par(uuid, text) from public, anon, authenticated;

create or replace function public.el_accord(p_jeton_sha256 text, p_ip_hash text, p_donner boolean, p_version text, p_code boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype; v_ph text;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  v_ph := public._el_phase(a.fin_bail, a.comptes_clos_le, current_date);
  if v_ph not in ('complet', 'depart') then raise exception 'el:ferme' using errcode = 'P0001'; end if;
  if p_donner then
    if p_version is null or p_version !~ '^v[0-9]{1,3}$' then raise exception 'el:version' using errcode = '22023'; end if;
    update public.locataire_acces set accord_quittance_le = now(), accord_quittance_version = p_version,
           accord_quittance_code = coalesce(p_code, false), accord_retire_le = null where id = a.id;
  else
    if a.accord_quittance_le is not null then
      update public.locataire_acces set accord_retire_le = now() where id = a.id;
    end if;
  end if;
  return (select jsonb_build_object('donne_le', x.accord_quittance_le, 'retire_le', x.accord_retire_le,
                                    'version', x.accord_quittance_version, 'code', x.accord_quittance_code)
          from public.locataire_acces x where x.id = a.id);
end;
$$;

create or replace function public.el_signaler(p_jeton_sha256 text, p_ip_hash text, p_piece text, p_element text,
                                             p_urgence text, p_description text, p_photos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype; v_id uuid; x jsonb;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  if public._el_phase(a.fin_bail, a.comptes_clos_le, current_date) <> 'complet' then
    raise exception 'el:ferme' using errcode = 'P0001';
  end if;
  if (select count(*) from public.locataire_signalements s where s.acces_id = a.id and s.cree_le > now() - interval '24 hours') >= 10 then
    raise exception 'el:limite' using errcode = 'P0001';
  end if;
  insert into public.locataire_signalements (acces_id, piece, element, urgence, description, photos)
  values (a.id, p_piece, p_element, p_urgence, btrim(p_description), public._el_pieces_serveur(a.id, p_photos))
  returning id into v_id;
  return v_id;
end;
$$;

-- Suivi : statut et dates de passage lus dans le registre (incidents) — JAMAIS le verdict, le payeur, l'artisan,
-- l'assurance ni le coût (règle du message au locataire, chantier Travaux).
create or replace function public.el_signalements(p_jeton_sha256 text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  if public._el_phase(a.fin_bail, a.comptes_clos_le, current_date) = 'documents' then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', s.id, 'cree_le', s.cree_le, 'piece', s.piece, 'element', s.element, 'urgence', s.urgence,
             'description', s.description, 'nb_photos', jsonb_array_length(s.photos),
             'statut', coalesce(case when i.statut in ('signale', 'en_cours', 'resolu') then i.statut end, 'signale'),
             'dates', jsonb_build_object(
               'signale',  coalesce(i.legacy_raw->'statutDates'->>'signale', s.cree_le::text),
               'en_cours', i.legacy_raw->'statutDates'->>'en_cours',
               'resolu',   i.legacy_raw->'statutDates'->>'resolu'))
           order by s.cree_le desc)
    from public.locataire_signalements s
    left join lateral (select x.statut, x.legacy_raw from public.incidents x where x.espace_id = s.espace_id and x.logement_id = s.logement_id
                        and x.legacy_id = s.incident_legacy_id and x.deleted_at is null limit 1) i on true
    where s.acces_id = a.id), '[]'::jsonb);
end;
$$;

create or replace function public.el_messages(p_jeton_sha256 text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype; r jsonb;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  if public._el_phase(a.fin_bail, a.comptes_clos_le, current_date) = 'documents' then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', m.id, 'auteur', m.auteur, 'corps', m.corps, 'cree_le', m.cree_le, 'signalement_id', m.signalement_id,
           'lu', case when m.auteur = 'locataire' then m.lu_bailleur_le is not null else m.lu_locataire_le is not null end,
           'pieces', (select coalesce(jsonb_agg(jsonb_build_object('nom', p->>'nom', 'mime', p->>'mime', 'taille', p->'taille')), '[]'::jsonb)
                      from jsonb_array_elements(m.pieces) p))
         order by m.cree_le), '[]'::jsonb) into r
  from (select * from public.locataire_messages where acces_id = a.id order by cree_le desc limit 200) m;
  update public.locataire_messages set lu_locataire_le = now()
   where acces_id = a.id and auteur = 'bailleur' and lu_locataire_le is null;
  return r;
end;
$$;

create or replace function public.el_message_envoyer(p_jeton_sha256 text, p_ip_hash text, p_corps text, p_pieces jsonb, p_signalement_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype; v_id uuid; x jsonb;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  if public._el_phase(a.fin_bail, a.comptes_clos_le, current_date) not in ('complet', 'depart') then
    raise exception 'el:ferme' using errcode = 'P0001';
  end if;
  if (select count(*) from public.locataire_messages m where m.acces_id = a.id and m.auteur = 'locataire'
        and m.cree_le > now() - interval '24 hours') >= 50 then
    raise exception 'el:limite' using errcode = 'P0001';
  end if;
  insert into public.locataire_messages (acces_id, auteur, auteur_uid, corps, pieces, signalement_id)
  values (a.id, 'locataire', null, btrim(p_corps), public._el_pieces_serveur(a.id, p_pieces), p_signalement_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- E-mail d'un colocataire, cherché par son NOM dans le bail de la location (repli : bail mono-locataire ancien).
create or replace function public._el_email_du_locataire(a public.locataire_acces)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select e->>'email' from public.baux b, jsonb_array_elements(case when jsonb_typeof(b.locataires) = 'array' then b.locataires else '[]'::jsonb end) e
      where b.id = a.bail_id and b.date_debut is not distinct from a.bail_debut
        and public._el_cle_nom(e->>'nom') = public._el_cle_nom(a.locataire_nom) limit 1),
    (select b.legacy_raw->>'email' from public.baux b
      where b.id = a.bail_id and b.date_debut is not distinct from a.bail_debut
        and jsonb_array_length(case when jsonb_typeof(b.locataires) = 'array' then b.locataires else '[]'::jsonb end) = 0));
$$;
revoke all on function public._el_email_du_locataire(public.locataire_acces) from public, anon, authenticated;

-- Adresse e-mail du locataire de CET accès (code à usage unique pour l'accord, D10 — seulement quand l'envoi d'e-mails
-- sera actif). Lue dans le bail de la location ; jamais renvoyée au navigateur par le relais (il n'en montre qu'un masque).
create or replace function public.el_contact(p_jeton_sha256 text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype; v_mail text;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  v_mail := public._el_email_du_locataire(a);
  v_mail := lower(btrim(coalesce(v_mail, '')));
  if v_mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_mail) > 254 then return jsonb_build_object('email', null); end if;
  return jsonb_build_object('email', v_mail);
end;
$$;

do $g$
declare f text;
begin
  foreach f in array array[
    'el_contact(text, text)', 'el_depot_fin(text, text, text, text, bigint)', 'el_ouvrir(text, text)', 'el_documents(text, text)', 'el_fichier(text, text, text, uuid, int)', 'el_depot(text, text, text)',
    'el_accord(text, text, boolean, text, boolean)', 'el_signaler(text, text, text, text, text, text, jsonb)',
    'el_signalements(text, text)', 'el_messages(text, text)', 'el_message_envoyer(text, text, text, jsonb, uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);   -- _el_acces refuse tout sauf le relais
  end loop;
end
$g$;

-- ═══════════════════════════════════════════ 7. Stockage : lecture / dépôt par l'identité du relais ════════════════
create or replace function public.el_objet_ouvert(p_name text, p_mode text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._el_relais_ok() and exists (
    select 1 from public.locataire_ouvertures o
    where o.storage_path = p_name and o.mode = p_mode and o.jusqu_au > now());
$$;
revoke all on function public.el_objet_ouvert(text, text) from public, anon;
grant execute on function public.el_objet_ouvert(text, text) to authenticated;

create policy "espace-files: lecture espace locataire (relais, 60 s)"
  on storage.objects for select to authenticated
  using ( bucket_id = 'espace-files'
          and (public.el_objet_ouvert(name, 'lecture') or public.el_objet_ouvert(name, 'depot')) );   -- dépôt : l'API Storage relit l'objet créé

create policy "espace-files: dépôt espace locataire (relais, sous ticket)"
  on storage.objects for insert to authenticated
  with check ( bucket_id = 'espace-files' and public.el_objet_ouvert(name, 'depot') );

commit;
