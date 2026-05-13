# BAILLEUR-FORM-RICHE — Enrichir le formulaire profil bailleur (parité Qalimo V2)

**Status** : ⬜ À faire · **Prio** : P2 · **Taille** : M (3-5h)
**Détecté** : 2026-05-13 (captures Qalimo V2)
**Lié à** : ENT-FICHE-360 · LEGAL-2044 · EXPORT-COMPTABLE (livré) · ASSO-PARTAGE

## Contexte
Demande utilisateur 2026-05-13 (captures formulaire Modifier profil bailleur Qalimo V2). Le formulaire ImmoTrack actuel pour les entités/bailleurs est probablement plus pauvre.

## Référence Qalimo V2

### Champs riches observés
**Section "Informations entreprise" (si société)** :
- Nom du profil
- Toggle "Il s'agit d'une société (SCI IR/IS, SAS, ...)"
- Régime fiscal (dropdown : Société soumise IS, SCI IR, etc.)
- **SIRET / Nom entreprise** (auto-complete API INSEE/Sirene avec nom entreprise + n° SIRET)
- Lien "L'entreprise n'apparaît pas ? Entrer manuellement"
- N° TVA intracommunautaire
- Début d'activité comptable (date)
- ⚠️ Bannière info : « Il faut indiquer ci-dessous les informations concernant l'entreprise (gérant, etc.), et non pas ajouter les associés »

**Section "Informations personnelles"** :
- Toggle Personne physique / Personne morale
- Prénom + Nom du représentant légal
- Adresse email (obligatoire, validation pro)
- Téléphone
- Type de société (dropdown : SCI, SARL, SAS, EURL, etc.)
- Dénomination sociale
- Adresse (auto-complete API adresse + complément + pays)
- **+ Ajouter un copropriétaire** (≠ associé, c'est pour indivision officielle)
- Toggle "SCI Familiale"
- Adresses email en copie (gestionnaires, expert-comptable, etc.)
- Numéro ICS (Identifiant Créancier SEPA, pour prélèvements)
- Sélection banque (dropdown préselectionne BIC) + IBAN
- BIC (auto-rempli si banque connue)
- Notes libres ("Identifiant CAF, VISAL, etc.")

## Scope

### Phase 1 — Refonte form profil bailleur (~2h)
Restructurer en 3 sections :

**A. Identification** :
- Nom du profil (champ libre, ex "SCI Famille Dupont")
- Type : Particulier / SCI / SARL / SAS / EURL / SCPI / Autre
- Si société : régime fiscal (IR / IS / Mixte), SIRET (auto-complete API Sirene), TVA intracom, début comptable
- Bannière info légale pour distinction associés vs gérant

**B. Informations personnelles / représentant légal** :
- Personne physique / morale toggle
- Prénom, Nom (obligatoires)
- Email, Téléphone
- Adresse complète (auto-complete API base adresse nationale)
- Pays (défaut France)

**C. Spécificités juridiques** :
- Bouton "+ Ajouter un copropriétaire" → ouvre sous-form (cf ASSO-PARTAGE pour gestion fine indivision)
- Toggle SCI Familiale (impacts fiscaux spécifiques cf LEGAL-2044)
- Adresses email en copie (gestionnaires, comptable) — utilisable par EMAIL-AUTO pour CC automatique

**D. Coordonnées bancaires** :
- Numéro ICS (utile pour SaaS prélèvements V2)
- Sélection banque (liste 40 banques FR principales avec BIC pré-mappé)
- IBAN (validation format + checksum mod 97)
- BIC (auto si banque sélectionnée, sinon manuel)

**E. Notes** : champ libre pour identifiants externes (CAF, VISALE, etc.)

### Phase 2 — Auto-complete API SIRET (~1h)
- API publique INSEE Sirene v3 (gratuite, 30 req/min)
- Tapez "SCI Dupont" → suggestions avec SIRET + adresse pré-remplie
- Si l'utilisateur n'a pas internet ou rate limit → fallback "Entrer manuellement"
- Stockage : SIRET + raison sociale + adresse siège

### Phase 3 — Validation IBAN + BIC auto (~30min)
- Helper `_validateIBAN(iban)` (algorithme mod 97 + format pays)
- Tests Vitest dans `__tests__/helpers/iban.test.js` (10+ cas FR/BE/DE/ES + invalides)
- Mapping banque → BIC pour les 40 banques FR principales (CIC, BNP, SG, CA, LCL, BPCE, La Banque Postale, Boursorama, Fortuneo, N26, Revolut, etc.)

### Phase 4 — Liens vers autres sujets (~30min)
- Lien `+ Ajouter copropriétaire` → ouvre sous-form (renvoi ASSO-PARTAGE pour gestion fine quote-parts)
- Adresses email en copie → consommatrices par EMAIL-AUTO CC automatique
- ICS → préparation SaaS V2 prélèvements

## Décisions à prendre
- [ ] **API SIRET** : INSEE Sirene v3 (gratuit) OU dépendre 100% saisie manuelle ?
  - Recommandation : INSEE Sirene avec fallback manuel (gratuit, robuste)
- [ ] **Validation IBAN** : tolérante (warning) ou bloquante ?
  - Recommandation : bloquante (mod 97 standard, erreurs trop coûteuses sur virements)
- [ ] **Liste banques préselectionnées** : top 40 FR ? Toutes EU ? Custom ?
  - Recommandation : top 40 FR V1, étendre EU V2 si besoin

## Différenciant marché
| Solution | Form bailleur richesse |
|---|---|
| Rentila | basique |
| BailFacile | moyen |
| Qalimo V2 | ⭐ très riche (API SIRET + IBAN + copropriétaires) |
| **ImmoTrack actuel** | basique |
| **ImmoTrack après BAILLEUR-FORM-RICHE** | parité Qalimo + lien ASSO-PARTAGE |

## Notes utilisateur
> 💬 2026-05-13 : captures partagées formulaire Modifier profil bailleur Qalimo V2 (SCI DD2AMELEVIERES exemple complet)

## Journal
- 2026-05-13 : créé · 4 sections (Identification / Personnelles / Juridique / Bancaire) + API SIRET + validation IBAN
