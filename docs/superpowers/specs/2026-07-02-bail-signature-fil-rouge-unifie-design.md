# Fil rouge de signature unifié — design

> Statut : **design validé sur mockup** (`mockups/BAIL-SIGN-UNIFIE/index.html`, 2026-07-02). En attente de revue spec avant plan d'implémentation.

**Objectif :** remplacer les 3 points d'entrée de signature disjoints par **un seul**, avec un écran « qui signe, et comment ? » (présentiel / à distance / ne signe pas), une signature présentielle **chacun son tour** (jamais de double paraphe), et un envoi automatique des liens aux signataires à distance — **en réutilisant 100 % des mécaniques existantes** (rendu PDF réel, capture paraphes/signature, persistance, relais email, archivage cloud, cert de preuve).

**Contrainte non négociable (user, 2026-07-02) :** « on garde le design et toutes les fonctionnalités de l'app ». Ce chantier est une **couche d'orchestration + réorganisation UX**, pas une réécriture. Toute mécanique existante est appelée, jamais recopiée (règle DRY).

---

## 1. Problème actuel

La fiche expose **3 boutons séparés** ([index.html:38200-38202](../../index.html)) selon l'état `sigSign`/`partial`/`complet`/`remoteSession` :

1. **« ✍️ Signer le bail »** → `previewBailSignRef` → wizard bailleur in-app (`autoSign`).
2. **« ✍️ Le locataire signe »** → `previewBailLocataireRef` → wizard phase 2 locataire (`autoPhase2`), visible seulement si `partial`.
3. **« 📨 Envoyer en signature »** → `openRemoteSignModal` → envoi distant (relais D2a), avec garde « signe d'abord le bailleur… puis reviens envoyer » ([index.html:7291](../../index.html)).

**Conséquence** : après avoir signé le bailleur, l'utilisateur doit fermer la popup, retrouver un autre bouton, reconfigurer une modale. Le fil est décousu → « impossible d'envoyer au locataire après ». Ce n'est pas un bug isolé mais une architecture à 3 entrées.

Par ailleurs le mode historique « avec-locataire » fait parapher **bailleur ET locataire sur la même page** (double pad) — explicitement rejeté par l'utilisateur (« chacun son tour, pas de double signature/paraphe »).

## 2. Fil rouge cible (mockup validé)

**Un seul bouton** « ✍️ Signer le bail » sur la fiche, visible tant que le bail n'est pas 100 % signé.

