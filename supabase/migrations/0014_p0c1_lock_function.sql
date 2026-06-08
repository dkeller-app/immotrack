-- P0-C1 — Tâche 1/6 : fonction d'immutabilité légale du signé (§9, invariant 10).
-- Branchée comme trigger BEFORE UPDATE OR DELETE sur baux (0015) et edl (0016).
--
-- Règle : dès que OLD.locked = true, tout UPDATE/DELETE est refusé. Le passage
--   false → true (acte de verrouillage à la signature) reste autorisé. L'INSERT
--   n'est JAMAIS intercepté (trigger UPDATE/DELETE only) → un signé importé entre
--   déjà verrouillé (import-aware, §9 l.184).
--
-- Échappatoire admin/import : le GUC de session app.bypass_immutable = 'on' lève le
--   verrou pour CETTE session uniquement. Sert (a) au ré-import idempotent (§9 l.284)
--   et (b) au démontage de test. INACCESSIBLE depuis PostgREST : un rôle authenticated
--   / anon ne peut pas exécuter SET app.* ; current_setting(...) renvoie alors NULL
--   (missing_ok = true) → jamais 'on'. Seule une connexion DB privilégiée (service_role
--   en SQL direct, script d'import) peut l'activer. Pas une faille applicative.
--
-- search_path = '' homogène avec freeze_espace_id (0009) — pas de résolution de schéma
--   implicite (vecteur d'escalade classique d'un SECURITY DEFINER/trigger).

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
      raise exception 'ROW_LOCKED_IMMUTABLE'
        using detail = format('%s id=%s verrouille (signe) : UPDATE refuse', tg_table_name, old.id);
    end if;
    return new;
  end if;
end;
$$;
