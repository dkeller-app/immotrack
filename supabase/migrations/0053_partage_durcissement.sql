-- 0053 — Partage par SCI : durcissements issus des DEUX audits adversariaux du 2026-09-18.
--
-- (A) F2 — Contournement du filtre de config par VARIANTE DE CASSE. ref_logement_accessible /
--     nom_immeuble_accessible (0043) comparent en lower(btrim()) alors que l'unicité des refs est exacte et
--     que les noms d'immeubles n'ont aucune unicité. Une gestionnaire SCOPÉE de SCI-A créait un logement
--     « f-001 » (ou un immeuble homonyme) DANS SCI-A → la RPC de config lui renvoyait loyerBareme,
--     irlHistorique, emailsSent (PII)… du « F-001 » de SCI-B. FIX : fail-closed sur AMBIGUÏTÉ — la clé
--     n'est accessible que si TOUTES les lignes de même clé normalisée le sont. Membre plein : inchangé.
--     (Prod 2026-09-18 : 0 ref ambiguë, 0 immeuble homonyme multi-SCI.)
-- (B) F4 — Résolveurs d'entité = ORACLES. entite_of_logement/immeuble/bail/document (DEFINER, exécutables
--     par authenticated ET anon via les grants par défaut Supabase) renvoyaient l'entité de n'importe quelle
--     ligne. Les ids étant déterministes (sha1(owner|type|clé naturelle)), un scopé énumérait l'existence
--     des logements/baux de SCI-B (occupé/vacant) et l'UUID de SCI-B. FIX : chaque résolveur ne renvoie
--     l'entité que si l'appelant y a accès (has_entite_access), sinon NULL. Policies INCHANGÉES en effet :
--     plein → toujours l'entité ; scopé sans octroi → NULL → has_entite_*(NULL) = faux, comme avant.
--     + EXECUTE retiré à anon sur les helpers réservés aux policies `to authenticated`.
-- (C) m2 — has_entite_access / has_entite_write : la branche SCOPÉE exige désormais une appartenance
--     ACTIVE (is_member). Avant, un octroi entite_membre survivait à la révocation/suppression de la seule
--     ligne espace_members (aucune FK entre les deux) → accès tables + Storage conservé.
-- (D) F6 — accept_invitation : (a) `for update` sur l'invitation (deux comptes ne consomment plus le même
--     token en parallèle) ; (b) invitation LIÉE à l'email du COMPTE (auth.users.email, pas le JWT qui peut
--     être périmé) quand invite_email est renseigné (le client le renseigne toujours) → un lien transféré
--     ne sert plus à un compte d'une AUTRE adresse. ⚠ LIMITE : la confirmation d'email est DÉSACTIVÉE
--     (config.toml enable_confirmations=false, en attente du domaine propryo.fr) → tant que l'invité n'a
--     pas encore créé son compte, quelqu'un qui détient le lien ET connaît l'adresse peut s'inscrire à sa
--     place. Nette amélioration vs lien porteur, pas une preuve de possession de la boîte ; (c) la ré-activation
--     d'une ancienne ligne espace_members REMET full_espace=false + role=lecture_seule (une ancienne ligne
--     « plein » révoquée ne redevient plus membre plein par une invitation scopée) ; (d) expiration par
--     défaut 7 jours pour les NOUVELLES invitations (le client n'en posait jamais → lien éternel).
--     (e) à la ré-activation d'un membre NON actif, ses anciens octrois entite_membre DORMANTS sont purgés
--     (sinon une invitation « lecture SCI-A » réveillait un vieil octroi « gestionnaire SCI-B ») ; (f) le
--     retour idempotent (déjà acceptée par moi) passe AVANT le test d'expiration (rouvrir son ancien lien
--     après J+7 = no-op, pas « expirée »).
-- (E) entite_of_bail : entité renvoyée seulement si accès à l'entité du bail ET à celle de son logement (un
--     bail à l'entite_id périmée ne donne plus de visibilité croisée via baux_evenements / documents).
--     entite_of_document branche 'mouvement' : + repli immeuble_id (aligné sur 0037 : le justificatif d'un
--     mouvement « immeuble seul » était refusé au scopé).
--     (Prod 2026-09-18 : 0 invitation en attente → aucun lien existant impacté.)
--
-- Idempotente (create or replace / alter default). Dépend de 0029, 0030, 0032, 0042, 0043.

begin;

