# BAILLEUR-DIAGNOSTICS-DDT — Dossier Diagnostic Technique + obligations bailleur

**Status** : ✅ Livré v15.05 + v15.06 (Sprint 7 + 7B V1.1) — toutes phases 1-5 · **Prio** : P1 · **Taille** : M-L (5-8h → ~5h réalisé)
**Détecté** : 2026-05-13 (instruction utilisateur — distinction obligations locataire vs bailleur)
**Lié à** : EQUIP-CONTROLES-PERIODIQUES (jumeau côté locataire) · BAIL-CLAUSES-PERSO · IRL-DPE-FG (livré) · LEGAL-2044 (livré) · DASH-PROFILES lentille Conformité · LEGAL-DPE-INTERDICTION-LOCATION (✅ livré v15.05)

## Contexte
Demande utilisateur 2026-05-13 :
> 💬 « les autres catégories sont des obligations bailleur pas locataire. il faut les gérer mais autrement »

Les diagnostics techniques (DDT) sont à la charge **EXCLUSIVE du bailleur** AVANT mise en location (ou à la signature/renouvellement). Ils doivent être :
- Réalisés par des **diagnostiqueurs certifiés**
- Joints au bail à la signature (sinon nullité)
- Renouvelés selon leur durée de validité légale
- Surveillés activement (alertes dashboard bailleur)

→ Gestion **complètement différente** de l'entretien locataire : pas de fréquence d'entretien régulière, mais une **date de validité** par diagnostic + **bloquage du bail** si expiré.

## Cadre légal — Dossier Diagnostic Technique (loi 89-462 art. 3-3)

Liste exhaustive des diagnostics à charge bailleur :

| Diagnostic | Validité | Cible | Texte légal | Joint au bail ? |
|---|---|---|---|---|
| **DPE** (perf énergétique) | **10 ans** | Tous logements | Loi 2010-788 + décret 2020-1610 | **OUI obligatoire** |
| **CREP** (plomb) | **1 an** si présence / illimité si absence | Logement construit avant 1949 | Art. L1334-5 à L1334-9 Code santé | **OUI si avant 1949** |
| **État amiante (DAPP)** | Illimité si absence | Permis avant 1er juillet 1997 | Art. R1334-15 à R1334-29 | **OUI si permis < 1997** |
| **État installation gaz** | **6 ans** | Installation > 15 ans | Art. L134-6 | **OUI si install > 15 ans** |
| **État installation élec** | **6 ans** | Installation > 15 ans | Art. L134-7 | **OUI si install > 15 ans** |
| **État risques (ERP)** | **6 mois** | Zone à risques (PPRN/PPRT/sismicité/etc.) | Art. L125-5 Code env. | **OUI si zone concernée** |
| **Termites / parasitaire** | **6 mois** | Zone à arrêté préfectoral | Art. L133-6 Code construction | **OUI si zone arrêté** |
| **Mérule** | À déclarer si zone | Zone à arrêté préfectoral | Art. L133-7 | OUI si applicable |
| **Bruit aérien** | Illimité si non concerné | Zone aéroport (PEB) | Art. L112-11 Code urb. | OUI si zone PEB |

## Équipements collectifs (immeuble — obligations bailleur)

| Équipement | Obligation | Fréquence |
|---|---|---|
| **VMC collective** | Vérification | 3 ans (arrêté 31 oct 2005) |
| **Ascenseur** | Maintenance + contrôle technique | Mensuel/bimestriel + 5 ans (décret 2004-964) |
| **Chaufferie collective** | Entretien | Annuel + ramonage |
| **Toiture/façade/gros œuvre** | Contrôle décennal | Variable |
| **Citerne fioul collective** | Contrôle | 5 ans |
| **Sécurité incendie collective** (RIA, désenfumage) | Contrôle | Selon installation |

→ À gérer au niveau **Immeuble** (cf IMM-FICHE-360), pas Logement.

## DAAF — Cas particulier installation (instruction user)
- **Installation** (à charge BAILLEUR avant location, loi 2010-238 art. R129-12)
- **Entretien pile** (à charge LOCATAIRE pendant location, art. R129-13) → géré dans EQUIP-CONTROLES-PERIODIQUES + EDL
- Donc côté bailleur : juste s'assurer de l'installation initiale (1 fois) + alerte si pas installé sur un logement existant

## Scope

