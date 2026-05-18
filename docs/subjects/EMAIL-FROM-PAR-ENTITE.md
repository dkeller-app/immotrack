# EMAIL-FROM-PAR-ENTITE — Envoyer depuis l'adresse de l'entité (pas Gmail perso)

**Status** : ✅ **Livré v15.92** (Option A send-as alias) · **Prio** : P1 (V1 commercial) · **Taille** : S (~2-3h)
**Détecté** : 2026-05-18 (user : « est-il possible de choisir l'email d'envoie en fonction de l'entité ? »)
**Lié à** : EMAIL-SMTP-CONNECT, EMAIL-MODAL-UX-REFONTE, SAAS-MULTIUSERS

## Contexte

Aujourd'hui (v15.91), tous les emails partent depuis le Gmail connecté (`didierkeller@gmail.com`). Quand le user a plusieurs entités (SCI A, SCI B, biens persos), il veut envoyer depuis l'adresse de la SCI concernée (`gestion@sci-a.fr`) — image pro + RGPD (le locataire répond à la SCI, pas à l'adresse perso du gérant).

C'est **bloquant V1 commercial** : un gestionnaire pro avec 5 SCI ne peut pas envoyer toutes ses quittances depuis sa Gmail perso.

## Solutions techniques

### Option A — Send-as aliases Gmail (recommandé V1)
**Gratuit**, géré côté Google :
1. User va sur Gmail → Compte → « Envoyer des e-mails en tant que » → ajouter `gestion@sci-a.fr`
2. Gmail envoie un mail de vérification à cette adresse (il faut donc avoir accès au mailbox `gestion@sci-a.fr`)
3. Une fois validé, l'API Gmail accepte `From: gestion@sci-a.fr <didierkeller@gmail.com>` dans les MIME envoyés (avec le scope `gmail.send`)

**Avantages** : gratuit, standard, géré par Google, multi-aliases natif
**Inconvénient** : il faut que l'user gère ses aliases côté Gmail (procédure à documenter)

### Option B — Connexion OAuth multi-comptes
Connecter plusieurs comptes Gmail directement (un OAuth par entité).
**Avantage** : pas de config Gmail, chaque compte est indépendant
**Inconvénients** : complexe (multi-tokens), demande picker à chaque envoi, friction

### Option C — SMTP custom par entité
SMTP propre à chaque entité (compte mail pro IONOS / OVH / O2switch...).
**Avantages** : pas Gmail-dépendant, vrai mail pro
**Inconvénients** : credentials SMTP à stocker (sécurité !), pas envisageable V1 sans backend

## Scope V1 — Option A

### Phase 1 — Champ entité (~30 min)
- [ ] Champ `entite.emailEnvoi` (string, optionnel) dans la fiche bailleur (entrée Paramètres > Bailleurs)
- [ ] Validation format email (regex simple)
- [ ] Tooltip explicatif : « Adresse à utiliser dans le From des emails (doit être configurée en alias dans votre Gmail). Sinon : Gmail par défaut. »

### Phase 2 — Détection automatique des aliases (~30 min, optionnel mais top UX)
- [ ] Au boot Gmail connecté : appeler `users.settings.sendAs.list` → liste tous les aliases disponibles
- [ ] Stocker dans `window._gmailAliases` (array de `{sendAsEmail, displayName, verificationStatus}`)
- [ ] Dans fiche bailleur : selectbox au lieu d'input texte (dropdown des aliases dispo)
- [ ] Ajout entrée bonus « + Configurer un nouvel alias dans Gmail » → lien vers `https://mail.google.com/mail/u/0/#settings/accounts`

### Phase 3 — Intégration MIME (~30 min)
- [ ] `_emailToMimeBase64Url({to, cc, from, subject, body, attachments})` : si `from` fourni → ajouter header `From: <from>` (sinon Gmail déduit du token)
- [ ] `_emailSendViaGmail` inchangé (le From est dans le MIME)
- [ ] Modal email : récupère `ctx.entite.emailEnvoi` et passe à `_emailToMimeBase64Url`
- [ ] Affichage FROM bar dans la modale : montre `gestion@sci-a.fr (via didierkeller@gmail.com)` si entité a un email custom

### Phase 4 — Gestion erreur (~30 min)
- [ ] Si Gmail rejette (alias non configuré ou non validé) → toast erreur clair : « Alias [adresse] non configuré dans votre Gmail. Soit le configurer (lien), soit envoyer depuis votre Gmail principal. » + bouton « Envoyer quand même depuis Gmail principal »
- [ ] Fallback graceful, pas de crash

### Phase 5 — Procédure user (~15 min)
- [ ] Page d'aide intégrée Paramètres > Communications expliquant la configuration des aliases Gmail (avec captures)

## Décisions à prendre

- **D1** : `entite.emailEnvoi` champ texte libre OU selectbox depuis détection aliases ?
- **D2** : Si entité sans email custom → fallback Gmail principal silencieux ou demander confirmation ?
- **D3** : Multi-utilisateurs SaaS V2 : chaque user de l'entité a son propre Gmail → comment résoudre le From ?

## Critères de succès

- [ ] User configure 1 alias Gmail + le saisit dans fiche entité SCI → envoie quittance depuis cette adresse en 1 clic
- [ ] Locataire reçoit le mail FROM = `gestion@sci-a.fr` (pas didierkeller@gmail.com)
- [ ] Réponse du locataire arrive sur `gestion@sci-a.fr`
- [ ] Si alias non configuré côté Gmail : message d'erreur clair + fallback proposé

## Notes utilisateur

> 💬 2026-05-18 : « autre point pr les mails : est-il possible de choisir l'email d'envoie en fonction de l'entité ? »

## Journal

- 2026-05-18 : créé · P1 (bloquant V1 commercial) · S (~2-3h) · Option A (send-as aliases Gmail) retenue
- 2026-05-18 : ✅ **Livré v15.92** — Option A retenue (champ texte simple, pas de détection auto via Gmail API en V1)
  - Phase 1 ✅ : champ `ent-email-envoi` ajouté dans `#ov-ent` (modale bailleur, après IBAN/BIC) + tooltip explicatif + procédure inline (Gmail → ⚙ → Comptes → Send-as)
  - `openNewEnt(id)` charge `ent.emailEnvoi` au load (compat existing entités sans le champ)
  - `saveEnt()` enregistre `emailEnvoi: (v('ent-email-envoi')||'').trim().toLowerCase()` (cohérence + idempotent)
  - Phase 2 ✅ : `_emailToMimeBase64Url` accepte déjà `from` (préexistant ligne 94) — pas besoin de modifier. `_onSendNow` dans `email-modal.js` récupère `modal._emailCtx.fromEntite` et passe au MIME `from: fromEntite || undefined`
  - `_fillModal` étendu pour recevoir `context` en 4ème arg + extraire `_fromEntite` = `context.entite.emailEnvoi` trim
  - Phase 3 ✅ : FROM bar dynamique
    - Si entité.emailEnvoi configuré + Gmail connecté → `Envoi depuis [alias] (via [Gmail perso])`
    - Si juste Gmail perso → `Envoi depuis [Gmail perso] (Gmail connecté)`
    - Si rien → bar masquée
  - Erreur claire 403 Gmail : détection regex `not allowed|invalidsender|delegate|sendas|from address` → message explicit avec procédure de fix (Gmail → ⚙ → Send-as) au lieu du message générique "scope manquant"
  - Phase 4 ✅ : 915/915 tests verts (pas d'impact). Verif preview JS v15.92 :
    - `field_exists: true`, `field_type: "email"` (HTML correct)
    - `fromEntite_stored: "gestion@sci-test.fr"` (stockage modal._emailCtx OK)
    - Avec alias → `"gestion@sci-test.fr"` + `"(via didierkeller@gmail.com)"` ✅
    - Sans alias → `"didierkeller@gmail.com"` + `"(Gmail connecté)"` ✅
- ⏸️ **V1.1 reporté** (si besoin) : détection auto aliases via `users.settings.sendAs.list` (demande scope `gmail.settings.basic` supplémentaire + re-validation OAuth Google ~2-6 sem). Selectbox au lieu d'input texte. Pour V1 le champ texte avec procédure inline suffit.
- ⏸️ **Multi-utilisateurs SaaS V2** (D3) : à arbitrer quand on aborde MULTI-USER (rôles + permissions). Each user pourrait avoir son propre alias par entité.
