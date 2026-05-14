# SAAS-V2-AUDIT-LEGAL — ImmoTrack V2

**Date** : 2026-05-14
**Auditeur** : DPO/Juriste SaaS-immobilier FR
**Périmètre** : Viabilité légale et RGPD d'ImmoTrack V2 (SaaS multi-tenant gestion locative FR)
**Cibles auditées** : Bailleurs particuliers + Gestionnaires Hoguet (10-50+ lots)
**Stack auditée** : Vercel EU + Neon PostgreSQL EU + Clerk Auth + Resend EU + Yousign + Bridge/Powens

---

## TL;DR — Verdict en 30 secondes

| Item | Statut | Bloquant lancement ? |
|---|---|---|
| RGPD base légale + registre art.30 | À FAIRE | OUI |
| DPIA CNIL (données financières + bancaires) | OBLIGATOIRE | OUI |
| DPA sous-traitants signés (Clerk, Vercel, Neon, Yousign, Bridge) | À FAIRE | OUI |
| Clerk = transferts USA → SCC 2021 + analyse Schrems II | À FAIRE | OUI |
| Carte Hoguet propre à ImmoTrack | NON requis si pure édition SaaS | NON |
| Agrément ACPR / statut PSP | NON si agrégation pure via Bridge | NON |
| Signature Yousign avancée | Suffisant pour bail FR | NON |
| Assurance RC Pro cyber | OBLIGATOIRE de fait | OUI |
| Budget juridique initial | **15-25 k€** | — |
| Délai mise en conformité | **3-5 mois** avant ouverture commerciale | — |

**Conclusion exécutive** : projet viable, mais 7 obligations dures à lever avant le premier client payant. Le point le plus sensible est le **DPIA obligatoire** (volet bancaire DSP2 + données financières locataires) et l'**analyse Schrems II sur Clerk** (auth US malgré data EU).

---

## 1. RGPD — Obligations dures

### 1.1 Bases légales de traitement (art. 6 RGPD)

ImmoTrack traite plusieurs catégories de PII avec des bases légales distinctes. Il faut documenter chacune dans le registre.

