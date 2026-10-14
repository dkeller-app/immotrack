-- 0058 (NUMÉRO PROVISOIRE — le pilotage fixe le numéro définitif) — ÉTAT DES LIEUX FILMÉ (EDL-VIDEO-IA)
-- Registre des MÉDIAS d'état des lieux (vidéos) + protection des vidéos d'un EDL SIGNÉ.
--
-- POURQUOI (décision Didier 14/10/2026, n° 7) : la vidéo d'un état des lieux est une preuve pour LES DEUX
-- parties. Une fois l'EDL signé, ni le bailleur ni un associé ne doit pouvoir l'effacer ou l'écraser ; elle
-- est supprimée AUTOMATIQUEMENT à l'échéance de conservation (restitution du dépôt de garantie + 3 ans,
-- art. 7-1 loi n° 89-462 ; CNIL délibération 2021-057 § 53), prolongeable en cas de litige, par une tâche
-- serveur planifiée (fonction Edge `purge-medias-edl`, rôle service).
--
-- CE QUE FAIT LA MIGRATION :
--   1. table `edl_medias` (une ligne par fichier vidéo : chemin dans le bucket espace-files, empreinte
--      SHA-256, taille, durée, pièce, prise ; `signed_at` = scellé ; `purge_apres` = échéance ; gel = litige) ;
--      RLS FORCÉE par SCI (même rattachement que `edl` : logement → entité, 0030) ;
--   2. garde (trigger) : une fois scellée, une ligne est figée (chemin, empreinte, taille…), ne se descelle
--      jamais, son échéance ne recule jamais et ne peut tomber avant signature + 3 ans ; sa suppression n'est
--      possible qu'à échéance (même pour le rôle service) ; avant scellé (prise refaite), suppression libre
--      pour un associé en écriture ;
--   3. scellé AUTOMATIQUE : quand un EDL reçoit `signed_at`, ses médias sont scellés ; un média enregistré
--      APRÈS la signature (envoi différé) est scellé dès son insertion ;
--   4. STORAGE : les politiques update/delete de `espace-files` (0031) refusent un objet dont le chemin est
--      celui d'un média scellé (fonction `media_edl_protege`). Lecture et insertion inchangées ;
--   5. `edl_medias_a_purger(limite)` : liste des médias à échéance, réservée au rôle service (tâche planifiée).
--
-- Le front lit/écrit la table de façon TOLÉRANTE (table absente → vidéo gardée sur l'appareil + dans le
-- stockage, rien ne casse). ORDRE DE DÉPLOIEMENT : cette migration AVANT le front qui enregistre les vidéos.
-- La vidéo reste ÉTEINTE tant que le relais n'a pas AI_VIDEO=true (plan gratuit) : la table restera vide.
--
-- Dépend de 0001 (espaces, touch_row), 0009 (freeze_espace_id), 0011 (logements), 0013/0016 (edl),
-- 0024 (safe_uuid, bucket espace-files), 0029/0030 (has_entite_*, entite_of_logement), 0031 (politiques
-- storage par entité, reprises ici à l'identique + la garde), 0053 (has_entite_* durcies).

begin;

create table public.edl_medias (
  id             uuid primary key default gen_random_uuid(),
  espace_id      uuid not null references public.espaces(id) on delete cascade,
  logement_id    uuid not null,
  edl_id         uuid,                      -- detUuid('edl', id local) ; pas de FK : la vidéo peut partir avant l'EDL
  edl_legacy_id  text,
  storage_path   text not null,
  kind           text not null default 'video',
  mime           text,
  octets         bigint,
  duree_s        integer,
  sha256         text,
  piece          text,
  prise          integer,
  signed_at      timestamptz,               -- scellé (posé par la signature de l'EDL)
  purge_apres    date,                      -- échéance de conservation ; null = conserver
  gel_jusquau    date,                      -- litige : pas de suppression avant cette date
  gel_motif      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        bigint not null default 1,
  created_by     uuid default auth.uid() references auth.users(id),
  constraint edl_medias_path_unique unique (storage_path),
  constraint edl_medias_kind_chk check (kind in ('video')),
  constraint edl_medias_octets_chk check (octets is null or octets >= 0),
  constraint edl_medias_duree_chk check (duree_s is null or duree_s >= 0),
  constraint edl_medias_sha256_chk check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  constraint edl_medias_gel_chk check (gel_motif is null or length(gel_motif) <= 300),
  -- Plancher de conservation d'un média scellé : jamais avant 3 ans après la signature (la restitution du
  -- dépôt de garantie est postérieure à tout EDL du bail ; restitution + 3 ans >= signature + 3 ans).
  -- Empêche de poser une échéance proche AVANT de signer pour faire purger la vidéo aussitôt après.
  constraint edl_medias_purge_min_chk check (
    signed_at is null or purge_apres is null
    or purge_apres >= ((signed_at at time zone 'UTC') + interval '3 years')::date
  ),
  -- Le fichier vit DANS l'espace de la ligne, sous files/, et c'est une vidéo d'EDL (clé vid_…).
  constraint edl_medias_path_chk check (
    split_part(storage_path, '/', 1) = espace_id::text
    and storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]+/files/vid_[A-Za-z0-9_]+\.(webm|mp4|mov|mkv)$'
  ),
  constraint edl_medias_logement_fk foreign key (logement_id, espace_id) references public.logements (id, espace_id)
);

