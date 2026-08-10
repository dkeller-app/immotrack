-- P1 — Partage par SCI : isolation STORAGE par entité (corrige C1 de l'audit 2026-06-18).
-- Dépend de 0024 (bucket 'espace-files' + safe_uuid) et 0029 (has_entite_access/has_entite_write).
--
-- PROBLÈME (C1) : les policies 0024 ancrent l'accès sur le SEUL 1er segment (espace_id) et
-- autorisent via is_member/has_role AU NIVEAU ESPACE. Un membre SCOPÉ étant un membre actif,
-- is_member est vrai pour lui → il pouvait lister/télécharger les fichiers (PDF baux, photos EDL,
-- justificatifs) de TOUTES les SCIs. Fuite cross-SCI sur les binaires.
--
-- CORRECTIF : on ajoute un segment ENTITÉ au chemin et on gate par has_entite_access /
-- has_entite_write sur CETTE entité. Convention de chemin :
--   • Fichier rattaché à une SCI :  <espace_id>/<entite_id>/files/<clé>     (seg2 = entite_id uuid)
--   • Fichier orphelin (sans SCI) :  <espace_id>/_orphelin/files/<clé>       (seg2 = '_orphelin')
--   • LEGACY (uploads d'avant ce correctif) : <espace_id>/files/<clé>         (seg2 = 'files')
-- safe_uuid(seg2) → uuid pour une SCI, NULL pour 'files'/'_orphelin'/tout non-uuid.
--
-- COMPORTEMENT (rétro-compatible, fail-closed, ZÉRO re-migration nécessaire) :
--   • Membre PLEIN (propriétaire) : has_entite_access(espace, …) renvoie true MÊME si seg2→NULL
--     (cf 0029). Il lit/écrit donc TOUT : nouveaux chemins par-SCI, orphelins ET fichiers legacy.
--     → comportement strictement inchangé pour le propriétaire, les anciens fichiers restent lisibles.
--   • Membre SCOPÉ : has_entite_access exige une entité NON NULL octroyée. Les chemins legacy/orphelin
--     (seg2→NULL) lui sont REFUSÉS ; les chemins <espace>/<autre_entite>/… aussi. Il n'atteint que
--     <espace>/<entite_octroyée>/… → plus aucune fuite cross-SCI. Les anciens fichiers (legacy) lui
--     sont invisibles tant qu'ils ne sont pas re-rangés sous leur SCI (acceptable : à faire avant
--     d'activer le partage si un scopé doit y accéder ; aucun scopé n'existe aujourd'hui).
--
-- Realtime (canal espace:<id>, 0025) reste espace-level : sévérité moindre (payloads de sync, pas de
-- binaire) et aucun membre scopé n'existe encore. À scoper (espace:<id>:<entite>) avant activation.

begin;

-- Remplace les 4 policies espace-level de 0024 par des policies par-ENTITÉ.
drop policy if exists "espace-files: lecture membre"  on storage.objects;
drop policy if exists "espace-files: insert writer"   on storage.objects;
drop policy if exists "espace-files: update writer"   on storage.objects;
drop policy if exists "espace-files: delete writer"   on storage.objects;

-- LECTURE = accès à l'entité du fichier (seg2). Membre plein : tout (seg2 NULL inclus). Scopé : octroi.
create policy "espace-files: lecture par entité"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'espace-files'
    and public.has_entite_access(
          public.safe_uuid( split_part(name, '/', 1) ),
          public.safe_uuid( split_part(name, '/', 2) )
        )
  );

-- ÉCRITURE (insert/update/delete) = droit d'écriture sur l'entité du fichier (seg2).
create policy "espace-files: insert par entité"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'espace-files'
    and public.has_entite_write(
          public.safe_uuid( split_part(name, '/', 1) ),
          public.safe_uuid( split_part(name, '/', 2) )
        )
  );

create policy "espace-files: update par entité"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'espace-files'
    and public.has_entite_write(
          public.safe_uuid( split_part(name, '/', 1) ),
          public.safe_uuid( split_part(name, '/', 2) )
        )
  )
  with check (
    bucket_id = 'espace-files'
    and public.has_entite_write(
          public.safe_uuid( split_part(name, '/', 1) ),
          public.safe_uuid( split_part(name, '/', 2) )
        )
  );

create policy "espace-files: delete par entité"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'espace-files'
    and public.has_entite_write(
          public.safe_uuid( split_part(name, '/', 1) ),
          public.safe_uuid( split_part(name, '/', 2) )
        )
  );

commit;
