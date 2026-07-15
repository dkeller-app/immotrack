-- 0043 — CONFIG SCOPÉE : le blob espace_config ne fuite plus ENTIER au membre scopé par-SCI.
--
-- CONTEXTE (AUDIT-SYNC-CLOUD-2026-07-12 §4, gap [AUDIT] étape 5). espace_config.data est un blob unique
-- par espace, dont la SELECT était gardée par is_member → LU par TOUT membre, y compris un membre SCOPÉ
-- par-SCI. Il contient des clés PER-SCI keyées par ref de logement — irlHistorique (historique des
-- révisions de loyer), assurances BAILLEUR (PNO/GLI), compteursReleves (relevés de compteurs) — de
-- TOUTES les SCIs de l'espace. Un scopé recevait donc l'historique/les assurances/les compteurs de SCIs
-- qu'il n'a pas le droit de voir (fuite RGPD confirmée).
--
-- La RLS est ligne-par-ligne : elle ne peut pas exposer PARTIELLEMENT une colonne jsonb. On règle donc
-- côté SERVEUR (esprit 0035/0036, jamais un filtre client) par :
--   1) une RPC SECURITY DEFINER `espace_config_scoped` qui renvoie le blob INTÉGRAL à un membre PLEIN et
--      FILTRÉ (les 3 clés per-SCI réduites aux refs de logement ACCESSIBLES) à un membre SCOPÉ. Les clés
--      d'APP (params/categories/templates/irlTable/piecesEDL/catConfig…) ne sont PAS per-SCI → conservées
--      telles quelles (le scopé en a besoin pour rendre l'app) ;
--   2) le durcissement de la SELECT brute d'espace_config à is_full_member → un scopé ne lit PLUS le blob
--      directement (il passe par la RPC). INSERT/UPDATE/DELETE inchangés (has_role = manager plein ; un
--      scopé, lecture_seule au niveau espace, n'écrit jamais la config).
--
-- HYPOTHÈSE (invariant app) : une ref de logement est UNIQUE dans un espace (l'app keye logementByRef par
-- ref). Le filtre matche la ref en TOLÉRANT (lower+btrim, comme norm()). Si deux SCIs d'un même espace
-- partageaient une ref (donnée déjà ambiguë pour l'app), le filtre serait permissif sur cette ref — angle
-- documenté, hors du cas réel. FAIL-CLOSED par défaut : une ref inconnue/non accessible est EXCLUE.
--
-- Additif et réversible (réappliquer la policy is_member de 0027). Aucun membre scopé en prod aujourd'hui
-- (partage non activé) → application sans effet sur un utilisateur courant. Dépend de 0027 (espace_config),
-- 0029 (is_full_member), 0030 (has_entite_access).

begin;

-- ── helper : la ref de logement `p_ref` désigne-t-elle un logement ACCESSIBLE au caller dans l'espace ?
--    SECURITY DEFINER (bypass RLS pour la résolution) ; l'AUTORISATION reste has_entite_access. Borné à
--    p_espace_id (étanchéité tenant). Comparaison tolérante (lower+btrim = norm() côté app).
create or replace function public.ref_logement_accessible(p_espace_id uuid, p_ref text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.logements l
    where l.espace_id = p_espace_id
      and lower(btrim(l.ref)) = lower(btrim(p_ref))
      and public.has_entite_access(p_espace_id, l.entite_id)
  );
$$;
revoke all on function public.ref_logement_accessible(uuid, text) from public;
grant execute on function public.ref_logement_accessible(uuid, text) to authenticated;

-- ── RPC filtrante : blob espace_config INTÉGRAL (membre plein) ou FILTRÉ par-SCI (membre scopé).
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
  -- non-membre → rien (défense en profondeur ; la RLS le refuserait déjà sur la table).
  if not public.is_member(p_espace_id) then
    return null;
  end if;
  select data into cfg from public.espace_config where espace_id = p_espace_id;
  if cfg is null then
    return '{}'::jsonb;
  end if;
  -- membre PLEIN (owner inclus) → blob intégral, comportement P0 inchangé.
  if public.is_full_member(p_espace_id) then
    return cfg;
  end if;
  -- membre SCOPÉ → filtrer les 3 clés per-SCI par ref de logement accessible.
  -- irlHistorique : tableau d'objets {ref, …} → garder ceux dont `ref` = un logement accessible.
  if jsonb_typeof(cfg -> 'irlHistorique') = 'array' then
    cfg := jsonb_set(cfg, '{irlHistorique}', coalesce((
      select jsonb_agg(e)
      from jsonb_array_elements(cfg -> 'irlHistorique') e
      where public.ref_logement_accessible(p_espace_id, e ->> 'ref')
    ), '[]'::jsonb));
  end if;
  -- assurances BAILLEUR : tableau d'objets {logement, …} → garder ceux dont `logement` (ref) accessible.
  if jsonb_typeof(cfg -> 'assurances') = 'array' then
    cfg := jsonb_set(cfg, '{assurances}', coalesce((
      select jsonb_agg(e)
      from jsonb_array_elements(cfg -> 'assurances') e
      where public.ref_logement_accessible(p_espace_id, e ->> 'logement')
    ), '[]'::jsonb));
  end if;
  -- compteursReleves : objet {ref: [...]} → garder les clés `ref` accessibles.
  if jsonb_typeof(cfg -> 'compteursReleves') = 'object' then
    cfg := jsonb_set(cfg, '{compteursReleves}', coalesce((
      select jsonb_object_agg(k, v)
      from jsonb_each(cfg -> 'compteursReleves') as t(k, v)
      where public.ref_logement_accessible(p_espace_id, k)
    ), '{}'::jsonb));
  end if;
  return cfg;
end;
$$;
revoke all on function public.espace_config_scoped(uuid) from public;
grant execute on function public.espace_config_scoped(uuid) to authenticated;

-- ── Fermer la fuite : SELECT brute du blob = membre PLEIN uniquement (le scopé passe par la RPC).
drop policy if exists espace_config_select on public.espace_config;
create policy espace_config_select on public.espace_config
  for select to authenticated
  using ( public.is_full_member(espace_id) );

commit;
