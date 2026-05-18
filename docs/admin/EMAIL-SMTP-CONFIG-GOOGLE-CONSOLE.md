# Procédure ADMIN — Activer le scope `gmail.send` pour ImmoTrack

> **Pour qui** : Didier (propriétaire du projet OAuth ImmoTrack).
> **Quand** : 1 seule fois avant le déploiement de v15.80 en production.
> **Durée** : ~10 min Console + 2-6 semaines vérification Google (en arrière-plan).

---

## Contexte

ImmoTrack v15.80 ajoute le bouton **`📤 Envoyer maintenant`** dans la modale email, qui envoie via Gmail API depuis l'adresse Gmail du bailleur. Pour que ça marche, le scope OAuth `https://www.googleapis.com/auth/gmail.send` doit être :

1. **Ajouté** à l'OAuth consent screen du projet Google Cloud
2. **Soumis pour vérification Google** (gratuit) pour passer en production publique

Sans ces 2 étapes, le bouton apparaîtra mais Google rejettera la connexion avec un message "scope not allowed".

---

## Pré-requis

- Accès à **`console.cloud.google.com`** avec le compte Google propriétaire du projet ImmoTrack
- Identifier le projet : `580411013113` (Client ID `580411013113-48d3e433klscfad6u180e62kr8fjq545.apps.googleusercontent.com`, défini dans `index.html` ligne 35921 sous `DRIVE_CLIENT_ID`)

---

## Étape 1 — Ajouter le scope (~3 min)

1. Ouvrir **`console.cloud.google.com`**
2. En haut, sélecteur de projet → choisir **ImmoTrack** (ou le nom que tu lui as donné, vérifier ID `580411013113`)
3. Menu hamburger ☰ → **APIs & Services** → **OAuth consent screen**
4. Bouton **EDIT APP** en haut
5. Cliquer sur les étapes successives ou naviguer directement à l'onglet **Scopes**
6. Bouton **ADD OR REMOVE SCOPES**
7. Dans la liste, chercher : `gmail.send`
   - Le scope complet : `https://www.googleapis.com/auth/gmail.send`
   - Description Google : "Send email on your behalf"
   - Type : **Restricted** (= nécessite vérification, mais gratuit)
8. **Cocher** la case
9. Bouton **UPDATE** en bas du modal
10. **SAVE AND CONTINUE** à chaque étape suivante (les autres pages ne changent pas)
11. Sur la page de résumé final : **BACK TO DASHBOARD**

À ce stade, le scope est **disponible en mode test** : les utilisateurs whitelistés (toi + comptes que tu ajoutes dans "Test users") peuvent l'utiliser immédiatement. Les autres verront "App not verified".

---

## Étape 2 — Ajouter Test Users (pour toi + bêta-testeurs, ~2 min)

Pour utiliser le scope SANS attendre la vérif Google :

1. Toujours dans **OAuth consent screen**
2. Section **Test users** → bouton **+ ADD USERS**
3. Ajouter ton adresse Gmail principale + celles des bêta-testeurs (max 100 users en mode test)
4. **SAVE**

Au prochain login Drive depuis ImmoTrack, ces comptes verront le consent screen avec `gmail.send` et pourront autoriser.

---

## Étape 3 — Soumettre pour vérification Google (~5 min puis 2-6 sem d'attente)

⚠️ **À FAIRE EN PARALLÈLE** car ça prend plusieurs semaines. Tant que la vérif n'est pas validée, les utilisateurs externes verront "App not verified" et devront cliquer "Advanced → Continue anyway" (= mauvaise UX commerciale).

1. Toujours dans **OAuth consent screen** → ton app
2. En haut : **PUBLISHING STATUS** = `Testing` → bouton **PUBLISH APP**
3. Confirmer "Push to production"
4. Une fois en production : un encart apparaît "Your app needs verification because it uses sensitive/restricted scopes"
5. Bouton **PREPARE FOR VERIFICATION**
6. Suivre le formulaire Google :
   - **App name + logo + homepage URL** : ImmoTrack, `https://dkeller-app.github.io/immotrack/`
   - **Privacy policy URL** : *(à créer si pas encore — voir docs/legal/)*
   - **Terms of service URL** : *(à créer si pas encore)*
   - **Authorized domain** : `dkeller-app.github.io` (et plus tard ton domaine custom `immotrack.app`)
   - **Application explanation** : "ImmoTrack helps individual landlords manage their rental properties. We need `gmail.send` to let users send pre-filled rent receipts, IRL revision letters, and other tenant communications directly from their own Gmail account (zero data stored on our side)."
   - **Justification for each restricted scope** : "Users compose tenant emails (rent receipts, IRL revisions, lease notices) inside ImmoTrack. Sending via their Gmail account ensures the email comes from a known address (vs noreply@) and arrives in their Sent folder for traceability. We do NOT store email bodies — only metadata (date, recipient, subject, status) per RGPD."
   - **Demo video** (Loom 2-3 min recommandé) : montre le flow Drive consent → user clique "Envoyer maintenant" dans modale email → Gmail API envoie → email apparaît dans Sent natif.
7. **SUBMIT FOR VERIFICATION**
8. Attente : Google répond généralement en 2-6 semaines. Possibilité d'allers-retours (clarifications). Gratuit.

---

## Vérification du résultat

Après l'étape 1+2 (avant vérification Google) :

```bash
# Dans ImmoTrack en local
1. Se déconnecter de Drive (bouton ☁ → Déconnecter)
2. Cliquer ☁ Drive à nouveau
3. Google consent screen DOIT lister maintenant :
   ✓ See, edit, create, and delete only the specific Google Drive files
   ✓ See and download all your Google Drive files
   ✓ See your primary Google Account email address
   ✓ Send email on your behalf  ← NOUVEAU
4. Cliquer "Continuer" → "Tout autoriser"
5. Dans n'importe quelle modale email ImmoTrack → bouton "📤 Envoyer maintenant" doit apparaître
```

Si le scope n'apparaît PAS dans le consent : retour étape 1, le scope n'a pas été coché ou la propagation Google n'est pas finie (parfois ~10 min).

---

## Coût

- **0 €** : scope `gmail.send` + vérification Google = gratuits
- Quota Gmail API : 250 envois/jour/utilisateur (largement suffisant pour un bailleur)

---

## Sujets liés

- [docs/subjects/EMAIL-SMTP-CONNECT.md](../subjects/EMAIL-SMTP-CONNECT.md) — sujet technique
- [docs/help/EMAIL-CONNECTER-GMAIL.md](../help/EMAIL-CONNECTER-GMAIL.md) — procédure utilisateur final (à embarquer dans l'aide intégrée ImmoTrack)
