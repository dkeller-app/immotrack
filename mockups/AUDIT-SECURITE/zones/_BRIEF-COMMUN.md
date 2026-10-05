# Brief commun — analyse adverse (audit sécurité Propryo, 2026-10-05)

Contexte : Propryo (ex-ImmoTrack) = app web vanilla JS (coquille `index.html`, code applicatif dans `js/app/app-part1.js`, `app-part2.js`, `app-part3.js`, modules `js/core/*.js`, `js/app/supabase-entry.js`, `js/app/supabase-boot.js`, `js/core/store-*.js`), backend Supabase (auth, Postgres + RLS — `supabase/migrations/0001→0055`, Storage, Realtime), worker Cloudflare `relay/` (signature à distance, dossiers candidats). Pas de backend propre. Multi-tenant : `espaces` → `espace_members` (role owner/gestionnaire/…, `full_espace`) → partage scopé par SCI (`entite_membre`). Les membres d'un espace partagé sont des personnes DIFFÉRENTES (ex. Didier et Marion), donc un membre est un attaquant crédible contre un autre membre.

Un premier audit a été rendu le 2026-09-09 sur migrations 0001→0046 : `mockups/AUDIT-SECURITE/RAPPORT-2026-09-09.md` (lis-le, au moins les constats de ta zone). Depuis, des correctifs ont été livrés (git log : P0-1 tamponnage serveur, P0-3 CSP egress, P0-4 table audit_log 0047, P0-6 révocation epoch, RT-1 0048, PUB-1 0049, P0-2 sweep XSS `_lyQ` v15.633, durcissements F9.2/F4 PKCE/F14.1/F14.2/F-proto/xlsx v15.629, partage 0050→0053, 0054 journal baux, 0055 archivage bail signé). ATTENTION : le rapport du 09/09 contient des affirmations à revérifier (ex. il affirme que les RPC de partage sont « revoke all from public » et qu'il n'y a « pas d'auto-escalade » ; la cartographie récente laisse penser autrement). Ne le crois pas sur parole.

Cartographie factuelle déjà faite (à utiliser, ne pas refaire) : `mockups/AUDIT-SECURITE/cartographie/01-tables-rls.md`, `02-rpc-functions.md`, `03-relay-routes.md`.

## Règles absolues
- LECTURE SEULE. Aucune modification de fichier hors de TON livrable. Aucun commit, aucun push. Aucun appel réseau vers la prod. N'utilise AUCUN outil Supabase/MCP (je fais moi-même les vérifications live en SELECT).
- Tu peux lancer les tests locaux existants s'ils ne touchent pas le réseau (ex. `cd relay && npx vitest run`), et écrire des scripts jetables dans `/tmp`.
- Ne recopie aucune valeur de secret (dis où il est).
- Postgres/Supabase : souviens-toi que (a) EXECUTE est accordé à PUBLIC par défaut à la création d'une fonction ; (b) Supabase accorde par défaut SELECT/INSERT/UPDATE/DELETE sur les tables de `public` à anon et authenticated (la RLS est alors la seule barrière) ; (c) une policy sans `TO` vaut pour PUBLIC ; (d) plusieurs policies permissives d'une même commande sont en OU ; (e) pour UPDATE, USING filtre la ligne avant, WITH CHECK la ligne après ; (f) un trigger BEFORE s'applique même au service_role, la RLS non ; (g) `set_config()` est une fonction de pg_catalog, pas exposée par PostgREST sauf via une RPC du schéma exposé, mais PostgREST pose lui-même des GUC `request.*`.

## Méthode
Pense en attaquant : un compte authentifié quelconque (inconnu, pas membre), un membre scopé d'une SCI, un gestionnaire, un signataire, un anonyme sur Internet. Pour chaque hypothèse, va jusqu'à la preuve ou la réfutation dans le code (fichier:ligne). Une hypothèse réfutée se note brièvement (« vérifié sain : … ») — c'est utile.

## Livrable (fichier indiqué dans ta mission)
1. **Statut des constats du 09/09 de ta zone** : tableau `Réf | Statut (CORRIGÉ / PARTIEL / OUVERT / RÉGRESSION / CADUC) | Preuve fichier:ligne | Commentaire`.
2. **Nouveaux constats**, chacun avec :
   - Titre, gravité proposée : 🔴 (accès d'un compte aux données d'un autre compte/espace, prise de contrôle de compte, falsification d'un document signé, élévation vers owner) · 🟠 (sérieux) · 🟡 (durcissement) ;
   - Statut de preuve : « prouvé par lecture » ou « à confirmer en live » (et dis exactement quelle requête SELECT ou quel test live trancherait) ;
   - Preuve : fichier:ligne (+ extrait court) ;
   - Scénario d'attaque concret, pas à pas (qui, avec quoi, quelle requête HTTP/PostgREST/SQL) ;
   - Correctif proposé (précis : quelle policy/fonction/ligne) ;
   - Test qui prouverait le correctif (nom de fichier de test plausible dans `supabase/tests/` ou `relay/test/` ou `__tests__/`, et assertion).
3. **Vérifié sain** : liste courte.
Français, direct, sans flatterie. Termine ton message de retour par un résumé ≤ 20 lignes : constats par gravité (titre + une ligne), et statut des anciens constats.
