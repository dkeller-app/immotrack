-- 0060 (NUMÉRO RÉSERVÉ — le pilotage fixe le numéro définitif) — CIRCUIT D'UN INCIDENT : locataire → artisan → fin.
-- CDC : docs/CDC-INCIDENT-CIRCUIT.md (décisions D1 → D18, GO Didier 14/10/2026).
--
-- 1. CARNET D'ARTISANS (D5) : table `artisans` synchronisée comme `incidents` (legacy_raw), par SCI (RLS 0052). La note
--    privée du propriétaire y vit : visible de lui et des associés de la SCI seulement, jamais publiée (CDC § 13).
-- 2. LIEN DE L'ARTISAN (D13, D14) — même frontière que l'espace locataire (0059, option C) :
--    • l'artisan n'a AUCUN compte ; il ne parle qu'au relais, qui calcule SHA-256(jeton) et appelle les SEULES fonctions
--      ar_* « côté artisan », sous l'IDENTITÉ TECHNIQUE du relais (table el_relais de 0059, même compte) ;
--    • chaque fonction ar_* côté artisan commence par _ar_acces(empreinte) : lien trouvé, non révoqué, non expiré
--      (30 jours après la validation finale, 90 jours au plus après l'émission), incident encore vivant — sinon NULL
--      → « lien inactif », aucune donnée ;
--    • l'artisan ne voit QUE la demande MINIMISÉE composée par l'app du propriétaire (adresse, accès, contact du
--      locataire avec son accord, description, photos) et ses propres dépôts. Jamais le bail, le loyer, le verdict ;
--    • photos de la demande : chemins contrôlés à l'émission (espace et SCI de l'incident) ; ouvertes 60 s, une à une ;
--    • ses dépôts (devis, facture, photos) : sous ticket, chemin imposé <espace>/<sci>/files/ar-<lien>-<uuid>.<ext>.
-- 3. PLAFOND (D1, D3) : figé sur le lien à l'émission par un membre EN ÉCRITURE. Un devis déposé est « accepté
--    automatiquement » par la base si son montant TTC est ≤ ce plafond (> 0), sinon « en attente » de la réponse du
--    propriétaire (ar_devis_decider). Règle miroir JS : decisionDevis (js/core/incident-circuit.js), testée.
-- 4. ESPACE LOCATAIRE : le signalement porte l'aide de l'IA, l'accord pour transmettre le téléphone (D13), l'accès et
--    les présences ; le suivi montre l'entreprise et le créneau (D12) et, APRÈS la validation du propriétaire, le
--    résultat publié ; le locataire confirme le créneau (accord exprès exigé un samedi ou un dimanche, art. 7 e).
-- 5. IA des liens publics (D15) : el_ia_autorise / ar_ia_autorise renvoient le compte du propriétaire qui a émis le lien
--    (le relais impute la consommation à ce compte).
--
-- ORDRE DE DÉPLOIEMENT : 0060 → relais → front. Dépend de 0001, 0009, 0024 (espace-files, safe_uuid), 0029/0030/0053
-- (has_entite_*, entite_of_*), 0052 (has_entite_*_all), 0057 (incidents), 0059 (el_relais, _el_relais_ok, _el_acces,
-- _el_phase, _el_pieces_serveur, locataire_*).

begin;

-- ═══════════════════════════════════════════ 1. Carnet d'artisans ═══════════════════════════════════════════════════
create table public.artisans (
  id          uuid primary key default gen_random_uuid(),
  espace_id   uuid not null references public.espaces(id) on delete cascade,
  legacy_id   text,
  entite_id   uuid,                                  -- artisan.entity (SCI) — nullable : membres pleins seulement
  legacy_raw  jsonb,                                 -- fiche complète (métiers, téléphone, e-mail, note privée…)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     bigint not null default 1,
  created_by  uuid default auth.uid() references auth.users(id),
  constraint artisans_id_espace_unique unique (id, espace_id),
  constraint artisans_entite_fk foreign key (entite_id, espace_id) references public.entites (id, espace_id)
);
create index artisans_by_espace_entite on public.artisans (espace_id, entite_id);
create trigger trg_touch_artisans before update on public.artisans for each row execute function public.touch_row();
create trigger trg_freeze_espace_id before update on public.artisans for each row execute function public.freeze_espace_id();
alter table public.artisans enable row level security;
alter table public.artisans force  row level security;
create policy artisans_select on public.artisans for select to authenticated
  using ( public.has_entite_access_all(espace_id, entite_id, null, null) );
create policy artisans_insert on public.artisans for insert to authenticated
  with check ( public.has_entite_write_all(espace_id, entite_id, null, null) );
create policy artisans_update on public.artisans for update to authenticated
  using      ( public.has_entite_write_all(espace_id, entite_id, null, null) )
  with check ( public.has_entite_write_all(espace_id, entite_id, null, null) );
create policy artisans_delete on public.artisans for delete to authenticated
  using ( public.has_entite_write_all(espace_id, entite_id, null, null) );

