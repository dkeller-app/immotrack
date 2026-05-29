# EMAIL-COMPOSER-GMAIL — Composer email riche intégré (style Gmail) depuis le bouton ✉

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : M (~5-7h)
**Détecté** : 2026-05-25 (user : « quand je clic sur le bouton email, il faudrait un pop up où je peux écrire un mail comme dans gmail »)
**Lié à** : EMAIL-AUTO ✅ v15.09 (templates) · EMAIL-ONGLET-PERMANENT ✅ v15.79 · EMAIL-MODAL-UX-REFONTE · EMAIL-SMTP-CONNECT · CARNET-ADRESSE

## Le besoin en clair

Aujourd'hui le bouton ✉ "Écrire" depuis la liste Locataires (ou ailleurs) ouvre soit :
- Une modale liée à un **template** (quittance, IRL, relance) avec le corps figé
- Ou un `mailto:` qui ouvre Outlook/Mail à l'extérieur

**Ce qu'on veut** : un **vrai composer intégré dans l'app**, type Gmail, où l'utilisateur peut **écrire librement** sans sortir de l'app.

## Caractéristiques du composer

### Champs et structure (comme Gmail)
- **De** : pré-rempli avec l'entité émettrice (paramétrable cf EMAIL-FROM-PAR-ENTITE)
- **À** : destinataire(s) avec autocomplete depuis carnet d'adresses + locataires + contacts
- **CC / CCI** : optionnels, repliés par défaut
- **Sujet** : ligne unique
- **Corps** : éditeur **rich text** simple (gras / italique / liste / lien)
- **Pièces jointes** : drag & drop + bouton 📎
- **Signature** : injectée automatiquement, modifiable

### Boutons d'action
- **Envoyer** (déclenche le canal d'envoi configuré : mailto / SMTP / partage natif)
- **Brouillon** (sauve l'état pour reprise)
- **Annuler** (confirmation si contenu rédigé)

### Comportement
- **Pop-up flottante en bas à droite** (style Gmail) → permet de continuer à naviguer dans l'app sans perdre le brouillon
- Possibilité de **réduire** (ne devient qu'une barre en bas) / **agrandir** / **fermer**
- Plusieurs brouillons simultanés ? V1 : un seul. V2 : multi-fenêtres.

### Modèles
- Bouton "📋 Insérer un modèle" qui injecte un template (quittance / IRL / relance / libre) dans le corps
- L'utilisateur peut **éditer** le corps après insertion (différence cruciale avec EMAIL-AUTO actuel)

### Persistance
- Brouillons stockés dans `DB.emailsDrafts[]` (récup au rechargement)
- Envois loggés dans `DB.emailsSent[]` (existant)

## Cas d'usage typiques

1. **Depuis liste Locataires** : clic ✉ sur un locataire → composer s'ouvre, "À" pré-rempli avec son mail, sujet/corps vides → écrit librement
2. **Depuis carnet d'adresses** (futur) : clic ✉ sur un artisan/syndic → idem
3. **Réponse à un email reçu** (V2 si on lit la boîte) : composer avec quote du précédent
4. **Modèle + édition** : insère "quittance template" puis ajoute un paragraphe perso

## Scope (proposé)

### Phase 1 — Composer pop-up flottant (~2-3h)
- Composant `_emailComposerOpen({to, subject, body, attachments})` qui crée la pop-up
- État (réduit / normal / agrandi / fermé) avec animations
- Champs De / À / CC / CCI (autocomplete locataires + entités)
- Sujet + corps (textarea simple V1, rich text V1.1)
- Bouton Envoyer / Brouillon / Annuler

### Phase 2 — Rich text léger (~1h)
- Toolbar minimaliste : Gras / Italique / Liste / Lien (utiliser `contenteditable` natif + execCommand ou alternative)
- Pas de WYSIWYG complet, juste l'essentiel pour formater un mail

### Phase 3 — Pièces jointes (~1h)
- Drag & drop zone + bouton 📎
- Affichage des PJ en bas du composer (nom + taille + ✕)
- Limite taille (5-10 Mo total V1)

### Phase 4 — Brouillons (~1h)
- Sauvegarde auto debounce (toutes les 3s d'inactivité)
- Liste des brouillons accessible depuis l'onglet Communication ("📤 Brouillons")
- Bouton "Reprendre" depuis la liste

### Phase 5 — Insertion de modèles (~30min)
- Sélecteur "Insérer un modèle" qui liste les 29 templates EMAIL-AUTO
- Injection dans le corps + variables résolues

### Phase 6 — Envoi (~30min)
- V1 : `mailto:` enrichi avec sujet/corps (limite : pas de PJ via mailto)
- V1.1 : intégration `navigator.share()` mobile (PWA)
- V2 : EMAIL-SMTP-CONNECT pour envoi vraiment intégré (cf sujet dédié)

### Phase 7 — Tests + responsive (~1h)
- Tests Vitest sur les helpers (validation email, parsing destinataires)
- Responsive : sur mobile, pop-up → plein écran

## Décisions à arbitrer

- [ ] **D1** : pop-up flottante (style Gmail) OU modale centrée (style actuel) ? → Reco : **flottante** (multi-tâche)
- [ ] **D2** : rich text V1 (gras/italique/listes/liens) ou texte brut V1 → rich V1.1 ?
  - → Reco : **rich V1** (différenciation forte vs mailto plat)
- [ ] **D3** : envoi V1 = mailto (limité) ou attendre EMAIL-SMTP-CONNECT (vrai envoi) ?
  - → Reco : **mailto V1** (immédiat), SMTP en V1.1 quand prêt
- [ ] **D4** : un seul brouillon ouvert à la fois OU multi-fenêtres ? → Reco : **un seul V1** (KISS)

## Coordination

- **EMAIL-AUTO** existant : on RÉUTILISE le moteur de templates (zéro réécriture) + le `DB.emailsSent[]` (zéro nouvelle DB)
- **EMAIL-ONGLET-PERMANENT** : la liste des brouillons s'affiche dans l'onglet Communication (nouvelle sous-tab)
- **EMAIL-SMTP-CONNECT** : V2 du canal d'envoi (vrai envoi serveur au lieu de mailto)
- **CARNET-ADRESSE** : alimente l'autocomplete "À"

## Différenciant

| Solution | Composer mail libre |
|---|---|
| Rentila | mailto basique |
| BailFacile | templates uniquement |
| Qalimo V2 | partial |
| **ImmoTrack actuel** | templates + mailto |
| **ImmoTrack avec ce sujet** | ✅ **Composer riche intégré** (style Gmail) — différenciant fort |

## Notes utilisateur

> 💬 2026-05-25 : « quand je clic sur le bouton email, il faudrait un pop up où je peux écrire un mail comme dans gmail »

## Journal

- 2026-05-25 : créé · composer flottant style Gmail · rich text léger + drag&drop PJ + brouillons + insertion de modèles · réutilise EMAIL-AUTO templates et DB.emailsSent · envoi V1 mailto, V1.1 SMTP via EMAIL-SMTP-CONNECT · P1/M (5-7h)
