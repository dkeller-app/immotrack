# Ajustements à apporter dans le design existant

**Principe** : on **ne touche pas** au design (fonts, couleurs, palette, composants). Beaucoup de travail a déjà été fait dessus. On **réutilise** les classes CSS et variables existantes (`.btn .bp .bs`, `--bg --sur --acc --grn`, etc.) pour intégrer les nouveautés.

**Coordination** : tu travailles sur `index.html` (logement/bien/bail). Ces ajustements ne touchent **pas** la même zone du fichier que ton travail actuel — on les fera quand tu auras fini.

---

## 1. Barre de contexte globale (Chantier A)

### Où l'insérer dans le code existant
Le composant `.v4-sb-ent` (les bulles entités) existe déjà dans le dashboard. Aujourd'hui il est rendu DANS `#p-dashboard`. Il faut le **déplacer hors du dashboard**, dans la **topbar** ou juste sous la sidebar, pour qu'il soit visible partout.

### Modifications techniques
| Fichier | Ce qui change |
|---|---|
| `index.html` topbar/header | Ajouter un nouveau div `<div id="ctx-bar">` juste après la sidebar header, contenant les bulles + le sélecteur période |
| Réutiliser | Classes existantes `.v4-sb-ent`, `.v4s-e`, `.v4s-e-all` (déjà stylées) |
| Refactor | `_v4FilterEnt(name)` ligne 5732 → **retirer** le `go('dashboard')` forcé · faire un `_setGlobalEntity(name)` qui met à jour `_activeEntity` + persiste + re-rend l'onglet courant |
| Nouveau | `_activeEntity` (variable globale) + `_activePeriod` (mois/année) + persistance `localStorage` |
| Chaque renderer concerné | `rDash()`, `rIRL()`, `rMv()`, `rQuit()`, `rAss()` (devenu obsolète), `rBaux()`, `rEquip()` lisent `_activeEntity` au lieu de leur dropdown local |

### Composant période
- Soit un sélecteur déjà existant (`#dash-period`, `#mv-period`, etc.) qu'on déplace en topbar
- Soit un nouveau composant simple `‹ Mai 2026 ›` + petit caption "Période"

→ Effort : ~5-7h

---

## 2. Sidebar — sous-titres de groupes thématiques

### Où l'insérer
Dans la section sidebar de `index.html` (ligne ~75-100). Aujourd'hui les `.ni` sont à plat. Il faut ajouter des `.nlbl` (label de groupe) entre eux.

### Modifications techniques
| Fichier | Ce qui change |
|---|---|
| `index.html` HTML sidebar | Insérer des `<div class="nlbl">Patrimoine</div>`, `Finance`, `Relation`, `Admin` entre les `.ni` correspondants |
| `css/main.css` | Ajouter une classe `.nlbl` si elle n'existe pas (style : font-size 9px, uppercase, letter-spacing, color t3, padding 12px 11px 5px) |

→ Effort : ~30min

---

## 3. Supprimer l'onglet Assurances de la sidebar

### Modifications techniques
| Fichier | Ce qui change |
|---|---|
| `index.html` HTML sidebar | Retirer le `<div class="ni" data-module="assurances">` |
| `index.html` HTML page | Garder `#p-assurances` accessible par URL directe (fallback) mais sans entrée sidebar |
| Fiche bien (`logf-subtab`) | Ajouter un sous-onglet "🛡 Assurances" qui affiche les PNO de ce bien |
| Fiche bail | Ajouter une section "🛡 Garanties" qui affiche GLI + attestation MRH du locataire |
| Dashboard / Accueil | Ajouter un widget/bloc "Assurances à renouveler" (j-60/j-30) pour garder l'alerte centrale |

→ Effort : ~3-4h (le plus long = déplacer le rendu actuel `rAss()` dans les fiches)

---

## 4. Hub Biens — vue par défaut = Logements

### Modifications techniques
| Fichier | Ce qui change |
|---|---|
| `index.html` JS (probablement dans `setBiensView('immeubles')` ou équivalent) | Changer le défaut à `'logements'` |
| Persistance | `localStorage.biensView` lu au boot, fallback `'logements'` |

→ Effort : ~30min

---

## 5. Onglet Locataires — afficher contact + bouton ✉

### Où l'insérer
Dans `rBaux()` (devenu `rLocataires()` après v15.220) — la liste des locataires actifs. Chaque ligne/card de locataire reçoit des colonnes en plus.

### Modifications techniques
| Fichier | Ce qui change |
|---|---|
| `rBaux()` ou `rLocataires()` | Pour chaque locataire, afficher : `bail.locataires[0].tel`, `bail.locataires[0].email` |
| Composant ligne locataire | Ajouter un bouton à droite : `<button class="btn bp" onclick="openEmailComposer(...)">✉ Écrire</button>` |
| Style | Réutiliser `.btn.bp` (déjà défini) |

→ Effort : ~1h

---

## 6. Sous-onglet Candidats dans Locataires

