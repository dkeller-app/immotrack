# Refonte de la navigation Propryo — Design

> Statut : **design validé sur maquette** (`mockups/refonte-nav/index.html`, local). Reste : revue de ce doc → plan d'implémentation → code.
> Date : 2026-07-08. Version app au moment du design : v15.439.

## 1. Problème

L'app a **trois systèmes de navigation désynchronisés**, avec des listes d'onglets différentes :

| Système | Où | Actif | Onglets |
|---------|-----|-------|---------|
| Sidebar V4 (`.v4s-a`, générée JS) | `index.html` `_renderSidebarV4` ~8117 | desktop (défaut prod) | 17 (sans `emails`) |
| Sidebar legacy (`.ni`, HTML) | `index.html:65` | mort (dashRenderV v1) | 18 |
| Bottom-nav + feuille « Plus » | `index.html:1214` / `1225` | mobile ≤767px | 4 + 13 |

Conséquences (constatées) :
- **`finances` totalement inaccessible sur téléphone** (ni bottom-nav, ni « Plus ») → « on ne retrouve pas tous les onglets ».
- `emails` absent de la sidebar desktop V4 mais présent en mobile.
- 17 onglets à plat, sans regroupement clair, pas de fil rouge.
- Une modif de nav doit être répliquée dans 3 endroits → dérive garantie.

## 2. Objectifs

1. **Une seule source de vérité** de la nav (un tableau JS) → desktop, tablette et mobile en dérivent. Impossible qu'un onglet manque sur un format.
2. **Fil rouge logique** en peu d'onglets, avec sous-parties.
3. **Réglages hors des onglets** (dans le menu compte).
4. **Menu personnalisable par utilisateur** (chacun n'affiche que ce qu'il utilise).
5. **Ne rien casser** : les liens profonds `#p-<id>` (refresh, back, bookmarks, fiches 360) continuent de marcher.

## 3. Architecture cible — 8 onglets, 3 zones

Menu latéral regroupé en 3 zones espacées (lisible au premier regard) :

```
PILOTAGE
  Accueil
  Pilotage            → Tableau de bord · Finances · Suivi
GESTION LOCATIVE
  Logements           → Biens · Immeubles · Bailleurs
  Locataires          → Baux en cours · Candidatures
  États des lieux
  Agenda              → Agenda · Équipements
ARGENT
  Loyers & mouvements → Mouvements · Quittances   (bouton « 🏦 Importer banque » intégré)
  Révisions           → Loyer (IRL) · Charges
```

Pied de sidebar (existant `v4s-sb-userfoot` + popover `v4s-acct-pop`, `index.html:8194`) :
```
[avatar] Didier Keller / email        ▴
  → 🧩 Personnaliser le menu   (nouveau)
  → ⚙️ Paramètres              (go('params') existant)
  → 🛟 Sauvegarde & export     (go('export') existant)
  ──────────
  → ↩ Se déconnecter           (existant)
```

