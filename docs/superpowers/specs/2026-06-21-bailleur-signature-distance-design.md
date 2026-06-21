# Envoyer le bail au bailleur à distance (D2a) — Design

> Spec figée 2026-06-21. Extension de **BAIL-SIGNATURE-DISTANCE** (livré PROD v15.263).
> Worktree : `Immo-bail-stale-fix` (base origin/main). Sandbox-first `index-test.html`. Audit `superpowers:code-reviewer` obligatoire (bail légal opposable). Bump version 5 endroits.

## Goal
Permettre d'envoyer le bail en signature **à distance au(x) bailleur(s)/co-gérant(s)**, exactement comme aux locataires aujourd'hui — chacun reçoit son propre lien email, signe à son tour. Le présentiel in-app reste le **défaut** du bailleur (zéro régression sur l'usage courant).

## Décisions validées (utilisateur, 2026-06-21)
1. **Co-gérants SCI** : chacun son lien (idem multi-locataires). N signataires bailleur ⇒ N ancres `bailleur-N` vides.
2. **Défaut bailleur = présentiel** (signe in-app), distance en **opt-in** via toggle. Tous bailleurs présentiel = comportement actuel inchangé.
3. **Disposition modal = variante B** (2 sections : 🏛️ Côté bailleur / 🔑 Côté locataires).
4. **Ordre de signature distant** : bailleurs d'abord, puis locataires, chacun à son tour (chaînage séquentiel existant).
5. Mockup validé : `mockup-bailleur-distance.html` (variante B).

## Fait capital : le relais n'a AUCUN changement à subir
Le relais (Composant 1, Cloudflare Worker, branche `origin/relay-bail-sign`, déployé) est **déjà role-aware** :
- `relay/public/sign/sigid.js` → `computeSigId` calcule `loc-N` pour `/locat|preneur/i` et **`bailleur-N` sinon**. Un signataire de rôle `bailleur` reçoit déjà `bailleur-0`, `bailleur-1`…
- `relay/public/sign/stamp.js` → tamponne par ancre : `manifest.anchors.filter(a => a.sigId === sigId)`. Aucun `loc-` codé en dur ; les ancres `bailleur-N` fonctionnent à l'identique.
- `relay/public/sign.js` → l'UI distante rend le rôle dynamiquement (`Je reconnais signer ce bail (${S.role})`, mentions `role: S.role`). Un bailleur s'affiche correctement.

Le module pur app `__tests__/helpers/bail-sign-sigid.js` contient déjà `relayComputeSigId(remoteSigners, index)` — réplique side-aware testée cross-composant. **On la réutilise** pour générer les sigId côté app sur la liste combinée. ⇒ **Chantier 100% app-side.**

## Architecture actuelle (ancrée — ne pas réinventer)
- **Signature bailleur in-app (phase 1)** : `previewBailSignRef` → `genPDFNative` capture N PNG bailleur (`bailleur-0…`, boucle co-gérants déjà en place, `index.html:20094`), les **cuit** dans le PDF (§18 via `drawSignatureBlock`, paraphes via `drawParaphesFooter(... sigBPNGs ...)`), pose `mode='bailleur-seul'` (`index.html:21250`).
- **Ancres + placeholder distants** : `__pushAnchor` (`index.html:21788`) + `drawLocataireSignaturePlaceholder` (`index.html:21893`) — **uniquement locataires** aujourd'hui. Le manifeste (`buildSignManifest`) porte des ancres en **mm bruts** (pas de conversion ; le relais convertit mm→pt+flip Y une seule fois).
- **Collecte distants** : `_collectRemoteSigners` (`index.html:6918`) = **locataires en dur**, `role:'locataire'`, `sigId:'loc-'+rang`.
- **Modal d'envoi** : `openRemoteSignModal` (`index.html:6940`), verrouillé `mode==='bailleur-seul'` (`:6943`), lit `_bsdLocataires` seul, ligne bailleur en **lecture seule** « ✅ signé dans l'app ».
- **Preuve / certificat / complétion** : `_completeRemoteSign` (`:6842`) mappe par `ordre` (1-based), `role` **stocké tel quel**, jamais supposé locataire en aval (`_buildBailCertificatePdf` imprime `p.role`). **Aucun blocage.**

## Modèle de signature retenu
**présentiel = signe in-app (PNG cuit) · distance = case vide, remplie par le relais.** Indépendant par signataire.
- Cas commun (tous bailleurs présentiel + locataires distance) : **inchangé**. Le PDF cuit les PNG bailleur présentiels, laisse les locataires distants vides + ancrés. Verrou `mode==='bailleur-seul'` conservé pour ce chemin.
- Cas nouveau (≥1 bailleur distance) : la case de ce bailleur part **vide + ancrée `bailleur-N`** ; il signe à distance (avant les locataires). Les bailleurs présentiel restants gardent leur PNG cuit.
- **Pré-condition** : un bailleur présentiel doit avoir signé in-app (PNG existant) avant l'envoi. S'il en reste un non signé, l'envoi est gardé (CTA « Signer le bail » d'abord). Un bailleur distance **n'exige plus** de signature in-app préalable.

## Les 5 foyers à coder (tous index.html + 1 module pur)

