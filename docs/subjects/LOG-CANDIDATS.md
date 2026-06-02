# LOG-CANDIDATS — Pipeline candidats locataires avec lien partagé + conversion bail

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : L
**Détecté** : 2026-05-13 (validé important par utilisateur — capture Qalimo V2)
**Design refondu** : 2026-06-02 → **`docs/superpowers/specs/2026-06-02-candidature-locataire-design.md`** (lien partagé désormais V1 via le relais Cloudflare ; abandon du report « V2 SaaS » + fallback PDF de mai)
**Lié à** : LOG-FICHE-360 · LOG-ANNONCE · BAIL (wizard + `copyBailFrom`) · **BAIL-SIGNATURE-DISTANCE** (relais Cloudflare mutualisé = fondation) · EMAIL-AUTO · PORTAIL-LOCATAIRE (projet suivant, même serveur) · IA-V2 (OCR justifs)

## Contexte
Demande utilisateur 2026-05-13 (avec capture Qalimo V2 onglet Candidats) :
> 💬 « candidats on n'a pas et on m'a dit que c'est une bonne chose. Tu transmets un lien aux personnes intéressées par le logement et quand tu fais le bail tu bascules direct en locataire »

Workflow validé par feedback marché :
1. **Bailleur publie l'annonce** (cf LOG-ANNONCE) ou est contacté directement
2. **Bailleur génère un lien candidat** pour le logement vacant
3. **Bailleur envoie le lien** au prospect intéressé (email, SMS, Whatsapp)
4. **Prospect remplit son dossier en ligne** (revenus, garant, RIB, pièces) — pas besoin de compte
5. **Bailleur reçoit notification + dossier visible** dans onglet Candidats avec scoring "Confiance"
6. **Bailleur arbitre** : accepter / refuser / demander complément
7. **Si accepté** : bouton "Créer le bail à partir de ce candidat" → wizard bail pré-rempli avec toutes les infos saisies par le candidat
8. **Bascule auto** : candidat archivé, bail créé, le candidat devient locataire dans l'onglet Locataires

→ **Pas de double saisie**. C'est ça la valeur.

## Référence Qalimo V2 (capture)
Tableau Candidats avec colonnes :
- Nom locataire (futur)
- Bien affecté
- Date de début (souhaitée)
- Statut (Candidature reçue / Dossier en cours / Validé / Refusé)
- Revenus mensuels déclarés
- Caution déclarée (oui/non + type)
- **Confiance** (scoring auto avec tooltip explicatif)

Tabs : Actifs / Archivés
Bouton primaire "+ Ajouter un candidat"
Bouton secondaire "Inviter un candidat" (génère lien partagé)

## ⚠️ Note 2026-06-02 — design refondu
Le scope ci-dessous (rédigé en mai) reportait le lien partagé en V2 SaaS faute de backend. **Ce n'est plus le cas** : le relais Cloudflare de BAIL-SIGNATURE-DISTANCE (en cours de build, branche `relay-bail-sign`) fournit la couche publique pour utilisateurs sans compte. La candidature **réutilise** ce relais (modèle dossier + routes + page `dossier.html`), elle ne reconstruit rien. **Le lien partagé est donc V1.** Voir le design consolidé : `docs/superpowers/specs/2026-06-02-candidature-locataire-design.md`. Le scope d'origine ci-dessous est conservé pour mémoire mais la spec fait foi.

## Scope (schéma original mai — voir spec 2026-06-02 pour la version à jour)

### Phase 1 — Modèle de données + onglet Candidats (~1.5h)
- Nouvelle entité `DB.candidats[]` : `{id, ref, logRef, dateCreation, sourceInvitation: 'manuel'|'lien'|'annonce', nom, prenom, civilite, dateNaissance, tel, email, revenus, employeur, contrat: 'CDI'|'CDD'|'Freelance'|'Etudiant'|'Retraite', garant: {nom, type, lien}, ribUploaded: bool, statut: 'recu'|'enCours'|'valide'|'refuse', notes, confianceScore: 0-100, _stamp, _modifiedAt, _archived}`
- Nouvel onglet sidebar "Candidats" (entre Locataires et Mouvements ou à confirmer)
- Page `#p-candidats` avec tableau (cf maquette Qalimo) + tabs Actifs/Archivés
- Card "Inviter un candidat" en haut → modale génération lien

