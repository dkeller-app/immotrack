-- 0062 — CONSOMMATION IA : compteurs ATOMIQUES et plafonds mensuels PAR COMPTE selon l'offre (chantier CONSO-IA).
-- GO Didier 16/10/2026 (« ok pour les 4, go conso ia ») ; maquette mockups/CONSO-IA/maquette.html.
--
-- Décisions :
--   D1 · le « compte » = l'utilisateur ; son offre = celle de l'espace qu'il a créé (espaces.created_by → plan_id).
--   D2 · le compteur vit ICI (Postgres) : une fonction verrouille la ligne du mois (SELECT … FOR UPDATE), donc des appels
--        lancés en parallèle par un même compte passent l'un après l'autre et ne dépassent pas le plafond.
--        Offres → plafonds (ia_plafonds_offre) et surcharges par compte (ia_surcharges) se modifient sans redéployer.
--   D3 · grille validée (Gratuit avec un petit essai d'IA) ; le garde-fou JOURNALIER reste dans le relais (wrangler.toml).
--   D4 · les espaces existants passent à l'offre « beta » ; l'administrateur reçoit une surcharge « sans plafond » ;
--        mois calendaire à l'heure de Paris.
--
-- Qui appelle quoi :
--   • ia_reserver / ia_consigner : SEULEMENT l'identité technique du relais (public.el_relais, migration 0059). Un
--     utilisateur connecté qui les appelle reçoit 42501 : il ne peut ni remettre son compteur à zéro ni gonfler celui
--     d'un autre.
--   • ia_mon_usage : l'utilisateur connecté, pour lui-même (compteurs et plafonds, aucun euro).
--   • ia_admin_* : seulement l'administrateur (public.is_app_admin(), table app_admins, 0038) ; chaque changement de
--     plafond est inscrit dans ia_admin_journal (append-only).
-- AUCUNE donnée personnelle de locataire ou de candidat : des compteurs par compte (identifiant d'utilisateur), par
-- fonction, par jour. L'effacement d'un compte efface ses compteurs (on delete cascade).
--
-- Durcissement inclus : l'offre d'un espace (plan_id et colonnes d'abonnement, 0019) n'est plus modifiable par un
-- utilisateur connecté (la politique espaces_update de 0003 laissait l'owner réécrire plan_id → contournement des
-- plafonds). Seuls le back-office (service_role / SQL) et les fonctions SECURITY DEFINER la changent.
--
-- Sans cette migration, le relais retombe sur ses plafonds journaliers (wrangler.toml) : jamais de blocage.
-- APPLICATION : node scripts/db-run.mjs migrate supabase/migrations/0062_ia_conso_plafonds.sql (jamais supabase db push).

begin;

-- ── 1. Offres du catalogue (grille BIZPLAN révisée le 06/10/2026). N'écrase rien d'existant. ──
-- Limites de membres et de stockage laissées NULL : rien ne les applique encore (chantier PLANS-QUOTAS-ESSAI).
insert into public.plans (id, nom, limite_biens, prix_cents) values
  ('essentiel',       'Essentiel',     1,  299),
  ('investisseur',    'Investisseur',  5,  990),
  ('patrimoine',      'Patrimoine',    10, 1990),
  ('patrimoine_plus', 'Patrimoine +',  30, 2990)
on conflict (id) do nothing;

-- ── 2. Plafonds MENSUELS par offre et par famille de fonctions. NULL = sans plafond pour cette famille. ──
--   dictee_min     : minutes de dictée (EDL)            pieces_pages : pages de pièces lues (candidats, OCR)
--   liens_demandes : demandes du locataire et de l'artisan (liens publics)   factures : factures lues
--   video_images   : images de l'EDL filmé (éteint ; plafond à fixer à l'allumage — le garde-fou journalier s'applique)
create table public.ia_plafonds_offre (
  plan_id        text primary key references public.plans(id) on delete cascade,
  dictee_min     int check (dictee_min is null or dictee_min between 0 and 1000000),
  pieces_pages   int check (pieces_pages is null or pieces_pages between 0 and 1000000),
  liens_demandes int check (liens_demandes is null or liens_demandes between 0 and 1000000),
  factures       int check (factures is null or factures between 0 and 1000000),
  video_images   int check (video_images is null or video_images between 0 and 1000000),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id) on delete set null
);
insert into public.ia_plafonds_offre (plan_id, dictee_min, pieces_pages, liens_demandes, factures, video_images) values
  ('free',             10,   8,  10,   5, null),
  ('essentiel',        30,  40,  30,  20, null),
  ('investisseur',     90, 120, 150,  60, null),
  ('patrimoine',      180, 240, 300, 120, null),
  ('patrimoine_plus', 300, 400, 500, 200, null),
  ('beta',            300, 400, 500, 200, null)
on conflict (plan_id) do nothing;

-- ── 3. Surcharge par compte (administrateur) : sans plafond, ou plafonds propres (NULL = valeur de l'offre). ──
create table public.ia_surcharges (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  sans_plafond   boolean not null default false,
  dictee_min     int check (dictee_min is null or dictee_min between 0 and 1000000),
  pieces_pages   int check (pieces_pages is null or pieces_pages between 0 and 1000000),
  liens_demandes int check (liens_demandes is null or liens_demandes between 0 and 1000000),
  factures       int check (factures is null or factures between 0 and 1000000),
  video_images   int check (video_images is null or video_images between 0 and 1000000),
  motif          text check (motif is null or char_length(motif) <= 200),
  jusqu_au       date,                                  -- inclus ; NULL = sans fin
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id) on delete set null
);

-- ── 4. Compteur PLAFONNÉ : une ligne par compte, par mois, par famille. Verrouillée à chaque réservation. ──
-- Unités : dictee = secondes ; pieces = pages ; liens = demandes ; factures = lectures ; video = images.
create table public.ia_compteurs (
  user_id uuid   not null references auth.users(id) on delete cascade,
  mois    date   not null check (extract(day from mois) = 1),
  famille text   not null check (famille in ('dictee', 'pieces', 'liens', 'factures', 'video')),
  unites  bigint not null default 0 check (unites >= 0),
  primary key (user_id, mois, famille)
);

-- ── 5. Mesures : une ligne par compte, par jour (heure de Paris), par fonction. Coût estimé en micro-euros. ──
create table public.ia_conso_jour (
  user_id        uuid   not null references auth.users(id) on delete cascade,
  jour           date   not null,
  fonction       text   not null check (fonction in ('dictee', 'pieces', 'locataire', 'artisan', 'factures', 'video')),
  appels         int    not null default 0 check (appels >= 0),
  audio_sec      bigint not null default 0 check (audio_sec >= 0),
  pages          int    not null default 0 check (pages >= 0),
  images         int    not null default 0 check (images >= 0),
  jetons_e       bigint not null default 0 check (jetons_e >= 0),
  jetons_s       bigint not null default 0 check (jetons_s >= 0),
  cout_micro_eur bigint not null default 0 check (cout_micro_eur >= 0),
  primary key (user_id, jour, fonction)
);
create index ia_conso_jour_par_jour on public.ia_conso_jour (jour);

-- ── 6. Journal des changements de plafonds (administrateur), append-only. ──
create table public.ia_admin_journal (
  id       bigint generated always as identity primary key,
  ts       timestamptz not null default now(),
  admin_id uuid references auth.users(id) on delete set null,
  cible    text not null check (char_length(cible) <= 80),   -- 'offre:<plan_id>' | 'compte:<uuid>'
  avant    jsonb,
  apres    jsonb
);

-- ── 7. RLS : ENABLE + FORCE partout ; lecture directe réservée à l'administrateur (sauf le catalogue des plafonds,
-- public comme public.plans) ; AUCUNE écriture directe : tout passe par les fonctions ci-dessous. ──
alter table public.ia_plafonds_offre enable row level security;
alter table public.ia_plafonds_offre force  row level security;
alter table public.ia_surcharges     enable row level security;
alter table public.ia_surcharges     force  row level security;
alter table public.ia_compteurs      enable row level security;
alter table public.ia_compteurs      force  row level security;
alter table public.ia_conso_jour     enable row level security;
alter table public.ia_conso_jour     force  row level security;
alter table public.ia_admin_journal  enable row level security;
alter table public.ia_admin_journal  force  row level security;

create policy ia_plafonds_offre_lecture on public.ia_plafonds_offre for select to authenticated using (true);
create policy ia_surcharges_admin       on public.ia_surcharges     for select to authenticated using (public.is_app_admin());
create policy ia_compteurs_admin        on public.ia_compteurs      for select to authenticated using (public.is_app_admin());
create policy ia_conso_jour_admin       on public.ia_conso_jour     for select to authenticated using (public.is_app_admin());
create policy ia_admin_journal_admin    on public.ia_admin_journal  for select to authenticated using (public.is_app_admin());

revoke all on public.ia_plafonds_offre, public.ia_surcharges, public.ia_compteurs, public.ia_conso_jour, public.ia_admin_journal from anon;
revoke insert, update, delete, truncate on public.ia_plafonds_offre, public.ia_surcharges, public.ia_compteurs, public.ia_conso_jour, public.ia_admin_journal from authenticated;

-- ── 8. Helpers internes (exécutables par personne : appelés seulement depuis les fonctions SECURITY DEFINER). ──
create or replace function public._ia_auj()
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone 'Europe/Paris')::date;
$$;

