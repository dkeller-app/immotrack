# BUG-DRIVE-PARTAGE-TIERS — Workaround V1 (P1)

> **Statut** : ✅ Workaround V1 documenté (Phase A3, session 2026-05-15) · Fix structurel = V2 multi-tenant (Q4 2027)
> **Prio** : P1 (limite usage co-gestion)
> **Taille** : XS workaround / L fix structurel

---

## Symptôme

Bailleur principal partage son dossier Google Drive ImmoTrack avec un tiers (ex : Marion, co-gestionnaire / conjointe / expert-comptable). Le tiers a accès « Éditeur Drive » Google natif, voit les fichiers, peut les ouvrir manuellement dans Drive. **Mais quand elle ouvre l'app ImmoTrack** :

- ❌ Soit elle ne voit pas toutes les données (synchronisation partielle)
- ❌ Soit elle voit les données mais ne peut rien enregistrer (« sauvegarde échouée »)

User : *« j'ai donné accès à un tiers et elle n'a pas toutes les infos et ne peut pas enregistrer »* (Marion en mai 2026).

## Cause racine

ImmoTrack utilise OAuth scope `drive.file` + `drive.readonly` (lignes 32503-32507 de `index-test.html`). Ce scope est volontairement **restreint à la sécurité maximale** :

- `drive.file` : l'app ne peut **lire/écrire que les fichiers créés par elle-même** pour l'utilisateur connecté
- `drive.readonly` : lecture de méta-données globales

**Conséquence pour le partage** : même si Marion a accès « Éditeur Drive » natif au fichier ImmoTrack créé par Didier, l'app OAuth de Marion **ne peut pas l'écrire** car ce n'est pas son app qui l'a créé. Limitation **structurelle de Google** sur scope `drive.file`, pas un bug ImmoTrack.

## Options évaluées (audit synthèse SaaS V2)

| Option | Description | Coût | Risque |
|---|---|---|---|
| A | Migrer vers scope `drive` (full) | ~4h dev + revérification Google Workspace | 🔴 perte certif sécu Google · revue manuelle 4-6 semaines |
| B | Fichier copié au tiers | 2h doc | 🟠 perd la collab temps réel · doublons |
| C | SaaS V2 multi-tenant | 240-260h dev | 🟢 sécurité maximale, vrai multi-user |
| **D** | **Drive partagé Google (workaround)** | **0h dev, 30 min user setup** | **🟢 zéro modif app · OK pour usage co-gestion** |

**Option D retenue pour V1** (workaround user-side, on garde scope `drive.file` minimal).

## Workaround V1 — Procédure pas-à-pas

Pour partager ImmoTrack avec un tiers (conjoint, co-gestionnaire, expert-comptable) :

### Étape 1 — Créer un Drive partagé Google
1. Aller sur https://drive.google.com
2. Menu gauche → « Drive partagés » → « Nouveau » → nommer ex `ImmoTrack Patrimoine Keller`
3. Ajouter le tiers (Marion) en tant que **Gestionnaire de contenu** (pas juste Lecteur)

### Étape 2 — Déplacer le dossier ImmoTrack vers le Drive partagé
1. Dans « Mon Drive », trouver le dossier ImmoTrack (créé par l'app)
2. Clic droit → « Déplacer » → choisir le Drive partagé
3. ⚠️ Important : déplacer le **dossier complet**, pas juste un fichier

### Étape 3 — Configurer Marion
1. Marion ouvre `https://immotrack.app` (ou l'URL où l'app est hébergée)
2. Clique sur 🔗 Connexion Drive
3. Se connecte avec **son propre compte Google** (pas celui de Didier)
4. L'app détecte automatiquement le dossier ImmoTrack dans son Drive partagé
5. Marion peut maintenant lire ET écrire dans le dossier

### Pourquoi ça marche
Dans un Drive partagé, tous les membres sont **propriétaires effectifs** des fichiers (la propriété est celle de l'organisation/du Drive). L'OAuth `drive.file` de Marion considère donc qu'elle a créé les fichiers → autorise lecture + écriture.

## Limites du workaround

- 🟠 Nécessite un compte Google Workspace ou Google personnel **avec quota suffisant** (Drive partagés ont parfois des limites de quota selon le plan)
- 🟠 Comportement de propriété peut changer si Google modifie ses APIs (à monitorer)
- 🔴 **Pas adapté pour 10+ utilisateurs** : la collaboration temps réel sur le même `db.json` peut générer des conflits (merge tombstone gère 2-3 users max correctement)

## Fix structurel = SaaS V2 multi-tenant (Phase D long terme)

Pour 10+ utilisateurs, vraie multi-tenant base de données (Phase D / V2 Q4 2027) :
- PostgreSQL Neon + Row-Level Security (RLS)
- Auth Clerk/Better Auth multi-comptes
- Rôles : Bailleur / Co-gestionnaire / Expert-comptable / Locataire
- Permissions granulaires par fonctionnalité

## Note pour la roadmap

Quand on attaquera Phase D Stripe paywall, prévoir un tier **« Co-gestion »** à ~19€/mois qui débloque officiellement le partage avec 1-2 tiers via Drive partagé. Cible : couples bailleurs, expert-comptables. Le workaround actuel devient une feature commerciale.
