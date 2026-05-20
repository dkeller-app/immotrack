# DRIVE-CONFIANCE-UX — Réduire la friction Drive (popups Google + messages restauration)

**Status** : ⬜ À faire (audit fait, plan à valider) · **Prio** : P1 · **Taille** : M (B+A ≈ 5-7h, C en plus ≈ +4h)
**Détecté** : 2026-05-19 (plainte user récurrente)
**Lié à** : BUG-DRIVE-DISCONNECT (✅ v13.41, 5 leviers anti-expiration jugés insuffisants) · BUG-DRIVE-RESURRECTION (✅ v14.30-32) · DRIVE-2H/2F/2G (multi-users, hors scope ici)

## Plainte utilisateur

> 💬 2026-05-19 : « je veux qu'on traite les points drive. j'en ai marre de toutes les fenetres de connexion google et les messages que je t'avais déjà donné »
> 💬 (antérieur, contexte v15.84) : « j'ai toujours des pop up de restauration de données à faire sur drive ou depuis drive. comment on gère ça ? ça ne me donne pas confiance et je ne suis jamais sur d'avoir les bonnes infos »

**Deux pains distincts** :
1. **Fenêtres de connexion Google** trop fréquentes (popups OAuth + modale connect)
2. **Messages de restauration / sync** anxiogènes (toasts éphémères + liens « Restaurer backup »)

---

## AUDIT 1 — Sources de popups Google Sign-In / modale connect

| # | Déclencheur | Code (index.html) | Type | Évitable ? |
|---|---|---|---|---|
| P1 | Boot : modale connect si pas de token | `_showDriveConnectModal` via `setTimeout(...,1500)` ligne ~38046 | Modale `#ov-drive-connect` (sans croix, choix forcé) | **Oui** — ne l'afficher qu'au 1er besoin d'écriture |
| P2 | Boot : silent re-grant si déjà connu | `_attemptStartupReconnect` ligne ~37792 → `requestAccessToken({prompt:''})` | Popup Google **si** cookies tiers bloqués | Partiel (dépend navigateur) |
| P3 | Clic « Connecter Drive » | `connectDrive()` ligne ~36605 → `requestAccessToken()` | Popup OAuth (explicite, voulu) | Non (action volontaire) |
| P4 | Refresh proactif T-5min échoué | `_scheduleProactiveTokenRefresh` ligne ~36468 → fail → `_showDriveDisconnectedModal` | Modale | Partiel |
| P5 | `driveFetch` reçoit 401 | ligne ~36504 → silent refresh + retry → fail → `_showDriveConnectModal` | Modale | Partiel |
| P6 | Retour onglet (>1h idle), token expiré | `visibilitychange` ligne ~37721 → silent refresh → fail → modale | Modale | Partiel |
| P7 | Retour onglet, pas de token mais déjà connecté | `visibilitychange` ligne ~37732 → modale (après 5s) | Modale | **Oui** — peut être différée |
| P8 | Envoi email (scope `gmail.send`) | granular consent v15.80 | Popup si refusé | Non (action volontaire) |

### Cause structurelle dure
OAuth GIS **browser-only** (`google.accounts.oauth2.initTokenClient`) ne fournit **pas** de refresh_token persistant. TTL access_token = **1h**. Conséquences :
- Toute ouverture de l'app après >1h d'inactivité = re-auth nécessaire.
- Le silent re-grant (`prompt:''`) ne marche QUE si la session Google du navigateur est encore active ET que les cookies tiers Google ne sont pas bloqués (Brave shields, Safari ITP, Firefox ETP strict, extensions anti-tracking).
- **Impossible de descendre sous ~1 popup/h** sans changer d'architecture OAuth (backend avec refresh_token = nécessite serveur, hors scope V1 browser-only).

### Leviers réalistes (sans backend)
1. **Ne plus afficher la modale connect au boot** (P1) : passer en lecture seule silencieuse, n'ouvrir la modale qu'à la 1re tentative d'écriture réelle (`saveDB` guard). → l'user qui consulte ne voit aucune popup.
2. **Différer P7** : ne pas re-popper la modale au simple retour d'onglet si l'user ne fait rien.
3. **Diagnostiquer le navigateur de Didier** : si silent re-grant échoue systématiquement, c'est probablement cookies tiers. À confirmer (quel navigateur ? Brave ?). Si oui : doc + éventuel ajustement (ouvrir Google dans le même contexte).
4. **Mémoriser le dismiss plus longtemps** : `_driveModalDismiss` est aujourd'hui réinitialisé à chaque reconnexion. À conserver 24h.
5. **Wording modale** : actuellement « Connexion Google Drive requise » + pas de croix = anxiogène. Reformuler : « ImmoTrack fonctionne hors-ligne, connecte Drive quand tu veux synchroniser ».

---

## AUDIT 2 — Messages de restauration / sync (toasts + confirms + modales)

