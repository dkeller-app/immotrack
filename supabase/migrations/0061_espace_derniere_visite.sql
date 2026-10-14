-- 0061 (NUMÉRO PROVISOIRE — le pilotage fixe le numéro définitif ; 0060 est réservée à feat/incident-circuit)
-- ESPACE LOCATAIRE — « Dernière visite » fidèle (smoke 14/10 : le bloc restait à 17 h 39 alors que le locataire
-- avait rouvert son espace ensuite).
--
-- CAUSE : el_ouvrir (0059) n'écrivait locataire_acces.derniere_visite qu'au plus UNE FOIS PAR HEURE. Toute réouverture
-- dans l'heure suivant la précédente laissait l'ancienne valeur. Le journal reste minimal (une seule colonne, aucune
-- donnée de navigation) ; on écrit désormais si la valeur a plus d'UNE MINUTE : une réouverture est visible tout de
-- suite, et un rechargement rapproché (ou une rafale) n'écrit pas plusieurs fois.
--
-- Seule la fonction el_ouvrir est remplacée (corps identique à 0059 hormis ce seuil). CREATE OR REPLACE conserve les
-- droits déjà posés (revoke / grant de 0059). Aucune table, aucune politique touchée.
begin;

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
  if a.derniere_visite is null or a.derniere_visite < now() - interval '1 minute' then
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
                     left join lateral (select x.statut from public.incidents x where x.espace_id = s.espace_id
                                         and (x.logement_id = s.logement_id or (x.logement_id is null and x.entite_id is not distinct from s.entite_id))
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

commit;
