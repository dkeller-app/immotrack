# PROMPT — Session SECU-C3 · Appartenance aux espaces fermée au client · modèle **Opus**

Tu es la session dédiée au chantier **SECU-C3** issu de l'audit de sécurité du 05/10 : aujourd'hui le client peut écrire directement dans `espace_members`. Il faut que l'appartenance à un espace ne s'obtienne qu'avec le consentement de l'intéressé, et que le client ne confonde jamais plusieurs espaces « à moi ».

## À lire avant toute chose
1. `AGENTS.md`.
2. `BACKLOG.md`, section **« 🔴 P0 — AUDIT DE SÉCURITÉ COMPLET »**.
3. **Le rapport confidentiel** `mockups/AUDIT-SECURITE/RAPPORT.md` §R3, puis `zones/Z1-rls-rpc.md` (Z1-01) et `zones/CA-1-base.md` (mécanisme corrigé, il prime). Il est gitignoré et n'existe que sur le PC de Didier ; en session cloud, demande-le en pièce jointe. **Ne le commite jamais.**
4. Migrations `0001`, `0003`, `0004`, `0029`, `0032`, `0050`, `0053` ; client `js/app/supabase-boot.js` (`resolveEspaces`), `js/core/store-multi.js`, `js/app/supabase-entry.js` (choix de l'espace propre, `persistConfig`).

## Objectif
1. **Serveur** : `authenticated` et `anon` n'ont plus INSERT ni UPDATE sur `espace_members`. Les seuls écrivains sont les RPC `SECURITY DEFINER` (`create_espace`, `accept_invitation`, et `_revokeMember`/DELETE à revoir). Si un futur « co-gérant plein » est voulu : RPC à consentement, pas maintenant.
2. **Client** :
   - « espace propre » = `created_by === uid`, pas `full_espace` ;
   - requête des appartenances ordonnée (`created_at`) ;
   - la config (partagée et privée) est lue et écrite **uniquement** pour l'espace propre ;
   - si plusieurs espaces propres : alerte, rien n'est câblé au hasard.
3. **Vérification préalable en SELECT** : aucun membre plein actif autre que le créateur (0 au 05/10). À refaire juste avant d'appliquer la migration.
4. **Tests** : `supabase/tests/` (INSERT/UPDATE client sur `espace_members` → 42501 ; `create_espace` et `accept_invitation` fonctionnent toujours) et `__tests__/` (store multi-espaces : config d'`own` uniquement).

## Déroulé
Migration simulée (`supabase/tests/sim` ou base locale) → tests RLS → client → contre-audit par un agent `opus` qui n'a rien écrit → **GO Didier** → migration appliquée via `node scripts/db-run.mjs migrate` (jamais `supabase db push`) → front.

## Règles
- Branche `fix/secu-c3-membres`. Commits neutres (« durcissement appartenance aux espaces ») : le dépôt est public.
- Aucune écriture en base sans GO. Le pilotage attribue le numéro de version.
