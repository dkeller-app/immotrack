# Design — CANDIDATURE relance + inbox : complément via popup partage, auto-pull, notification accueil

**Date** : 2026-06-05
**Sujet parent** : `docs/superpowers/specs/2026-06-02-candidature-locataire-design.md` (LOG-CANDIDATS) — ce design **complète** la feature « candidature lien en ligne » après livraison de la Task 13 (demande de complément).
**Plan d'origine** : `docs/superpowers/plans/2026-06-03-candidature-lien-en-ligne.md` — ces 3 composants s'insèrent comme Tasks **T13b / T13c / T13d**, à réaliser dans le sandbox `index-candidature-test.html` **avant** la Task 15 (audit obligatoire).
**Mockups validés** (user, 2026-06-05, dans son vrai navigateur) :
- `mockups/candidature/relance-complement.html` → **Variante A · 2 étapes**
- `mockups/candidature/notif-inbox.html` → **Variante A · Bandeau dédié** (repli vertical mobile corrigé)

**Prio** : P1 · **Taille** : M · **Statut** : design validé en mockups, spec en cours de relecture user.

---

## 1. Objectif

Rendre la candidature en ligne **exploitable sans surveillance manuelle**. Aujourd'hui (post-Task 13) :
1. la **demande de complément** se fait via un `prompt()` + copie presse-papier du lien — fonctionnel mais pauvre, alors que l'invitation initiale a déjà une **popup de partage** (Email/SMS/WhatsApp/QR) ;
2. les dépôts n'arrivent que si l'utilisateur va sur l'onglet Candidats et clique **« Actualiser les dépôts »** — *« l'utilisateur va pas passer son temps à aller sur candidat et refresh »* ;
3. rien ne signale l'arrivée d'un dossier — *« il faudrait un message sur accueil : vous avez reçu un nouveau dossier »*.

Trois composants, indépendants mais cohérents :

| Composant | Task | Rôle |
|---|---|---|
| **A — Complément via popup partage** | T13b | Remplacer `prompt()`+clipboard par la popup de partage réutilisée de l'invitation (flux 2 étapes : note → repartage du lien existant). |
| **B — Auto-pull des dépôts** | T13c | Rapatrier les dépôts en arrière-plan (ouverture onglet + focus fenêtre + intervalle ~3 min), sans bouton. |
| **C — Notification nouveau dossier** | T13d | Bandeau accueil dédié + pastille compteur nav + toast à l'arrivée + pill « ● Nouveau » dans la liste. |

**B est le moteur, C est l'affichage du résultat** : l'auto-pull n'a quasi pas de surface visuelle propre ; sa seule manifestation visible est la notification.

---

## 2. État des lieux de l'existant (ce sur quoi on s'appuie)

Tout est déjà dans le sandbox `index-candidature-test.html` (et son miroir prod `index.html`). **On réutilise, on ne réinvente pas** (règle gravée).