-- ═══════════════════════════════════════════ 2. Lien de l'artisan ═══════════════════════════════════════════════════
create table public.artisan_acces (
  id                     uuid primary key default gen_random_uuid(),
  espace_id              uuid not null references public.espaces(id) on delete cascade,
  entite_id              uuid,                       -- rattachements DÉDUITS de la ligne incident (jamais du client)
  logement_id            uuid,
  immeuble_id            uuid,
  incident_legacy_id     text not null check (incident_legacy_id ~ '^[0-9]{1,20}$'),
  signalement_id         uuid references public.locataire_signalements(id) on delete set null,
  artisan_nom            text not null check (char_length(btrim(artisan_nom)) between 1 and 160),
  artisan_email          text check (artisan_email is null or (char_length(artisan_email) <= 254 and artisan_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  artisan_tel            text check (artisan_tel is null or artisan_tel ~ '^[+0-9 .()-]{6,30}$'),
  metier                 text check (metier is null or metier ~ '^[a-z_]{2,30}$'),
  plafond_ttc            numeric(10,2) not null default 0 check (plafond_ttc between 0 and 100000),
  demande                jsonb not null check (jsonb_typeof(demande) = 'object' and octet_length(demande::text) <= 20000),
  emis_le                timestamptz not null default now(),
  emis_par               uuid default auth.uid() references auth.users(id),
  revoque_le             timestamptz,
  revoque_par            uuid references auth.users(id),
  valide_le              timestamptz,                -- validation finale du propriétaire → fin du lien 30 jours après
  derniere_visite        timestamptz,
  creneau_date           date,
  creneau_debut          time,
  creneau_fin            time,
  creneau_propose_le     timestamptz,
  creneau_confirme_le    timestamptz,                -- écrit par le LOCATAIRE seulement (el_creneau_confirmer)
  creneau_accord_expres  boolean not null default false,
  constat                text check (constat is null or constat in ('usure', 'entretien_non_fait', 'casse', 'defaut', 'exterieure', 'sinistre')),
  constat_sous_type      text check (constat_sous_type is null or constat_sous_type in ('tiers', 'evenement')),
  constat_ampleur        text check (constat_ampleur is null or constat_ampleur in ('petite', 'complet', 'entretien')),
  constat_resume         text check (constat_resume is null or char_length(constat_resume) <= 1000),
  constat_le             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  version                bigint not null default 1,
  constraint artisan_acces_id_espace_unique unique (id, espace_id),
  constraint artisan_acces_creneau_chk check (creneau_fin is null or creneau_debut is null or creneau_fin > creneau_debut),
  constraint artisan_acces_entite_fk   foreign key (entite_id, espace_id)   references public.entites   (id, espace_id),
  constraint artisan_acces_logement_fk foreign key (logement_id, espace_id) references public.logements (id, espace_id),
  constraint artisan_acces_immeuble_fk foreign key (immeuble_id, espace_id) references public.immeubles (id, espace_id)
);
create index artisan_acces_by_incident on public.artisan_acces (espace_id, incident_legacy_id);
create index artisan_acces_by_signalement on public.artisan_acces (signalement_id);
create trigger trg_touch_artisan_acces before update on public.artisan_acces for each row execute function public.touch_row();
create trigger trg_freeze_espace_artisan_acces before update on public.artisan_acces for each row execute function public.freeze_espace_id();

create table public.artisan_acces_jeton (
  acces_id      uuid primary key references public.artisan_acces(id) on delete cascade,
  jeton_sha256  bytea not null unique check (octet_length(jeton_sha256) = 32)
);

create table public.artisan_depots (
  id            uuid primary key default gen_random_uuid(),
  acces_id      uuid not null references public.artisan_acces(id) on delete cascade,
  espace_id     uuid not null references public.espaces(id) on delete cascade,
  entite_id     uuid,
  logement_id   uuid,
  immeuble_id   uuid,
  type_depot    text not null check (type_depot in ('devis', 'facture', 'photo')),
  storage_path  text not null check (char_length(storage_path) between 40 and 600 and storage_path !~ '(^/|\.\.|//|\\)'),
  nom           text check (nom is null or char_length(nom) <= 120),
  mime          text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png')),
  sha256        text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  taille        bigint check (taille is null or taille between 1 and 10485760),
  montant_ttc   numeric(10,2) check (montant_ttc is null or montant_ttc between 0 and 1000000),
  numero        text check (numero is null or char_length(numero) <= 60),
  statut        text check (statut is null or statut in ('auto_accepte', 'en_attente', 'accepte', 'refuse')),
  decide_le     timestamptz,
  decide_par    uuid references auth.users(id),
  cree_le       timestamptz not null default now(),
  constraint artisan_depots_devis_chk check ((type_depot = 'devis') = (statut is not null)),
  constraint artisan_depots_photo_chk check (type_depot <> 'photo' or montant_ttc is null),
  constraint artisan_depots_chemin_unique unique (acces_id, storage_path)
);
create index artisan_depots_by_acces on public.artisan_depots (acces_id, cree_le);

create table public.artisan_ouvertures (
  id            bigint generated always as identity primary key,
  acces_id      uuid not null references public.artisan_acces(id) on delete cascade,
  storage_path  text not null,
  mode          text not null check (mode in ('lecture', 'depot')),
  jusqu_au      timestamptz not null,
  sha256        text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  taille        bigint check (taille is null or taille between 1 and 10485760),
  cree_le       timestamptz not null default now()
);
create index artisan_ouvertures_by_path on public.artisan_ouvertures (storage_path, mode, jusqu_au);
create index artisan_ouvertures_by_acces on public.artisan_ouvertures (acces_id, mode, cree_le);

-- Dépôts : rattachements copiés du lien (jamais du client) ; gelés ensuite.
create or replace function public._ar_depot_coherence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare a public.artisan_acces%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.acces_id <> old.acces_id or new.espace_id <> old.espace_id or new.storage_path <> old.storage_path
       or new.type_depot <> old.type_depot or new.montant_ttc is distinct from old.montant_ttc then
      raise exception 'ar:depot-gele' using errcode = '42501';
    end if;
    return new;
  end if;
  select * into a from public.artisan_acces where id = new.acces_id;
  if not found then raise exception 'ar:interdit' using errcode = '42501'; end if;
  new.espace_id := a.espace_id; new.entite_id := a.entite_id; new.logement_id := a.logement_id; new.immeuble_id := a.immeuble_id;
  return new;
end;
$$;
create trigger trg_ar_depot_coherence before insert or update on public.artisan_depots
  for each row execute function public._ar_depot_coherence();

-- ═══════════════════════════════════════════ 3. Espace locataire : colonnes nouvelles ═══════════════════════════════
alter table public.locataire_signalements
  add column ia                 jsonb check (ia is null or (jsonb_typeof(ia) = 'object' and octet_length(ia::text) <= 8000)),
  add column tel_partage        boolean not null default false,
  add column telephone          text check (telephone is null or telephone ~ '^[+0-9 .()-]{6,30}$'),
  add column acces_info         text check (acces_info is null or char_length(acces_info) <= 300),
  add column presence           text check (presence is null or char_length(presence) <= 300),
  add column resultat           jsonb check (resultat is null or (jsonb_typeof(resultat) = 'object' and octet_length(resultat::text) <= 20000)),
  add column resultat_publie_le timestamptz;
-- Le propriétaire (droit d'écriture sur la SCI, politique 0059) publie le résultat ; rien d'autre ne change.
grant update (resultat, resultat_publie_le) on public.locataire_signalements to authenticated;

-- ═══════════════════════════════════════════ 4. RLS + droits ═════════════════════════════════════════════════════════
alter table public.artisan_acces       enable row level security;  alter table public.artisan_acces       force row level security;
alter table public.artisan_acces_jeton enable row level security;  alter table public.artisan_acces_jeton force row level security;
alter table public.artisan_depots      enable row level security;  alter table public.artisan_depots      force row level security;
alter table public.artisan_ouvertures  enable row level security;  alter table public.artisan_ouvertures  force row level security;

create policy artisan_acces_jeton_aucune on public.artisan_acces_jeton for select to authenticated using (false);
create policy artisan_ouvertures_aucune  on public.artisan_ouvertures  for select to authenticated using (false);
create policy artisan_acces_select on public.artisan_acces for select to authenticated
  using ( public.has_entite_access_all(espace_id, entite_id, logement_id, immeuble_id) );
create policy artisan_depots_select on public.artisan_depots for select to authenticated
  using ( public.has_entite_access_all(espace_id, entite_id, logement_id, immeuble_id) );

-- Tout changement passe par les fonctions (security definer) : aucune écriture directe.
revoke all on public.artisan_acces, public.artisan_acces_jeton, public.artisan_depots, public.artisan_ouvertures from anon, authenticated;
grant select on public.artisan_acces, public.artisan_depots to authenticated;

-- ═══════════════════════════════════════════ 5. Fonctions côté propriétaire ══════════════════════════════════════════
-- Fin de validité d'un lien (D14). Miroir JS : expirationLien.
create or replace function public._ar_fin(p_emis timestamptz, p_valide timestamptz)
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select least(p_emis + interval '90 days', coalesce(p_valide + interval '30 days', 'infinity'::timestamptz)); $$;
revoke all on function public._ar_fin(timestamptz, timestamptz) from public, anon;
grant execute on function public._ar_fin(timestamptz, timestamptz) to authenticated;

-- Photos de la demande : chemins du dossier de l'incident, dans l'espace ET la SCI de l'incident (un associé scopé ne
-- peut pas rendre lisible, par le lien d'un artisan, un fichier d'une autre SCI). Fichiers sans SCI (orphelins, anciens
-- chemins) : membre plein seulement. 6 photos au plus.
create or replace function public._ar_photos_valides(p_photos jsonb, p_espace uuid, p_entite uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare x jsonb; p text; s2 text;
begin
  if p_photos is null then return true; end if;
  if jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) > 6 then return false; end if;
  for x in select e from jsonb_array_elements(p_photos) e loop
    if jsonb_typeof(x) <> 'object' then return false; end if;
    p := x->>'path';
    if p is null or char_length(p) not between 40 and 600 or p ~ '(^/|\.\.|//|\\)' or p !~ '\.(jpg|jpeg|png|pdf)$' then return false; end if;
    if split_part(p, '/', 1) <> p_espace::text then return false; end if;
    s2 := split_part(p, '/', 2);
    if p_entite is not null and s2 = p_entite::text and split_part(p, '/', 3) = 'files' then continue; end if;
    if s2 in ('_orphelin', 'files') and public.is_full_manager(p_espace) then continue; end if;
    return false;
  end loop;
  return true;
end;
$$;
revoke all on function public._ar_photos_valides(jsonb, uuid, uuid) from public, anon, authenticated;

-- Émettre (ou RENOUVELER : même incident, même entreprise → nouvelle empreinte, l'ancien lien cesse aussitôt) le lien
-- d'un artisan. Rattachements DÉDUITS de la ligne incident ; droit d'écriture exigé sur chacun ; jeton tiré dans le
-- navigateur, seule l'empreinte arrive ici.
create or replace function public.ar_acces_emettre(
  p_espace_id uuid, p_incident_legacy_id text, p_signalement_id uuid, p_artisan_nom text, p_artisan_email text,
  p_artisan_tel text, p_metier text, p_plafond_ttc numeric, p_demande jsonb, p_jeton_sha256 text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  i record; v_ent uuid; v_id uuid;
begin
  if p_jeton_sha256 is null or p_jeton_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'ar:empreinte-invalide' using errcode = '22023'; end if;
  if p_artisan_nom is null or char_length(btrim(p_artisan_nom)) not between 1 and 160 then raise exception 'ar:nom-invalide' using errcode = '22023'; end if;
  if p_plafond_ttc is null or p_plafond_ttc < 0 or p_plafond_ttc > 100000 then raise exception 'ar:plafond-invalide' using errcode = '22023'; end if;
  if p_demande is null or jsonb_typeof(p_demande) <> 'object' then raise exception 'ar:demande-invalide' using errcode = '22023'; end if;
  select x.espace_id, x.entite_id, x.logement_id, x.immeuble_id into i
    from public.incidents x where x.espace_id = p_espace_id and x.legacy_id = p_incident_legacy_id and x.deleted_at is null;
  if not found or not public.has_entite_write_all(i.espace_id, i.entite_id, i.logement_id, i.immeuble_id) then
    raise exception 'ar:interdit' using errcode = '42501';
  end if;
  v_ent := coalesce(i.entite_id, public.entite_of_logement(i.espace_id, i.logement_id), public.entite_of_immeuble(i.espace_id, i.immeuble_id));
  if not public._ar_photos_valides(p_demande->'photos', i.espace_id, v_ent) then raise exception 'ar:photo-invalide' using errcode = '23514'; end if;
  if p_signalement_id is not null and not exists (select 1 from public.locataire_signalements s
       where s.id = p_signalement_id and s.espace_id = i.espace_id and s.incident_legacy_id = p_incident_legacy_id) then
    raise exception 'ar:signalement-hors-incident' using errcode = '23514';
  end if;
  select a.id into v_id from public.artisan_acces a
   where a.espace_id = i.espace_id and a.incident_legacy_id = p_incident_legacy_id and a.revoque_le is null
     and lower(btrim(a.artisan_nom)) = lower(btrim(p_artisan_nom)) and now() < public._ar_fin(a.emis_le, a.valide_le)
   order by a.emis_le desc limit 1;
  if v_id is null then
    insert into public.artisan_acces (espace_id, entite_id, logement_id, immeuble_id, incident_legacy_id, signalement_id,
                                      artisan_nom, artisan_email, artisan_tel, metier, plafond_ttc, demande)
    values (i.espace_id, i.entite_id, i.logement_id, i.immeuble_id, p_incident_legacy_id, p_signalement_id,
            btrim(p_artisan_nom), nullif(lower(btrim(coalesce(p_artisan_email, ''))), ''), nullif(btrim(coalesce(p_artisan_tel, '')), ''),
            p_metier, p_plafond_ttc, p_demande)
    returning id into v_id;
  else
    update public.artisan_acces set demande = p_demande, plafond_ttc = p_plafond_ttc, metier = p_metier,
           artisan_email = nullif(lower(btrim(coalesce(p_artisan_email, ''))), ''), artisan_tel = nullif(btrim(coalesce(p_artisan_tel, '')), ''),
           signalement_id = coalesce(p_signalement_id, signalement_id), emis_le = now(), emis_par = (select auth.uid())
     where id = v_id;
    delete from public.artisan_acces_jeton where acces_id = v_id;
  end if;
  insert into public.artisan_acces_jeton (acces_id, jeton_sha256) values (v_id, decode(p_jeton_sha256, 'hex'));
  return v_id;
end;
$$;

create or replace function public.ar_acces_revoquer(p_acces_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare a public.artisan_acces%rowtype;
begin
  select * into a from public.artisan_acces where id = p_acces_id;
  if not found or not public.has_entite_write_all(a.espace_id, a.entite_id, a.logement_id, a.immeuble_id) then
    raise exception 'ar:interdit' using errcode = '42501';
  end if;
  update public.artisan_acces set revoque_le = now(), revoque_par = (select auth.uid()) where id = a.id;
  delete from public.artisan_acces_jeton where acces_id = a.id;
end;
$$;

-- Validation finale par le propriétaire : le lien reste ouvert 30 jours (facture tardive), puis expire (D14).
create or replace function public.ar_acces_valider(p_acces_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare a public.artisan_acces%rowtype;
begin
  select * into a from public.artisan_acces where id = p_acces_id;
  if not found or not public.has_entite_write_all(a.espace_id, a.entite_id, a.logement_id, a.immeuble_id) then
    raise exception 'ar:interdit' using errcode = '42501';
  end if;
  update public.artisan_acces set valide_le = coalesce(valide_le, now()) where id = a.id returning valide_le into a.valide_le;
  return public._ar_fin(a.emis_le, a.valide_le);
end;
$$;

-- Réponse du propriétaire à un devis AU-DESSUS du plafond (D3) : accepter ou refuser, en 1 clic. Un devis accepté
-- automatiquement n'est pas « re-décidé » ici.
create or replace function public.ar_devis_decider(p_depot_id uuid, p_accepte boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare d public.artisan_depots%rowtype;
begin
  if p_accepte is null then raise exception 'ar:decision-invalide' using errcode = '22023'; end if;
  select * into d from public.artisan_depots where id = p_depot_id;
  if not found or not public.has_entite_write_all(d.espace_id, d.entite_id, d.logement_id, d.immeuble_id) then
    raise exception 'ar:interdit' using errcode = '42501';
  end if;
  if d.type_depot <> 'devis' or d.statut <> 'en_attente' then raise exception 'ar:deja-decide' using errcode = 'P0001'; end if;
  update public.artisan_depots set statut = case when p_accepte then 'accepte' else 'refuse' end, decide_le = now(), decide_par = (select auth.uid())
   where id = d.id;
  return case when p_accepte then 'accepte' else 'refuse' end;
end;
$$;

-- Destinataire d'un e-mail envoyé par le relais à la demande d'un membre EN ÉCRITURE (jamais fourni par le client :
-- pas de relais d'e-mails ouvert). Lien inactif → NULL. Invitation : le jeton doit être celui de ce lien.
create or replace function public.ar_acces_contact(p_acces_id uuid, p_jeton_sha256 text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare a public.artisan_acces%rowtype; v_nom text;
begin
  select * into a from public.artisan_acces where id = p_acces_id;
  if not found or not public.has_entite_write_all(a.espace_id, a.entite_id, a.logement_id, a.immeuble_id) then
    raise exception 'ar:interdit' using errcode = '42501';
  end if;
  if a.revoque_le is not null or now() >= public._ar_fin(a.emis_le, a.valide_le) then return null; end if;
  if p_jeton_sha256 is not null and not exists (select 1 from public.artisan_acces_jeton j
       where j.acces_id = a.id and p_jeton_sha256 ~ '^[0-9a-f]{64}$' and j.jeton_sha256 = decode(p_jeton_sha256, 'hex')) then
    return null;
  end if;
  select e.nom into v_nom from public.entites e where e.id = coalesce(a.entite_id, public.entite_of_logement(a.espace_id, a.logement_id)) and e.espace_id = a.espace_id;
  return jsonb_build_object('email', a.artisan_email, 'bailleur', coalesce(v_nom, ''));
end;
$$;

revoke all on function public.ar_acces_emettre(uuid, text, uuid, text, text, text, text, numeric, jsonb, text) from public, anon;
grant execute on function public.ar_acces_emettre(uuid, text, uuid, text, text, text, text, numeric, jsonb, text) to authenticated;
revoke all on function public.ar_acces_revoquer(uuid) from public, anon;
grant execute on function public.ar_acces_revoquer(uuid) to authenticated;
revoke all on function public.ar_acces_valider(uuid) from public, anon;
grant execute on function public.ar_acces_valider(uuid) to authenticated;
revoke all on function public.ar_devis_decider(uuid, boolean) from public, anon;
grant execute on function public.ar_devis_decider(uuid, boolean) to authenticated;
revoke all on function public.ar_acces_contact(uuid, text) from public, anon;
grant execute on function public.ar_acces_contact(uuid, text) to authenticated;

-- ═══════════════════════════════════════════ 6. Fonctions côté artisan (identité du relais SEULEMENT) ════════════════
-- Résolution UNIQUE d'un lien. NULL = « lien inactif ». Jetons invalides comptés par IP (table de 0059, 20 / heure).
create or replace function public._ar_acces(p_jeton_sha256 text, p_ip_hash text)
returns public.artisan_acces
language plpgsql
security definer
set search_path = ''
as $$
declare a public.artisan_acces%rowtype; v_ip text;
begin
  if not public._el_relais_ok() then raise exception 'ar:interdit' using errcode = '42501'; end if;
  v_ip := case when p_ip_hash ~ '^[0-9a-f]{16,64}$' then p_ip_hash else null end;
  if p_jeton_sha256 ~ '^[0-9a-f]{64}$' then
    select x.* into a from public.artisan_acces x
      join public.artisan_acces_jeton j on j.acces_id = x.id
     where j.jeton_sha256 = decode(p_jeton_sha256, 'hex') and x.revoque_le is null and now() < public._ar_fin(x.emis_le, x.valide_le)
       and exists (select 1 from public.incidents i where i.espace_id = x.espace_id and i.legacy_id = x.incident_legacy_id and i.deleted_at is null);
    if found then return a; end if;
  end if;
  if v_ip is not null then
    if (select count(*) from public.locataire_tentatives t where t.ip_hash = v_ip and t.at > now() - interval '1 hour') >= 20 then
      raise exception 'el:limite' using errcode = 'P0001';
    end if;
    insert into public.locataire_tentatives (ip_hash) values (v_ip);
  end if;
  return null;
end;
$$;
revoke all on function public._ar_acces(text, text) from public, anon, authenticated;

create or replace function public._ar_prefixe(a public.artisan_acces)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.espace_id::text || '/'
         || coalesce(coalesce(a.entite_id, public.entite_of_logement(a.espace_id, a.logement_id), public.entite_of_immeuble(a.espace_id, a.immeuble_id))::text, '_orphelin')
         || '/files/ar-' || a.id::text || '-';
$$;
revoke all on function public._ar_prefixe(public.artisan_acces) from public, anon, authenticated;

-- La page de l'artisan : la demande minimisée (photos sans leur chemin), le plafond, le créneau, le constat, ses dépôts.
create or replace function public.ar_ouvrir(p_jeton_sha256 text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a public.artisan_acces%rowtype; v_nom text;
begin
  a := public._ar_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return jsonb_build_object('actif', false); end if;
  if a.derniere_visite is null or a.derniere_visite < now() - interval '1 hour' then
    update public.artisan_acces set derniere_visite = now() where id = a.id;
  end if;
  select e.nom into v_nom from public.entites e
   where e.id = coalesce(a.entite_id, public.entite_of_logement(a.espace_id, a.logement_id), public.entite_of_immeuble(a.espace_id, a.immeuble_id)) and e.espace_id = a.espace_id;
  return jsonb_build_object(
    'actif', true,
    'artisan', a.artisan_nom,
    'bailleur', coalesce(v_nom, ''),
    'plafond_ttc', a.plafond_ttc,
    'demande', (a.demande - 'photos') || jsonb_build_object('photos', (select coalesce(jsonb_agg(jsonb_build_object('index', o - 1, 'nom', coalesce(x->>'nom', 'photo'))), '[]'::jsonb)
                                                                   from jsonb_array_elements(case when jsonb_typeof(a.demande->'photos') = 'array' then a.demande->'photos' else '[]'::jsonb end) with ordinality as t(x, o))),
    'creneau', case when a.creneau_date is null then null else jsonb_build_object('date', a.creneau_date, 'debut', to_char(a.creneau_debut, 'HH24:MI'), 'fin', to_char(a.creneau_fin, 'HH24:MI'), 'confirme_le', a.creneau_confirme_le) end,
    'constat', case when a.constat is null then null else jsonb_build_object('constat', a.constat, 'sous_type', a.constat_sous_type, 'ampleur', a.constat_ampleur, 'resume', a.constat_resume, 'le', a.constat_le) end,
    'depots', (select coalesce(jsonb_agg(jsonb_build_object('id', d.id, 'type', d.type_depot, 'nom', d.nom, 'mime', d.mime, 'montant_ttc', d.montant_ttc, 'numero', d.numero, 'statut', d.statut, 'cree_le', d.cree_le) order by d.cree_le), '[]'::jsonb)
               from public.artisan_depots d where d.acces_id = a.id),
    'valide', a.valide_le is not null,
    'fin_lien', public._ar_fin(a.emis_le, a.valide_le));
end;
$$;

-- Ouvre UN fichier : une photo de la demande (par son rang) ou un dépôt de CE lien. Lecture autorisée 60 s.
create or replace function public.ar_fichier(p_jeton_sha256 text, p_ip_hash text, p_source text, p_index int, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a public.artisan_acces%rowtype; v_path text; v_nom text; v_mime text; x jsonb;
begin
  a := public._ar_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  if p_source = 'demande' then
    if p_index is null or p_index < 0 or p_index > 5 then return jsonb_build_object('absent', true); end if;
    x := a.demande->'photos'->p_index;
    v_path := x->>'path'; v_nom := coalesce(x->>'nom', 'photo');
    v_mime := case when v_path ~ '\.pdf$' then 'application/pdf' when v_path ~ '\.png$' then 'image/png' else 'image/jpeg' end;
    -- Le chemin a été contrôlé à l'émission (_ar_photos_valides, droits de l'émetteur). Ceinture : même espace.
    if v_path is null or split_part(v_path, '/', 1) <> a.espace_id::text or v_path ~ '(^/|\.\.|//|\\)' then
      return jsonb_build_object('absent', true);
    end if;
  elsif p_source = 'depot' then
    select d.storage_path, d.nom, d.mime into v_path, v_nom, v_mime from public.artisan_depots d where d.id = p_id and d.acces_id = a.id;
  end if;
  if v_path is null then return jsonb_build_object('absent', true); end if;
  insert into public.artisan_ouvertures (acces_id, storage_path, mode, jusqu_au) values (a.id, v_path, 'lecture', now() + interval '60 seconds');
  delete from public.artisan_ouvertures where jusqu_au < now() - interval '1 day';
  return jsonb_build_object('path', v_path, 'nom', coalesce(v_nom, 'document'), 'mime', v_mime);
end;
$$;

create or replace function public.ar_depot(p_jeton_sha256 text, p_ip_hash text, p_ext text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a public.artisan_acces%rowtype; v_path text;
begin
  a := public._ar_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  if p_ext not in ('jpg', 'png', 'pdf') then raise exception 'ar:type' using errcode = '22023'; end if;
  if (select count(*) from public.artisan_ouvertures o where o.acces_id = a.id and o.mode = 'depot' and o.cree_le > now() - interval '24 hours') >= 40 then
    raise exception 'el:limite' using errcode = 'P0001';
  end if;
  v_path := public._ar_prefixe(a) || gen_random_uuid()::text || '.' || p_ext;
  insert into public.artisan_ouvertures (acces_id, storage_path, mode, jusqu_au) values (a.id, v_path, 'depot', now() + interval '5 minutes');
  return jsonb_build_object('path', v_path);
end;
$$;

create or replace function public.ar_depot_fin(p_jeton_sha256 text, p_ip_hash text, p_path text, p_sha256 text, p_taille bigint)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare a public.artisan_acces%rowtype;
begin
  a := public._ar_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  update public.artisan_ouvertures set sha256 = p_sha256, taille = p_taille
   where acces_id = a.id and storage_path = p_path and mode = 'depot' and sha256 is null and cree_le > now() - interval '1 hour';
  return found;
end;
$$;

-- Enregistre un devis, une facture ou une photo déposé sous ticket par CE lien (24 h). Le statut d'un devis est décidé
-- ICI (plafond figé sur le lien) : ≤ plafond (> 0) → accepté automatiquement ; sinon → en attente du propriétaire.
create or replace function public.ar_document(p_jeton_sha256 text, p_ip_hash text, p_type text, p_path text, p_nom text,
                                              p_montant_ttc numeric, p_numero text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a public.artisan_acces%rowtype; o record; v_statut text; v_id uuid;
begin
  a := public._ar_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  if p_type not in ('devis', 'facture', 'photo') then raise exception 'ar:type' using errcode = '22023'; end if;
  if p_type in ('devis', 'facture') and (p_montant_ttc is null or p_montant_ttc <= 0 or p_montant_ttc > 1000000) then
    raise exception 'ar:montant' using errcode = '22023';
  end if;
  if (select count(*) from public.artisan_depots d where d.acces_id = a.id) >= 30 then raise exception 'el:limite' using errcode = 'P0001'; end if;
  select oo.storage_path, oo.sha256, oo.taille into o from public.artisan_ouvertures oo
   where oo.acces_id = a.id and oo.storage_path = p_path and oo.mode = 'depot' and oo.cree_le > now() - interval '24 hours' and oo.sha256 is not null
   order by oo.cree_le desc limit 1;
  if not found then raise exception 'ar:piece-invalide' using errcode = '23514'; end if;
  v_statut := case when p_type <> 'devis' then null
                   when a.plafond_ttc > 0 and p_montant_ttc <= a.plafond_ttc then 'auto_accepte' else 'en_attente' end;
  insert into public.artisan_depots (acces_id, espace_id, type_depot, storage_path, nom, mime, sha256, taille, montant_ttc, numero, statut, decide_le)
  values (a.id, a.espace_id, p_type, o.storage_path, left(coalesce(nullif(btrim(coalesce(p_nom, '')), ''), p_type), 120),
          case when o.storage_path like '%.pdf' then 'application/pdf' when o.storage_path like '%.png' then 'image/png' else 'image/jpeg' end,
          o.sha256, o.taille, case when p_type = 'photo' then null else round(p_montant_ttc, 2) end,
          nullif(left(btrim(coalesce(p_numero, '')), 60), ''), v_statut, case when v_statut = 'auto_accepte' then now() end)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'statut', v_statut);
end;
$$;

-- Créneau proposé par l'artisan (le locataire le confirme). Un nouveau créneau annule la confirmation précédente.
create or replace function public.ar_creneau(p_jeton_sha256 text, p_ip_hash text, p_date date, p_debut time, p_fin time)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare a public.artisan_acces%rowtype;
begin
  a := public._ar_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  if p_date is null or p_date < current_date - 1 or p_date > current_date + 180 then raise exception 'ar:date' using errcode = '22023'; end if;
  if p_debut is not null and p_fin is not null and p_fin <= p_debut then raise exception 'ar:heure' using errcode = '22023'; end if;
  update public.artisan_acces set creneau_date = p_date, creneau_debut = p_debut, creneau_fin = p_fin, creneau_propose_le = now(),
         creneau_confirme_le = null, creneau_accord_expres = false
   where id = a.id;
  return true;
end;
$$;

-- Constat NEUTRE de l'artisan (proposé par l'IA, confirmé par lui). Il ne voit jamais la répartition.
create or replace function public.ar_constat(p_jeton_sha256 text, p_ip_hash text, p_constat text, p_sous_type text, p_ampleur text, p_resume text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare a public.artisan_acces%rowtype;
begin
  a := public._ar_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  if a.valide_le is not null then raise exception 'el:ferme' using errcode = 'P0001'; end if;   -- déjà validé par le propriétaire
  update public.artisan_acces set constat = p_constat, constat_sous_type = case when p_constat = 'exterieure' then coalesce(p_sous_type, 'tiers') end,
         constat_ampleur = p_ampleur, constat_resume = nullif(left(btrim(coalesce(p_resume, '')), 1000), ''), constat_le = now()
   where id = a.id;
  return true;
end;
$$;

-- IA d'un lien public (D15) : le compte du propriétaire qui a émis le lien (le relais lui impute la consommation).
create or replace function public.ar_ia_autorise(p_jeton_sha256 text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a public.artisan_acces%rowtype;
begin
  a := public._ar_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null or a.emis_par is null then return null; end if;
  return jsonb_build_object('proprietaire', a.emis_par, 'lien', a.id);
end;
$$;

-- ═══════════════════════════════════════════ 7. Espace locataire : fonctions mises à jour ════════════════════════════
create or replace function public.el_ia_autorise(p_jeton_sha256 text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null or a.emis_par is null then return null; end if;
  if public._el_phase(a.fin_bail, a.comptes_clos_le, current_date) <> 'complet' then return null; end if;
  return jsonb_build_object('proprietaire', a.emis_par, 'lien', a.id);
end;
$$;

-- Signaler : mêmes contrôles qu'en 0059, plus l'aide de l'IA, l'accord pour le téléphone, l'accès et les présences.
-- (Nouvelle signature : l'ancienne est retirée, sinon PostgREST ne saurait laquelle appeler.)
drop function if exists public.el_signaler(text, text, text, text, text, text, jsonb);
create or replace function public.el_signaler(p_jeton_sha256 text, p_ip_hash text, p_piece text, p_element text,
                                             p_urgence text, p_description text, p_photos jsonb,
                                             p_ia jsonb default null, p_tel_partage boolean default false, p_telephone text default null,
                                             p_acces_info text default null, p_presence text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype; v_id uuid;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  if public._el_phase(a.fin_bail, a.comptes_clos_le, current_date) <> 'complet' then
    raise exception 'el:ferme' using errcode = 'P0001';
  end if;
  if (select count(*) from public.locataire_signalements s where s.acces_id = a.id and s.cree_le > now() - interval '24 hours') >= 10 then
    raise exception 'el:limite' using errcode = 'P0001';
  end if;
  insert into public.locataire_signalements (acces_id, piece, element, urgence, description, photos, ia, tel_partage, telephone, acces_info, presence)
  values (a.id, p_piece, p_element, p_urgence, btrim(p_description), public._el_pieces_serveur(a.id, p_photos),
          case when jsonb_typeof(p_ia) = 'object' then p_ia end, coalesce(p_tel_partage, false) and nullif(btrim(coalesce(p_telephone, '')), '') is not null,
          case when coalesce(p_tel_partage, false) then nullif(btrim(coalesce(p_telephone, '')), '') end,
          nullif(left(btrim(coalesce(p_acces_info, '')), 300), ''), nullif(left(btrim(coalesce(p_presence, '')), 300), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Lien d'artisan COURANT d'un signalement (le plus récent, actif).
create or replace function public._el_intervention(p_sig public.locataire_signalements)
returns public.artisan_acces
language sql
stable
security definer
set search_path = ''
as $$
  select x.* from public.artisan_acces x
   where x.espace_id = p_sig.espace_id and x.revoque_le is null
     and (x.signalement_id = p_sig.id or (p_sig.incident_legacy_id is not null and x.incident_legacy_id = p_sig.incident_legacy_id
          and (x.logement_id = p_sig.logement_id or (x.logement_id is null and x.entite_id is not distinct from p_sig.entite_id))))
   order by x.emis_le desc limit 1;
$$;
revoke all on function public._el_intervention(public.locataire_signalements) from public, anon, authenticated;

-- Suivi : statut et dates (0059) + entreprise et créneau dès « Intervention prévue » (D12) + résultat PUBLIÉ par le
-- propriétaire après sa validation. JAMAIS le verdict avant cette publication, ni le payeur, ni le coût.
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
               'resolu',   i.legacy_raw->'statutDates'->>'resolu'),
             'intervention', case when x.id is null then null else jsonb_build_object(
               'entreprise', x.artisan_nom,
               'creneau', case when x.creneau_date is null then null else jsonb_build_object('date', x.creneau_date, 'debut', to_char(x.creneau_debut, 'HH24:MI'), 'fin', to_char(x.creneau_fin, 'HH24:MI')) end,
               'confirme_le', x.creneau_confirme_le, 'accord_expres', x.creneau_accord_expres) end,
             'resultat', case when s.resultat_publie_le is not null then s.resultat end,
             'resultat_publie_le', s.resultat_publie_le)
           order by s.cree_le desc)
    from public.locataire_signalements s
    left join lateral (select y.statut, y.legacy_raw from public.incidents y where y.espace_id = s.espace_id
                        and (y.logement_id = s.logement_id or (y.logement_id is null and y.entite_id is not distinct from s.entite_id))
                        and y.legacy_id = s.incident_legacy_id and y.deleted_at is null limit 1) i on true
    left join lateral (select (public._el_intervention(s)).*) x on true
    where s.acces_id = a.id), '[]'::jsonb);
end;
$$;

-- Le locataire confirme le créneau proposé par l'artisan. Un samedi ou un dimanche : accord exprès exigé (art. 7 e de la
-- loi n° 89-462). Les jours fériés sont signalés par la page (règle JS exigeAccordExpres) et l'accord y est demandé.
create or replace function public.el_creneau_confirmer(p_jeton_sha256 text, p_ip_hash text, p_signalement_id uuid, p_accord_expres boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare a public.locataire_acces%rowtype; s public.locataire_signalements%rowtype; x public.artisan_acces%rowtype;
begin
  a := public._el_acces(p_jeton_sha256, p_ip_hash);
  if a.id is null then return null; end if;
  if public._el_phase(a.fin_bail, a.comptes_clos_le, current_date) not in ('complet', 'depart') then raise exception 'el:ferme' using errcode = 'P0001'; end if;
  select * into s from public.locataire_signalements where id = p_signalement_id and acces_id = a.id;
  if not found then return false; end if;
  x := public._el_intervention(s);
  if x.id is null or x.creneau_date is null or now() >= public._ar_fin(x.emis_le, x.valide_le) then return false; end if;
  if extract(isodow from x.creneau_date) in (6, 7) and not coalesce(p_accord_expres, false) then
    raise exception 'el:accord-requis' using errcode = '22023';
  end if;
  update public.artisan_acces set creneau_confirme_le = now(), creneau_accord_expres = coalesce(p_accord_expres, false) where id = x.id;
  return true;
end;
$$;

do $g$
declare f text;
begin
  foreach f in array array[
    'ar_ouvrir(text, text)', 'ar_fichier(text, text, text, int, uuid)', 'ar_depot(text, text, text)',
    'ar_depot_fin(text, text, text, text, bigint)', 'ar_document(text, text, text, text, text, numeric, text)',
    'ar_creneau(text, text, date, time, time)', 'ar_constat(text, text, text, text, text, text)', 'ar_ia_autorise(text, text)',
    'el_ia_autorise(text, text)', 'el_signaler(text, text, text, text, text, text, jsonb, jsonb, boolean, text, text, text)',
    'el_signalements(text, text)', 'el_creneau_confirmer(text, text, uuid, boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);   -- _ar_acces / _el_acces refusent tout sauf le relais
  end loop;
end
$g$;

-- ═══════════════════════════════════════════ 8. Stockage : lecture / dépôt par l'identité du relais ════════════════
create or replace function public.ar_objet_ouvert(p_name text, p_mode text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public._el_relais_ok() and exists (
    select 1 from public.artisan_ouvertures o
    where o.storage_path = p_name and o.mode = p_mode and o.jusqu_au > now());
$$;
revoke all on function public.ar_objet_ouvert(text, text) from public, anon;
grant execute on function public.ar_objet_ouvert(text, text) to authenticated;

create policy "espace-files: lecture lien artisan (relais, 60 s)"
  on storage.objects for select to authenticated
  using ( bucket_id = 'espace-files' and (public.ar_objet_ouvert(name, 'lecture') or public.ar_objet_ouvert(name, 'depot')) );

create policy "espace-files: dépôt lien artisan (relais, sous ticket)"
  on storage.objects for insert to authenticated
  with check ( bucket_id = 'espace-files' and public.ar_objet_ouvert(name, 'depot') );

commit;
