# PROMPT — Session SECU-C1 · Signature à distance : identité du signataire vérifiée · modèle **Opus**

Tu es la session dédiée au chantier **SECU-C1** issu de l'audit de sécurité du 05/10. C'est un P0 : la signature à distance est en prod et le lancement est prévu vers le 14/10.

## À lire avant toute chose
1. `AGENTS.md`.
2. `BACKLOG.md`, section **« 🔴 P0 — AUDIT DE SÉCURITÉ COMPLET »** (statut, décision attendue de Didier).
3. **Le rapport confidentiel** `mockups/AUDIT-SECURITE/RAPPORT.md` : §R1, O5, O6, O9, O10, O18, et les annexes `zones/Z3-relais-public.md`, `zones/Z4-chaine-signature.md`, `zones/CA-2-relais.md`. Il est **gitignoré** et n'existe que sur le PC de Didier. En session cloud, demande-le-lui en pièce jointe. **Ne le commite jamais, ne recopie jamais son contenu dans un fichier suivi** : le dépôt est public.
4. `relay/` (`src/index.js`, `sessions.js`, `otp.js`, `email-sender.js`, `wrangler.toml`, `test/`), et côté app le flux d'envoi en signature et d'ingestion du résultat (`js/app/app-part1.js`, grep `remoteSession`, `reclaim`, `signUrl`).

## Préalable : décision de Didier
Demande-lui d'abord laquelle des deux options il retient pour le 14/10 :
- **A** : C1 complet avant le lancement (domaine + Resend nécessaires) ;
- **B** : restriction temporaire en attendant (un seul signataire distant par session, pas d'envoi depuis un espace partagé), puis C1.

## Expéditeur e-mail
`no-reply@propryo.fr` est disponible (Didier, 06/10) : c'est l'`EMAIL_FROM` de prod du relais (à la place de `code@propryo.fr`), et le même expéditeur servira au SMTP de Supabase Auth (chantier C5). Prérequis à vérifier avec Didier avant tout code : domaine vérifié chez Resend (SPF, DKIM, DMARC), clé API posée en secret Cloudflare (`wrangler secret put RESEND_API_KEY`, jamais dans un fichier), envoi de test reçu hors spam (Gmail, Outlook).

## Objectif (ce qui doit être vrai à la fin)
1. Le serveur exige une **preuve de possession de la boîte e-mail** du signataire courant avant d'accepter sa signature. Ça doit tenir **fail-closed** : une configuration de test hors localhost refuse de signer et ne divulgue jamais de code.
2. La configuration **réellement déployée** est vérifiable automatiquement (route de santé + contrôle côté app et en CI). Un `wrangler deploy` sans environnement ne peut pas réinstaller la configuration de test.
3. Une signature ne peut être enregistrée que pour **le signataire auquel le jeton a été frappé**, sans fenêtre de concurrence. Côté app, l'ingestion refuse un résultat incohérent (signataire « fait » sans tampon).
4. Aucun secret de session (identifiant, lien, jeton propriétaire) n'est plus écrit dans les lignes synchronisées. Le créateur récupère son accès par son JWT, **sans révoquer ses autres appareils**. La suppression d'une session exige le JWT du créateur et est journalisée.
5. La limitation des renvois et essais d'OTP vaut pour toute la session. Les pages porteuses de jetons ou de données personnelles sont en `no-store`.
6. Côté preuve : l'empreinte du document original est incluse dans la preuve serveur, et une copie est envoyée au signataire dès que l'e-mail est en place.

## Déroulé
Phases, chacune = 1 commit testé. Tests relais (`relay/test/`) et app (`__tests__/`) écrits **avant** le correctif et en échec d'abord (le rapport propose les tests). Les données existantes (7 baux portent un lien) : migration de nettoyage des champs synchronisés, en SELECT d'abord, puis GO Didier. Contre-audit par un agent `opus` qui n'a pas écrit le code, **avant** le GO de déploiement du relais.

## Règles
- Branche `fix/secu-c1-signature`. Aucun déploiement du relais ni écriture en base sans GO explicite de Didier. Jamais `supabase db push` : passer par `node scripts/db-run.mjs migrate`.
- Commits et messages **neutres** (« durcissement signature à distance »), sans description d'attaque : le dépôt est public.
- Le pilotage attribue le numéro de version.
- Fin de session : « C1 prêt — dis "où en est sécurité" au pilotage ».