create or replace function public._ia_mois()
returns date language sql stable security definer set search_path = '' as $$
  select date_trunc('month', public._ia_auj())::date;
$$;

-- Plafonds EFFECTIFS d'un compte, en unités du compteur (dictée en secondes). NULL = sans plafond.
-- Offre : celle des espaces créés par le compte (la plus large s'il en a plusieurs) ; aucun espace → 'free'.
-- Surcharge en cours (jusqu_au NULL ou ≥ aujourd'hui) : sans_plafond, ou valeurs propres (NULL = valeur de l'offre).
create or replace function public._ia_plafonds(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  o public.ia_plafonds_offre;
  s public.ia_surcharges;
  v_nom text;
  v_surcharge boolean;
begin
  select po.* into o
    from public.espaces e
    join public.ia_plafonds_offre po on po.plan_id = e.plan_id
   where e.created_by = p_user
   order by (coalesce(po.dictee_min, 1000000)::bigint + coalesce(po.pieces_pages, 1000000) + coalesce(po.liens_demandes, 1000000)
             + coalesce(po.factures, 1000000) + coalesce(po.video_images, 1000000)) desc, e.created_at
   limit 1;
  -- Bêta privée : un testeur INVITÉ sans espace propre suit l'offre « beta » de l'espace qui l'a invité (D4). Seule
  -- l'offre « beta » se partage ainsi : une offre payante reste attachée à la personne qui la paie (BIZPLAN).
  if o.plan_id is null then
    select po.* into o
      from public.espace_members m
      join public.espaces e on e.id = m.espace_id
      join public.ia_plafonds_offre po on po.plan_id = e.plan_id
     where m.user_id = p_user and m.invite_status = 'active' and e.plan_id = 'beta'
     limit 1;
  end if;
  if o.plan_id is null then
    select po.* into o from public.ia_plafonds_offre po where po.plan_id = 'free';
  end if;
  if o.plan_id is null then
    -- Catalogue vidé par erreur : prudence, toutes les familles à 0 (jamais « sans plafond » par défaut).
    o.plan_id := 'free'; o.dictee_min := 0; o.pieces_pages := 0; o.liens_demandes := 0; o.factures := 0; o.video_images := 0;
  end if;
  select p.nom into v_nom from public.plans p where p.id = o.plan_id;

  select su.* into s from public.ia_surcharges su
   where su.user_id = p_user and (su.jusqu_au is null or su.jusqu_au >= public._ia_auj());
  v_surcharge := s.user_id is not null;

  if v_surcharge and s.sans_plafond then
    return jsonb_build_object('offre', o.plan_id, 'nom', coalesce(v_nom, o.plan_id), 'surcharge', true, 'sans_plafond', true,
      'motif', s.motif, 'jusqu_au', s.jusqu_au,
      'dictee', null, 'pieces', null, 'liens', null, 'factures', null, 'video', null);
  end if;
  return jsonb_build_object('offre', o.plan_id, 'nom', coalesce(v_nom, o.plan_id), 'surcharge', v_surcharge, 'sans_plafond', false,
    'motif', s.motif, 'jusqu_au', s.jusqu_au,
    'dictee',   case when coalesce(s.dictee_min, o.dictee_min) is null then null else coalesce(s.dictee_min, o.dictee_min)::bigint * 60 end,
    'pieces',   coalesce(s.pieces_pages, o.pieces_pages),
    'liens',    coalesce(s.liens_demandes, o.liens_demandes),
    'factures', coalesce(s.factures, o.factures),
    'video',    coalesce(s.video_images, o.video_images));
end;
$$;

-- Compteurs du mois d'un compte : { dictee: n, pieces: n, … } (0 si aucune ligne).
create or replace function public._ia_compteurs_mois(p_user uuid, p_mois date)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'dictee',   coalesce(max(c.unites) filter (where c.famille = 'dictee'), 0),
    'pieces',   coalesce(max(c.unites) filter (where c.famille = 'pieces'), 0),
    'liens',    coalesce(max(c.unites) filter (where c.famille = 'liens'), 0),
    'factures', coalesce(max(c.unites) filter (where c.famille = 'factures'), 0),
    'video',    coalesce(max(c.unites) filter (where c.famille = 'video'), 0))
  from public.ia_compteurs c where c.user_id = p_user and c.mois = p_mois;
$$;

revoke all on function public._ia_auj() from public, anon, authenticated;
revoke all on function public._ia_mois() from public, anon, authenticated;
revoke all on function public._ia_plafonds(uuid) from public, anon, authenticated;
revoke all on function public._ia_compteurs_mois(uuid, date) from public, anon, authenticated;

-- ── 9. Relais : réserver AVANT l'appel payant (atomique), consigner APRÈS. ──
-- Réserve `p_estimation` unités si le compteur du mois est SOUS le plafond (la ligne est verrouillée : deux appels
-- simultanés du même compte sont sérialisés et le second voit la réservation du premier). Plafond NULL = toujours ok.
create or replace function public.ia_reserver(p_user uuid, p_famille text, p_estimation bigint)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  v_mois date := public._ia_mois();
  v_u bigint;
  v_pl bigint;
begin
  if not public._el_relais_ok() then raise exception 'ia:interdit' using errcode = '42501'; end if;
  if p_user is null or p_famille is null or p_famille not in ('dictee', 'pieces', 'liens', 'factures', 'video')
     or p_estimation is null or p_estimation < 0 or p_estimation > 100000 then
    raise exception 'ia:invalide' using errcode = '22023';
  end if;
  insert into public.ia_compteurs (user_id, mois, famille) values (p_user, v_mois, p_famille) on conflict do nothing;
  select c.unites into v_u from public.ia_compteurs c
   where c.user_id = p_user and c.mois = v_mois and c.famille = p_famille for update;
  v_pl := (public._ia_plafonds(p_user) ->> p_famille)::bigint;
  -- Estimation 0 (analyse d'une dictée déjà transcrite et payée) : jamais refusée — sinon la dernière dictée qui
  -- franchit le plafond serait payée puis perdue. Elle sert seulement à lire l'état du compteur.
  if v_pl is not null and v_u >= v_pl and p_estimation > 0 then
    return jsonb_build_object('ok', false, 'unites', v_u, 'plafond', v_pl, 'mois', v_mois,
      'renouvellement', (v_mois + interval '1 month')::date);
  end if;
  update public.ia_compteurs c set unites = c.unites + p_estimation
   where c.user_id = p_user and c.mois = v_mois and c.famille = p_famille
   returning c.unites into v_u;
  return jsonb_build_object('ok', true, 'unites', v_u, 'plafond', v_pl, 'mois', v_mois,
    'renouvellement', (v_mois + interval '1 month')::date);
end;
$$;

-- Corrige la réservation (unités réelles − estimation ; négatif si l'appel a échoué) et ajoute les mesures du jour.
-- Bornes sur chaque valeur : même l'identité du relais ne peut pas écrire n'importe quoi.
create or replace function public.ia_consigner(
  p_user uuid, p_mois date, p_famille text, p_fonction text, p_correction bigint,
  p_appels int, p_audio_sec bigint, p_pages int, p_images int, p_jetons_e bigint, p_jetons_s bigint, p_cout_micro_eur bigint)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_mois date := public._ia_mois();
begin
  if not public._el_relais_ok() then raise exception 'ia:interdit' using errcode = '42501'; end if;
  if p_user is null or p_mois is null
     or p_mois not in (v_mois, (v_mois - interval '1 month')::date)
     or p_famille is null or p_fonction is null
     or not ((p_fonction = 'dictee' and p_famille = 'dictee') or (p_fonction = 'pieces' and p_famille = 'pieces')
          or (p_fonction in ('locataire', 'artisan') and p_famille = 'liens') or (p_fonction = 'factures' and p_famille = 'factures')
          or (p_fonction = 'video' and p_famille = 'video'))
     or coalesce(p_correction, 0) not between -100000 and 100000
     or coalesce(p_appels, 0) not between 0 and 10
     or coalesce(p_audio_sec, 0) not between 0 and 100000
     or coalesce(p_pages, 0) not between 0 and 100
     or coalesce(p_images, 0) not between 0 and 100
     or coalesce(p_jetons_e, 0) not between 0 and 10000000
     or coalesce(p_jetons_s, 0) not between 0 and 10000000
     or coalesce(p_cout_micro_eur, 0) not between 0 and 10000000 then
    raise exception 'ia:invalide' using errcode = '22023';
  end if;
  if coalesce(p_correction, 0) <> 0 then
    update public.ia_compteurs c set unites = greatest(0, c.unites + p_correction)
     where c.user_id = p_user and c.mois = p_mois and c.famille = p_famille;
  end if;
  insert into public.ia_conso_jour as j (user_id, jour, fonction, appels, audio_sec, pages, images, jetons_e, jetons_s, cout_micro_eur)
  values (p_user, public._ia_auj(), p_fonction, coalesce(p_appels, 0), coalesce(p_audio_sec, 0), coalesce(p_pages, 0), coalesce(p_images, 0),
          coalesce(p_jetons_e, 0), coalesce(p_jetons_s, 0), coalesce(p_cout_micro_eur, 0))
  on conflict (user_id, jour, fonction) do update set
    appels = j.appels + excluded.appels, audio_sec = j.audio_sec + excluded.audio_sec, pages = j.pages + excluded.pages,
    images = j.images + excluded.images, jetons_e = j.jetons_e + excluded.jetons_e, jetons_s = j.jetons_s + excluded.jetons_s,
    cout_micro_eur = j.cout_micro_eur + excluded.cout_micro_eur;
end;
$$;

-- ── 10. Utilisateur : son utilisation du mois (compteurs et plafonds ; aucun euro). ──
create or replace function public.ia_mon_usage()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_mois date := public._ia_mois();
begin
  if v_uid is null then raise exception 'ia:interdit' using errcode = '42501'; end if;
  return jsonb_build_object('mois', v_mois, 'renouvellement', (v_mois + interval '1 month')::date,
    'plafonds', public._ia_plafonds(v_uid) - 'motif', 'unites', public._ia_compteurs_mois(v_uid, v_mois));   -- motif : note interne de l'admin
end;
$$;

-- ── 11. Administrateur : consommation d'un mois, plafonds par offre, surcharges. ──
create or replace function public.ia_admin_conso(p_mois date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_mois date := date_trunc('month', coalesce(p_mois, public._ia_mois()))::date;
  v_fin  date := (date_trunc('month', coalesce(p_mois, public._ia_mois())) + interval '1 month')::date;
begin
  if not public.is_app_admin() then raise exception 'ia:interdit' using errcode = '42501'; end if;
  return jsonb_build_object(
    'mois', v_mois, 'aujourdhui', public._ia_auj(),
    'par_jour', coalesce((select jsonb_agg(jsonb_build_object('jour', d.jour, 'cout', d.cout, 'appels', d.appels) order by d.jour)
        from (select j.jour, sum(j.cout_micro_eur) as cout, sum(j.appels) as appels from public.ia_conso_jour j
               where j.jour >= v_mois and j.jour < v_fin group by j.jour) d), '[]'::jsonb),
    'par_fonction', coalesce((select jsonb_agg(jsonb_build_object('fonction', f.fonction, 'appels', f.appels, 'audio_sec', f.audio_sec,
          'pages', f.pages, 'images', f.images, 'jetons_e', f.jetons_e, 'jetons_s', f.jetons_s, 'cout', f.cout))
        from (select j.fonction, sum(j.appels) as appels, sum(j.audio_sec) as audio_sec, sum(j.pages) as pages, sum(j.images) as images,
                     sum(j.jetons_e) as jetons_e, sum(j.jetons_s) as jetons_s, sum(j.cout_micro_eur) as cout
                from public.ia_conso_jour j where j.jour >= v_mois and j.jour < v_fin group by j.fonction) f), '[]'::jsonb),
    'comptes', coalesce((select jsonb_agg(jsonb_build_object(
          'user_id', u.user_id, 'email', au.email, 'cout', u.cout, 'appels', u.appels, 'par_fonction', u.par_fonction,
          'plafonds', public._ia_plafonds(u.user_id), 'unites', public._ia_compteurs_mois(u.user_id, v_mois),
          'surcharge', (select to_jsonb(s) - 'updated_by' from public.ia_surcharges s where s.user_id = u.user_id)) order by u.cout desc)
        from (select x.user_id, sum(x.cout) as cout, sum(x.appels) as appels, jsonb_object_agg(x.fonction, x.cout) as par_fonction
                from (select j.user_id, j.fonction, sum(j.cout_micro_eur) as cout, sum(j.appels) as appels from public.ia_conso_jour j
                       where j.jour >= v_mois and j.jour < v_fin group by j.user_id, j.fonction) x
               group by x.user_id
              union all
              -- comptes sans conso ce mois mais avec un compteur (réservations) ou une surcharge : visibles aussi
              select y.user_id, 0, 0, '{}'::jsonb from (
                select c.user_id from public.ia_compteurs c where c.mois = v_mois
                union select s.user_id from public.ia_surcharges s) y
               where not exists (select 1 from public.ia_conso_jour j where j.user_id = y.user_id and j.jour >= v_mois and j.jour < v_fin)) u
        left join auth.users au on au.id = u.user_id), '[]'::jsonb));
end;
$$;

create or replace function public.ia_admin_plafonds()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'ia:interdit' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('plan_id', o.plan_id, 'nom', p.nom, 'prix_cents', p.prix_cents,
      'limite_biens', p.limite_biens, 'dictee_min', o.dictee_min, 'pieces_pages', o.pieces_pages, 'liens_demandes', o.liens_demandes,
      'factures', o.factures, 'video_images', o.video_images, 'updated_at', o.updated_at)
      order by coalesce(p.prix_cents, 1000000), o.plan_id)
    from public.ia_plafonds_offre o join public.plans p on p.id = o.plan_id), '[]'::jsonb);
end;
$$;

-- Plafonds d'une offre (NULL = sans plafond). Valeurs entières de 0 à 1 000 000.
create or replace function public.ia_admin_plafonds_maj(p_plan text, p_dictee_min int, p_pieces_pages int, p_liens_demandes int, p_factures int, p_video_images int)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_avant jsonb;
  v_uid uuid := (select auth.uid());
begin
  if not public.is_app_admin() then raise exception 'ia:interdit' using errcode = '42501'; end if;
  if p_plan is null or not exists (select 1 from public.plans p where p.id = p_plan) then raise exception 'ia:offre' using errcode = '22023'; end if;
  select to_jsonb(o) - 'updated_at' - 'updated_by' into v_avant from public.ia_plafonds_offre o where o.plan_id = p_plan;
  insert into public.ia_plafonds_offre as o (plan_id, dictee_min, pieces_pages, liens_demandes, factures, video_images, updated_at, updated_by)
  values (p_plan, p_dictee_min, p_pieces_pages, p_liens_demandes, p_factures, p_video_images, now(), v_uid)
  on conflict (plan_id) do update set dictee_min = excluded.dictee_min, pieces_pages = excluded.pieces_pages,
    liens_demandes = excluded.liens_demandes, factures = excluded.factures, video_images = excluded.video_images,
    updated_at = now(), updated_by = v_uid;
  insert into public.ia_admin_journal (admin_id, cible, avant, apres)
  values (v_uid, 'offre:' || p_plan, v_avant, jsonb_build_object('dictee_min', p_dictee_min, 'pieces_pages', p_pieces_pages,
    'liens_demandes', p_liens_demandes, 'factures', p_factures, 'video_images', p_video_images));
end;
$$;

-- Surcharge d'un compte : sans plafond, ou plafonds propres (NULL = valeur de l'offre), motif, date de fin incluse.
create or replace function public.ia_admin_surcharge_maj(p_user uuid, p_sans_plafond boolean, p_dictee_min int, p_pieces_pages int,
  p_liens_demandes int, p_factures int, p_video_images int, p_motif text, p_jusqu_au date)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_avant jsonb;
  v_uid uuid := (select auth.uid());