create index edl_medias_by_espace_logement on public.edl_medias (espace_id, logement_id);
create index edl_medias_by_edl on public.edl_medias (espace_id, edl_id);
create index edl_medias_purge on public.edl_medias (purge_apres) where purge_apres is not null;

create trigger trg_touch_edl_medias
  before update on public.edl_medias
  for each row execute function public.touch_row();
create trigger trg_freeze_espace_id
  before update on public.edl_medias
  for each row execute function public.freeze_espace_id();

-- ── Garde : scellé irréversible, champs de preuve figés, échéance qui ne recule pas ────────────────────
create or replace function public.edl_medias_garde()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.bypass_immutable', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if old.signed_at is not null and not (
         old.purge_apres is not null and old.purge_apres <= current_date
         and (old.gel_jusquau is null or old.gel_jusquau < current_date)) then
      raise exception 'MEDIA_EDL_SCELLE'
        using detail = format('edl_medias id=%s scellé : suppression seulement à échéance de conservation', old.id);
    end if;
    return old;
  end if;

  -- UPDATE
  -- Scellé posé par cette mise à jour : l'échéance est relevée au plancher (signature + 3 ans), jamais refusée
  -- (une signature ne doit jamais échouer à cause d'une échéance trop proche).
  if old.signed_at is null and new.signed_at is not null and new.purge_apres is not null then
    new.purge_apres := greatest(new.purge_apres, ((new.signed_at at time zone 'UTC') + interval '3 years')::date);
  end if;
  if old.signed_at is not null then
    if new.signed_at is distinct from old.signed_at
       or new.storage_path is distinct from old.storage_path or new.sha256 is distinct from old.sha256
       or new.octets is distinct from old.octets or new.mime is distinct from old.mime
       or new.duree_s is distinct from old.duree_s or new.kind is distinct from old.kind
       or new.logement_id is distinct from old.logement_id or new.edl_id is distinct from old.edl_id
       or new.edl_legacy_id is distinct from old.edl_legacy_id or new.piece is distinct from old.piece
       or new.prise is distinct from old.prise or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at then
      raise exception 'MEDIA_EDL_SCELLE'
        using detail = format('edl_medias id=%s scellé : seules l''échéance et le gel peuvent changer', old.id);
    end if;
    -- L'échéance ne recule jamais (null = conserver : toujours permis) ; le gel ne se raccourcit pas.
    if new.purge_apres is not null and old.purge_apres is not null and new.purge_apres < old.purge_apres then
      raise exception 'MEDIA_EDL_ECHEANCE' using detail = 'échéance de conservation : report seulement, jamais avance';
    end if;
    if old.gel_jusquau is not null and (new.gel_jusquau is null or new.gel_jusquau < old.gel_jusquau) then
      raise exception 'MEDIA_EDL_GEL' using detail = 'gel (litige) : prolongation seulement';
    end if;
  else
    if new.signed_at is null and old.signed_at is not null then
      raise exception 'MEDIA_EDL_SCELLE';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_edl_medias_garde
  before update or delete on public.edl_medias
  for each row execute function public.edl_medias_garde();

-- ── Scellé automatique ───────────────────────────────────────────────────────────────────────────────
-- (a) Un média enregistré pour un EDL DÉJÀ signé est scellé dès l'insertion (envoi différé après signature).
create or replace function public.edl_medias_sceller_a_l_insertion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare s timestamptz;
begin
  if new.edl_id is not null then
    select e.signed_at into s from public.edl e where e.id = new.edl_id and e.espace_id = new.espace_id;
    if s is not null then new.signed_at := coalesce(new.signed_at, s); end if;
  end if;
  if new.signed_at is not null and new.purge_apres is not null then
    new.purge_apres := greatest(new.purge_apres, ((new.signed_at at time zone 'UTC') + interval '3 years')::date);
  end if;
  return new;
end;
$$;
create trigger trg_edl_medias_sceller
  before insert on public.edl_medias
  for each row execute function public.edl_medias_sceller_a_l_insertion();

-- (b) Un EDL qui reçoit sa signature scelle ses médias.
create or replace function public.edl_sceller_medias()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.signed_at is not null and (tg_op = 'INSERT' or old.signed_at is null) then
    update public.edl_medias m set signed_at = new.signed_at   -- la garde relève l'échéance au plancher
     where m.edl_id = new.id and m.espace_id = new.espace_id and m.signed_at is null;
  end if;
  return new;
end;
$$;
create trigger trg_edl_sceller_medias
  after insert or update of signed_at on public.edl
  for each row execute function public.edl_sceller_medias();

-- ── RLS FORCÉE par SCI (rattachement logement → entité, comme `edl` en 0030) ─────────────────────────
alter table public.edl_medias enable row level security;
alter table public.edl_medias force  row level security;

create policy edl_medias_select on public.edl_medias for select to authenticated
  using ( public.has_entite_access(espace_id, public.entite_of_logement(espace_id, logement_id)) );
create policy edl_medias_insert on public.edl_medias for insert to authenticated
  with check ( public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id)) );
