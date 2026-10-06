# PROMPT — Session dédiée AUDIT DE SÉCURITÉ · modèle **Opus** (agents Fable si disponibles)

Tu es la session dédiée à l'**audit de sécurité complet** de Propryo : app web vanilla JS, Supabase (auth, Postgres + RLS, Storage, Realtime), worker relais (`relay/`) pour les pages publiques. C'est un **P0 bloquant pour la commercialisation**. Audit en boîte blanche, **aucun code de l'app modifié**.

## Étape 0 — ne pas refaire ce qui existe
Le BACKLOG prévoyait un rapport `mockups/AUDIT-SECURITE/RAPPORT.md`. Il n'est pas sur GitHub. En revanche, l'historique montre des correctifs numérotés « Sécurité P0-2 : sweep XSS » (v15.633) et un partage par SCI durci (migrations 0050 à 0053, branche `feat/partage-isolation-sci`).
**Demande d'abord à Didier** si le rapport existe sur son PC, et s'il peut le déposer :
- **s'il existe**, ta mission = vérifier ce qui a été corrigé, puis auditer les trous restants et ce qui a changé depuis ;
- **sinon**, audit complet.

## À lire
1. `AGENTS.md`.
2. `BACKLOG.md`, section **« 🔴 P0 — AUDIT DE SÉCURITÉ COMPLET »** : le périmètre consolidé d'environ 20 sections est la base, ne le réécris pas. Il couvre notamment :
   - authentification et prise de contrôle de compte ;
   - isolation par RLS table par table (`supabase/migrations/`) ;
   - partage et invitations ;
   - IDOR, UUID déterministes, RPC `SECURITY DEFINER` ;
   - XSS stocké, rendu HTML et PDF ;
   - Storage et téléversements ;
   - pages publiques et worker relais ;
   - secrets et données personnelles (IBAN) ;
   - en-têtes, CSP, Realtime.
3. `supabase/` (migrations, tests RLS : `npm run test:rls`), `relay/`, `js/core/store-sync.js`, `js/supabase-entry.js` (ou leurs équivalents).

## Livrable
`mockups/AUDIT-SECURITE/RAPPORT.md` :
- chaque constat classé par gravité. 🔴 = accès d'un compte aux données d'un autre, prise de contrôle, falsification d'un document signé. Puis 🟠 et 🟡 ;
- chaque constat avec : preuve (fichier:ligne ou requête), scénario d'attaque concret, correctif proposé, test qui le prouverait ;
- en fin de rapport, la liste ordonnée des chantiers de correction, chacun avec sa taille.

Tests d'intrusion seulement en lecture et sur ton propre compte de test. Jamais d'écriture sur les données de Didier ou de Marion. Toute requête Supabase via le MCP en SELECT uniquement.

## Pilotage des modèles
- **Toi (Opus)** : synthèse, gravités, scénarios d'attaque.
- **Agents `sonnet`** : cartographie (liste des tables et de leurs politiques RLS, des handlers inline, des appels `innerHTML`, des routes du relais).
- **Agents `fable`** (sinon `opus`) : l'analyse adverse des zones critiques (RLS et RPC `SECURITY DEFINER`, invitations, relais public, chaîne de signature). Une zone par agent, avec un brief autonome.
- **Contre-audit** des 🔴 par un second agent `opus` avant de les présenter.

## Règles
- Aucune modification de l'app, aucun commit hors `mockups/AUDIT-SECURITE/`, aucune migration.
- Ne publie aucun secret dans le rapport (dis où il est, pas sa valeur).
- Branche `audit/securite`.
- Fin de session : « Rapport écrit dans `mockups/AUDIT-SECURITE/RAPPORT.md` — dis "où en est sécurité" à ta session pilotage pour planifier les correctifs. »
- Français, direct, zéro flatterie.
