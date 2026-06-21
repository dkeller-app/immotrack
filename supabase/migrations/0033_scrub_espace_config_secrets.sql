-- P1 — Anti-fuite partage par-SCI : SCRUB des params LOCAL-USER déjà présents dans espace_config.data.
--
-- Contexte : espace_config a une RLS `is_member` (niveau espace) → TOUT membre, y compris un invité
-- SCOPÉ (full_espace=false), lit le blob `data` entier. Or `data.params` contenait des clés LOCAL-USER
-- qui n'auraient jamais dû y être, dont un SECRET :
--   - bailSignAppKey  → 🔴 clé API du relais Cloudflare de signature (un membre pouvait s'en servir)
--   - bailSignRelayUrl, imRootFolderId, edlDriveFolderId, coGestionnaires → par-appareil/par-user
--
-- Le code ne les écrit plus (strip dans store-supabase `extractConfig` + store-sync `configSig`,
-- symétrique du strip Drive `_buildGlobalPayload`) et les restaure depuis un localStorage dédié après
-- hydrate (`__immoSetDB`). Cette migration NETTOIE l'existant côté serveur. Idempotente.
--
-- ⚠️ OPS REQUIS (hors migration) : la clé `bailSignAppKey` ayant été lisible par des membres, la
--    REGÉNÉRER côté worker Cloudflare (l'ancienne est à considérer comme compromise).

begin;

update public.espace_config
   set data = jsonb_set(
        data,
        '{params}',
        ( coalesce(data -> 'params', '{}'::jsonb)
            - 'bailSignAppKey'
            - 'bailSignRelayUrl'
            - 'imRootFolderId'
            - 'edlDriveFolderId'
            - 'coGestionnaires' ),
        false)
 where data ? 'params'
   and (data -> 'params') ?| array['bailSignAppKey','bailSignRelayUrl','imRootFolderId','edlDriveFolderId','coGestionnaires'];

commit;
