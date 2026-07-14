-- 0042 — ÉCRITURE MEMBRE SCOPÉ : entite_of_document résout les parent_types émis par l'app (0040).
--
-- CONTEXTE (réserve consignée de l'audit 0040 + AUDIT-SYNC-CLOUD-2026-07-12 §4). La migration 0040 a
-- élargi documents_parent_type_check aux 5 types réellement émis par l'app ('assurance','mrh',
-- 'equipement','quittance','candidat') pour débloquer l'INSERT (fin des 23514). MAIS le résolveur
-- d'entité entite_of_document (0030) ne connaît que les 5 types historiques (entite/immeuble/logement/
-- bail/mouvement) → pour les nouveaux, il renvoie NULL → has_entite_write(espace, NULL) = FAUX pour un
-- membre SCOPÉ (un membre PLEIN court-circuite via is_full_*) → INSERT/UPDATE refusé 42501 → la sync du
-- gestionnaire scopé s'EMPOISONNE (un poison isolé retenté en boucle ; avant l'isolation d'erreur P1,
-- il tuait tout le flush). Sans ce correctif : ⛔ un gestionnaire scopé ne peut PAS attacher une
-- attestation d'assurance, une quittance, une pièce de candidat, une facture d'équipement.
--
-- RÉSOLUTION VIA LE LOGEMENT. Le mapper (js/core/store-mapping.js `documents`) pose désormais, pour ces
-- 5 types, parent_id = l'uuid de LIGNE du LOGEMENT concerné (dérivé de `logRef`, la ref du logement que
-- l'app embarque sur chaque pièce). Le résolveur fait donc simplement entite_of_logement(parent_id) —
-- exactement « l'entité via le logement ». (parent_id est PUREMENT une clé de résolution RLS : l'hydrate
-- reconstruit le document depuis legacy_raw, pas depuis cette colonne → aucune incidence sur le document
-- rendu par l'app, ni sur les lignes existantes.) logRef absent (candidat rattaché à une SCI sans bien
-- précis) → parent_id NULL → entité NULL → FAIL-CLOSED (visible du seul membre plein), sûr.
--
-- 'bail' est DÉJÀ géré par entite_of_document (via entite_of_bail) : le mapper le complète en posant
-- parent_id = uuid de ligne bail — aucune modification du résolveur pour 'bail' ici.
--
-- SÉCURITÉ. Additive et FAIL-CLOSED → OUVERT : pour les 5 nouveaux types le résolveur passait NULL
-- (invisible du scopé) ; il renvoie maintenant l'entité du logement → le scopé n'obtient l'accès QUE si
-- has_entite_access/write le lui accorde sur CETTE entité. Aucun type existant n'est modifié
-- (comportement byte-identique). Aucun membre scopé n'existe en prod aujourd'hui (le partage n'est pas
-- activé) → application sans effet sur un utilisateur courant. Idempotent (create or replace, même
-- signature → privilèges conservés ; grants ré-émis par sûreté). Réversible (réappliquer 0030).

begin;

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
    )
    when 'immeuble' then public.entite_of_immeuble(p_espace_id, p_parent_id)
    when 'logement' then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'bail' then public.entite_of_bail(p_espace_id, p_parent_id)
    when 'mouvement' then (
      select coalesce(mv.entite_id, public.entite_of_logement(p_espace_id, mv.logement_id))
      from public.mouvements mv
      where mv.id = p_parent_id and mv.espace_id = p_espace_id
    )
    -- 0042 : types 0040 — parent_id = uuid de ligne LOGEMENT (posé par le mapper via logRef) → l'entité
    -- est celle du logement. Un parent_id NULL (logRef absent) retombe sur entite_of_logement(NULL)=NULL.
    when 'assurance'  then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'mrh'        then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'equipement' then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'quittance'  then public.entite_of_logement(p_espace_id, p_parent_id)
    when 'candidat'   then public.entite_of_logement(p_espace_id, p_parent_id)
    else null
  end;
$$;
revoke all on function public.entite_of_document(uuid, text, uuid) from public;
grant execute on function public.entite_of_document(uuid, text, uuid) to authenticated;

commit;
