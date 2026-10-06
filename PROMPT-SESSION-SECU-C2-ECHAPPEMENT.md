# PROMPT — Session SECU-C2 · Échappement : 2ᵉ balayage + garde automatique · **Sonnet orchestrateur** (+ contre-audit Opus)

Tu es la session dédiée au chantier **SECU-C2** issu de l'audit de sécurité du 05/10. Le balayage v15.633 (`_lyQ`) a laissé des sites ; un garde automatique doit empêcher que ça se reproduise.

## À lire avant toute chose
1. `AGENTS.md`.
2. `BACKLOG.md`, section **« 🔴 P0 — AUDIT DE SÉCURITÉ COMPLET »**.
3. **Le rapport confidentiel** `mockups/AUDIT-SECURITE/RAPPORT.md` §R2, puis `zones/CA-3-xss.md` (**liste exhaustive des sites, fichier:ligne — elle prime sur `zones/Z5-front-xss.md`**). Il est gitignoré et n'existe que sur le PC de Didier ; en session cloud, demande-le en pièce jointe. **Ne le commite jamais, ne recopie pas la liste des sites dans un fichier suivi.**
4. Le commentaire de `_lyQ` (`js/app/app-part2.js`, grep `_lyQ`) et le commit `7088789`.

## Objectif
1. **Chaque site de la liste corrigé** avec le bon helper selon le contexte : argument JS dans un attribut `on*` → `_lyQ` ; texte ou attribut HTML → `escHtml` ; donnée sérialisée dans un `<script>` inline → **nouveau helper unique** `_jsonForInlineScript` (échappe `<`, `>`, `&`, U+2028, U+2029), appliqué à **toutes** les sérialisations de la fenêtre du bail ; `innerHTML` dans la popup → `_wizV2Esc`.
2. Le code mort non échappé est supprimé (pas « laissé au cas où »).
3. Les champs identité reçus du relais candidat sont bornés (longueur, classe de caractères) dans `relay/src/validate.js` : défense en profondeur, l'échappement en sortie reste la barrière.
4. **Garde automatique** : un test qui parcourt `js/app/app-part*.js` et échoue sur tout handler `on*` dont l'argument passe par `escHtml` sans `_lyQ`, et sur toute sérialisation JSON non enveloppée dans le script de la popup.
5. Tests de rendu (jsdom) : pour chaque vue touchée, des données contenant des caractères spéciaux HTML/JS ressortent intactes et inertes.

## Déroulé
- Un agent `sonnet` par groupe de sites (fenêtre du bail / vues Loyers-impayés / autres). Toi : revue et intégration.
- Puis un agent **`opus` contre-auditeur** qui n'a rien écrit : il refait une passe indépendante sur `js/app/` et `js/core/` à la recherche de sites non listés.
- Sandbox-first et vérification dans le navigateur (3 formats), selon AGENTS.md. Après modif de `js/app/app-part*.js` : `node tools/stamp-app-parts.mjs`.

## Règles
- Branche `fix/secu-c2-echappement`. Commits **neutres** (« durcissement échappement »), sans charge utile ni description d'attaque : le dépôt est public. Les tests utilisent des chaînes inertes (caractères spéciaux), jamais de charge offensive.
- Le pilotage attribue le numéro de version ; GO Didier avant merge.
