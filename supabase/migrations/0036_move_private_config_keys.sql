-- P1 — Volet 3 : DÉPLACE les clés propriétaire-privé du blob partagé `espace_config` vers
-- `espace_config_private` (auditTrail, candidatLinks, params.bankAccounts, params.userProfile).
--
-- Rend le déplacement REPRODUCTIBLE (DR / restauration d'un backup pré-move / nouvel environnement),
-- là où l'app fait le split à l'exécution. Miroir du modèle 0033 (scrub), mais MOVE (copie PUIS retrait)
-- pour ne RIEN perdre hors-prod. **Idempotent** : sur une base déjà migrée (ETL), l'INSERT est
-- court-circuité (ligne privée déjà présente) et l'UPDATE ne matche plus rien → no-op (0 ligne).
-- Dépend de 0035 (table espace_config_private).

begin;

-- 1) Copier le sous-ensemble PRIVÉ vers la table privée (skip si la ligne existe déjà).
insert into public.espace_config_private (espace_id, data)
select ec.espace_id,
  coalesce((select jsonb_object_agg(k, val) from jsonb_each(ec.data) e(k, val)
            where k in ('auditTrail', 'candidatLinks')), '{}'::jsonb)
  || case when (ec.data -> 'params') ?| array['bankAccounts', 'userProfile']
          then jsonb_build_object('params',
                 (select jsonb_object_agg(k, val) from jsonb_each(ec.data -> 'params') p(k, val)
                  where k in ('bankAccounts', 'userProfile')))
          else '{}'::jsonb end
from public.espace_config ec
where ec.data ?| array['auditTrail', 'candidatLinks']
   or (ec.data -> 'params') ?| array['bankAccounts', 'userProfile']
on conflict (espace_id) do nothing;

-- 2) Retirer ces clés du blob PARTAGÉ (lu par tout membre via is_member).
update public.espace_config
set data = (data - 'auditTrail' - 'candidatLinks')
         || jsonb_build_object('params', coalesce(data -> 'params', '{}'::jsonb) - 'bankAccounts' - 'userProfile')
where data ?| array['auditTrail', 'candidatLinks']
   or (data -> 'params') ?| array['bankAccounts', 'userProfile'];

commit;