begin
  if not public.is_app_admin() then raise exception 'ia:interdit' using errcode = '42501'; end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'ia:compte' using errcode = '22023'; end if;
  select to_jsonb(s) - 'updated_at' - 'updated_by' into v_avant from public.ia_surcharges s where s.user_id = p_user;
  insert into public.ia_surcharges as s (user_id, sans_plafond, dictee_min, pieces_pages, liens_demandes, factures, video_images, motif, jusqu_au, updated_at, updated_by)
  values (p_user, coalesce(p_sans_plafond, false), p_dictee_min, p_pieces_pages, p_liens_demandes, p_factures, p_video_images,
          nullif(trim(coalesce(p_motif, '')), ''), p_jusqu_au, now(), v_uid)
  on conflict (user_id) do update set sans_plafond = excluded.sans_plafond, dictee_min = excluded.dictee_min,
    pieces_pages = excluded.pieces_pages, liens_demandes = excluded.liens_demandes, factures = excluded.factures,
    video_images = excluded.video_images, motif = excluded.motif, jusqu_au = excluded.jusqu_au, updated_at = now(), updated_by = v_uid;
  insert into public.ia_admin_journal (admin_id, cible, avant, apres)
  values (v_uid, 'compte:' || p_user::text, v_avant, (select to_jsonb(s) - 'updated_at' - 'updated_by' from public.ia_surcharges s where s.user_id = p_user));
