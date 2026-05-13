# EMAIL-AUTO — Infrastructure d'envoi / proposition emails sortants

**Status** : ✅ V1 livrée sandbox v14.97 (2026-05-13) — branche `claude/adoring-morse-1565eb` · **Prio** : P1 · **Taille** : M
**Détecté** : 2026-05-11 · **Livré** : 2026-05-13 (~3-4h session dédiée)
**Lié à** : QUIT-EMAIL · AVIS-ECHEANCE · RAPPEL-IMPAYE · IRL-VALIDATION · MRH-AUTO-LOC · DRIVE-ARBORESCENCE

## Contexte
Demande utilisateur 2026-05-11 :
> 💬 « possible de faire un envoi automatique ou proposition de mail (par exemple pour quittance) ? »

Au-delà des quittances mentionnées en exemple, l'app a besoin d'une **infrastructure commune d'envoi/proposition d'emails** pour de nombreux cas :

| Cas d'usage | Sujet existant | Déclencheur |
|---|---|---|
| Quittance mensuelle au locataire | QUIT-EMAIL (P2) | Génération quittance |
| Avis d'échéance avant paiement | AVIS-ECHEANCE (P2) | J-5 avant date paiement |
| Rappel impayé | RAPPEL-IMPAYE (P2) | J+5, J+15, J+30 après échéance |
| Lettre révision IRL | (déjà géré v13.30-33) | Validation user |
| Mise en demeure / commandement | GESTION-IMPAYE (P1 V1.1) | Pré-contentieux |
| CRG mensuel au bailleur | GESTION-CRG (P0 V1.1) | Fin de mois mandataire |
| Renouvellement MRH | MRH-AUTO-LOC + alerte | Date fin MRH < 30j |
| Convocation EDL sortie | (à créer ?) | Fin de bail |
| Décompte régularisation annuelle | BUG-CHARGE-001 fixé | Régul calculée |
| Bail signé par PDF | (post-bail) | Wizard bail terminé |
| Notification candidat refusé / accepté | LOG-CANDIDATS (futur) | Décision candidature |

→ Au lieu de coder une UI d'email par sujet, créer **1 infrastructure commune** : `_emailCompose(type, context)` → renvoie `{to, subject, body, attachments}`.

## 2 modes V1 vs V2

### Mode V1 — "Proposition de mail" (offline-first compatible)

L'app **génère un brouillon** et le passe au client mail de l'utilisateur ou affiche une modale avec sujet + corps prêts à copier.

**Techniques possibles** :
1. **`mailto:` link** (le plus simple, natif navigateur)
   - Avantage : 0 backend, instantané, ouvre Gmail/Outlook/Apple Mail natif
   - Limite : taille max ~2000 caractères (URL), pas de PJ
2. **Modale avec sujet + corps copiables** + bouton "Ouvrir dans mon client mail"
   - Avantage : pas de limite de taille, copier-coller propre
   - PJ : générer le PDF côté app, dire à l'utilisateur "PDF téléchargé, à joindre dans votre mail"
3. **Web Share API** (mobile)
   - Si disponible → partage natif iOS/Android avec choix d'app (mail / WhatsApp / etc.)

**Recommandation V1** : mix Mode 2 (desktop) + Mode 3 (mobile si Web Share dispo).

### Mode V2 SaaS — "Envoi automatique" (post-V1)

