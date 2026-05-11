# DPA Google Drive — Note d'analyse pour ImmoTrack

**Version** : 1.0
**Date** : 2026-05-11
**Statut** : Note synthétique. Pour le texte légal, voir : [https://cloud.google.com/terms/data-processing-addendum](https://cloud.google.com/terms/data-processing-addendum) (Google Cloud Workspace DPA).

---

## Contexte

ImmoTrack utilise Google Drive (scope `drive.file`) pour la sync optionnelle des données utilisateur (bases JSON + photos EDL + PDF baux signés).

**Conséquence RGPD** : si l'utilisateur active la sync, il devient **responsable de traitement** et Google devient **sous-traitant** au sens de l'art. 28 RGPD.

---

## Engagement Google (extraits du DPA officiel)

Google s'engage à :

- Traiter les données **uniquement selon les instructions documentées** du responsable de traitement (vous).
- Garantir la **confidentialité** par ses employés (clauses contractuelles internes).
- Mettre en œuvre les **mesures de sécurité techniques et organisationnelles** appropriées (chiffrement transport TLS, chiffrement stockage AES-256, contrôle d'accès, journalisation).
- **Notifier** sans délai injustifié toute violation de données.
- Assister le responsable de traitement dans la réponse aux demandes des personnes concernées (art. 12-22 RGPD).
- **Supprimer ou restituer** les données à la fin du contrat.

---

## Transferts internationaux (art. 44-49 RGPD)

Google traite les données dans plusieurs centres :
- Europe (Belgique, Pays-Bas, Finlande, Irlande)
- États-Unis et autres régions

Les transferts hors UE sont encadrés par les **clauses contractuelles types** (Standard Contractual Clauses, décision UE 2021/914) **et** par le **Data Privacy Framework** UE-USA (décision UE 2023/1795 du 10 juillet 2023).

**Action utilisateur** : si vous transférez des données de locataires, vous devez les en informer dans vos baux ou un avenant — pour V1 commerciale, prévoir une clause-type dans le contrat ImmoTrack.

---

## Sous-sous-traitants Google (autorisés a priori)

Google déclare la liste de ses sous-traitants à : [https://cloud.google.com/terms/subprocessors](https://cloud.google.com/terms/subprocessors).

Google s'engage à notifier 30 jours avant toute modification (vous pouvez objecter via email à `cloud-security@google.com`).

---

## Acceptation du DPA

Le DPA Google s'applique automatiquement par défaut à tout compte utilisant les services Google Workspace ou les API Drive.

**Aucune signature additionnelle nécessaire** côté ImmoTrack utilisateur — le DPA est **incorporé par référence** à votre Google Terms of Service.

Référence : [https://cloud.google.com/terms](https://cloud.google.com/terms) + DPA add-on.

---

## Recommandations ImmoTrack

1. **2FA obligatoire** sur le compte Google qui héberge les données ImmoTrack
2. **Compte dédié** : créer un compte Google séparé `immotrack@<domaine>` plutôt que d'utiliser le compte perso
3. **Audit des permissions** : vérifier annuellement la liste des applications connectées via `myaccount.google.com/permissions`
4. **Backups locaux** : exporter mensuellement un JSON via ImmoTrack > Paramètres > Export — conserver sur disque chiffré local
5. **Documenter les transferts** : en cas de litige RGPD avec un locataire, l'historique des sync Drive est nécessaire (action='drive_sync' dans `DB.auditTrail`)

---

## Liens officiels

- DPA Google : https://cloud.google.com/terms/data-processing-addendum
- Sous-traitants Google : https://cloud.google.com/terms/subprocessors
- SCC européennes : https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/standard-contractual-clauses-scc_en
- Décision DPF UE-USA : https://commission.europa.eu/document/c2023-4745
- Portail CNIL violation : https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles

---

**Dernière mise à jour** : 2026-05-11
