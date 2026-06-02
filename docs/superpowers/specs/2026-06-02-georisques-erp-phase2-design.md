# FEAT-GEORISQUES-ERP — Phase 2 : validité ERP (6 mois) + régénération ERRIAL

**Date :** 2026-06-02
**Sujet backlog :** `docs/subjects/FEAT-GEORISQUES-ERP.md` (P2)
**Cible :** `index-test.html` (sandbox) — PROD `index.html` synchronisée plus tard (Phase B2 PROD d'abord)
**Mockup validé :** `mockups/georisques-erp/alerte-validite-erp.html`

---

## Problème

La Phase 1 (livrée v15.252-253) détecte les risques **via l'adresse** (API Géorisques) AVANT tout upload et affiche un panneau « 🗺️ État des Risques (ERP / IAL) » + lien ERRIAL dans l'onglet Diagnostics de la modale logement. Mais **3 signaux ERP restent déconnectés** :

1. La **ligne ERP** du tableau DDT ne reçoit **jamais de date** → reste « ❓ À renseigner » même après dépôt du PDF ERRIAL « État des Risques », alors que le PDF est natif (texte) et déjà lu par le scanner pdf.js.
2. Aucun **message de renouvellement** ne se déclenche quand l'ERP est périmé, alors que sa validité légale est de **6 mois** (Art. L.125-5 C. env.) — la plus courte de tout le DDT.
3. **Bug de seuil connu** : le seuil générique « expire bientôt » des diagnostics non-DPE = 6 mois (`_diagStatut`). Comme la validité **totale** de l'ERP *est* 6 mois, un ERP fraîchement établi s'afficherait « ⚠️ Expire bientôt » dès le 1ᵉʳ jour.

## Objectif

Brancher la date du PDF ERRIAL sur la ligne ERP → calcul d'expiration → message de régénération. Le propriétaire régénère l'ERP **gratuitement, lui-même, sans diagnostiqueur** sur ERRIAL (particularité de l'ERP vs DPE/plomb/amiante).

---

## Décisions de conception (validées en mockup)

### Décision 1 — ERP **binaire** : valide ou expiré (jamais « expire bientôt »)

Le seuil « expire bientôt » n'a pas de sens pour un diagnostic dont la validité totale = le seuil. On **supprime** l'état intermédiaire pour la clé `erp` plutôt que de régler un seuil arbitraire. `_diagStatut('erp', …)` ne renvoie que :
- `manquant` (pas de date),
- `valide` (date présente, expiration non dépassée),
- `expire` (expiration dépassée),
- `inapplicable` / `na` (inchangé).

Ça corrige le bug de seuil **par suppression**, pas par réglage.

### Décision 2 — Alerte dans l'onglet Diagnostics : **bandeau dédié (Proposition B)**

Un **bandeau rouge** apparaît **au-dessus du tableau** DDT (dans `_logDiagRenderTab`) **uniquement si l'ERP est expiré**, avec gros CTA « ↻ Régénérer sur ERRIAL (gratuit) » ouvrant `https://errial.georisques.gouv.fr/` dans un nouvel onglet. Cohérent visuellement avec le bandeau de revue « ✨ N champs pré-remplis » existant. **Aucun bandeau si l'ERP est valide.** La ligne ERP garde son chip de statut habituel.

### Décision 3 — Alerte à la **génération du bail** : enrichir la modale existante

`saveBail()` (ligne 15340) appelle déjà `_ddtComplet()` ; si un diagnostic est **manquant ou expiré**, `_ddtShowIncompletModal()` ouvre la modale **bloquante** `ov-ddt-incomplet` (override « Continuer quand même » tracé en audit-trail). **Un ERP expiré ou manquant bloque donc déjà** la génération — mais le message est générique. Phase 2 = **ajouter un encart rouge ERP→ERRIAL** dans cette modale quand l'ERP est listé manquant/expiré, avec le CTA de régénération gratuite et la mention légale. On n'invente **aucune nouvelle porte**. Comme l'ERP est binaire (Décision 1), il n'y a **aucune** alerte « expire bientôt » à la génération : soit valide (silence), soit expiré (bloquant).

---

## Architecture & points d'insertion (index-test.html)

Tout est inline dans le moteur `_logDiag*` + `_diag*` existant. Aucun nouveau module, aucune dépendance.

### A. Extraction de la date « Établi le » du PDF ERRIAL

**Fichier :** `index-test.html`
**Fonctions :** `_logDiagExtractSuggestions` (~ligne 35428) + `_logDiagApplySuggestions` (~ligne 36327)

Le moteur de suggestions extrait aujourd'hui **une seule date globale** (`sug.date`) ancrée sur les libellés « date du repérage / réalisation / visite / exécution » et l'applique à tous les diags couverts par le PDF. L'« État des Risques » ERRIAL utilise un libellé **différent** : « **Établi le JJ/MM/AAAA** ». Cette date est **propre à l'ERP** (≠ date de repérage des autres diagnostics) et ne doit jamais polluer les autres lignes.

**Solution :** extraire une `erpDate` dédiée, ancrée sur « établi le », **séparée** de la date globale, et l'appliquer **uniquement** à la clé `erp`.

- Dans `_logDiagExtractSuggestions`, après l'extraction de la date globale, ajouter une extraction `erpDate` / `erpDateSrc` ancrée sur `/[ée]tabli\s+le\s+(JJ\/MM\/AAAA)/i`, avec la **même validation calendaire** (jour 1-31, mois 1-12, rejet des dates qui « roulent » via `Date.UTC`) que la date globale. Retour étendu : `{ …, erpDate, erpDateRaw, erpDateSrc }`.
- Dans `_logDiagApplySuggestions`, pour chaque `key` couvert : si `key === 'erp'` et `sug.erpDate` présent, utiliser `sug.erpDate`/`sug.erpDateSrc` ; sinon `sug.date`/`sug.dateSrc` (fallback). Le reste de la mécanique (champ vide uniquement, badge « ✨ à vérifier », `_logDiagSuggest`, valider/effacer) est **réutilisé tel quel** — aucune nouvelle UI à créer.

La couverture `erp` est déjà détectée par `_logDiagScanText` (`coverage.erp = has('etatdesrisquesetpollutions', 'etatdesrisques', 'risquesetpollutions')`). Déposer un PDF ERRIAL → `coverage.erp=true` → `erp` dans `coveredKeys` → date « Établi le » suggérée sur la ligne ERP en « ✨ suggéré · à vérifier ».

### B. ERP binaire dans `_diagStatut` (Décision 1)

**Fichier :** `index-test.html`
**Fonction :** `_diagStatut` (ligne 32058-32072)

Après le calcul du seuil (`threshold`), avant le `return … 'expirebientot' : 'valide'` (ligne 32071), insérer une garde :

```js
// ERP : binaire valide/expiré — la validité (6 mois) = le seuil « bientôt »,
// on neutralise l'état intermédiaire (FEAT-GEORISQUES-ERP Phase 2, décision 1).
if (diagKey === 'erp') return 'valide';
```

On est déjà dans la branche « non expiré » (le `return 'expire'` ligne 32064 a filtré les périmés), donc un ERP non expiré → toujours `valide`. `_ddtComplet` (ligne 32074) ne flague que `manquant`/`expire` → inchangé, cohérent.

### C. Bandeau ERP expiré dans l'onglet Diagnostics (Décision 2)

**Fichier :** `index-test.html`
**Fonction :** `_logDiagRenderTab` (~ligne 36566 ; injection dans `body.innerHTML` ~ligne 36738)
**CSS :** bloc `_logDiagEnsureCSS` (id `logdiag-css`, ~ligne 32135)

- Calculer le statut ERP du **brouillon** courant via `_diagStatut('erp', _logDiagSyntheticLog(), new Date())` (le helper `_logDiagSyntheticLog()` existe déjà, utilisé ligne 36344).
- Construire `erpAlertHtml` = bandeau rouge **seulement si statut === 'expire'**, inséré juste après `reviewHtml` (avant `logmod-info-banner`, ~ligne 36741).
- Contenu : titre « État des Risques expiré », date d'établissement + date d'expiration dépassée, mention Art. L.125-5, CTA `<a class="erp-banner-renew" href="https://errial.georisques.gouv.fr/" target="_blank" rel="noopener">↻ Régénérer sur ERRIAL (gratuit)</a>`.
- Ajouter les classes CSS `.logdiag-erp-banner` (rouge, bordure gauche 4px) + `.logdiag-erp-banner .renew` dans `_logDiagEnsureCSS`, calquées sur `.logdiag-review` (même grammaire visuelle). Variables de thème (`--sur`, `--bor`) pour le mode sombre.

### D. Encart ERP→ERRIAL dans la modale de blocage du bail (Décision 3)

**Fichier :** `index-test.html`
**Fonction :** `_ddtShowIncompletModal` (ligne 32332-32370)

Après la construction des listes manquants/expirés (`body.innerHTML`, ligne 32358-32361), si `ddt.manquants.includes('erp') || ddt.expires.includes('erp')`, **append** un encart rouge avant le bloc « 💡 Vous pouvez continuer… » :

- Titre : « État des Risques {expiré|manquant} — régénération gratuite ».
- Texte : mention que, contrairement aux autres diagnostics, le propriétaire le **régénère lui-même, gratuitement, sans diagnostiqueur** sur ERRIAL (Art. L.125-5 C. env.).
- CTA `<a href="https://errial.georisques.gouv.fr/" target="_blank" rel="noopener">↻ Régénérer sur ERRIAL (gratuit)</a>`.
- Styles **inline** (cohérent avec le reste de `_ddtShowIncompletModal` qui n'utilise pas de classes CSS), couleurs rouge `#fef2f2`/`#dc2626`/`#7f1d1d`.

Les boutons existants « Continuer quand même » (`_ddtForceOverride`) et « Mettre à jour » (`_ddtGoFix`) sont **inchangés**.

---

## Ce qui N'est PAS touché (garde-fous)

- **`__tests__/helpers/georisques-erp-detector.js`** et son miroir global : pas de changement (Phase 2 = wiring UI/statut inline, le module pur de détection est complet).
- **`_diagGet` / `_diagDateExpiration` / `_estDiagExpire`** : inchangés. La validité ERP `validityYears:0.5` du catalogue suffit déjà au calcul d'expiration à 6 mois.
- **DPE** : `_logDiagApplySuggestions` continue de ne JAMAIS suggérer sur le DPE (ADEME autoritaire).
- **PROD `index.html`** : non touchée. La synchro PROD est différée (dépend de la mise en PROD de la modale B2 ; `_logDiag*` = 0 occurrence dans `index.html` aujourd'hui).
- **Immutabilité du bail signé** : aucune écriture sur un bail existant ; on agit sur le brouillon de diagnostics et l'aiguillage de génération.

---

## Tests & vérification

- **Vitest** : aucune nouvelle fonction pure → la suite existante (44 tests) doit rester verte (`npx vitest run`).
- **Inline JS** : `node scripts/check-inline-js.mjs index-test.html` (attendu `4|0`).
- **Test visuel sandbox** (manuel, vrai navigateur) :
  1. Logement avec PPR/sismicité → déposer un PDF ERRIAL « État des Risques » → la ligne ERP reçoit la date « Établi le » en « ✨ suggéré · à vérifier », statut recalculé.
  2. Date < 6 mois → chip ✅ Valide, **aucun** bandeau, **aucune** mention « expire bientôt ».
  3. Date > 6 mois → chip 🔴 Expiré + **bandeau rouge** au-dessus du tableau + CTA ERRIAL.
  4. Générer le bail avec ERP expiré/manquant → modale `ov-ddt-incomplet` **bloquante** + **encart ERP→ERRIAL**.
- **Audit code-reviewer OBLIGATOIRE** (`superpowers:code-reviewer`) avant de dire « prêt à tester » — sujet sensible (validité légale d'un diagnostic annexé au bail).

## Versioning

Bump `IMMOTRACK_VERSION` (1 livraison Phase 2). Cible : **v15.254** (ligne 3514 + 3 spots d'affichage 6 / 57 / 3454). Commit + mise à jour BACKLOG.md (statut FEAT-GEORISQUES-ERP) en temps réel.