end;
$$;

create or replace function public.ia_admin_surcharge_retirer(p_user uuid)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare
  v_avant jsonb;
begin
  if not public.is_app_admin() then raise exception 'ia:interdit' using errcode = '42501'; end if;
  delete from public.ia_surcharges s where s.user_id = p_user returning to_jsonb(s) - 'updated_at' - 'updated_by' into v_avant;
  if v_avant is not null then
    insert into public.ia_admin_journal (admin_id, cible, avant, apres) values ((select auth.uid()), 'compte:' || p_user::text, v_avant, null);
  end if;
end;
$$;

revoke all on function public.ia_reserver(uuid, text, bigint) from public, anon;
revoke all on function public.ia_consigner(uuid, date, text, text, bigint, int, bigint, int, int, bigint, bigint, bigint) from public, anon;
revoke all on function public.ia_mon_usage() from public, anon;
revoke all on function public.ia_admin_conso(date) from public, anon;
revoke all on function public.ia_admin_plafonds() from public, anon;
revoke all on function public.ia_admin_plafonds_maj(text, int, int, int, int, int) from public, anon;
revoke all on function public.ia_admin_surcharge_maj(uuid, boolean, int, int, int, int, int, text, date) from public, anon;
revoke all on function public.ia_admin_surcharge_retirer(uuid) from public, anon;
grant execute on function public.ia_reserver(uuid, text, bigint) to authenticated;
grant execute on function public.ia_consigner(uuid, date, text, text, bigint, int, bigint, int, int, bigint, bigint, bigint) to authenticated;
grant execute on function public.ia_mon_usage() to authenticated;
grant execute on function public.ia_admin_conso(date) to authenticated;
grant execute on function public.ia_admin_plafonds() to authenticated;
grant execute on function public.ia_admin_plafonds_maj(text, int, int, int, int, int) to authenticated;
grant execute on function public.ia_admin_surcharge_maj(uuid, boolean, int, int, int, int, int, text, date) to authenticated;
grant execute on function public.ia_admin_surcharge_retirer(uuid) to authenticated;