L'app **envoie le mail directement** via un service tiers :
- SendGrid (gratuit jusqu'à 100/jour, 15€/mois pour 50k/mois)
- Postmark (focus transactionnel, $15/mois pour 10k/mois)
- AWS SES (ultra cheap, $0.10 pour 1000 mails)
- Mailgun

Nécessite :
- Backend léger (Cloudflare Worker ou Vercel Function) pour ne pas exposer la clé API
- DKIM / SPF configurés sur un domaine `mail.immotrack.app` ou similaire
- UI de configuration utilisateur (template par défaut, signature, etc.)

→ **V2 (post-V1 commerciale Q4 2026)**, en parallèle de SAAS-MULTIUSERS et PORTAIL-LOC.

## Scope V1 (mode "Proposition")

### Phase 1 — Infrastructure commune (~2h)
- Module `js/core/email-compose.js` (cohérent ARCHI-MODULAR Stratégie 2)
- API : `_emailCompose(type, context) → {to, subject, body, attachments}`
- Types supportés en V1 :
  - `quittance` (cf QUIT-EMAIL)
  - `avis-echeance` (cf AVIS-ECHEANCE)
  - `rappel-impaye-1`, `rappel-impaye-2`, `rappel-impaye-3` (cf RAPPEL-IMPAYE, escalade)
  - `irl-revision` (déjà géré mais à uniformiser)
  - `mrh-renouvellement`
  - `bail-signe-final`
  - `convocation-edl-sortie`
  - `decompte-regul-annuel`
- Templates dans `docs/templates/emails/` (1 markdown par type, avec variables `{{...}}`)
- Tests Vitest dans `__tests__/helpers/email-compose.test.js`

### Phase 2 — UI "Envoyer par email" (~2h)
- Composant `js/components/email-modal.js` (cohérent ARCHI-MODULAR)
- Modale avec :
  - Destinataire pré-rempli (depuis bail.locataire.email)
  - Sujet éditable
  - Corps éditable (Markdown ou textarea simple ?)
  - Aperçu rendu HTML
  - PJ : liste des fichiers à joindre (PDF généré + autres docs si pertinents)
  - 3 boutons :
    - **"Ouvrir dans mon client mail"** (mailto: si < 2000 char OU téléchargement .eml)
    - **"Copier sujet + corps"** (clipboard)
    - **"Annuler"**
- Mobile : Web Share API si disponible (iOS/Android)
- Tests Vitest + tests UI manuel

### Phase 3 — Intégration par cas d'usage (~30min × N cas)
- Quittance : bouton "Envoyer par email" sur fiche quittance → ouvre modale avec template `quittance`
- IRL : intégrer dans le workflow IRL-VALIDATION existant
- MRH : alerte dashboard + bouton sur fiche MRH
- Etc.

### Phase 4 — Historique d'envoi (~1h)
- Champ `entity._emailsSent[]` : `{type, to, sentAt, status: 'proposed'|'sent_via_mailto'|'copied'}`
- Affichage historique dans fiche logement / bail / entité
- Permet à l'utilisateur de tracer quelles communications ont été générées

## Décisions à prendre
- [ ] **Mode V1 par défaut** : mailto: link OU modale + clipboard ? → recommandation : modale (plus robuste)
- [ ] **PJ dans V1** : générer PDF côté app + dire utilisateur de joindre manuellement ? Oui (mailto: ne supporte pas les PJ)
- [ ] **Templates** : 1 unique par type ou template éditable par utilisateur ? → V1 : template fixe, V2 : éditable
- [ ] **Multi-langue** : V1 français uniquement, V2 anglais/etc.
- [ ] **Signature** : signature utilisateur configurable dans Paramètres ?
- [ ] **CC / BCC** : utile pour envoyer copie au gestionnaire / expert-comptable ?

## Templates V1 (à rédiger)

Pour chaque type, créer `docs/templates/emails/{type}.md` avec :
- Sujet (1 ligne, variables interpolées)
- Corps (texte ou HTML simple, variables interpolées)
- PJ recommandées (liste)
- Notes légales (obligation envoi LRAR pour certains, etc.)

## Notes utilisateur
> 💬 2026-05-11 : "possible de faire un envoi automatique ou proposition de mail (par exemple pour quittance) ?"

## Journal
- 2026-05-11 : créé · sujet transversal qui regroupe l'infra commune sous QUIT-EMAIL / AVIS-ECHEANCE / RAPPEL-IMPAYE / etc.
- 2026-05-11 : V1 = mode "proposition" (mailto: ou modale clipboard). V2 SaaS = mode "automatique" (SendGrid/Postmark) post-V1 commerciale
- 2026-05-13 : **V1 livrée sandbox v14.97** sur branche `claude/adoring-morse-1565eb` (4 commits + Phase 5 sync) :
  - **EMAIL-AUTO.1 (bce5268)** : `js/core/email-compose.js` (10 types V1 inline templates avec articles légaux cités : art. 24 / 17-1 / 7g / 23 / 3-2 loi 89-462 + loi Climat 2021 art. 23) + helper `_interpolateEmail({{path.to.value}})` + fallback `(inconnu)` pour variables manquantes + mode `opts.escapeHtml` pour aperçu HTML safe. **30 tests Vitest**.
  - **EMAIL-AUTO.2 (fa8dab7)** : `js/components/email-modal.js` (DOM modale injecté dynamiquement, idempotent, réutilise `.ov .modal .m-head .m-body .m-foot` design system) + helper `_buildMailtoUrl` (encode espaces/accents/CC via encodeURIComponent) + 3 boutons (mailto: cutoff 1800 chars, clipboard `navigator.clipboard.writeText`, share Web Share API mobile masqué sauf si dispo) + notes légales affichées + warning type inconnu. **18 tests Vitest**.
  - **EMAIL-AUTO.3 (03ddb2d)** : `_logEmailSent(entityType, entityId, emailData)` + `_getEmailHistory(entityType?, entityId?, list?)` — DB.emailsSent[] avec id `em_*`, sentAt ISO, status `proposed|mailto|copied|shared`. **Body NON persisté (RGPD)**. saveDB() silencieux si throw (read-only mode). Hook auto-invoqué par email-modal après chaque action. **11 tests Vitest**.
  - **EMAIL-AUTO.4 (e266843)** : intégration UI 3 cas prioritaires + bump v14.97 :
    - Quittance : bouton 📧 dans cellule actions du tableau quittances → `envoyerQuittanceParEmail(id)` construit contexte (locataire/bail/logement/entité/quittance) et appelle `window._openEmailModal('quittance', ctx, {entityType: 'quittance', entityId})`.
    - IRL : bouton "📧 Envoyer" à côté de "🖨 Imprimer" sur pane aperçu + modale `ov-irl-lettre` → `envoyerLettreIRLParEmail()` lit `_letterRef`, vérifie `computeIRLRevision`, bloque si DPE manquant/F/G, ouvre modale type `irl-revision`.
    - Décompte régul : bouton 📧 sur chaque card régul → `envoyerDecompteParEmail(entryKey)` relit `computeRegul`, calcule solde + soldeSens + soldeAction (art. 23 al. 4 loi 89-462), ouvre modale type `decompte-regul-annuel`.
  - **Tests Vitest totaux** : 321/321 passent (262 base session marathon + 59 ajoutés EMAIL-AUTO).
  - **Test navigateur** (preview server :8770) : modules ES chargés (_emailCompose, _openEmailModal, 10 types listés), handlers globaux définis, modale s'ouvre avec contexte pré-rempli (to/subject/body/attachments/legalNote validés via eval JS).
- 2026-05-13 : **6 autres types prêts en infra mais sans intégration UI** (V1.1) : avis-echeance, rappel-impaye-1/2/3, mrh-renouvellement, bail-signe-final, convocation-edl-sortie. Helpers `_emailCompose('<type>', ctx)` et templates fonctionnels — il suffira d'ajouter les boutons UI dans les écrans correspondants.

## V1.1 — Intégration UI restante (6 cas)
- [ ] **avis-echeance** : alerte dashboard "J-5 paiement" + bouton 📧 sur card alerte
- [ ] **rappel-impaye-1/2/3** : section "Impayés" du dashboard, escalade J+5/J+15/J+30 + boutons 📧 par niveau
- [ ] **mrh-renouvellement** : alerte dashboard "MRH expire < 30j" + bouton 📧 sur fiche MRH
- [ ] **bail-signe-final** : auto-proposer après signature bail dans wizard (étape post-signature)
- [ ] **convocation-edl-sortie** : sur fiche bail → bouton "Convoquer EDL sortie" qui demande date/heure puis ouvre modale
