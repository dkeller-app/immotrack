-- 0051 — Partage par SCI : espace_config_scoped devient une VRAIE allowlist pour un membre SCOPÉ.
--
-- FAILLE (audit adversarial 2026-09-18, B1) : la RPC (0043/0044) partait du blob INTÉGRAL et ne FILTRAIT
-- que 8 clés connues (irlHistorique, loyerBareme, assurances, compteursReleves, equipements, emailsSent,
-- regulValidations, irlLettres). Toute AUTRE clé était renvoyée telle quelle au scopé : en prod
-- `importRules` (règles d'import bancaire : libellés + affectations de TOUTES les SCIs), `templates`,
-- `edlTemplates`, `catMapping`, `params.mandataire`, `params.gerantDefaut`, `params.quittancesMeta`… et
-- surtout toute clé FUTURE (extractConfig côté client pousse dans ce blob tout ce qui n'est pas une table).
-- Fail-OPEN par construction, malgré le commentaire « ALLOWLIST EXHAUSTIF ».
--
-- FIX : pour un scopé, on CONSTRUIT un objet neuf qui ne contient QUE les clés par-SCI, chacune filtrée
-- par accessibilité (mêmes filtres qu'avant, inchangés). Tout le reste — config d'app, params, clés
-- inconnues — n'est PLUS renvoyé. Fail-CLOSED : une nouvelle clé n'atteint un scopé que si on l'ajoute ici.
--
-- IMPACT FONCTIONNEL : nul. Le client (js/core/store-multi.js, hydrate) n'utilise la config QUE de
-- l'espace PROPRE (`else if (s.mine)`) ; la config d'un espace tiers est jetée. Membre PLEIN : inchangé
-- (blob intégral). Non-membre : null, inchangé.
--
-- Idempotente (create or replace). Dépend de 0043 (ref_logement_accessible / nom_immeuble_accessible).

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
  res jsonb := '{}'::jsonb;
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

  -- ── Membre SCOPÉ : ALLOWLIST. `res` part de VIDE ; seules les clés ci-dessous y entrent, filtrées. ──
  -- irlHistorique / loyerBareme : tableaux {ref} → refs de logement accessibles.
  if jsonb_typeof(cfg -> 'irlHistorique') = 'array' then
    res := res || jsonb_build_object('irlHistorique', coalesce((
      select jsonb_agg(e) from jsonb_array_elements(cfg -> 'irlHistorique') e
      where public.ref_logement_accessible(p_espace_id, e ->> 'ref')), '[]'::jsonb));
  end if;
  if jsonb_typeof(cfg -> 'loyerBareme') = 'array' then
    res := res || jsonb_build_object('loyerBareme', coalesce((
      select jsonb_agg(e) from jsonb_array_elements(cfg -> 'loyerBareme') e
      where public.ref_logement_accessible(p_espace_id, e ->> 'ref')), '[]'::jsonb));
  end if;
  -- assurances BAILLEUR : tableau {logement}.
  if jsonb_typeof(cfg -> 'assurances') = 'array' then
    res := res || jsonb_build_object('assurances', coalesce((
      select jsonb_agg(e) from jsonb_array_elements(cfg -> 'assurances') e
      where public.ref_logement_accessible(p_espace_id, e ->> 'logement')), '[]'::jsonb));
  end if;
  -- compteursReleves / equipements : objets keyés par ref de logement.
  if jsonb_typeof(cfg -> 'compteursReleves') = 'object' then
    res := res || jsonb_build_object('compteursReleves', coalesce((
      select jsonb_object_agg(k, v) from jsonb_each(cfg -> 'compteursReleves') as t(k, v)
      where public.ref_logement_accessible(p_espace_id, k)), '{}'::jsonb));
  end if;
  if jsonb_typeof(cfg -> 'equipements') = 'object' then
    res := res || jsonb_build_object('equipements', coalesce((
      select jsonb_object_agg(k, v) from jsonb_each(cfg -> 'equipements') as t(k, v)
      where public.ref_logement_accessible(p_espace_id, k)), '{}'::jsonb));
  end if;
  -- emailsSent : journal (PII) {entityType, entityId} → logement/bail accessibles seulement.
  if jsonb_typeof(cfg -> 'emailsSent') = 'array' then
    res := res || jsonb_build_object('emailsSent', coalesce((
      select jsonb_agg(e) from jsonb_array_elements(cfg -> 'emailsSent') e
      where e ->> 'entityType' in ('logement', 'bail')
        and public.ref_logement_accessible(p_espace_id, e ->> 'entityId')), '[]'::jsonb));
  end if;
  -- regulValidations : objet keyé « <nom immeuble>|<du>|<au> » → immeuble accessible.
  if jsonb_typeof(cfg -> 'regulValidations') = 'object' then
    res := res || jsonb_build_object('regulValidations', coalesce((
      select jsonb_object_agg(k, v) from jsonb_each(cfg -> 'regulValidations') as t(k, v)
      where public.nom_immeuble_accessible(p_espace_id, split_part(k, '|', 1))), '{}'::jsonb));
  end if;
  -- TOUT LE RESTE (categories, templates, importRules, params, irlLettres, bailEvents, clé inconnue…) :
  -- NON renvoyé à un scopé. Pour ouvrir une clé : l'ajouter ICI avec son filtre par-SCI + un test.
  return res;
end;
$$;
revoke all on function public.espace_config_scoped(uuid) from public;
grant execute on function public.espace_config_scoped(uuid) to authenticated;

commit;