### Modifications techniques
| Fichier | Ce qui change |
|---|---|
| Page Locataires | Ajouter une barre `.tabs` avec 3 onglets : "Locataires actuels", "Candidats", "Baux à terme" |
| Nouveau rendu `rCandidats()` | Liste des candidats (LOG-CANDIDATS) avec bouton "Voir dossier" + "✉" + "Convertir en locataire" |
| Données | Schéma `DB.candidats[]` à créer (cf sujet LOG-CANDIDATS) |

→ Effort : ~5-8h (gros, c'est LOG-CANDIDATS au complet)

---

## 7. Composer email type Gmail

### Modifications techniques
| Fichier | Ce qui change |
|---|---|
| `index.html` | Ajouter un container `<div id="email-composer">` invisible en bas à droite (position: fixed) |
| JS | Helpers `openEmailComposer({to,subject,body})`, `closeEmailComposer()`, `saveDraft()`, gestion contenteditable, etc. |
| Style | Réutiliser les variables `--sur --bor --acc` + un peu de CSS dédié pour le `position:fixed; bottom:20px; right:20px;` |
| Intégration | Bouton `✉ Écrire` dans Locataires (#5) appelle `openEmailComposer(...)`. Bouton existant `mailto:` remplacé par cet appel. |
| Données | `DB.emailsDrafts[]` pour les brouillons. Réutiliser `DB.emailsSent[]` existant pour l'historique. |

→ Effort : ~5-7h

---

## 8. Wizard de création séquentiel

### Modifications techniques
| Fichier | Ce qui change |
|---|---|
| `saveImm()` (sauvegarde immeuble) | Après save → afficher popup "Voulez-vous ajouter un bien ?" |
| `saveLog()` / `addNewLogement()` | Idem → popup "Voulez-vous créer un bail ?" |
| `saveBail()` | Toast "🎉 Patrimoine enregistré" |
| Nouveau composant | `_wizardPropose(type, parentRef)` qui affiche la popup bottom-sheet avec deux boutons (Continuer / Plus tard) |
| Style | Réutiliser les classes `.btn .bp .bs` existantes + petit container CSS `.wizard-sheet` pour le bottom-sheet |

→ Effort : ~4-6h

---

## 9. Renommer Loyers → Mouvements

### Modifications techniques
| Fichier | Ce qui change |
|---|---|
| `index.html` HTML sidebar | `<span>Loyers</span>` → `<span>Mouvements</span>` |
| `index.html` HTML page header | `<h2>Loyers...</h2>` → `<h2>Mouvements...</h2>` |
| `_titles` ou équivalent | Mettre à jour si présent |
| **NE PAS** renommer | L'ID `p-loyers` (sinon casse `localStorage.currentPage` chez les users) |

→ Effort : ~30min

---

## 10. Intercalaires immeuble (cascade UX-GROUP-BY-IMMEUBLE Phase 4)

L'helper `_groupLogementsByImm` existe déjà (livré v15.76 sur IRL). Il faut juste l'appliquer aux autres renderers.

### Modifications techniques
| Renderer | Application |
|---|---|
| `rMv()` Mouvements | grouper par immeuble du logement référencé |
| `rQuit()` Quittances | idem |
| `rEDLList()` ou `rEDLCards()` | idem |
| `rEquip()` Équipements | idem |
| `rRegul()` Régularisations | idem |
| `rBaux()` Locataires | optionnel (selon UX) |

→ Effort : ~3h (cascade mécanique)

---

## Plan d'attaque consolidé (effort total)

| Tranche | Modifs | Effort |
|---|---|---|
| **Quick wins** | #2 sidebar groupes · #4 défaut Logements · #9 renommer Mouvements | ~2h |
| **Chantier A** | #1 barre de contexte globale | ~5-7h |
| **Communication** | #5 contact+✉ dans Locataires · #7 composer Gmail | ~6-8h |
| **Wizard + Assurances** | #3 supprimer Assurances · #8 wizard création | ~7-10h |
| **Cascades** | #10 intercalaires sur 5 onglets | ~3h |
| **Gros chantier indépendant** | #6 sous-onglet Candidats (= LOG-CANDIDATS) | ~5-8h |
| **TOTAL** | | **~28-38h** |

---

## Pour démarrer

Mon avis : ordre logique d'attaque
1. **Quick wins** (~2h) → tu vois le résultat immédiatement
2. **Chantier A — Barre de contexte** (~5-7h) → vrai impact UX quotidien
3. **Composer Gmail** + contact dans Locataires (~6-8h) → différenciant fort
4. **Wizard + suppression Assurances** (~7-10h)
5. **Cascades intercalaires** (~3h)
6. **LOG-CANDIDATS** quand tu veux (chantier à part)

**Important** : tout ce qui est listé ici **réutilise les classes CSS et variables existantes**. Aucune nouvelle direction visuelle. Aucun mockup nécessaire.

Quand tu auras fini ton travail logement/bien/bail, dis-moi par quelle tranche on attaque.
