-- 0055 — Bail signé : ARCHIVAGE autorisé (et SEULEMENT lui) sur une ligne verrouillée.
--
-- POURQUOI (prouvé le 28/09 sur la base hébergée, supabase/tests/repro-bail-signe-cloture.test.mjs) :
-- une ligne `baux` verrouillée (0014 prevent_locked_mutation) refuse TOUT UPDATE, y compris
-- `archived = true`. Or l'index `baux_one_active_per_logement` (0012) n'admet qu'UN bail actif
-- (non supprimé, non archivé) par logement. Un bail signé, une fois clôturé, occupait donc le
-- logement POUR TOUJOURS : le bail du locataire suivant ne pouvait jamais monter au cloud, et le
-- bail clôturé revenait comme « bail en cours » au rechargement. Le design P0-C1 (résiliation =
-- événement dans `baux_evenements`) n'avait pas traité ce cas.
--
-- DÉCISION DIDIER (28/09, option « B2 ») : le contrat signé NE BOUGE JAMAIS — seul son ÉTAT
-- « archivé » peut changer, une fois, dans un seul sens. La vie du bail (modifications, IRL,
-- départ, dépôt de garantie…) vit dans le journal `baux_evenements` (0054), jamais dans la ligne.
--
-- RÈGLE POSÉE ICI (table `baux` uniquement ; `edl` inchangé) : sur une ligne verrouillée, un UPDATE
-- passe si et seulement si
--   • OLD.archived = false ET NEW.archived = true (jamais de désarchivage),
--   • et AUCUNE autre colonne ne change (comparaison de la ligne entière hors archived / updated_at /
--     version — ces deux dernières sont posées par touch_row, qui s'exécute APRÈS ce trigger :
--     trg_prevent_locked_mutation < trg_touch_baux dans l'ordre alphabétique des triggers).
-- Toute autre écriture sur une ligne verrouillée reste refusée (ROW_LOCKED_IMMUTABLE), DELETE compris.
-- La suppression logique (deleted_at) reste refusée : un bail signé s'archive, il ne se supprime pas.
-- RLS inchangée : l'archivage est un UPDATE ordinaire, soumis aux mêmes droits d'écriture par SCI.
-- L'échappatoire d'administration (app.bypass_immutable, 0014) est conservée à l'identique.

begin;

create or replace function public.prevent_locked_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.bypass_immutable', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    if old.locked then
      raise exception 'ROW_LOCKED_IMMUTABLE'
        using detail = format('%s id=%s verrouille (signe) : DELETE refuse', tg_table_name, old.id);
    end if;
    return old;
  else  -- UPDATE
    if old.locked then
      -- 0055 : seule transition permise sur un bail signé = l'archivage (false → true), rien d'autre.
      -- IF imbriqué À DESSEIN : `edl` n'a pas de colonne `archived` ; la condition interne n'est
      -- préparée que pour `baux` (sinon « record old has no field archived » sur un EDL verrouillé).
      if tg_table_name = 'baux' then
        if old.archived = false and new.archived = true
           and (to_jsonb(new) - array['archived', 'updated_at', 'version'])
             = (to_jsonb(old) - array['archived', 'updated_at', 'version']) then
          return new;
        end if;
      end if;
      raise exception 'ROW_LOCKED_IMMUTABLE'
        using detail = format('%s id=%s verrouille (signe) : UPDATE refuse', tg_table_name, old.id);
    end if;
    return new;
  end if;
end;
$$;

commit;
