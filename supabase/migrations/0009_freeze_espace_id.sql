-- P0-B — Durcissement post-audit qualité (Tâche 1) : immutabilité de espace_id.
--
-- FAILLE [Important] (revue code-quality de la Tâche 1) : les write-policies RLS
-- (has_role sur espace_id) autorisent un writer membre de DEUX espaces (owner/gestionnaire
-- de A ET de B) à exécuter `update ... set espace_id = <B>` → déplacement SILENCIEUX d'une
-- ligne d'un tenant vers un autre. Même classe que SEV-1 fermée pour espace_members en 0006
-- (members_freeze_identity). espace_id est LA clé d'isolation ET la cible des FK composites
-- (id, espace_id) de toutes les tables enfant : le laisser mutable propagerait la faille à
-- TOUTES les tables P0-B et casserait la stabilité des FK composites.
--
-- Solution robuste (pas un patch) = trigger d'immutabilité, comme 0006 :
--   - s'applique MÊME au service_role (bypassrls ne contourne PAS les triggers, contrairement
--     à un simple with check RLS) ;
--   - fonction UNIQUE réutilisée par TOUTES les tables métier (boucle DDL, zéro divergence) ;
--   - search_path='' homogène avec tout le projet (0007).
-- Append-only : ne modifie pas 0008. Rattrape entites/immeubles (déjà créées en 0008) ;
-- les migrations suivantes (0010+) créent le trigger dans leur boucle RLS.

create or replace function public.freeze_espace_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.espace_id is distinct from old.espace_id then
    raise exception 'ESPACE_ID_IMMUTABLE';
  end if;
  return new;
end;
$$;

-- Rattrapage des tables déjà créées en 0008.
do $freeze$
declare t text;
begin
  foreach t in array array['entites','immeubles'] loop
    execute format(
      'create trigger trg_freeze_espace_id before update on public.%I
         for each row execute function public.freeze_espace_id()', t);
  end loop;
end
$freeze$;