### F1 — Collecte des signataires distants (inclure bailleurs)
- **Fichier** : `index.html` `_collectRemoteSigners` (`:6918`) + nouveau helper `_collectRemoteBailleurs(bail)`.
- Construire la **liste combinée ordonnée** `[bailleurs distants…, locataires distants…]`. Pour chaque entrée, `role` = `'bailleur'`/`'locataire'`, `sigId` calculé par la **logique side-aware** (réutiliser `relayComputeSigId` / répliquer son rang par côté), `ordre` = position 1-based dans la liste combinée.
- Source bailleurs : les co-gérants/signataires bailleur (mêmes `sigNames`/entité que la phase 1 in-app, `index.html:20094`). Email bailleur : champ à exposer dans le modal (pré-rempli depuis l'entité si dispo, sinon vide).

### F2 — Modal d'envoi variante B
- **Fichier** : `index.html` `openRemoteSignModal` (`:6940`) + CSS `.bsd-section-head` (déjà dans le mockup).
- 2 sections : **🏛️ Côté bailleur** (rows par co-gérant, toggle présentiel↔distance, **défaut présentiel/coché**, champ email visible si distance) puis **🔑 Côté locataires** (inchangé, défaut distance).
- Label de rôle dynamique (retirer « Locataire · » en dur, `:6992`). Pastille mode présentiel/distance. Bannière violette « un bailleur signe à distance → PDF sans sa signature » quand ≥1 bailleur distant.
- Message d'erreur `:7131` : « Au moins un signataire doit signer à distance » (au lieu de « locataire »).
- **Point d'entrée** : exposer « 📨 Envoyer en signature » même sur bail **non signé in-app** dès qu'au moins un bailleur peut être mis en distance ; lever le verrou `mode==='bailleur-seul'` pour ce chemin (F4). « ✍️ Signer le bail » reste pour les bailleurs présentiel.

### F3 — Génération PDF : bailleur distant = case vide + ancre
- **Fichier** : `index.html` `genPDFNative` (branche §18 `signature-bailleur` `:21849` + paraphes footer `:21935`).
- Par bailleur : si **distant**, NE PAS cuire son PNG → dessiner un **placeholder vide** (réutiliser `drawLocataireSignaturePlaceholder`, généralisé/renommé `drawSignaturePlaceholder`) + `__pushAnchor({sigId:'bailleur-N', kind:'signature', …, luApprouve})`. Idem paraphe footer : si bailleur distant, placeholder + `__pushAnchor({sigId:'bailleur-N', kind:'paraphe', …})` (réutiliser le mécanisme `__REMOTE_LOC_SIGIDS` généralisé en `__REMOTE_SIGIDS`).
- Si **présentiel**, comportement actuel (cuit le PNG). La boucle par-bailleur existe déjà.
- Coordonnées du bloc bailleur déjà connues (`x,y,w=90,h=30`, `:21864`) → réutilisées pour l'ancre, en **mm bruts**.

### F4 — Point d'entrée / mode
- **Fichier** : `index.html` `:6943` (verrou modal) + boutons fiche `_renderLogFichePanelBail` (`:37469`) et liste `rBaux` (`:17074`).
- Autoriser l'ouverture du modal d'envoi si (`mode==='bailleur-seul'`) **OU** (au moins un bailleur configurable en distance). Le bouton « 📨 Envoyer en signature » apparaît dans ce cas même sans signature in-app.
- `_completeRemoteSign` pose déjà `mode='distance'` à la complétion — inchangé.

### F5 — sigId side-aware côté app
- **Fichier** : `__tests__/helpers/bail-sign-sigid.js` (étendre) + son miroir global dans index.html.
- Remplacer/compléter `buildRemoteSigIdMap` (locataires only) par une fonction sur la **liste combinée** produisant `loc-N`/`bailleur-N` par rang-par-côté, **identique** à `relayComputeSigId` (déjà présent). Garantit que manifeste app ≡ sigId relais.

## Stratégie de test (TDD sur le pur)
- **Module sigId** (`bail-sign-sigid.test.js`) : liste mixte [bailleur1, bailleur2, loc1, loc2] → `[bailleur-0, bailleur-1, loc-0, loc-1]` ; cohérence app vs `relayComputeSigId` ; présentiel exclu du rang.
- **Manifeste** (`build-sign-manifest.test.js`) : ancres `bailleur-N` (signature + paraphe) présentes, mm bruts, `luApprouve` propagé.
- **Collecte** : `_collectRemoteSigners` étendu — ordre bailleurs→locataires, présentiel exclu, emails.
- **Non-régression** : cas « tous bailleurs présentiel » ⇒ manifeste/PDF byte-identique à aujourd'hui (aucune ancre bailleur).
- Garde existante `check-inline-js` + Vitest complet verts.

## Hors périmètre (v1)
- OTP email bailleur (mutualisé avec l'OTP locataire existant côté relais — rien à faire).
- Pré-remplissage avancé de l'email bailleur depuis l'entité (best-effort ; sinon saisie manuelle).
- Modification du relais (confirmé : aucune).

## Risques & garde-fous
- **Légal/PDF** : laisser une case bailleur vide change le PDF envoyé → **audit code-reviewer obligatoire** (immutabilité du signé, ancres correctes, pas de double-conversion mm/pt). 
- **Ordre mixte présentiel/distance bailleurs** : présentiels doivent avoir signé in-app avant l'envoi (gardé). Testé.
- **Parité** : modif portée d'abord sur `index-test.html`, validée visuellement, puis `index.html` après OK explicite. Coordination commit index via file `.index-queue` (protocole maître).

## Gates de livraison
1. Modules purs TDD verts. 2. Sandbox `index-test.html` validé visuellement (navigateur, lien en ligne). 3. Audit `superpowers:code-reviewer` PASS 0 bloquant. 4. Parité sandbox↔prod. 5. Bump version 5 endroits. 6. BACKLOG mis à jour.