**Décisions actées :**
- **Réglages n'est pas un onglet** : Paramètres + Sauvegarde/Export vivent dans le menu compte (là où sont déjà « Paramètres » et « Se déconnecter »).
- **Import bancaire n'est pas un onglet** : c'est déjà un bouton dans Loyers & mouvements (`_bankImportOpen()`, `index.html:300`). La page `p-import` (legacy, template Excel + import) est dépriorisée du menu principal.
- **Quittances** = sous-onglet de Loyers & mouvements (une quittance = preuve d'un loyer).
- **Finances** = sous-onglet de Pilotage (c'est une vue de synthèse, comme le tableau de bord — ≠ Loyers qui est opérationnel).
- **Candidats → « Candidatures »** (les dossiers reçus), sous Locataires.
- Les **noms** ci-dessus sont la proposition validée sur maquette ; ajustables (« Suivi », « Loyer (IRL) »… restent négociables).

### Correspondance ancien → nouveau (rien n'est supprimé)

| Ancien onglet (`go` id) | Devient |
|---|---|
| accueil | **Accueil** |
| dashboard | Pilotage › Tableau de bord |
| finances | Pilotage › Finances |
| pilotage | Pilotage › Suivi |
| biens | Logements › Biens |
| *(fiches imm/ent)* | Logements › Immeubles / Bailleurs |
| baux | Locataires › Baux en cours |
| candidats | Locataires › Candidatures |
| edl | **États des lieux** |
| agenda | Agenda › Agenda |
| equipements | Agenda › Équipements |
| loyers | Loyers & mouvements › Mouvements |
| quittances | Loyers & mouvements › Quittances |
| import | *(bouton dans Loyers ; page legacy conservée, hors menu principal)* |
| irl | Révisions › Loyer (IRL) |
| regul | Révisions › Charges |
| emails | *(hors menu principal — accès contextuel ; à trancher)* |
| params | menu compte › Paramètres |
| export | menu compte › Sauvegarde & export |

## 4. Menu personnalisable (par utilisateur)

Écran « 🧩 Personnaliser le menu » (depuis le menu compte) :
- **4 préréglages** de départ : *Propriétaire — tout* · *Gestion locative* · *Comptable* · *Sur-mesure*.
- **Interrupteurs par fonction** (12), groupés par zone. Granularité = onglets **et** sous-parties lourdes (Finances, Candidatures, Équipements, Quittances) → un gestionnaire masque « Finances » sans perdre le reste.
- **2 onglets obligatoires** non masquables : **Accueil** + **Logements** (le menu n'est jamais vide/cassé).
- **Effet immédiat** sur sidebar, bottom-nav et feuille « Plus ».

**Décisions actées :**
- **Préférence propre au compte / utilisateur** (dans une SCI partagée, chacun règle son menu). *Stockage à trancher en implémentation* : préférence par-utilisateur (localStorage par-appareil pour V1, ou champ de profil utilisateur si on veut la synchro multi-appareils).
- Un onglet/sous-partie masqué **reste accessible en lien profond** (`#p-<id>`) — on masque du menu, on ne supprime pas la page.

## 5. Responsive — garantie de complétude

| Format | Nav | Complétude |
|--------|-----|-----------|
| **PC** (≥ ~1000px) | sidebar complète, 3 zones + libellés | tous onglets ; sous-parties en sous-onglets dans la page |
| **Tablette** (~700–1000px) | **sidebar complète avec libellés** (comme la vraie app en tablette) | idem PC |
| **Téléphone** (≤767px) | bottom-nav : 4 onglets + « Plus » | **la feuille « Plus » liste les 3 zones + les 8 onglets + TOUTES les sous-parties** (Candidatures, Finances, Quittances…) |

Règle dure : **tout item présent dans la source de vérité (et activé dans le menu perso) est joignable sur les 3 formats.** Fini le « candidat/finances manquant sur mobile ».

## 6. Approche technique

- **Source de vérité unique** : un tableau `NAV` (id, libellé, icône, sous-onglets, zone). La sidebar V4, la bottom-nav et la feuille « Plus » se **génèrent** toutes depuis ce tableau (fin des 3 listes hardcodées). La sidebar legacy `.ni` est retirée (déjà morte).
- **Sous-onglets** : réutiliser le mécanisme existant `setTab(parentSel, tabEl, panelPrefix)` (`index.html:10183`, déjà utilisé par IRL et Paramètres). Chaque page-parent (Pilotage, Locataires, Agenda, Loyers, Révisions, Logements) porte une barre `.tabs` de sous-onglets.
- **Compat liens profonds** : les ids de page `#p-<id>` restent **inchangés** (accueil, dashboard, finances, pilotage, biens, baux, candidats, edl, agenda, equipements, loyers, quittances, irl, regul, params, export, + fiches log/imm/ent). Le regroupement se fait au niveau du **menu** (quel onglet ouvre quelle page + quel sous-onglet), pas en renommant les ids. `go(id)` continue de router vers `#p-<id>`. Un onglet-parent ouvre sa page + active le bon sous-onglet.
- **Menu perso** : filtre d'affichage appliqué au rendu de la nav (sidebar/bottom/Plus). N'altère jamais le routeur ni les pages.
- **Réglages** : le popover compte existe déjà (`_toggleAcctMenu`) ; on y ajoute « Personnaliser le menu » + « Sauvegarde & export ».

## 7. Hors scope (à trancher séparément)

- Sort de `emails` (Communications) : accès contextuel ou entrée discrète — décision différée (« on n'y touche pas » pour l'instant).
- Sort de la page `p-import` legacy (template Excel) : conservée, hors menu principal ; nettoyage éventuel plus tard.
- Synchro multi-appareils de la préférence de menu (V1 = par-appareil possible).

## 8. Vérifs prévues à l'implémentation

- Une seule `NAV` alimente les 3 rendus (test : chaque id apparaît sur PC/tablette/téléphone).
- Deep-links : `#p-finances`, `#p-candidats`… ouvrent la bonne page + bon sous-onglet après refresh et back.
- Menu perso : preset « Comptable » → sidebar réduite, mais `#p-agenda` reste joignable en direct.
- Responsive réel (navigateur, pas la zone preview) sur les 3 formats.
- Audit `superpowers:code-reviewer` (refonte transverse d'`index.html`).
