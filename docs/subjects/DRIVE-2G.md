# DRIVE-2G — Awareness UI (qui édite quoi)

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : S (3-4h)
**Lié à** : DRIVE-2H (architecture par-user), DRIVE-2F (OCC)
**Bloquant** : V1 commercial multi-users (UX)

## Contexte

En multi-users sur entité partagée, les conflits sont **techniquement résolus** par DRIVE-2F (OCC) mais l'UX reste mauvaise : pas de visibilité sur qui fait quoi, on découvre le conflit a posteriori.

**Awareness UI** = afficher en temps quasi-réel qui est connecté et sur quoi → évite les conflits AVANT qu'ils arrivent.

## Scope

### Phase 2G-1 : présence basique
- [ ] Au démarrage : push `immotrack-presence-{userId}.json` (dans Drive perso ou partagé entité)
  - Contenu : `{userId, userName, userEmail, currentEntity, currentObjectType, currentObjectId, lastHeartbeat, deviceType}`
- [ ] Heartbeat toutes les 30s tant que l'app est focusée
- [ ] Stop heartbeat sur visibilitychange=hidden (économie bande passante)

### Phase 2G-2 : affichage présences actives
- [ ] Au load entity, list des fichiers `immotrack-presence-*.json` dans le scope partagé
- [ ] Filter présences actives (lastHeartbeat < 60s)
- [ ] Afficher dans la barre du haut (à côté du FAB Drive) : `🟢 User1 sur bail F-001 · User2 sur dashboard`
- [ ] Mise à jour toutes les 30s

### Phase 2G-3 : alerte préventive
- [ ] À l'ouverture d'un objet (bail, mouvement, etc.) :
  - Vérifier si un autre user a `currentObjectId === ouvert` dans sa présence
  - Si OUI → toast préventif : `⚠️ User1 édite ce bail actuellement — concertez-vous avant modif`
- [ ] Surbrillance dans la liste des objets : badge `👤 User1` à côté

### Phase 2G-4 : config user identity
- [ ] Page Paramètres → Profil utilisateur :
  - userName (saisi par user, ex: "Didier", "Sophie")
  - userColor (couleur d'identification visuelle)
  - notifications conflits ON/OFF
- [ ] Stocké dans `immotrack-user-{userId}.json` (DRIVE-2H)

## Décisions à prendre

- [ ] **userId source** : email Google compte connecté ou UUID local généré ?
  - **Reco** : email Google (déjà disponible via `_fetchUserInfo`, stable)
- [ ] **Présence : 1 fichier par user OU 1 fichier consolidé partagé ?**
  - 1 par user : isolation, écriture sans conflit, mais N read au load
  - Consolidé : 1 read mais conflits sur le write
  - **Reco** : 1 par user (`immotrack-presence-{userId}.json`)
- [ ] **Granularité de l'objet courant** : juste l'entity ou jusqu'au bail/mouvement précis ?
  - **Reco** : entity + objectType + objectId (3 niveaux)

## Prompt de démarrage de session

```
On attaque DRIVE-2G.
Lis : BACKLOG.md, docs/subjects/DRIVE-2G.md, docs/subjects/DRIVE-2H.md.

Prérequis : DRIVE-2H livré (user identity pour userId).

Workflow :
1. Confirme les décisions (userId source, granularité, format présence)
2. Implémente en 4 sous-phases (2G-1 à 2G-4)
3. Test multi-comptes : 2 browsers connectés à la même entité partagée

Estimation : 3-4h.
```

## Notes utilisateur

> 💬 _(rien pour le moment)_

## Journal

- 2026-04-28 : créé suite réflexion UX multi-users dans session pilotage