create policy edl_medias_update on public.edl_medias for update to authenticated
  using      ( public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id)) )
  with check ( public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id)) );
-- Suppression par un associé : seulement une prise NON scellée (refaire une prise avant la signature).
create policy edl_medias_delete on public.edl_medias for delete to authenticated
  using ( signed_at is null and public.has_entite_write(espace_id, public.entite_of_logement(espace_id, logement_id)) );

-- ── STORAGE : un fichier de média scellé ne s'efface ni ne s'écrase ─────────────────────────────────
create or replace function public.media_edl_protege(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.edl_medias m where m.storage_path = p_name and m.signed_at is not null);
$$;
revoke all on function public.media_edl_protege(text) from public;
grant execute on function public.media_edl_protege(text) to authenticated, service_role;

-- Politiques 0031 reprises À L'IDENTIQUE, plus la garde `not media_edl_protege(name)` (update + delete).
drop policy if exists "espace-files: update par entité" on storage.objects;
drop policy if exists "espace-files: delete par entité" on storage.objects;

create policy "espace-files: update par entité"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'espace-files'
    and public.has_entite_write(
          public.safe_uuid( split_part(name, '/', 1) ),
          public.safe_uuid( split_part(name, '/', 2) )
        )
    and not public.media_edl_protege(name)
  )
  with check (
    bucket_id = 'espace-files'
    and public.has_entite_write(
          public.safe_uuid( split_part(name, '/', 1) ),
          public.safe_uuid( split_part(name, '/', 2) )
        )
    and not public.media_edl_protege(name)
  );

create policy "espace-files: delete par entité"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'espace-files'
    and public.has_entite_write(
          public.safe_uuid( split_part(name, '/', 1) ),
          public.safe_uuid( split_part(name, '/', 2) )
        )
    and not public.media_edl_protege(name)
  );

-- ── Tâche planifiée de purge (rôle service seulement) ───────────────────────────────────────────────
create or replace function public.edl_medias_a_purger(p_limite integer default 100)
returns table (id uuid, storage_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.storage_path
    from public.edl_medias m
   where m.purge_apres is not null and m.purge_apres <= current_date
     and (m.gel_jusquau is null or m.gel_jusquau < current_date)
   order by m.purge_apres, m.id
   limit greatest(1, least(coalesce(p_limite, 100), 500));
$$;
revoke all on function public.edl_medias_a_purger(integer) from public;
revoke all on function public.edl_medias_a_purger(integer) from anon, authenticated;
grant execute on function public.edl_medias_a_purger(integer) to service_role;

commit;