### Phase 1 — Section "Diagnostics & DDT" sur fiche logement (~2h)
Nouvelle section dans `LOG-FICHE-360` sous-onglet "Diagnostics" (à créer) avec carte par diagnostic :

**Pour chaque diagnostic** :
- État : ✅ Valide / ⚠️ Expire bientôt (< 6 mois ou < 12 mois pour DPE) / 🔴 Expiré / ⬜ Non applicable / ❓ Non renseigné
- Date du diagnostic
- Date d'expiration (auto calculée)
- Diagnostiqueur (texte)
- Résultat (libre selon diagnostic) : ex DPE classe A-G + valeur kWh/m²
- PJ : fichier PDF du diagnostic (cf DRIVE-ARBORESCENCE sous-dossier `Documents/`)
- Bouton "Marquer N/A" si logement non concerné (ex CREP si construction > 1949)

Auto-détection N/A :
- CREP : si `logement.anneeConstruction > 1949` → masquer ou auto-N/A
- Amiante : si `logement.permisConstruire > 1997-07-01` → idem
- Gaz/élec : si `logement.installationAnnee < (today - 15 ans)` → applicable
- ERP : si commune dans liste PPR (data INSEE/Géorisques) → applicable
- Termites : si commune dans liste arrêtés préfectoraux → applicable

### Phase 2 — Génération automatique du DDT (~1-2h)
Bouton "📎 Générer Dossier Diagnostic Technique (DDT)" dans la fiche logement :
- Compile en 1 PDF unique : tous les diagnostics applicables au logement (page de garde + concaténation des PDF source)
- Joint automatiquement au bail à la signature (cf wizard bail)
- Cohérence avec DRIVE-ARBORESCENCE (sauvegarde dans sous-dossier `Documents/DDT/`)

### Phase 3 — Bloquage du bail si DDT incomplet (~1h)
Dans wizard bail :
- Avant validation finale du bail, vérifier que tous les diagnostics applicables sont valides
- Si diagnostic manquant ou expiré :
  - Modale rouge "⚠️ Diagnostic X manquant/expiré — risque nullité du bail"
  - Boutons "Continuer quand même (à mes risques)" + "Aller mettre à jour"
  - Logger dans audit-trail (`DB.auditTrail` cf AUDIT-TRAIL livré v14.89)

### Phase 4 — Alertes dashboard lentille Conformité (~1h)
Lentille Patrimoine & conformité (DASH-PROFILES, V2 mais à anticiper) → liste :
- DPE expirent dans 12 mois (rénovation à anticiper pour ne pas tomber sous gel IRL si F/G)
- ERP expire dans 30j sur baux à signer
- CREP expire dans 1 mois si présence plomb
- Gaz/élec à renouveler si > 6 ans depuis dernier diag
- DDT manquant pour bail en cours

### Phase 5 — Tests Vitest (~30min)
- `_estDiagApplicable(diag, logement)` : pour CREP si avant 1949, amiante si avant 1997, etc.
- `_estDiagExpire(diag, dateRef)` pour les 9 diagnostics
- `_ddtComplet(logement, dateRef)` : tous applicables ont diag valide
- Tests cas : logement nouveau (rien), ancien (tout applicable), partiel

### Phase 6 — Lien avec sujets existants (~30min)
- IRL-DPE-FG (livré v13.31) : utiliser le statut DPE F/G ici → bloquer révision IRL
- LEGAL-2044 (livré v14.90) : intégrer dépenses diagnostics dans charges déductibles ?
- DRIVE-ARBORESCENCE : sous-dossier `Documents/DDT/` pour stocker PDFs diagnostics
- BAIL-CHARGES-DETAIL (nouveau) : préciser que diagnostics PAS récupérables (charge bailleur exclusive)

## Décisions arbitrées 2026-05-13
- [x] **Sous-onglet "Diagnostics" dans LOG-FICHE-360** (séparation claire UX bailleur vs locataire)
- [x] **Bloquage bail si DDT incomplet** : override "à mes risques" possible avec log audit-trail (user validé)
- [ ] **Data PPR / Termites / PEB** : statique V1, API Géorisques V1.1 (à confirmer selon volumétrie)

## Différenciant marché
| Solution | Gestion DDT bailleur |
|---|---|
| Rentila | Liste basique sans alertes |
| BailFacile | Alertes DPE seul |
| Qalimo | Section dédiée sans génération DDT |
| ICS / Crypto (pro) | Module complet (cible pro) |
| **ImmoTrack après BAILLEUR-DIAGNOSTICS-DDT** | **DDT généré auto + bloquage bail + alertes + auto-N/A par contexte logement** = parité pro |