**Écran 1 — « Qui signe, et comment ? »** (la matrice de présence)
- **Bailleur** : une ligne par co-gérant → ◉ Présentiel · ○ À distance [email] · ○ Ne signe pas.
- **Locataire(s)** : une ligne par locataire → ◉ Présentiel · ○ À distance [email].
- Résumé live : « N signent ici chacun son tour · M reçoivent un lien ».
- (Garants/cautions : **hors scope** pour cette itération — acte séparé comme aujourd'hui.)

**Écran 2 — Signature chacun son tour** (présentiels uniquement)
- Le wizard enchaîne les présentiels **dans l'ordre légal** : bailleur(s) → locataire(s).
- Chaque signataire parcourt **le document entier** (le vrai PDF rendu) et appose **sa** signature en une passe.
- **Un seul jeu de pads par signataire** — jamais deux signataires sur la même page.
- Entre deux signataires : écran de transition « ✅ X a signé — au tour de Y » (passage d'appareil).
- Le document montre les marques du signataire précédent **avant** que le suivant signe.

**Écran 3 — Fin**
- S'il reste des signataires à distance → envoi des liens (relais existant), bail « en attente ».
- Sinon (tous présentiels signés) → bail **complet**, PDF archivé, cert de preuve.

**Reprise** : rouvrir « Signer le bail » ré-affiche l'écran 1 avec l'état à jour (qui a signé, qui est en attente). Plus de bouton séparé.

## 3. Réutilisation (mapping vers l'existant) — cœur du design

| Besoin du fil rouge | Existant réutilisé | Adaptation |
|---|---|---|
| Écran de présence (matrice) | `openRemoteSignModal` + `_bsdSignerRow` + `_bsdSyncBailleurRow` ([index.html:7058](../../index.html)) : lignes co-gérant tri-état + lignes locataire présentiel/distance déjà construites | Re-titrer « Signature du bail — qui signe, et comment ? ». Le bouton de confirmation ne fait plus « envoyer seulement » : il appelle l'**orchestrateur** (§4). |
| Rendu du vrai document | `prerenderPDFPages()` → `window._wizV2Pages` | Inchangé. |
| Capture paraphes + signature | `startSignatureWizardV2` / `_wizV2Render` / `_wizV2Next` / pads | **1 seul changement** : filtrage « solo signataire » (§4.2). |
| Persistance signatures | `_wizV2PersistSignatures` (sait déjà **fusionner** bailleur+locataire via le pattern phase 2) | Réutilisé tel quel en mode fusion incrémentale, un signataire à la fois. |
| Génération PDF signé | `genPDFNative` | Inchangé. |
| Envoi distant + emails | `_confirmRemoteSignSend` + relais D2a (`bail.bailleurSign`, `bsd-*`) | Appelé par l'orchestrateur pour les distants, **après** les présentiels. La garde « signe d'abord le bailleur » devient inutile (l'ordre est orchestré) → retirée/allégée. |
| Archivage cloud + preuve | `__immoArchiveBailPdf`, `_ingestSignedBailArtifacts`, cert `otpVerifiedAt` | Inchangés. |
| Badge/état + relance session | `_renderRemoteSignBadge`, `remoteSession` | Le badge reste pour l'état distant ; le bouton unique remplace les 3. |

**Rien de la mécanique n'est réécrit.** Le nouveau code = (a) un orchestrateur mince, (b) un filtre « solo signataire » dans le wizard, (c) le remplacement des 3 boutons par 1 + le re-titrage de la modale.

## 4. Composants nouveaux (minces)

### 4.1 Point d'entrée unique
Sur la fiche ([index.html:38200-38202](../../index.html)), remplacer les 3 boutons conditionnels par **un** bouton « ✍️ Signer le bail » (tant que `!complet`) qui appelle `openBailSignatureFlow(ref)`. Le badge `remoteSession` (relance/état) reste affiché en complément quand une session distante est en cours.

`openBailSignatureFlow(ref)` = ouvre l'écran de présence (la modale `openRemoteSignModal` re-titrée). Aucune logique métier dupliquée.

### 4.2 Filtre « solo signataire » dans le wizard
Aujourd'hui `_wizV2GetSigs()` filtre par **rôle** (`_wizSignWithLocataires` false=bailleur(s), true=tous, phase2=locataire(s)). Pour « chacun son tour », introduire `window._wizV2SoloSigner = <sigId>` : quand défini, `_wizV2GetSigs()` ne renvoie **que ce signataire**. C'est l'unique changement de filtrage ; tout le rendu/capture/persistance reste identique.

### 4.3 Orchestrateur de présentiels
À la confirmation de l'écran de présence, `_confirmBailSignatureFlow(ref)` :
1. Lit la matrice (réutilise la lecture DOM existante de `_confirmRemoteSignSend` : `bsd-bsign-i`/`bsd-bdist-i`/`bsd-bemail-i`, `bsd-presentiel-i`/`bsd-email-i`) → construit `présentiels[]` (ordre bailleur→locataire) et `distants[]`.
2. Persiste `bail.bailleurSign` (modes co-gérants) comme aujourd'hui.
3. **Boucle présentiels** : pour chaque signataire présentiel, ouvre le wizard avec `_wizV2SoloSigner=sigId` ; à la fin de sa passe, `_wizV2PersistSignatures` fusionne sa signature ; écran de transition → signataire suivant.
4. **Fin** : s'il reste des `distants[]`, appelle la chaîne d'envoi existante (`_confirmRemoteSignSend`) ; sinon marque le bail complet (déjà géré par la persistance quand tous les rôles requis sont signés).

L'ouverture séquentielle du wizard réutilise le mécanisme popup existant ; l'orchestrateur ne fait que piloter l'ordre et le passage d'un signataire au suivant.

## 5. Ce qui est préservé (toutes fonctionnalités)
- Signature bailleur in-app · signature locataire in-app (ex-phase 2) · envoi distant par email · toggle présentiel/distance par signataire · exclusion co-gérant (`mode='no'`) · relais + OTP (staged) · archivage cloud + cert de preuve · snapshot signé + highlight diff · reset/re-signature · relance session expirée. **Aucune capacité retirée.**

## 6. Ce qui change / est retiré
- **3 boutons → 1** sur la fiche.
- Le mode « avec-locataire » **simultané** (double pad même page) est **remplacé** par le séquentiel « chacun son tour ». (Les baux déjà signés en `avec-locataire` restent lisibles/regénérables — le reload lit `_SAVED_SIGNATURES.mode`.)
- La garde « signe d'abord le bailleur puis reviens envoyer » disparaît (ordre orchestré).
- Nouveau flag wizard `_wizV2SoloSigner`.

## 7. Modèle de données
`bail.signatures` inchangé (`paraphes`/`finales`/`luApprouveBy`/`mode`/`signedAt`/`signedBailleurAt`/`signedLocataireAt`/`bailSnapshot`/`remoteSession`). La fusion incrémentale par signataire s'appuie sur l'`Object.assign` déjà en place dans `_wizV2PersistSignatures`. `bail.bailleurSign[]` (modes co-gérants) inchangé.

## 8. Cas limites & erreurs
- **Annulation en cours de tour** : le signataire ferme le wizard → les signataires déjà passés restent persistés ; la reprise ré-affiche l'écran de présence avec l'état à jour (les signés apparaissent « déjà signé »).
- **Drive readonly / opener perdu** : géré par les Path 1/Path 2 de `_wizV2PersistSignatures` (déjà corrigé v15.421, refresh fiche dans les deux chemins).
- **Session distante résiduelle** : signer en présentiel écrase la `remoteSession` obsolète (déjà explicite v15.421). Si une session distante est **vivante**, la garde de `openRemoteSignModal` ([index.html:7070](../../index.html)) demande confirmation avant de la remplacer.
- **Aucun présentiel** (tous distants, bailleur inclus) : pas de wizard, envoi direct des liens.
- **Aucun signataire du tout** : bouton « Continuer » désactivé (comme le mockup).

## 9. Tests
- **Unitaire (pur)** : la construction de `présentiels[]`/`distants[]` + l'ordre (bailleur→locataire) extraits de la matrice → fonction pure testable (Vitest), isolée de la lecture DOM.
- **Filtre solo** : `_wizV2GetSigs()` avec `_wizV2SoloSigner` défini ne renvoie que ce signataire (test sur données `_SIGS`).
- **Non-régression** : le reload d'un bail `avec-locataire` regénère le PDF correctement ; l'envoi distant seul fonctionne comme avant.
- **Vérif syntaxe** : `check-inline-js` 5/0 + parse du JS runtime popup assemblé.
- **Audit obligatoire** : `superpowers:code-reviewer` avant livraison (bail légal opposable).
- **Mockup** : `mockups/BAIL-SIGN-UNIFIE/index.html` sert de référence UX.

## 10. Hors scope (itérations futures)
- Garants / cautions dans la matrice (acte séparé pour l'instant).
- Refonte visuelle du wizard au-delà du fil rouge (reskin Propryo global = chantier séparé).