| Traitement | Base légale art. 6 | Justification |
|---|---|---|
| Compte client bailleur (nom, email, mot de passe) | **Contrat** (6.1.b) | Exécution du contrat SaaS |
| PII locataire dans la fiche bail | **Intérêt légitime** (6.1.f) du bailleur + **obligation légale** loi 6 juillet 1989 | Le bailleur est responsable de traitement, ImmoTrack sous-traitant |
| IBAN bailleur (pour reversement futur) | **Contrat** (6.1.b) | Si activé |
| IBAN locataire (prélèvement) | **Contrat** entre bailleur/locataire — ImmoTrack n'est que support technique | Sous-traitance |
| Justificatifs locataire (bulletins de salaire, avis d'imposition) | **Intérêt légitime** bailleur + **obligation légale** décret n°2015-1437 (liste limitative) | Attention : ne JAMAIS stocker plus que la liste limitative |
| Données bancaires DSP2 (Bridge/Powens) | **Consentement explicite** (6.1.a) | Obligatoire DSP2 + renouvelable tous les 180 jours |
| Cookies analytics | **Consentement** (6.1.a) | Bandeau CNIL conforme |
| Audit-trail / journaux sécurité | **Obligation légale** (6.1.c) — art. 32 RGPD | Sécurité du traitement |

**Point critique** : pour les **PII locataires**, ImmoTrack est **sous-traitant** au sens de l'art. 28 RGPD, le bailleur étant responsable de traitement. Cela doit être **explicite dans les CGU** et dans les contrats avec les gestionnaires Hoguet (qui sont eux-mêmes responsables de traitement vis-à-vis de leurs propres bailleurs mandants — sous-traitance en cascade, art. 28.4).

**Décret n°2015-1437** liste limitativement les pièces qu'un bailleur peut exiger d'un candidat locataire (CNI, justificatif domicile, 3 derniers bulletins, contrat de travail, avis d'imposition N-1, etc.). ImmoTrack doit **techniquement bloquer** l'upload de pièces hors liste (RIB locataire = OK ; n° sécu, photo, casier judiciaire = NON, sanction CNIL 5000 € par cas — délibération CNIL n°2017-281).

Source : [Légifrance — Décret 2015-1437](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000031466138/) | [CNIL — recommandation location](https://www.cnil.fr/fr/agences-immobilieres-bailleurs-gerez-correctement-les-donnees-de-vos-locataires)

### 1.2 Registre des traitements (art. 30 RGPD)

**Obligatoire** dès qu'on traite des PII en B2B. Document interne mais opposable à la CNIL en cas de contrôle. Doit lister :
- Finalité de chaque traitement
- Catégories de personnes (bailleurs, locataires, garants, gestionnaires)
- Catégories de données (identifiants, financières, justificatifs, biométrie signature)
- Destinataires (sous-traitants, banques via DSP2, huissiers en cas d'impayé)
- Transferts hors UE (Clerk USA → ⚠️)
- Durées de conservation (cf. § 1.6)
- Mesures de sécurité (chiffrement, RLS, MFA, journaux)

**Livrable attendu** : un fichier `registre-traitements.xlsx` versionné + accessible au DPO. Template CNIL téléchargeable.

Source : [CNIL — modèle de registre](https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement)

### 1.3 DPA sous-traitants — risque Schrems II

| Sous-traitant | Localisation données | Localisation siège | DPA standard ? | Transferts hors UE | Action requise |
|---|---|---|---|---|---|
| **Vercel** | EU (Frankfurt fra1 / Paris cdg1) si configuré | USA (Delaware) | Oui (`vercel.com/legal/dpa`) | Risque : journaux + métadonnées CDN traités USA | Forcer région EU dans config + SCC 2021 module 3 |
| **Neon PostgreSQL** | EU (Frankfurt aws-eu-central-1) | USA (Delaware) | Oui | Métadonnées d'admin US | SCC 2021 module 3 + audit annuel |
| **Clerk Auth** | **USA principalement, EU récent (2024)** | USA | Oui | **Forte** : par défaut Clerk stocke aux USA. Région EU disponible mais payante (tier Enterprise) | **CRITIQUE** : exiger région EU OU prévoir migration vers concurrent EU (WorkOS EU, Stytch EU, ou Supabase Auth + Keycloak self-host) |
| **Resend** | EU | USA | Oui | Modéré | SCC + DPF (Data Privacy Framework) |
| **Yousign** | **France (Brittany datacenter)** | France | Oui (eIDAS-compliant) | **Aucun** | RAS — argument commercial |
| **Bridge (Bankin')** | France | France | Oui (agréé ACPR FR-BICI) | Aucun | RAS |
| **Powens** | France | France | Oui | Aucun | RAS |

**Point critique Schrems II (CJUE C-311/18, 16 juillet 2020)** : depuis l'invalidation du Privacy Shield, tout transfert vers les USA nécessite :
1. **Clauses Contractuelles Types (SCC) 2021** version Commission, ET
2. **Transfer Impact Assessment (TIA)** documentant les risques d'accès par les autorités américaines (FISA 702, EO 12333),
3. **Mesures supplémentaires** (chiffrement avec clés contrôlées en UE, pseudonymisation).

Depuis le **Data Privacy Framework (DPF)** entré en vigueur le 10 juillet 2023 (décision d'adéquation UE-USA), les sous-traitants **certifiés DPF** offrent une présomption de conformité. **Clerk n'apparaît pas dans la liste DPF active** au moment de cet audit — à **vérifier** sur [dataprivacyframework.gov](https://www.dataprivacyframework.gov/list).

**Recommandation forte** : si Clerk ne migre pas vers DPF actif + région EU avant ouverture commerciale, remplacer par **Supabase Auth (EU)** ou **WorkOS EU**. Argument B2B Hoguet : « Toutes vos données hébergées exclusivement en France/UE ».

Source : [CNIL — transferts hors UE](https://www.cnil.fr/fr/les-transferts-de-donnees-hors-ue) | [Décision DPF UE 2023/1795](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32023D1795)

### 1.4 Droits des personnes — cas tordu locataire

Le **locataire** n'a pas de compte ImmoTrack mais ses PII y sont. Il a quand même tous les droits art. 15-22 RGPD.

| Droit | Mise en œuvre ImmoTrack |
|---|---|
| **Accès** (art. 15) | Le locataire écrit à `dpo@immotrack.fr` → on identifie via le bailleur → export PDF/JSON de toutes ses données. Délai 1 mois max |
| **Rectification** (art. 16) | Le locataire peut demander correction (ex : nom mal orthographié). On modifie + journalise |
| **Effacement** (art. 17) | **Conflit** avec conservation comptable obligatoire 10 ans. Solution : **archivage intermédiaire** (verrouillé, accès restreint DPO + comptable) pendant 10 ans, puis purge automatique |
| **Portabilité** (art. 20) | Export JSON/CSV des données fournies par le locataire (bulletins, justificatifs). À automatiser via endpoint `/api/gdpr/portability` |
| **Opposition** (art. 21) | Quasi inapplicable : base légale = contrat de bail entre bailleur/locataire, pas marketing |
| **Limitation** (art. 18) | Flag `frozen=true` sur la fiche → lecture seule pendant litige |

**Process opérationnel obligatoire** : page publique `immotrack.fr/vie-privee/exercer-mes-droits` + formulaire + délai 1 mois (extensible 2 mois sur traitement complexe, art. 12.3 RGPD). Sanction non-réponse : amende CNIL (cf. SNCF Connect 105 k€ 2024).

### 1.5 DPIA — analyse d'impact obligatoire ?

**Réponse : OUI, obligatoire** au regard des critères CNIL (Liste 2018-327).

ImmoTrack coche au moins 4 critères sur 9, donc DPIA obligatoire (seuil = 2/9) :

1. **Données financières** (loyers, IBAN, RIB, données bancaires DSP2) ✅
2. **Données sensibles / hautement personnelles** (situation conjugale, revenus, justificatifs fiscaux) ✅
3. **Croisement de données** (bailleur × locataire × bancaire × signature) ✅
4. **Personnes vulnérables potentielles** (locataires étudiants, dossiers contentieux) ✅
5. **Innovation technologique** (DSP2 + signature électronique avancée) ✅

**Conséquence** : DPIA rédigée **avant** mise en production. Si risque résiduel élevé après mesures, **consultation préalable CNIL obligatoire** (art. 36 RGPD, délai 8-14 semaines).

**Coût externalisé** : 3-7 k€ pour un DPO externe sur 4-6 semaines. **NE PAS sauter cette étape**.

Source : [CNIL — liste types de traitements soumis à DPIA](https://www.cnil.fr/sites/cnil/files/atoms/files/liste-traitements-aipd-requise.pdf) | [Délibération CNIL 2018-327](https://www.legifrance.gouv.fr/cnil/id/CNILTEXT000037597248)

### 1.6 Durées de conservation

| Donnée | Durée légale | Base |
|---|---|---|
| **Bail signé + annexes** | **5 ans après fin du bail** | Art. 7-1 loi 6 juillet 1989 (action en restitution dépôt de garantie) — prescription quinquennale art. 2224 C.civ. |
| **Quittances de loyer** | **3 ans** côté locataire (prescription dette locative) / **5 ans** pour preuve paiement | Art. 7-1 loi 1989 / art. L.218-2 C.conso |
| **Factures + comptabilité Hoguet** | **10 ans** | Art. L.123-22 C.commerce + art. 65 loi Hoguet 1970 |
| **DPE, ERP, diagnostics** | **Durée de validité du diagnostic** (10 ans DPE / 6 mois ERP / 1 an gaz si négatif) + archivage 1 an post-validité | Décret 2006-1147 |
| **IBAN bailleur (non utilisé)** | Suppression à la résiliation du compte | RGPD minimisation |
| **Données bancaires DSP2 (transactions importées)** | **13 mois max** | Recommandation CNIL 2020 + délai légal banque |
| **Audit-trail / logs sécurité** | **1 an** (recommandation CNIL) — exceptionnellement 6 mois si volumétrie | Recommandation CNIL 2021 (logs) |
| **Données candidats locataires non retenus** | **Effacement immédiat** après décision, sauf consentement explicite candidat (3 mois max) | CNIL recommandation 2017 |
| **Signature électronique + preuves Yousign** | **10 ans** (cohérent loi Hamon + Yousign coffre-fort) | Art. 1366-1369 C.civ. + eIDAS |

**Point pratique** : implémenter un **scheduler Neon** qui purge automatiquement (`pg_cron`) selon table de rétention. Sinon, accumulation = risque sanction CNIL « principe de limitation » (art. 5.1.e). Exemple sanction : Brico Privé 500 k€ (2022) pour conservation excessive.

### 1.7 Chiffrement at-rest + in-transit

| Couche | Recommandation | Suffisant ? |
|---|---|---|
| TLS 1.3 in-transit (Vercel + Neon) | Activé par défaut | OUI |
| AES-256 at-rest Neon (storage layer) | Activé par défaut Neon | OUI baseline |
| **IBAN, RIB, bulletins de salaire** | **pgsodium / pgcrypto column-level encryption** | OUI **si clés gérées hors Neon** (KMS externe AWS EU / Scaleway HSM) |
| Mots de passe Clerk | Bcrypt/Argon2 géré par Clerk | OUI |
| Signature Yousign | Coffre-fort qualifié eIDAS | OUI |

**Point critique pgsodium** : le chiffrement column-level est utile **seulement si la clé maître est externe à Neon**. Si la clé est dans Neon elle-même, un compromis Neon = compromis des données. → utiliser **AWS KMS EU (Paris)** ou **Scaleway KMS** comme key custodian. Coût négligeable (<10 €/mois) mais conformité forte.

### 1.8 Notification de violation (art. 33-34 RGPD)

- **Délai CNIL** : 72h après prise de connaissance (`notifications.cnil.fr`)
- **Délai personnes concernées** : « dans les meilleurs délais » si risque élevé
- **Tenir un registre interne** des violations même mineures (art. 33.5)

**Plan d'incident à rédiger** : runbook « En cas de fuite » avec :
1. T+0 : isolation + investigation forensique (mandater un cabinet, ex : Wavestone, Lexing)
2. T+24h : notification CNIL préliminaire (même incomplète, on précise après)
3. T+72h : notification CNIL complète
4. Communication clients + locataires impactés
5. Notification à l'assureur cyber

**Sanction non-notification** : jusqu'à 10 M€ ou 2 % du CA mondial (art. 83.4). Voir sanction Doctissimo 380 k€ (2020).

### 1.9 DPO obligatoire ?

**Critères art. 37 RGPD** : DPO obligatoire si traitement à **grande échelle** OU **suivi régulier et systématique des personnes** OU **données sensibles à grande échelle**.

**Verdict ImmoTrack V2** :
- < 1000 clients : DPO **non obligatoire formellement** mais **fortement recommandé** (CNIL apprécie strictement « grande échelle »)
- > 5000 clients ou > 50 000 locataires en base : **DPO obligatoire**

**Recommandation** : **DPO externe mutualisé** dès le lancement commercial (budget 3-6 k€/an, cabinets : Lexing, Dipeeo, Adekwa). Déclaration CNIL du DPO sur `designations.cnil.fr`. Cela rassure les clients Hoguet (argument commercial).

---

## 2. Statut juridique métier

### 2.1 Carte professionnelle Hoguet — ImmoTrack y est-elle soumise ?

**Loi du 2 janvier 1970 (« loi Hoguet »)**, modifiée par loi ALUR 2014, encadre :
- Transactions immobilières (vente, location)
- Gestion immobilière
- Syndic
- Marchand de listes

**Activités soumises à carte professionnelle CCI** (art. 1) :
> « Se livrer ou prêter son concours, même à titre accessoire, aux opérations portant sur les biens d'autrui... »

**Question clé : ImmoTrack en tant qu'éditeur SaaS « se livre-t-elle » à de la gestion immobilière ?**

**Analyse** :
- Si ImmoTrack se limite à **éditer un logiciel** que les bailleurs/gestionnaires utilisent eux-mêmes pour leur propre activité → **PAS soumise à Hoguet**. Statut = simple éditeur d'outil métier. Précédent : Rentila, Smovin, Masteos (SaaS gestion locative) — aucun n'a de carte T/G.
- Si ImmoTrack **gère elle-même les biens** (encaisse les loyers en son nom, négocie pour le compte du bailleur, sélectionne les locataires) → **soumise à Hoguet G** (gestion).

**Verdict ImmoTrack** : **pas de carte Hoguet propre** tant qu'on reste éditeur de logiciel.

**Garde-fous à mettre dans les CGU** :
> « ImmoTrack est un outil de gestion mis à disposition du Client. ImmoTrack n'agit jamais en qualité de mandataire, ni d'agent immobilier au sens de la loi n°70-9 du 2 janvier 1970. Le Client reste seul responsable de la gestion de ses biens et de la relation avec ses locataires. »

⚠️ **Piège** : si on développe une fonctionnalité « ImmoTrack trouve un locataire pour vous » avec scoring + matching, on **bascule** en intermédiaire immobilier → carte T obligatoire. → exclure formellement du roadmap.

Source : [Légifrance — loi Hoguet](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000509124) | [CCI — délivrance carte pro](https://www.cci.fr/agent-immobilier)

### 2.2 Mandat de gestion + transit de loyers

Si la roadmap prévoit un jour de **collecter les loyers sur un compte ImmoTrack puis reverser au bailleur**, on devient :
1. **Mandataire** au sens art. 1984 C.civ.
2. **Soumis à Hoguet G** (cautionnement Galian/CEGC minimum 110 000 €)
3. **PSP** au sens DSP2 → **agrément ACPR** (cf. § 4)
4. **Assujetti AML/KYC** (LCB-FT, art. L.561-2 CMF) : vigilance, déclaration TRACFIN

**Coût agrément ACPR PSP** : 100-300 k€ + 12-18 mois + équipe compliance dédiée. **Hors scope MVP**. Soit on reste en agrégation pure (lecture seule), soit on s'appuie sur un **partenaire EME** (Lemonway, Treezor, MangoPay) qui porte l'agrément à notre place (modèle « PSP-as-a-service », commission 0,3-1 % par transaction).

**Recommandation V2** : **ne pas toucher au flux monétaire**. Le bailleur reçoit toujours les loyers sur son propre compte. ImmoTrack ne fait que **constater** via DSP2 (read-only).

### 2.3 Tiers de confiance fiscal ?

**Statut « tiers de confiance »** créé par loi du 28 décembre 2010 (art. 170 ter CGI) : permet à un pro (avocat, expert-comptable, notaire) de transmettre la déclaration de revenus de son client en ayant vérifié les pièces.

**ImmoTrack ne peut PAS être tiers de confiance fiscal** : statut réservé aux professions réglementées. On peut **assister** le bailleur à pré-remplir sa 2044 (revenus fonciers) ou 2042-C-PRO (LMNP), mais **pas la télétransmettre en son nom**.

**Garde-fou CGU** :
> « ImmoTrack fournit une aide au calcul de votre déclaration foncière. Les chiffres produits n'ont qu'une valeur indicative. Le Client reste seul responsable de l'exactitude de sa déclaration. »

### 2.4 Convention collective immobilier (IDCC 1527)

**Pertinence ImmoTrack** : nulle pour l'activité éditeur SaaS. La CCN « Immobilier » s'applique aux **agences immobilières, syndics, administrateurs de biens**. ImmoTrack relève de la **CCN Syntec** (IDCC 1486, ingénieurs et bureaux d'études — informatique). Aucun impact tant qu'on n'embauche pas d'agent immobilier en interne.

---

## 3. Loi ALUR + cadre locatif

### 3.1 Mentions obligatoires bail (loi du 6 juillet 1989 modifiée ALUR)

Le **décret n°2015-587** liste 18 mentions obligatoires pour un bail vide, **décret n°2015-981** idem pour meublé. ImmoTrack doit :
- Garantir que **tous les baux générés** comportent les mentions à jour (loyer de référence zone tendue, surface habitable Carrez/Boutin, montant dépôt de garantie ≤ 1 mois vide / 2 mois meublé, etc.)
- **Versionner les modèles** à chaque évolution législative (décret modifié 2019, 2023, 2025…)
- **Mettre à jour automatiquement** ou alerter le client

**Responsabilité juridique** : la jurisprudence est claire — **le bailleur reste responsable** de la conformité du bail signé. Mais **clause de garantie d'usage** dans CGU :
> « ImmoTrack met à disposition des modèles de bail élaborés à partir des textes en vigueur à la date de génération. Le Client doit néanmoins vérifier la conformité avant signature. ImmoTrack ne saurait être tenue responsable d'une omission de mention obligatoire postérieure à une évolution législative. »

**Indemnités risque** : un bail incomplet ≠ nul automatiquement (Cass. 3e civ. 19 nov. 2014), mais peut faire perdre la possibilité de demander congé / réviser le loyer.

### 3.2 Encadrement des loyers — zones tendues

Décret n°2017-1198 + loi ELAN 2018 : encadrement effectif Paris (depuis juillet 2019), Lille (mars 2020), Lyon/Villeurbanne (nov 2021), Bordeaux (juillet 2022), Montpellier (juillet 2022), Plaine Commune, Est Ensemble, Grenoble (juillet 2023), etc.

**Obligations ImmoTrack** :
- Charger **les arrêtés préfectoraux** (loyer de référence majoré / minoré par typologie + époque construction)
- **Bloquer ou alerter** lors de la création d'un bail si loyer hors fourchette
- Stocker la **justification du complément de loyer** (caractéristique exceptionnelle obligatoire)

**Sanction bailleur (pas SaaS)** : amende administrative jusqu'à 5 000 € (particulier) / 15 000 € (personne morale), restitution loyers trop perçus.

**Bonus commercial** : l'encadrement des loyers est une vraie épine pour les bailleurs Paris/Lyon → fonctionnalité « calcul loyer max légal » = différenciant fort.

Source : [Service-public.fr — encadrement loyers](https://www.service-public.fr/particuliers/vosdroits/F1314)

### 3.3 Diagnostics obligatoires (DDT)

Le **Dossier de Diagnostic Technique** (art. 3-3 loi 1989) comprend selon le bien :
- DPE (énergie) — durée 10 ans
- ERP (état des risques et pollutions) — 6 mois
- Plomb (CREP) si avant 1949 — 6 ans si positif, illimité si négatif
- Amiante si avant 1997
- Gaz si installation > 15 ans — 6 ans
- Électricité si installation > 15 ans — 6 ans
- Bruit (aéronefs) si zone

**Responsabilité SaaS** :
- Si ImmoTrack **stocke** les diagnostics : oui (sous-traitant)
- Si ImmoTrack **affirme la validité** : risque juridique élevé. **Solution** : afficher la date de validité + alerter à expiration, **sans certifier** la conformité du diagnostic lui-même (le diagnostiqueur certifié reste responsable de son contenu).

**Clause CGU** :
> « ImmoTrack archive les diagnostics fournis par le Client et alerte sur leur date d'expiration. ImmoTrack ne vérifie ni la véracité ni la conformité technique des diagnostics, qui relèvent du diagnostiqueur certifié. »

### 3.4 Loi Climat & Résilience — passoires thermiques

| Échéance | Interdiction location |
|---|---|
| **1er janvier 2025** | DPE classe **G** (logements > 450 kWh/m²/an) |
| **1er janvier 2028** | DPE classe **F** |
| **1er janvier 2034** | DPE classe **E** |

**Obligation ImmoTrack** : **alerter le bailleur** si le DPE de son logement entre dans la classe interdite à l'échéance du prochain renouvellement de bail. **Bloquer** la génération d'un bail vide sur logement G en 2026+ avec consentement éclairé (« je sais que ce bail est non conforme »). Argument compliance fort.

**Sanction bailleur (pas SaaS)** : loyer non révisable, locataire peut demander travaux, voire mise en demeure et indemnisation (art. 6 loi 1989).

Source : [Loi n°2021-1104 Climat et Résilience](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000043956924/)

---

## 4. Paiements — DSP2 et ACPR

### 4.1 Agrégation Bridge/Powens — statut

**DSP2 (directive UE 2015/2366)** distingue :
- **AISP** (Account Information Service Provider) — agrégateur lecture seule
- **PISP** (Payment Initiation Service Provider) — initie virements
- **ASPSP** — banque teneur de compte

**Bridge et Powens sont déjà agréés** (Bridge : agréé ACPR n°16958 ; Powens : agréé ACPR via Budget Insight). **ImmoTrack en tant que client API de Bridge n'a PAS besoin d'agrément ACPR propre** — on est « utilisateur final » de l'API.

**Mais** : il faut respecter les exigences ACPR sur :
- **Consentement explicite renouvelé tous les 180 jours** (RTS SCA art. 36)
- **SCA — Strong Customer Authentication** : déléguée à la banque du bailleur
- **Pas de stockage des credentials banque** (ImmoTrack ne voit jamais le login banque)
- **Information utilisateur** sur les données collectées + finalité

**Verdict** : **agrégation pure via Bridge = OK sans agrément**. C'est la voie à recommander.

### 4.2 Initiation de virement = changement de statut

Si V3+ veut initier des virements (« reverser le loyer au bailleur », « rembourser la caution au locataire ») :
- Soit via **PISP partenaire** (Bridge propose aussi cette brique) → on reste utilisateur, pas besoin d'agrément
- Soit en propre → **agrément ACPR PSP** (100-300 k€, 12-18 mois)
- Soit via **EME mandataire** (Lemonway, Treezor) → on est « agent prestataire » + déclaration ACPR + LCB-FT light

**Recommandation V2** : **ne PAS initier de virement en V2**. Reporter en V3+ via partenaire Lemonway si la demande client se confirme.

Source : [ACPR — statut DSP2](https://acpr.banque-france.fr/autoriser/procedures-secteur-banque/services-de-paiement) | [Bridge API — compliance](https://docs.bridgeapi.io/docs/compliance)

---

## 5. eIDAS signature électronique

### 5.1 Yousign niveau « avancé » suffit ?

**Règlement eIDAS (UE 910/2014)** distingue 3 niveaux :
- **Simple** (case à cocher, OTP basique) — admissible, force probante faible
- **Avancée** (AES) — lien certain au signataire + intégrité document
- **Qualifiée** (QES) — délivrée par PSCo qualifié, équivalence légale signature manuscrite

**Yousign propose les 3 niveaux**. Pour un **bail d'habitation**, le niveau **avancé est juridiquement admissible** (Cass. 1re civ. 11 mars 2014 n°13-14.379 : signature électronique avancée acceptée comme preuve).

**Exception : caution solidaire**. L'art. 1376 C.civ. (ex-1326) impose la **mention manuscrite** (« Je me porte caution pour la somme de X… »). La jurisprudence est divisée mais tend à admettre la mention **dactylographiée + signature électronique avancée** (Cass. com. 13 sept. 2017 n°15-24.358 sur engagement de caution). **Recommandation prudente** : pour la caution solidaire, exiger **signature qualifiée Yousign QES** (vidéo-identification) → surcoût ~5 € par signature mais sécurité juridique maximale.

**Conservation preuves Yousign** : 10 ans dans coffre-fort numérique conformément à NF Z42-013. Coût Yousign Business : ~0,80 €/signature avancée, ~5 €/QES. Volumétrie 1000 baux/an = 800 € → 5 k€/an. **Acceptable**.

Source : [Règlement eIDAS](https://eur-lex.europa.eu/legal-content/FR/TXT/?uri=CELEX:32014R0910) | Cass. 1re civ. 11 mars 2014

### 5.2 Cautionnement solidaire à distance

Voir ci-dessus. **Workflow Yousign à privilégier pour caution** :
1. Génération PDF avec mention dactylographiée pré-remplie
2. Vidéo-identification du garant (Yousign Identity ou IDnow)
3. Signature qualifiée QES
4. Archivage coffre-fort 10 ans

Sans ce niveau, risque que le bailleur ne puisse pas activer la caution en cas d'impayé (cf. CA Paris 2018 sur caution annulée).

---

## 6. Risques juridiques spécifiques

### 6.1 Responsabilité éditeur SaaS + assurance cyber

**RC Pro classique** (~1-2 k€/an) couvre les fautes d'exploitation. **Cyber-assurance** (~3-8 k€/an pour TPE/PME SaaS) couvre :
- Frais de notification de violation
- Forensique post-incident
- Indemnisation tiers (clients, locataires)
- Rançon (sous conditions)
- Pertes d'exploitation cyber

**Recommandation** : **Hiscox Cyber**, **Generali Cyber**, ou **Stoïk** (assurtech FR) — couverture minimum 1 M€ pour démarrer. Souvent **exigée par les gestionnaires Hoguet** (clause type contrat B2B).

### 6.2 Mention « données stockées en France »

Argument commercial **majeur** en B2B Hoguet (frilosité Cloud Act). Si Clerk migre vers EU, on peut afficher :
> « Toutes vos données sont hébergées et traitées exclusivement en Union européenne, conformément au RGPD et à la doctrine SecNumCloud-compatible. »

**Attention** : ne pas mentir. Si Clerk reste US, dire la vérité (« authentification via Clerk Inc., USA, certifié DPF »).

**Cible aspirante** : qualification **SecNumCloud ANSSI** (~150 k€, 12 mois) — overkill V2 mais argument fort pour bailleurs sociaux/HLM en V3.

### 6.3 CGU + CGV à rédiger

| Document | Contenu | Quand |
|---|---|---|
| **CGU** (utilisation service) | Acceptation, comportements, propriété intellectuelle, garantie, limitation responsabilité | Avant ouverture beta |
| **CGV** (vente abonnement) | Prix, durée, résiliation, paiement, rétractation B2B vs B2C | Avant 1er € facturé |
| **Politique de confidentialité** | Conforme CNIL modèle 2024, mentions art. 13-14 RGPD | Avant beta |
| **Politique cookies + bandeau** | Conforme délibération CNIL 2020-091 | Avant beta |
| **DPA client (Data Processing Agreement)** | Annexe contractuelle pour clients Hoguet (responsable de traitement) | À la signature |
| **Mentions légales** | Art. 6 LCEN | Avant beta |

**Budget rédaction** : 5-8 k€ avocat NTIC (cabinets : Haas, Mathias Avocats, Lexing Alain Bensoussan, Itéanu).

### 6.4 Loi Chatel — abonnement SaaS

**Art. L.215-1 C.consommation** : pour les abonnements B2C tacitement reconductibles > 1 an, obligation d'informer le client de la date limite de résiliation entre 1 et 3 mois avant échéance. Sanction : pas de reconduction tacite.

**Pour ImmoTrack** :
- **B2B (gestionnaires Hoguet)** : pas concerné par Chatel.
- **B2C (bailleurs particuliers)** : si on propose un abonnement annuel, **email rappel automatique 30 jours avant renouvellement obligatoire**. Si abonnement mensuel, résiliation à tout moment → conforme automatiquement.

**Recommandation V2** : démarrer en **mensuel sans engagement** (modèle Stripe Billing) → zéro contrainte Chatel. Optimisations annuelles plus tard.

### 6.5 Loi Pratiques Commerciales Déloyales (DGCCRF)

Attention aux **comparatifs concurrents** (Qalimo, Rentila) : factuels uniquement, sinon dénigrement (art. 1240 C.civ.). Pas de claim « 100 % conforme RGPD » sans preuve (DGCCRF poursuit).

---

## 7. Verdict + checklist actionnable

### 7.1 Autorisations / déclarations OBLIGATOIRES avant lancement commercial

| # | Action | Obligatoire ? | Délai | Coût |
|---|---|---|---|---|
| 1 | **Registre traitements art. 30** | OUI | 2 semaines | Interne |
| 2 | **DPIA + plan de mitigation** | OUI | 4-6 semaines | 3-7 k€ DPO externe |
| 3 | **Consultation préalable CNIL** (si risque résiduel élevé) | SI applicable | 8-14 semaines | 0 € mais lent |
| 4 | **Désignation DPO + notification CNIL** | Recommandé (obligatoire >5000 clients) | 1 semaine | 3-6 k€/an |
| 5 | **Signature DPA tous sous-traitants** + TIA Schrems II Clerk | OUI | 2-3 semaines | Interne |
| 6 | **Migration Clerk EU ou changement provider auth** | OUI si reste US sans DPF | 4-6 semaines | 0-10 k€ |
| 7 | **Rédaction CGU + CGV + politique confidentialité + cookies** | OUI | 3-4 semaines | 5-8 k€ avocat |
| 8 | **Souscription RC Pro Cyber 1 M€** | OUI de fait | 2 semaines | 3-8 k€/an |
| 9 | **Runbook incident + procédure notification 72h** | OUI | 2 semaines | Interne |
| 10 | **Page « exercer mes droits RGPD »** + workflow | OUI | 2 semaines | Interne |
| 11 | **Chiffrement column-level IBAN/RIB** (pgsodium + KMS externe) | OUI (recommandation CNIL) | 1-2 semaines | <100 €/mois KMS |
| 12 | **Tests de conformité décret 2015-1437** (blocage upload pièces interdites) | OUI | 1 semaine | Interne |
| 13 | **Versionning modèles bail à jour** (ALUR + zones tendues) | OUI | 2 semaines | Interne |
| 14 | **Workflow Yousign QES caution solidaire** | Fortement recommandé | 2-3 semaines | ~5€/caution |

**Total temps** : **3-5 mois calendaires** en menant les chantiers en parallèle.
**Total budget juridique initial** : **15-25 k€**.

### 7.2 NON obligatoires V2 (à reporter)

- Carte professionnelle Hoguet (non requise tant qu'éditeur pur)
- Agrément ACPR PSP (non requis si agrégation pure via Bridge)
- Qualification SecNumCloud (overkill — viser V3 si cible HLM)
- Statut tiers de confiance fiscal (impossible juridiquement de toute façon)

### 7.3 Pièges à éviter absolument

1. **Ne pas lancer sans DPIA documentée** — premier réflexe CNIL en contrôle
2. **Ne pas stocker pièces interdites** (n° sécu, photo, casier) — sanction CNIL automatique
3. **Ne pas « initier » de virement** sans agrément ou partenaire EME
4. **Ne pas certifier la validité d'un DPE** — laisser cette responsabilité au diagnostiqueur
5. **Ne pas amender les DPA sous-traitants** par soi-même — utiliser les versions standard SCC 2021
6. **Ne pas oublier la couche `where tenant_id = ?` PostgreSQL RLS** — fuite multi-tenant = sanction CNIL majeure (cf. Optical Center 250 k€ 2020)
7. **Ne pas garder des candidats locataires non retenus** au-delà de la décision (sauf consentement explicite 3 mois max)
8. **Ne pas faire de comparatif Qalimo agressif** (dénigrement)
9. **Ne pas promettre « 100 % conforme RGPD »** sans certification (DGCCRF)
10. **Ne pas oublier le DPA client** pour les gestionnaires Hoguet (responsable de traitement vis-à-vis de leurs propres bailleurs mandants)

### 7.4 Sanctions encourues (rappel pédagogique)

| Manquement | Sanction maximum |
|---|---|
| Violation RGPD générale | 20 M€ ou 4 % CA mondial (le plus élevé) |
| Défaut notification violation 72h | 10 M€ ou 2 % CA mondial |
| Défaut de registre art. 30 | 10 M€ ou 2 % CA |
| Stockage pièces interdites loi 1989 | 5 000 €/cas (CNIL) + 15 000 € (sanction administrative préfectorale) |
| Encadrement loyers violé (bailleur) | 5 000 € particulier / 15 000 € PM |
| Mention obligatoire bail manquante | Pas nullité automatique mais perte d'opposabilité |
| Hébergement données santé sans HDS | 1 an de prison + 100 k€ (non applicable ici) |
| Hoguet sans carte | 6 mois de prison + 7 500 € (art. 14) |

### 7.5 Délai réaliste mise en conformité

**Scénario optimiste (équipe focus + DPO externe réactif)** : **3 mois**.
**Scénario réaliste (mono-développeur + DPO partagé)** : **5 mois**.
**Scénario pessimiste (consultation préalable CNIL nécessaire)** : **7-9 mois**.

**Recommandation séquence** :
1. **M1** : DPO externe + registre + DPIA en parallèle, rédaction CGU/CGV
2. **M2** : DPA sous-traitants + décision Clerk EU vs alternative + chiffrement column-level
3. **M3** : Workflow droits personnes + runbook incident + assurance cyber + Yousign QES caution
4. **M4** : Tests internes + audit blanc cabinet RGPD (~3 k€)
5. **M5** : Beta fermée 10-20 clients amis, ajustements
6. **M6** : Ouverture commerciale

---

## Sources principales

- **Légifrance** : loi 1989, loi Hoguet 1970, loi ALUR 2014, loi ELAN 2018, loi Climat 2021, décrets 2015-587/981/1437
- **CNIL** : recommandations location, liste DPIA, modèle registre, sanctions publiées (`cnil.fr/fr/les-sanctions-prononcees-par-la-cnil`)
- **ACPR** : statut DSP2, registre agents financiers (`regafi.banque-france.fr`)
- **CJUE** : arrêt Schrems II C-311/18 (16 juillet 2020)
- **Commission européenne** : SCC 2021 (`eur-lex.europa.eu` decision 2021/914), DPF 2023/1795
- **eIDAS** : règlement UE 910/2014
- **DGCCRF** : pratiques commerciales (`economie.gouv.fr/dgccrf`)
- **FNAIM, UNIS, ANIL** : pratiques de référence métier
- **Jurisprudence** : Cass. 1re civ. 11 mars 2014 (signature électronique avancée), Cass. com. 13 sept. 2017 (caution électronique), Cass. 3e civ. 19 nov. 2014 (mentions obligatoires bail)

---

**Document audit-trail** :
- Auteur : DPO/Juriste SaaS-immobilier FR (audit externe)
- Version : 1.0
- Date : 2026-05-14
- Prochaine revue : avant ouverture beta commerciale + revue annuelle obligatoire
- Approbation requise : Direction ImmoTrack + DPO externe désigné