| Brique existante | Emplacement (sandbox) | Réutilisation |
|---|---|---|
| **Moteur de partage invitation** | `_invState` + `_invRenderStep2` + `_invShareEmail` (mailto) / `_invShareSms` (sms:) / `_invShareWhatsApp` (wa.me) / `_invToggleQr` (lib qrcode `createImgTag(5,8)`) / `_invCopy` — ~14555-14605 | **Composant A** repeuple `_invState.link.url` + `_invState.message` puis rouvre l'étape 2 de partage. Aucune fonction de partage recréée. |
| **Pull des candidatures** | `_relayPullCandidatures(opts)` — ~14617-14692 ; filtre `link.status==='active'`, retourne `{imported, errors}`, accepte `opts.silent` (supprime les toasts) | **Composant B** appelle `_relayPullCandidatures({silent:true})`. **Composant C** étend la valeur de retour à `{imported, created, updated, errors, newNames}`. |
| **Réouverture relais** | `window._relayReopen(linkId)` (main.js ~321) → POST `/api/candidatures/{linkId}/reopen` | **Composant A** (candidat en ligne) : passe le lien en `active` côté relais avant repartage. |
| **Demande de complément (Task 13)** | `demanderComplementCandidat(id)` (async) + `_complementLocal(c,id,note)` | **Composant A** remplace la branche « online-link » (aujourd'hui prompt+clipboard) par l'ouverture de la popup partage. La branche « candidat manuel » (`_complementLocal`, sans réseau) est **conservée**. |
| **Accueil** | `rAccueil()` (~6791) → `_renderAccueil(ctx)` (~6822) ; hero `v4h-hero` (icône + « Bonjour [nom], N actions en attente » + 3 KPIs) + tuiles | **Composant C** insère le bandeau inbox **après le hero, avant les tuiles**. |
| **Nav Candidats** | sidebar desktop `.ni[data-module="candidats"]` (ligne 89, `onclick="go('candidats',this)"`) ; bottom-nav mobile (lignes 1266-1270) où **Candidats est sous « Plus » (☰)** | **Composant C** : pastille compteur sur l'entrée Candidats (desktop) et sur « Plus » + dans le menu Plus (mobile). |
| **Fiche candidat** | `openFicheCandidat(id)` | **Composant C** : ouvrir une fiche **efface le flag « nouveau »** de ce candidat. |
| **Toast** | `showToast(msg)` global existant | **Composant C** : toast d'arrivée. |
| **Scoring transparent** | `_calculConfiance` / `_confBreakdown` | Inchangé. **Le score n'est jamais calculé ni transmis côté relais** (règle gravée), pas touché ici. |

**Ce qui n'existe pas et qu'on crée** : un flag « non lu » par candidat, un planificateur d'auto-pull, le bandeau/pastille/pill de notification, le helper pur `shouldAutoPull`.

---

## 3. Composant A — Demande de complément via popup partage (T13b)

### Décision de layout : **Variante A · 2 étapes** (mockup validé)

Réutilise exactement la mécanique de l'invitation initiale.

**Flux candidat EN LIGNE** (`c.lien` présent, `link.status` connu) :
1. **Étape 1 — Note** : champ texte « Que manque-t-il ? » (ex. « Avis d'imposition page 2 illisible »). Bandeau info « ✓ Le dossier déjà déposé est conservé » (`.keep-box`). Bouton **« Rouvrir & partager »**.
2. Au clic : `await window._relayReopen(c.lien.linkId)` → passe le lien relais en `active`. La note est enregistrée localement (statut candidat « En cours », note horodatée — réutilise la logique Task 13).
3. **Étape 2 — Partage** : on repeuple `_invState` avec **le lien existant** (`c.lien.url`) + un message pré-rempli incluant la note, puis on rend l'étape 2 de partage (`_invRenderStep2`) → boutons Email / SMS / WhatsApp / QR / Copier, strictement identiques à l'invitation.

**Flux candidat MANUEL** (pas de `c.lien`) :
- Avertissement `.warn-box` « Ce candidat a été saisi manuellement, pas de lien en ligne à partager ». Seule la **note interne** est proposée (réutilise `_complementLocal`, **aucun appel réseau**). Pas d'étape 2.

**Gestion lien expiré** (relais répond 404/410 au reopen) : fallback gracieux déjà présent en Task 13 — message « le lien a expiré, recréez une invitation », pas de crash.

### Points de vérité
- **Aucun nouveau canal de partage** : on appelle les fonctions `_invShare*` existantes.
- Le `linkId` / `ownerToken` ne sont **jamais** mis dans une URL ni loggés (règle gravée). Le lien partagé est l'URL candidat publique déjà émise (`c.lien.url`), pas le lien capability bailleur.
- La popup réutilise les classes DS de l'invitation (`.modal`, `.chans`/`.chan`, `.qr`) — zéro page « à part ».

---

## 4. Composant B — Auto-pull des dépôts (T13c)

### Comportement (décision user : ouverture + focus + intervalle ~3 min)

Trois déclencheurs, tous appelant `_relayPullCandidatures({silent:true})` :
1. **À l'ouverture de l'onglet Candidats** (`go('candidats',…)` / `rCandidats()`).
2. **Au retour de focus** de la fenêtre/onglet navigateur (`visibilitychange` → `visible`, ou `window.focus`).
3. **Intervalle régulier ~3 min** (`setInterval`), **uniquement s'il existe au moins un lien `active`** (sinon rien à rapatrier — on n'appelle pas le réseau pour rien).

### Helper pur testable (TDD) — `shouldAutoPull`

Pour rendre la décision testable sans réseau ni DOM :

```js
// Retourne true si un pull auto doit partir maintenant.
// lastPullTs : timestamp du dernier pull (ms) ou 0/null si jamais
// now        : Date.now()
// intervalMs : 180000 (3 min) par défaut
// hasActiveLinks : bool — y a-t-il au moins un lien à rapatrier
function shouldAutoPull(lastPullTs, now, intervalMs, hasActiveLinks){
  if(!hasActiveLinks) return false;
  if(!lastPullTs) return true;              // jamais pull → oui
  return (now - lastPullTs) >= intervalMs;  // intervalle écoulé
}
```

Cas couverts par les tests : pas de lien actif → false ; jamais pull + liens actifs → true ; intervalle non écoulé → false ; intervalle écoulé → true ; bornes exactes (`now-last === intervalMs` → true).

### Garde-fous
- **Anti-chevauchement** : un flag `_autoPullInFlight` empêche deux pulls simultanés (un pull lent ne doit pas être relancé par le focus ou l'intervalle).
- **Throttle focus** : le déclencheur focus respecte aussi `shouldAutoPull` (pas de pull à chaque alt-tab si l'intervalle n'est pas écoulé).
- **Mode silencieux** : `{silent:true}` → pas de toast « X dépôts importés » sur les pulls auto ; seule la **notification** (Composant C) parle.
- **Cleanup** : l'`setInterval` est unique (mémorisé sur `window._autoPullTimer`), recréé idempotemment ; pas de fuite si l'onglet est ré-ouvert.
- **Implications RGPD/réseau** : l'auto-pull n'augmente pas la surface de données traitées — il rapatrie ce que le bouton manuel rapatriait déjà, juste automatiquement. À documenter dans le registre RGPD (Task 14) et à couvrir par l'audit (Task 15) : fréquence, absence de données nouvelles, déclencheur conditionnel.

---

## 5. Composant C — Notification nouveau dossier (T13d)

### Décision de placement : **Variante A · Bandeau dédié** (mockup validé)

Trois surfaces + un marqueur de liste :

**① Bandeau accueil dédié** (`.inbox-banner`) — inséré après le hero, avant les tuiles, **uniquement si ≥1 dossier non lu** :
- icône 📩 + « N nouveau(x) dossier(s) de candidature reçu(s) » + sous-ligne « [noms] — déposés via lien en ligne. Cliquez pour vérifier et traiter. » + bouton **« Voir les dossiers → »** (ouvre l'onglet Candidats) + croix ✕ « Marquer comme vu ».
- **Mobile** : repli vertical (corrigé dans le mockup) — ligne 1 = icône + texte + ✕, ligne 2 = bouton pleine largeur.

**② Pastille compteur sur la nav** :
- **Desktop** : `.pastille` rouge avec le nombre sur l'entrée Candidats de la sidebar.
- **Mobile** : Candidats étant sous « Plus », pastille sur l'entrée **« Plus » (☰)** du bottom-nav + sur la ligne Candidats dans le menu Plus.

**③ Toast d'arrivée** (`showToast`) — quand un pull (auto **ou** manuel) ramène ≥1 nouveau dossier : « 📩 Nouveau dossier reçu : [premier nom] » (+ « et N autres » si plusieurs). Un seul toast par salve de pull.

**④ Pill « ● Nouveau » dans la liste Candidats** — sur chaque ligne `.cand-row.is-new` non lue. Effacé à l'ouverture de la fiche.

### Modèle de données : flag « non lu » par candidat

**Décision** : un booléen `vu` sur l'objet candidat.
- Pull crée un candidat → `vu:false`.
- `openFicheCandidat(id)` → `vu:true` + `saveDB()` + rafraîchit nav/accueil.
- Compteur non lus = `DB.candidats.filter(c => c.vu === false).length`.
- Bouton ✕ du bandeau → marque **tous** les candidats `vu:true` (« marquer comme vu »).

**Pourquoi un flag DB (et pas localStorage par device)** : simplicité, cohérence avec le reste du modèle, et la trajectoire multi-tenant Supabase (à venir) gérera le « lu par device » proprement plus tard. Le flag se synchronise via Drive comme le reste de la DB (même niveau de confiance). *Compromis assumé : si deux devices sont utilisés, ouvrir la fiche sur l'un la marque lue sur l'autre — acceptable pour un usage mono-utilisateur actuel.*

### Quels événements comptent comme « nouveau »
- **Nouveau dossier** (candidat **créé** par le pull) → `vu:false`, toast « nouveau dossier reçu », pill, compteur, bandeau. **C'est le cœur de la demande user.**
- **Complément reçu** (candidat **mis à jour** après un reopen) : **hors périmètre de cette notification** pour rester fidèle à « vous avez reçu un nouveau dossier ». Le statut « En cours → complété » reste visible via la fiche/pipeline existants. *(À confirmer en relecture : si tu veux aussi notifier les compléments, on étend `vu:false` aux updates.)*

### Extension de `_relayPullCandidatures`
Valeur de retour passe de `{imported, errors}` à `{imported, created, updated, errors, newNames}` :
- `created` : nb de candidats nouvellement créés (→ marqués `vu:false`).
- `newNames` : noms des candidats créés (pour le toast + sous-ligne bandeau).
- Tous les appelants existants (bouton manuel, auto-pull) lisent ce retour pour déclencher toast + refresh des surfaces.

---

## 6. Découpage en tasks (pour writing-plans)

Toutes dans le sandbox `index-candidature-test.html`, **avant Task 15**. Chacune : édition → vérif diff (moi) → test visuel user → commit isolé (mon seul fichier).

- **T13b — Complément via popup partage** : réécrit la branche online de `demanderComplementCandidat` pour repeupler `_invState` + rouvrir l'étape 2 de partage ; conserve la branche manuelle (`_complementLocal`) ; conserve le fallback lien expiré.
- **T13c — Auto-pull** : helper pur `shouldAutoPull` (TDD, tests d'abord) ; câblage des 3 déclencheurs (ouverture onglet, visibilitychange, intervalle 3 min) ; garde-fous anti-chevauchement + throttle + cleanup.
- **T13d — Notification** : flag `vu` (création pull → false, ouverture fiche → true) ; extension retour `_relayPullCandidatures` ; bandeau accueil (var A) + pastille nav desktop + pastille « Plus » mobile + toast d'arrivée + pill « ● Nouveau » ; bouton ✕ « marquer tout vu ».

**Ordre conseillé** : T13d en dernier car il consomme l'extension de retour utilisée par T13c (auto-pull → toast). Possible aussi : T13b (isolé) → T13c (helper+câblage) → T13d (surfaces).

---

## 7. Contraintes respectées (rappel)

- **Sandbox-first** : zéro modif de `index.html` prod avant OK explicite (Task 16).
- **Réutilisation, pas réinvention** : partage = moteur invitation ; pull = fonction existante étendue ; toast/nav/accueil = composants réels.
- **Design-system** : tokens DS uniquement, classes existantes, pas de page « à part » (validé en mockups A/A).
- **Secrets** : `ownerToken`/`linkId` jamais en URL ni loggés ; APP_KEY jamais touché ici.
- **Scoring** : inchangé, jamais côté relais, non discriminant.
- **Audit obligatoire** (Task 15) : couvre les 3 composants, en particulier l'auto-pull (fréquence/RGPD) et le repartage (fuite de capability).
- **Registre RGPD** (Task 14) : documenter l'auto-pull (rapatriement automatisé, pas de donnée nouvelle).
- **Commercialisation** : comportements génériques (tous profils), pas spécifiques à un seul cas d'usage.
