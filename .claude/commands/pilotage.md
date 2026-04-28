---
description: Démarre/reprend la session de pilotage backlog ImmoTrack — charge BACKLOG.md, lit les sujets en cours, et affiche la TodoWrite à jour.
allowed-tools: Read, Bash, Glob, Grep, Edit, Write, mcp__ccd_session__mark_chapter
---

# Pilotage backlog ImmoTrack

Tu es maintenant en mode **pilotage** sur le projet ImmoTrack.

## Action immédiate (à exécuter dans cet ordre)

### 1. Charger le contexte de pilotage

Lire dans cet ordre :
1. `C:\Users\Did_K\Desktop\Immo\BACKLOG.md` — hub central
2. `C:\Users\Did_K\Desktop\Immo\docs\PILOTAGE.md` — guide du workflow (méta)
3. Lister tous les fichiers dans `C:\Users\Did_K\Desktop\Immo\docs\subjects\` (Glob `docs/subjects/*.md`) pour avoir l'inventaire des sujets détaillés

Si certains sujets ont le statut **🔄 En cours** dans BACKLOG.md, lire leur fichier `docs/subjects/{CODE}.md` pour vérifier leur journal d'avancement.

### 2. Vérifier les changements depuis la dernière session

Lancer `git -C "C:/Users/Did_K/Desktop/Immo" log --oneline -20` pour voir les commits récents.
Si des commits "Pilotage" ou nommés d'après un sujet ont été faits (en particulier depuis une session sujet qui aurait travaillé en parallèle), prendre note des changements.

### 3. Initialiser/rafraîchir la TodoWrite

Créer une TodoWrite avec :
- **Tous les items 🔄 En cours** (status `in_progress` si vraiment actif, sinon `pending`)
- **Tous les items 🔥 Priorité immédiate**
- **Tous les items ⏳ En attente** (status `pending`)
- **Tous les items P0 / P1** (status `pending`)
- **Bundles synthétiques pour P2/P3** : ex "[P2 fonctionnels] Bundle 7 items", "[P3 Agence/SaaS] Bundle 7 items"

Format de chaque item : `[CODE] Titre court (Prio / Taille)` — ex `[BUG-LOG-001] Logement : ref non modifiable (P2 / XS)`

### 4. Afficher un résumé court à l'utilisateur

Format type :
```
📊 État pilotage ImmoTrack au {date}

🔄 En cours : {N items}
🔥 Immédiat : {N items} ({liste codes})
🔴 P1 bloquants : {N items}
🟠 P2 chantiers : {N items}
🔵 P3 V1+ : {N items}
✅ Livré récemment : {dernier livré + date}

Dernier commit : {hash} {message} ({date relative})

Tu veux quoi ?
- "où en est [SUJET]" — détail d'un sujet
- "où en sont les P2" — filter par priorité
- "note : [remarque]" — ajout au backlog
- "on attaque [SUJET]" — génère le prompt de session sujet
```

### 5. Marquer le chapitre

Utiliser `mcp__ccd_session__mark_chapter` avec le titre "Pilotage" et un summary court pour distinguer ce mode dans la session.

## Règles importantes pendant cette session pilotage

### Quand l'utilisateur note une remarque
```
User : "Note : [remarque]"
```
- Identifier la catégorie (BUG-*, FEAT-*, IDEE-*) et générer un code
- Si sujet existant correspond → ajouter dans son `docs/subjects/{CODE}.md` section "Notes utilisateur"
- Sinon → créer un nouveau `docs/subjects/{NOUVEAU-CODE}.md` avec scope minimal et ajouter une ligne dans `BACKLOG.md`
- Update TodoWrite
- Commit `Pilotage : note {CODE}`
- Confirmer brièvement (1-2 lignes)

### Quand l'utilisateur demande "où en est-on"
- Relire BACKLOG.md et docs/subjects/ des sujets actifs
- Refresh TodoWrite si changements
- Donner un résumé court (différentiel par rapport à la dernière question, pas tout reciter)

### Quand l'utilisateur dit "on attaque [SUJET]"
- Lire `docs/subjects/{SUJET}.md`
- Si scope clair → générer le prompt complet (cf section "Prompt de démarrage" du doc sujet)
- Si scope incomplet → poser les questions nécessaires AVANT de générer le prompt
- Donner à l'utilisateur le prompt à coller dans une nouvelle session Claude Code
- Update statut dans BACKLOG.md : ⬜ → 🔄 En cours
- Commit `Pilotage : démarrage {SUJET}`
- Indiquer : "Quand tu reviens ici, dis 'où en est {SUJET}' pour sync"

### Ne JAMAIS demander à l'utilisateur de modifier un MD lui-même

Tout passe par toi (Claude). L'utilisateur dialogue uniquement en chat. Les commits sont automatiques.

### Toujours commit après modification

Format des commits :
- Note remarque : `Pilotage : note {CODE}`
- Update statut : `Pilotage : {SUJET} {nouveau status}`
- Démarrage sujet : `Pilotage : démarrage {SUJET}`
- Bilan session : `Pilotage : bilan session {date}`

## Référence
- Guide complet : `docs/PILOTAGE.md`
- Mémoire associée : `project_pilotage.md` dans la mémoire Claude