| # | Message | Code | Déclencheur | Verdict |
|---|---|---|---|---|
| R1 | `↑ N modif(s) locale(s) à pousser vers Drive` **+ lien « ↺ Restaurer backup »** | `_driveLoadEntityFiles` ligne ~37087 | Après chaque pull si conflits>0 | ⚠️ **Anxiogène** — c'est de la routine, le lien Restaurer fait peur. Supprimer le lien, ou supprimer le toast (passer en log). |
| R2 | `✅ N signature(s) bail protégée(s) du sync` **+ lien Restaurer** | ligne ~37099 | Pull avec signatures locales préservées | ✅ **Garder** mais retirer le lien Restaurer (l'event est positif, pas besoin de proposer un rollback). |
| R3 | `⚠ Base de données corrompue — restauration recommandée` | ligne ~3846 | initDB JSON invalide | ✅ **Garder** (vrai incident critique). |
| R4 | `⚠ Stockage plein — sauvegarde Drive recommandée` | ligne ~4667 | localStorage quota | ✅ **Garder** (vrai incident). |
| R5 | `↻ Synchro Drive — historique d'annulation effacé` | ligne ~4583 | Pull externe vide la stack undo | 🟡 **Reformuler** ou réduire (jargon « historique d'annulation »). |
| R6 | `🔒 EDL non sauvegardé — reconnecte Drive` | ligne ~24026 | Token expiré pendant save EDL | ✅ **Garder** (action requise). |
| R7 | confirm×2 chaînés « Restaurer la base d'avant la dernière sync » | `restoreDriveBackup` ligne ~37014-37015 | Bouton Paramètres manuel | ✅ **Garder** (action destructive volontaire, double confirm justifié). |
| R8 | confirm « Recharger toutes les données depuis Drive ? » | `reloadAllFromDrive` ligne ~37706 | Bouton manuel | ✅ **Garder**. |
| R9 | `Drive ✓ chargé : X entité(s) + config globale` | ligne ~37081 | Chaque pull réussi | 🟡 **Réduire fréquence** — toast à chaque auto-pull (60s + visibilitychange) = bruit. Ne l'afficher qu'au 1er load de session ou si data a changé. |
| R10 | Modale historique bail → option « restauration » | `openBailHist` ~12510 | Consultation historique | ✅ Garder (feature volontaire, hors scope friction). |

### Synthèse pain 2
Le problème n'est PAS le nombre brut de messages, c'est :
- **Liens « ↺ Restaurer backup » sur des events de routine** (R1, R2) → suggèrent un problème là où il n'y en a pas → « je ne suis jamais sûr d'avoir les bonnes infos ».
- **Toasts éphémères** qui passent trop vite pour être lus/vérifiés → sentiment de perte de contrôle.
- **Pas d'endroit unique** pour voir « est-ce que ma dernière sync s'est bien passée ? ».

---

## RECOMMANDATION — Plan d'attaque (ordre conseillé)

### 🥇 Étape B (priorité 1, ~2-3h, gain immédiat sur la confiance)
Nettoyage chirurgical des messages, **sans toucher au moteur de sync** :
- **B1** : Retirer le lien « ↺ Restaurer backup » de R1 et R2 (events de routine). Le bouton Restaurer reste accessible dans Paramètres (R7) pour les vrais cas.
- **B2** : R9 — ne plus afficher « Drive ✓ chargé » à chaque auto-pull. L'afficher seulement au 1er load de session OU si le pull a réellement modifié des données. Les auto-pulls silencieux (60s) ne produisent aucun toast.
- **B3** : R1 — reformuler ou supprimer. Si conflits=0 (cas normal), aucun toast. Si conflits>0, message neutre sans lien rollback.
- **B4** : R5 — reformuler en clair (« Données mises à jour depuis un autre appareil »).
- **Garder intacts** : R3, R4, R6, R7, R8 (vrais incidents / actions volontaires).

→ **Effet** : l'usage quotidien (consulter, modifier, sync auto) devient silencieux. Plus de toasts paniquants.

### 🥈 Étape A (priorité 2, ~3-4h, réduit les popups Google)
- **A1** : Boot — ne plus ouvrir la modale connect automatiquement (P1). Passer en lecture seule silencieuse. La modale ne s'ouvre qu'à la 1re tentative d'écriture (`saveDB` guard appelle `_showDriveConnectModal`).
- **A2** : Différer P7 (retour onglet sans token) — ne re-popper que si l'user tente d'écrire.
- **A3** : Conserver `_driveModalDismiss` 24h (au lieu de reset à chaque reconnexion).
- **A4** : Reformuler le wording de la modale `#ov-drive-connect` (moins « requise », plus « quand tu veux »).
- **A5 (diagnostic)** : confirmer avec Didier son navigateur. Si Brave/Safari/Firefox strict → cookies tiers Google bloqués = cause racine du silent re-grant qui échoue. Documenter le fix (autoriser cookies tiers pour accounts.google.com) ou accepter la limite.

→ **Effet** : plus de popup au démarrage si on ne fait que consulter. Popup uniquement quand on veut vraiment écrire et que le token a expiré.

### 🥉 Étape C (optionnel, ~4h, structurant — à faire seulement si B+A insuffisant)
Panneau « État Drive » permanent :
- Dropdown depuis le FAB Drive : `✓ Synchro HH:MM · 0 conflit · 0 modif en attente · Backup HH:MM`.
- Onglet Paramètres → « Diagnostic Drive » : historique des sync, conflits résolus, backups disponibles, dernière erreur.
- Remplace définitivement les toasts éphémères par de l'info consultable à la demande.

→ **À ne lancer que si** B+A ne suffisent pas à restaurer la confiance. Sinon over-engineering.

---

## Décision attendue de l'utilisateur
- [ ] Valider l'ordre **B → A** (puis C si besoin) ?
- [ ] Quel navigateur utilises-tu (pour le diagnostic A5) ?
- [ ] Sur R1/R9 : tu préfères **zéro toast** en usage normal, ou un **petit indicateur discret** (genre « synchro ✓ » qui s'efface seul) ?

## Notes utilisateur
> 💬 2026-05-19 : audit demandé (« audit plus recommandation du plan d'attaque »). Aucun code modifié à ce stade.

## Journal
- 2026-05-20 : créé · audit complet des 8 sources de popups OAuth + 10 messages restauration/sync · plan d'attaque B→A→(C) recommandé · validation user requise avant tout code