-- ── (C) helpers d'accès : branche scopée conditionnée à l'appartenance ACTIVE ──────────────────────────
create or replace function public.has_entite_access(p_espace_id uuid, p_entite_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_full_member(p_espace_id)
    or (
      p_entite_id is not null
      and public.is_member(p_espace_id)
      and exists (
        select 1 from public.entite_membre em
        where em.espace_id = p_espace_id
          and em.entite_id = p_entite_id
          and em.user_id = (select auth.uid())
      )
    );
$$;

create or replace function public.has_entite_write(p_espace_id uuid, p_entite_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.is_full_manager(p_espace_id)
    or (
      p_entite_id is not null
      and public.is_member(p_espace_id)
      and exists (
        select 1 from public.entite_membre em
        where em.espace_id = p_espace_id
          and em.entite_id = p_entite_id
          and em.user_id = (select auth.uid())
          and em.role = 'gestionnaire'
      )
    );
$$;

-- ── (B) résolveurs : l'entité n'est renvoyée QU'À qui y a accès ───────────────────────────────────────
create or replace function public.entite_of_logement(p_espace_id uuid, p_logement_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.entite_id
  from public.logements l
  where l.id = p_logement_id
    and l.espace_id = p_espace_id
    and public.has_entite_access(p_espace_id, l.entite_id);
$$;

create or replace function public.entite_of_immeuble(p_espace_id uuid, p_immeuble_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select im.entite_id
  from public.immeubles im
  where im.id = p_immeuble_id
    and im.espace_id = p_espace_id
    and public.has_entite_access(p_espace_id, im.entite_id);
$$;

create or replace function public.entite_of_bail(p_espace_id uuid, p_bail_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(b.entite_id, l.entite_id)
  from public.baux b
  left join public.logements l
    on l.id = b.logement_id and l.espace_id = b.espace_id
  where b.id = p_bail_id
    and b.espace_id = p_espace_id
    and coalesce(b.entite_id, l.entite_id) is not null
    and (b.entite_id is null or public.has_entite_access(p_espace_id, b.entite_id))
    and (l.entite_id is null or public.has_entite_access(p_espace_id, l.entite_id));
$$;

-- entite_of_document (0042) délègue aux trois résolveurs ci-dessus (déjà gardés) ; restent ses deux
-- branches directes ('entite' et 'mouvement') → même garde. Corps 0042 repris à l'identique par ailleurs.
create or replace function public.entite_of_document(p_espace_id uuid, p_parent_type text, p_parent_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case p_parent_type
    when 'entite' then (
      select e.id from public.entites e
      where e.id = p_parent_id and e.espace_id = p_espace_id
        and public.has_entite_access(p_espace_id, e.id)
    )
    when 'immeuble' then public.entite_of_immeuble(p_espace_id, p_parent_id)
    when 'logement' then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'bail' then public.entite_of_bail(p_espace_id, p_parent_id)
    when 'mouvement' then (
      select x.ent from (
        select coalesce(mv.entite_id, public.entite_of_logement(p_espace_id, mv.logement_id),
                        public.entite_of_immeuble(p_espace_id, mv.immeuble_id)) as ent
        from public.mouvements mv
        where mv.id = p_parent_id and mv.espace_id = p_espace_id
      ) x
      where public.has_entite_access(p_espace_id, x.ent)
    )
    when 'assurance'  then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'mrh'        then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'equipement' then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'quittance'  then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'candidat'   then public.entite_of_logement(p_espace_id, p_parent_id)
    else null
  end;
$$;

-- ── (A) filtres de config : fail-closed sur ambiguïté de clé normalisée ───────────────────────────────
create or replace function public.ref_logement_accessible(p_espace_id uuid, p_ref text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.logements l
    where l.espace_id = p_espace_id
      and lower(btrim(l.ref)) = lower(btrim(p_ref))
      and public.has_entite_access(p_espace_id, l.entite_id)
  ) and not exists (
    select 1 from public.logements l
    where l.espace_id = p_espace_id
      and lower(regexp_replace(l.ref, '\s+', '', 'g')) = lower(regexp_replace(p_ref, '\s+', '', 'g'))   -- classe ÉLARGIE (tout blanc ignoré) → plus fail-closed
      and not public.has_entite_access(p_espace_id, l.entite_id)
  );
$$;

create or replace function public.nom_immeuble_accessible(p_espace_id uuid, p_nom text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.immeubles im
    where im.espace_id = p_espace_id
      and lower(btrim(im.nom)) = lower(btrim(p_nom))
      and public.has_entite_access(p_espace_id, im.entite_id)
  ) and not exists (
    select 1 from public.immeubles im
    where im.espace_id = p_espace_id
      and lower(regexp_replace(im.nom, '\s+', '', 'g')) = lower(regexp_replace(p_nom, '\s+', '', 'g'))
      and not public.has_entite_access(p_espace_id, im.entite_id)
  );
$$;

-- Helpers réservés aux policies `to authenticated` / aux appels authentifiés : EXECUTE retiré à anon
-- (grant par défaut Supabase, que `revoke … from public` ne retire pas). invitation_preview et
-- accept_invitation restent tels quels (l'aperçu est appelé AVANT connexion).
revoke execute on function public.entite_of_logement(uuid, uuid)        from anon;
revoke execute on function public.entite_of_immeuble(uuid, uuid)        from anon;
revoke execute on function public.entite_of_bail(uuid, uuid)            from anon;
revoke execute on function public.entite_of_document(uuid, text, uuid)  from anon;
revoke execute on function public.ref_logement_accessible(uuid, text)   from anon;
revoke execute on function public.nom_immeuble_accessible(uuid, text)   from anon;
revoke execute on function public.espace_config_scoped(uuid)            from anon;

-- ── (D) invitations ────────────────────────────────────────────────────────────────────────────────
alter table public.invitations alter column expires_at set default (now() + interval '7 days');

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  v_inv   public.invitations;
  v_grant jsonb;
  v_role  public.entite_membre_role;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  -- for update : sérialise deux acceptations concurrentes du même token.
  select * into v_inv from public.invitations where token = p_token for update;
  if not found then raise exception 'INVITATION_NOT_FOUND'; end if;
  if v_inv.status = 'revoked' then raise exception 'INVITATION_REVOKED'; end if;
  -- idempotence AVANT l'expiration : rouvrir son propre lien déjà accepté reste un no-op, même après J+7.
  if v_inv.status = 'accepted' then
    if v_inv.accepted_by = v_uid then return v_inv.espace_id; end if;
    raise exception 'INVITATION_ALREADY_USED';
  end if;
  if v_inv.expires_at is not null and v_inv.expires_at <= now() then
    raise exception 'INVITATION_EXPIRED';
  end if;

  -- Invitation NOMINATIVE : si le manager a renseigné un email, seul ce compte peut l'accepter.
  -- Email du COMPTE (source d'autorité), pas le claim du JWT (périmé après un changement d'adresse).
  select lower(btrim(coalesce(u.email, ''))) into v_email from auth.users u where u.id = v_uid;
  if v_inv.invite_email is not null and btrim(v_inv.invite_email) <> ''
     and lower(btrim(v_inv.invite_email)) <> coalesce(v_email, '') then
    raise exception 'Cette invitation est destinée à une autre adresse e-mail (INVITATION_EMAIL_MISMATCH).';
  end if;

  -- pas de downgrade d'un membre PLEIN existant (l'invité voit déjà tout)
  if exists (
    select 1 from public.espace_members m
    where m.espace_id = v_inv.espace_id and m.user_id = v_uid
      and m.invite_status = 'active' and m.full_espace = true
  ) then
    raise exception 'ALREADY_FULL_MEMBER';
  end if;

  -- appartenance SCOPÉE. Une ancienne ligne (révoquée / en attente) est ré-activée EN SCOPÉ : on remet
  -- full_espace=false + role=lecture_seule (jamais de retour silencieux en membre plein).
  -- Pas (ou plus) membre ACTIF → tout octroi entite_membre restant est un reliquat DORMANT (aucune FK ne
  -- lie entite_membre à espace_members) : on le purge, l'invitation repart de ses SEULS grants.
  if not exists (
    select 1 from public.espace_members m
    where m.espace_id = v_inv.espace_id and m.user_id = v_uid and m.invite_status = 'active'
  ) then
    delete from public.entite_membre where espace_id = v_inv.espace_id and user_id = v_uid;
  end if;

  insert into public.espace_members (espace_id, user_id, role, invite_status, full_espace)
  values (v_inv.espace_id, v_uid, 'lecture_seule', 'active', false)
  on conflict (espace_id, user_id) do update
    set invite_status = 'active', full_espace = false, role = 'lecture_seule';

  for v_grant in select value from jsonb_array_elements(v_inv.grants) as t(value) loop
    v_role := case when v_grant->>'mode' = 'ecriture' then 'gestionnaire'
                   else 'lecture_seule' end::public.entite_membre_role;
    insert into public.entite_membre (espace_id, entite_id, user_id, role)
    values (v_inv.espace_id, (v_grant->>'entite_id')::uuid, v_uid, v_role)
    on conflict (espace_id, entite_id, user_id) do update set role = excluded.role;
  end loop;

  update public.invitations
    set status = 'accepted', accepted_by = v_uid, accepted_at = now()
    where id = v_inv.id;

  return v_inv.espace_id;
end;
$$;
revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;

commit;