-- ── 12. L'offre d'un espace n'est plus modifiable par un utilisateur connecté (contournement des plafonds). ──
-- Les colonnes d'abonnement (0019) ne bougent que par le back-office (service_role, SQL) ou une fonction SECURITY
-- DEFINER (current_user = propriétaire de la fonction). À la création directe, elles reprennent leurs valeurs par défaut.
create or replace function public.espaces_abonnement_garde()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'INSERT' then
    new.plan_id := 'beta';                -- aligné sur le défaut de colonne (section 13) pendant la bêta privée
    new.subscription_source := null; new.subscription_status := null; new.trial_ends_at := null;
    new.stripe_customer_id := null; new.comp_reason := null; new.comp_granted_by := null; new.comp_granted_at := null;
    return new;
  end if;
  if new.plan_id is distinct from old.plan_id
     or new.subscription_source is distinct from old.subscription_source
     or new.subscription_status is distinct from old.subscription_status
     or new.trial_ends_at is distinct from old.trial_ends_at
     or new.stripe_customer_id is distinct from old.stripe_customer_id
     or new.comp_reason is distinct from old.comp_reason
     or new.comp_granted_by is distinct from old.comp_granted_by
     or new.comp_granted_at is distinct from old.comp_granted_at
     or new.created_by is distinct from old.created_by then   -- created_by = lien compte → offre (_ia_plafonds)
    raise exception 'espaces:abonnement' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger trg_espaces_abonnement_garde
  before insert or update on public.espaces
  for each row execute function public.espaces_abonnement_garde();
revoke all on function public.espaces_abonnement_garde() from public, anon, authenticated;

-- ── 13. Bascule (D4) : espaces existants → 'beta' ; défaut 'beta' pendant la bêta privée (inscription sur liste
-- d'accès, 0038-0039) ; le chantier PLANS-QUOTAS-ESSAI remettra 'free' à l'ouverture publique. Administrateur : sans plafond. ──
update public.espaces set plan_id = 'beta' where plan_id = 'free';
update public.plans set nom = 'Bêta' where id = 'beta' and nom = 'Bêta illimité';   -- l'offre bêta est désormais plafonnée
alter table public.espaces alter column plan_id set default 'beta';
insert into public.ia_surcharges (user_id, sans_plafond, motif)
select a.user_id, true, 'Administrateur : tests sans plafond (16/10/2026)' from public.app_admins a
on conflict (user_id) do nothing;

commit;