### Phase 2 — Lien partagé (offline-compatible) (~2h)
**Architecture** : URL avec hash encrypté contenant le logRef + token éphémère
- Format URL : `https://immotrack.app/candidat#log=F-001&token={uuid}` (V2 SaaS)
- Format V1 offline : génération QR code + URL `file://...#candidat?log=F-001&token=X` (limité au device bailleur, peu pratique en réalité)
- **V1 simplifié** : pas de lien envoyé, le bailleur crée le candidat manuellement OU envoie un PDF "Dossier candidat à remplir" (template + retour par email)
- **V2 SaaS** : vrai lien partagé avec backend léger
- Page candidat (V2 SaaS) : formulaire en 4 étapes (identité / revenus / garant / pièces) → envoi au bailleur

→ **Décision V1** : se concentrer sur Phase 1 (UI gestion candidats) + Phase 3 (conversion bail), reporter V2 SaaS pour le lien partagé technique.

### Phase 3 — Conversion candidat → bail (~2h)
- Bouton "Créer le bail à partir de ce candidat" sur fiche candidat validé
- Action : ouvre wizard bail (existant) avec **pré-remplissage automatique** depuis les données candidat :
  - Locataire : nom, prénom, civilité, date naissance, tel, email, adresse précédente
  - Garant si fourni : nom, type
  - logRef pré-sélectionné
- Une fois bail créé et sauvegardé :
  - Candidat → archive automatique avec status "Converti en locataire"
  - Logement → statut "Loué" automatique
  - Lien candidat ↔ bail conservé dans audit-trail

### Phase 4 — Scoring "Confiance" (~1h)
Calcul automatique d'un score 0-100 basé sur :
- Revenus / loyer demandé : ratio ≥ 3 = +30 pts, 2.5-3 = +20 pts, 2-2.5 = +10 pts, < 2 = 0
- Contrat CDI : +25 pts, CDD : +10 pts, Freelance/Étudiant : +0 pts
- Garant présent : +20 pts
- RIB fourni : +10 pts
- Pièces complètes : +15 pts

Tooltip explicite (transparence) : « Score basé sur revenus, contrat, garant et complétude du dossier. À utiliser comme aide à la décision, pas comme verdict. »

### Phase 5 — Tests Vitest + UI mobile (~1h)
- `__tests__/helpers/candidats.test.js` :
  - `_calculConfiance(candidat)` cas nominaux + edge
  - `_candidatVersBail(candidat)` mapping correct
  - `_archiveCandidatAuto(candidatId, bailRef)`
- UI mobile responsive (cf MOBILE-AUDIT-ONGLETS)

## Différenciant marché
| Solution | Pipeline candidats | Lien partagé | Conversion auto bail |
|---|---|---|---|
| Rentila | ❌ | ❌ | ❌ |
| BailFacile | partiel (dossiers) | ❌ | partial |
| Qalimo V2 | ✅ tableau dédié | ✅ inviter | ✅ |
| Smovin | ✅ | ✅ | ✅ |
| **ImmoTrack après LOG-CANDIDATS V1** | ✅ tableau + scoring | ❌ V1 / ✅ V2 SaaS | ✅ |

## Décisions à prendre
- [ ] **Sidebar position** : onglet Candidats entre Locataires et Mouvements ? Ou avec Locataires (sous-onglet Actifs/Candidats/Archivés) ?
  - Recommandation : **onglet séparé** (parité Qalimo + LOG-FICHE-360 sous-onglet Candidats sur la fiche bien)
- [ ] **Lien partagé V1** : strictement V2 SaaS ? OU export PDF "Dossier candidat" en V1 ?
  - Recommandation : **export PDF V1**, vrai lien V2
- [ ] **Scoring Confiance** : formule visible utilisateur OU boîte noire ?
  - Recommandation : **transparente** (tooltip explique critères)
- [ ] **Refus candidat** : email automatique de courtoisie (cf EMAIL-AUTO) ?
  - Recommandation : oui, template prêt dans EMAIL-AUTO type `candidat-refus`

## Notes utilisateur
> 💬 2026-05-13 : « candidats on n'a pas et on m'a dit que c'est une bonne chose. Tu transmets un lien aux personnes intéressées par le logement et quans tu fais le fail [bail] tu bascules direct en locataire »

## Journal
- 2026-05-13 : créé · sujet promu de sous-sujet LOG-FICHE-360 vers sujet propre P1 suite validation user et capture Qalimo V2
- 2026-06-02 : **design refondu** (session brainstorming). Décision structurante : le lien partagé devient **V1** en mutualisant le relais Cloudflare de BAIL-SIGNATURE-DISTANCE (plus de report V2 SaaS, plus de fallback PDF). Identité candidat alignée 1:1 sur `bail.locataires[]` (zéro double saisie). Spec consolidée : `docs/superpowers/specs/2026-06-02-candidature-locataire-design.md`. En attente validation user du spec avant plan d'implémentation.