## Notes utilisateur
> 💬 2026-05-13 : "les autres catégories sont des obligations bailleur pas locataire. il faut les gérer mais autrement : proposition"

## Journal
- 2026-05-13 : créé · extraction des obligations bailleur depuis EQUIP-CONTROLES-PERIODIQUES (qui se concentre sur locataire) · 9 diagnostics couverts + DDT généré auto + bloquage bail conditionnel
- 2026-05-13 : 🔄 Phases 1+5 livrées v15.05 (Sprint 7 V1.1, ~2.5h) :
  - **Phase 1 (sous-onglet Diagnostics fiche logement)** : nouvel onglet `🏷 Diagnostics` dans `LOG-FICHE-360` à côté de Conformité. Module `js/core/diagnostics.js` (8 KB) + helpers inline shadow : catalogue 9 diagnostics (`DIAGS_CATALOG`), helpers purs `_diagCatalogEntry`, `_diagGet` (avec rétrocompat champs flat `log.dpe`/`log.dpeDate`), `_estDiagApplicable` (auto-détection par contexte : CREP <1949, amiante <1997, gaz/élec >15 ans installation, ERP zone risques, etc.), `_diagDateExpiration` (string-based pour éviter bug timezone), `_estDiagExpire`, `_diagStatut` (6 statuts : valide/expirebientot/expire/na/inapplicable/manquant), `_ddtComplet`. UI : badge DDT complet/incomplet + 9 cartes statut + section "Contexte logement" (4 champs : année construction / installation gaz / installation élec / 4 cases zones réglementaires) + modale d'édition par diagnostic avec champs spécifiques (DPE → classe + kWh, CREP/amiante/termites/mérule → présence oui/non, gaz/élec → conforme oui/non). Sauvegarde dans `log.diagnostics[diagKey]` + sync rétrocompat `log.dpe`/`log.dpeDate` côté DPE + audit-trail.
  - **Phase 5 (tests Vitest)** : `__tests__/helpers/diagnostics.test.js` 37 tests (catalogue ×2, lookup ×2, rétrocompat ×4, applicabilité ×10, date expiration ×8, expire ×3, statut ×6, DDT complet ×4). Total Sprint 7 : 57 nouveaux tests (20 LEGAL-DPE-INTERDICTION + 37 diagnostics).
- 2026-05-13 : ✅ Phases 2-3-4 livrées v15.06 (Sprint 7B, ~2.5h) :
  - **Phase 2 (récap DDT imprimable + PDF)** : bouton `📎 Récap DDT` dans le sous-onglet Diagnostics → ouvre modale `#ov-ddt-recap` avec page de garde (bailleur + logement) + tableau des 9 diagnostics avec statuts/dates/validités/diagnostiqueurs + cadre légal + 3 boutons (Fermer / 🖨 Imprimer via window.print sur popup dédié / 📄 Télécharger PDF via jsPDF + html2canvas multi-pages A4). Pas de concaténation des PDF source (limite explicite : sera traité en V2 avec pdf-lib si demandé).
  - **Phase 3 (bloquage bail si DDT incomplet, override "à mes risques")** : intercepte `saveBail()` ligne ~10240 après le check DPE interdit strict. Si `_ddtComplet()` renvoie incomplet → modale orange `#ov-ddt-incomplet` (≠ rouge DPE interdit) avec liste des diagnostics manquants/expirés + 3 boutons : "Annuler" / "⚠ Continuer quand même" (audit-trail `_auditLog('override','bail',ref,'DDT_INCOMPLET_FORCE')` + flag `_skipDdtCheckOnce` pour passer une fois) / "✦ Mettre à jour les diagnostics" (redirige fiche logement onglet Diagnostics). Override conscient = tracé RGPD-compliant.
  - **Phase 4 (alertes dashboard Conformité)** : intégration dans `rAlertsSection()` du dashboard. 2 nouveaux types d'alertes : "🏷 DDT incomplet" (warn) pour chaque logement loué avec `_ddtComplet().complet=false` + "🌡 DPE expire bientôt" (info, anticipation rénovation 12 mois avant pour éviter gel IRL F/G). Liens cliquables qui ouvrent `openLogFiche(ref) + setLogFicheTab('diagnostics')` en 200ms. Compteur intégré au pill dashboard existant.
