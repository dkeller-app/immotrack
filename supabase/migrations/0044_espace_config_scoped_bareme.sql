-- 0044 — CONFIG SCOPÉE : ajouter `loyerBareme` à l'allowlist de filtrage par-SCI.
--
-- CONTEXTE (AUDIT-SUIVI-LOYERS étape 2, 2026-07-15). L'étape 2 introduit une NOUVELLE clé de config
-- per-SCI : `loyerBareme` — tableau d'objets {ref, debut, fin, hc, ch, source, …} = le barème de loyer
-- historisé (source de vérité du dû dans le temps), keyé par ref de logement, exactement comme
-- `irlHistorique`. Elle transite par le blob espace_config (collection top-level non table-backée,
-- incluse par configSig de store-sync). La migration 0043 (espace_config_scoped) est un PASSTHROUGH :
-- elle ne filtre que les clés per-SCI qu'elle connaît et laisse passer les autres INTÉGRALEMENT. Sans
-- cet ajout, un membre SCOPÉ par-SCI recevrait le barème de TOUTES les SCIs de l'espace = fuite RGPD des
-- loyers d'autres bailleurs (le commentaire de 0043 le mandate : « toute NOUVELLE clé keyée par ref DOIT
-- être ajoutée ici »).
--
-- On recrée la RPC (CREATE OR REPLACE) à l'identique de 0043 + un bloc `loyerBareme` calqué sur
-- `irlHistorique` (même forme : tableau {ref}). FAIL-CLOSED : une ref inaccessible est exclue.
-- Additif et réversible. Aucun membre scopé en prod aujourd'hui (partage non activé) → application sans
-- effet sur un utilisateur courant. Dépend de 0043 (helpers ref_logement_accessible / is_full_member).

begin;

create or replace function public.espace_config_scoped(p_espace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cfg jsonb;
begin
  if not public.is_member(p_espace_id) then
    return null;
  end if;
  select data into cfg from public.espace_config where espace_id = p_espace_id;
  if cfg is null then
    return '{}'::jsonb;
  end if;
  if public.is_full_member(p_espace_id) then
    return cfg;
  end if;
  -- ⚠️ ALLOWLIST EXHAUSTIF (cf. 0043) : toute NOUVELLE clé de config keyée par ref de logement / nom
  -- d'immeuble / entité DOIT être filtrée ici, SINON elle fuite INTÉGRALEMENT au membre scopé.
  -- irlHistorique : tableau {ref} → garder les refs accessibles.
  if jsonb_typeof(cfg -> 'irlHistorique') = 'array' then
    cfg := jsonb_set(cfg, '{irlHistorique}', coalesce((
      select jsonb_agg(e)
      from jsonb_array_elements(cfg -> 'irlHistorique') e
      where public.ref_logement_accessible(p_espace_id, e ->> 'ref')
    ), '[]'::jsonb));
  end if;
  -- loyerBareme (AUDIT-SUIVI-LOYERS étape 2) : tableau {ref} → garder les refs accessibles. Même forme
  -- et même fail-closed qu'irlHistorique. C'est le barème de loyer historisé (dû dans le temps).
  if jsonb_typeof(cfg -> 'loyerBareme') = 'array' then
    cfg := jsonb_set(cfg, '{loyerBareme}', coalesce((
      select jsonb_agg(e)
      from jsonb_array_elements(cfg -> 'loyerBareme') e
      where public.ref_logement_accessible(p_espace_id, e ->> 'ref')
    ), '[]'::jsonb));
  end if;
  -- assurances BAILLEUR : tableau {logement} → garder les refs accessibles.
  if jsonb_typeof(cfg -> 'assurances') = 'array' then
    cfg := jsonb_set(cfg, '{assurances}', coalesce((
      select jsonb_agg(e)
      from jsonb_array_elements(cfg -> 'assurances') e
      where public.ref_logement_accessible(p_espace_id, e ->> 'logement')
    ), '[]'::jsonb));
  end if;
  -- compteursReleves : objet {ref: [...]} → garder les clés accessibles.
  if jsonb_typeof(cfg -> 'compteursReleves') = 'object' then
    cfg := jsonb_set(cfg, '{compteursReleves}', coalesce((
      select jsonb_object_agg(k, v)
      from jsonb_each(cfg -> 'compteursReleves') as t(k, v)
      where public.ref_logement_accessible(p_espace_id, k)
    ), '{}'::jsonb));
  end if;
  -- equipements : objet {ref: {...}} keyé par ref de logement → mêmes clés accessibles.
  if jsonb_typeof(cfg -> 'equipements') = 'object' then
    cfg := jsonb_set(cfg, '{equipements}', coalesce((
      select jsonb_object_agg(k, v)
      from jsonb_each(cfg -> 'equipements') as t(k, v)
      where public.ref_logement_accessible(p_espace_id, k)
    ), '{}'::jsonb));
  end if;
  -- emailsSent : tableau {entityType, entityId} = journal (PII). Garder logement/bail accessibles.
  if jsonb_typeof(cfg -> 'emailsSent') = 'array' then
    cfg := jsonb_set(cfg, '{emailsSent}', coalesce((
      select jsonb_agg(e)
      from jsonb_array_elements(cfg -> 'emailsSent') e
      where e ->> 'entityType' in ('logement', 'bail')
        and public.ref_logement_accessible(p_espace_id, e ->> 'entityId')
    ), '[]'::jsonb));
  end if;
  -- regulValidations : objet keyé « <nom immeuble>|<du>|<au> » → immeuble accessible.
  if jsonb_typeof(cfg -> 'regulValidations') = 'object' then
    cfg := jsonb_set(cfg, '{regulValidations}', coalesce((
      select jsonb_object_agg(k, v)
      from jsonb_each(cfg -> 'regulValidations') as t(k, v)
      where public.nom_immeuble_accessible(p_espace_id, split_part(k, '|', 1))
    ), '{}'::jsonb));
  end if;
  -- irlLettres : fail-closed (retiré entièrement pour un scopé) tant que sa forme per-SCI n'est pas fixée.
  if cfg ? 'irlLettres' then
    cfg := cfg - 'irlLettres';
  end if;
  return cfg;
end;
$$;
revoke all on function public.espace_config_scoped(uuid) from public;
grant execute on function public.espace_config_scoped(uuid) to authenticated;

commit;
