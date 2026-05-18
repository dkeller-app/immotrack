# 📧 Envoyer vos emails directement depuis ImmoTrack

> **Pour qui** : utilisateurs finaux ImmoTrack (bailleurs).
> **Durée** : 30 secondes la première fois, instantané ensuite.

---

## Pourquoi connecter votre Gmail à ImmoTrack ?

Sans connexion : ImmoTrack vous prépare un **brouillon** que vous devez ouvrir dans votre client mail (Gmail, Outlook, Thunderbird) et envoyer manuellement.

Avec connexion Gmail : un clic sur **`📤 Envoyer maintenant`** dans ImmoTrack envoie l'email **directement depuis votre adresse Gmail**. Les avantages :

- ✅ Email envoyé depuis **votre adresse pro**, pas un `noreply@app.com` peu crédible
- ✅ Apparaît dans votre **dossier "Envoyés" Gmail** comme n'importe quel email que vous écrivez
- ✅ Réponse du locataire arrive **dans votre boîte Gmail** normalement
- ✅ **Zéro stockage** chez ImmoTrack : nous n'enregistrons que la date + sujet + destinataire (traçabilité), jamais le contenu
- ✅ Conforme **RGPD** (pas de relais opaque)

---

## Comment faire ? (3 étapes)

### Étape 1 — Cliquez sur "☁ Drive" dans la sidebar ImmoTrack

Si vous êtes **déjà connecté à Drive** : déconnectez-vous d'abord (cliquez sur le bouton Drive, puis "Déconnecter"). C'est nécessaire pour ajouter la nouvelle permission.

Puis cliquez à nouveau **`☁ Connecter à Drive`**.

### Étape 2 — Google vous présente une page d'autorisation

Une popup Google s'ouvre. Vous devez voir **4 permissions demandées** :

| Permission | À quoi ça sert |
|---|---|
| 📁 Voir, modifier, créer vos fichiers Drive ImmoTrack | Sauvegarde de votre base de données |
| 📁 Voir et télécharger tous vos fichiers Drive | Restauration des sauvegardes |
| 👤 Voir l'adresse email de votre compte Google | Identifier qui est connecté |
| 📧 **Envoyer des emails en votre nom** ← Nouveau ! | **Bouton "Envoyer maintenant" dans ImmoTrack** |

Cliquez sur **Continuer** puis **Tout autoriser**.

> **⚠ Écran "Application non vérifiée par Google" ?**
> Pendant la phase de vérification Google (~2-6 semaines après lancement), vous pouvez voir un écran d'avertissement orange "Google n'a pas vérifié cette application". C'est **normal en phase bêta** :
> - Cliquez sur **"Paramètres avancés"** (en bas)
> - Cliquez sur **"Accéder à ImmoTrack (non sécurisé)"**
> - Puis continuez normalement
>
> Cet écran disparaîtra dès que Google aura validé ImmoTrack (rien à faire de votre côté).

### Étape 3 — Vérifier que le bouton est dispo

Allez dans n'importe quelle fiche bail, cliquez sur le bouton 📧 d'un email (par exemple "Quittance" ou "Révision IRL"). La modale "Proposition de mail" s'ouvre. **Vous devez maintenant voir 5 boutons en bas** :

```
[ Annuler ] [ 📋 Copier ] [ 📧 Ouvrir client mail ] [ 📤 Envoyer maintenant ]
```

Le dernier bouton **`📤 Envoyer maintenant`** est nouveau. Cliquez dessus → l'email part en quelques secondes, et apparaît dans votre Gmail "Envoyés".

---

## Questions fréquentes

### Est-ce que ça marche si je n'utilise pas Gmail (j'ai Outlook / Free / Orange) ?

**Pas pour l'instant**. Le bouton `📤 Envoyer maintenant` reste caché si vous n'avez pas de compte Google. Vous continuez avec **`📧 Ouvrir client mail`** comme avant (ouvre votre client mail natif avec le brouillon pré-rempli).

Support Outlook/Microsoft 365 prévu en **V1.2** (sujet EMAIL-SMTP-MICROSOFT, ~3h dev).

### Qu'est-ce qu'ImmoTrack peut faire avec ma permission "Envoyer des emails" ?

**Uniquement envoyer un email que VOUS avez explicitement composé et confirmé** par un clic sur "Envoyer maintenant". ImmoTrack ne peut :

- ❌ PAS envoyer d'emails sans votre clic explicite
- ❌ PAS lire vos emails reçus
- ❌ PAS supprimer vos emails
- ❌ PAS modifier vos paramètres Gmail
- ❌ PAS envoyer d'emails en arrière-plan (background)

Le scope OAuth utilisé est **`gmail.send`** : c'est le scope le plus restrictif possible pour l'envoi (vs `gmail.modify` qui donnerait beaucoup plus de pouvoirs).

### Comment révoquer cette permission plus tard ?

1. Allez sur **`myaccount.google.com/permissions`**
2. Trouvez **ImmoTrack** dans la liste
3. Cliquez sur **Supprimer l'accès**

Vous pouvez aussi simplement vous déconnecter de Drive dans ImmoTrack (☁ → Déconnecter) : le token est invalidé immédiatement.

### Est-ce qu'ImmoTrack envoie aussi des emails que je n'ai PAS composés ?

**Non, jamais**. Tous les emails envoyés via ImmoTrack passent par la modale "Proposition de mail" :
1. Vous voyez le contenu pré-rempli
2. Vous pouvez le modifier
3. Vous cliquez explicitement sur **Envoyer maintenant**

Aucun envoi automatique en arrière-plan.

### Je vois "Envoi en cours…" qui reste affiché, que faire ?

Si l'envoi prend plus de 10 secondes : c'est probablement un problème réseau ou une lenteur Gmail. Le bouton se déverrouille en cas d'erreur avec un message explicite (token expiré / quota / réseau). Vous pourrez réessayer.

Si vraiment bloqué : F5 (recharger la page) puis réessayer. Aucun risque de double envoi (Gmail dédoublonne par contenu).

### Et la limite "250 envois/jour" ?

Quota Gmail standard pour les comptes personnels : 500 emails/jour. Si vous gérez 10 lots, c'est suffisant pour 50 envois par lot, largement au-dessus de l'usage réel (≤ 10 envois/mois/lot typique = quittance + 1-2 autres).

Pour Workspace (Gmail pro) : quota plus élevé.

---

## Sécurité & RGPD

- ImmoTrack **ne stocke pas** les corps d'emails envoyés. Seules les **métadonnées** (date, destinataire, sujet, statut) sont conservées dans votre base locale ImmoTrack (voir onglet 📧 Communications).
- Le **token OAuth** est éphémère (1h max) et stocké uniquement dans votre navigateur. Aucun envoi de credentials vers un serveur ImmoTrack (qui n'existe pas en V1 — l'app est 100% offline-first).
- L'email part **directement de votre navigateur** vers les serveurs Gmail Google, sans intermédiaire.

Voir aussi : [docs/legal/RGPD-REGISTRE.md](../legal/RGPD-REGISTRE.md) (registre des traitements ImmoTrack).
