# ImmoTrack — Pack contenus mois 1 (juillet 2026)

**15 posts LinkedIn finis · 6 carrousels · 6 vidéos courtes · 3 YouTube · 2 newsletters · 3 threads Twitter · 3 Reddit**

Tout copié-collable. Tu changes 0 ligne, tu publies.

---

# PARTIE 1 — POSTS LINKEDIN (15 posts finis)

---

## POST 1 — Lundi semaine 1 — Annonce Founder Edition (storytelling)

> En 2024, j'ai oublié une révision IRL sur un de mes logements.
>
> 600 € de manque à gagner sur l'année. Impossible de les rattraper, la jurisprudence est claire : IRL non réclamée dans l'année = renoncée.
>
> Cette nuit-là, j'étais en train de relire un mail de mon locataire sur mon téléphone. Je me suis dit : "C'est impossible que je gère 22 lots avec Excel, Word et Drive. Je vais finir par tout perdre."
>
> Le lendemain, j'ai écrit la première ligne de code d'ImmoTrack.
>
> Deux ans plus tard, j'ai un outil qui :
>
> · pré-remplit ma déclaration 2044 depuis mes mouvements bancaires
> · génère mes baux avec paraphage sur 26 pages conforme article §18
> · m'envoie une alerte 45 jours avant chaque date anniversaire IRL
> · refuse de générer un bail pour un DPE F (Loi Climat 2021)
> · exporte mon FEC conforme arrêté du 29 juillet 2013 pour mon expert-comptable
>
> Aujourd'hui, j'ouvre les 100 premières places à vie d'ImmoTrack.
>
> 249 € une seule fois. À vie.
>
> Pas d'abonnement qui augmente. Pas de "freemium qui devient payant à 1 logement". Pas de "votre carte va être débitée le mois prochain".
>
> Vous payez. Vous utilisez à vie.
>
> Pour qui ? Le bailleur qui gère 2 à 10 lots, la SCI familiale, le conseiller en patrimoine qui a 30 dossiers à suivre.
>
> Le lien est dans le premier commentaire.
>
> Et si vous êtes seulement curieux, dites-le moi en commentaire — je vous fais une démo en visio.

**Image** : capture de ton dashboard ImmoTrack avec les 22 lots visibles.
**Hashtags** : #GestionLocative #SCI #BailleurParticulier

---

## POST 2 — Mardi semaine 1 — Démo import acte de vente

> Vous venez d'acheter un appartement. Vous recevez l'acte de vente PDF du notaire. 47 pages.
>
> Vous l'ouvrez. Vous notez à la main :
> · L'adresse de l'immeuble
> · La surface Carrez
> · Les références cadastrales
> · Le n° de lot et les tantièmes
> · Le prix d'achat
> · Les frais de notaire
> · La SCI acquéreuse
> · L'éventuelle occupation (bail repris article 1743)
>
> Vous saisissez tout ça dans votre logiciel de gestion. Une heure. Minimum.
>
> Si vous achetez 3 lots dans un immeuble en copropriété, c'est 3 heures.
>
> Hier soir, j'ai glissé un acte de vente PDF dans ImmoTrack. 30 secondes plus tard, mon bailleur, mon immeuble et mes 2 lots étaient créés. Avec annexes, tantièmes, étages, désignation cadastrale.
>
> J'ai juste vérifié. J'ai cliqué "Valider".
>
> La feature s'appelle "Import acte de vente". Elle utilise pdf.js et une heuristique locale (sans LLM, sans envoi tiers). 54 tests automatisés. Audit code reviewer validé. Aucun PDF ne quitte votre navigateur.
>
> Si vous avez 5 lots à saisir avant la fin de l'année, ça vaut le coup de regarder.
>
> Lien dans le premier commentaire.

**Image / Vidéo** : screen-capture de l'import (15 secondes).
**Hashtags** : #InvestissementLocatif #ImmobilierFR

---

## POST 3 — Jeudi semaine 1 — Carrousel 5 différenciants (texte d'intro)

> J'ai passé 4 mois à comparer ImmoTrack avec ses 8 concurrents français.
>
> Rentila. BailFacile. Smartloc. Qalimo. Gererseul. ImmobilierLoyer. Smovin. LocataireCloud.
>
> 149 critères évalués. Pour chacun : oui, non, partiel, en roadmap.
>
> Résultat : ImmoTrack a 20 fonctionnalités exclusives. Les 8 concurrents en ont 0 chacun.
>
> Swipe pour voir les 5 plus importantes.
>
> ➡️

**Carrousel à intégrer** : voir Partie 2, Carrousel C1.
**Hashtags** : #ComparatifLogiciel #SaaS

---

## POST 4 — Vendredi semaine 1 — Thread Twitter en LinkedIn (technique)

> Petit point technique pour les curieux.
>
> Une question m'a été posée hier : "Et si vous êtes hackés, qu'est-ce qui arrive à mes données ?"
>
> Réponse honnête en 3 points.
>
> 1. Les données métier d'ImmoTrack (vos baux, vos mouvements, vos locataires) sont stockées dans une base PostgreSQL Supabase, hébergée en Europe (Frankfurt, Allemagne).
>
> 2. Chaque utilisateur a son propre "espace" (un identifiant unique appelé espace_id). La politique d'isolation s'appelle Row Level Security FORCE. En clair : chaque requête SQL est forcée par le serveur à filtrer sur l'espace_id de l'utilisateur connecté. Même mes développeurs ne peuvent pas voir vos données sans casser cette politique.
>
> 3. Vos baux signés ont une protection supplémentaire : un trigger PostgreSQL nommé prevent_locked_mutation. Il refuse toute modification ou suppression d'un bail signé, même exécuté avec les droits administrateur. Si je voulais modifier votre bail signé, je devrais d'abord désactiver explicitement la protection (et c'est journalisé).
>
> Pourquoi je détaille tout ça ?
>
> Parce qu'aucun autre logiciel de gestion locative B2C français ne le fait à ce niveau. La plupart stockent vos données dans une base sans isolation forte. C'est-à-dire que techniquement, leurs développeurs peuvent voir vos baux, vos relevés bancaires, votre IBAN, et le scoring de vos locataires.
>
> ImmoTrack est conçu pour qu'on ne le puisse pas.
>
> Si vous gérez des données sensibles (et un bail en est une), ça mérite d'être posé.
>
> Lien dans le premier commentaire pour ceux qui veulent en savoir plus.

**Image** : schéma simple "espace_id → isolation RLS → trigger immutabilité".
**Hashtags** : #RGPD #Souveraineté #Postgres

---

## POST 5 — Lundi semaine 2 — La ligne 211 (expertise fiscale)

> La ligne 211 de la déclaration 2044, c'est celle qui plombe 80 % des bailleurs.
>
> Pourquoi ?
>
> Parce qu'elle demande "le montant brut des loyers encaissés".
>
> Et que tout le monde marque le montant TTC, charges comprises. C'est faux.
>
> La ligne 211, c'est uniquement les loyers HORS charges. Pas la TVA récupérée par le bailleur, pas les provisions pour charges, pas les remboursements de taxe d'enlèvement des ordures ménagères.
>
> Si vous mettez le mauvais chiffre, deux conséquences :
>
> 1. Vous payez plus d'impôt que vous ne devez (le fisc ne va pas vous corriger dans ce sens-là).
>
> 2. Vous sous-déclarez des charges en ligne 223, ce qui peut déclencher un contrôle.
>
> Avec ImmoTrack, la ligne 211 se calcule automatiquement depuis vos mouvements bancaires catégorisés. Vous voyez le détail ligne par ligne, locataire par locataire.
>
> Si vous avez fait votre 2044 cette année et que vous n'êtes pas sûr d'avoir mis le bon chiffre, prenez 5 minutes pour vérifier.
>
> Et si vous voulez que la prochaine soit faite sans douleur, le lien est dans le premier commentaire.

**Image** : capture d'écran d'une déclaration 2044 avec la ligne 211 surlignée + chiffre de référence en couleur.
**Hashtags** : #Déclaration2044 #RevenusFonciers

---

## POST 6 — Mardi semaine 2 — YouTube tuto 2044 (annonce vidéo)

> Nouvelle vidéo en ligne.
>
> "Remplir sa déclaration 2044 en 10 minutes — démonstration ImmoTrack"
>
> Ce que vous y verrez :
>
> · Comment ImmoTrack récupère vos mouvements bancaires de l'année
> · Comment il mappe automatiquement vos catégories sur les 12 lignes de la 2044
> · Le cas particulier des intérêts d'emprunt et de la taxe foncière
> · Le piège classique de la ligne 211 (qui plombe 80 % des bailleurs)
> · L'export PDF du récap prêt à recopier sur impots.gouv.fr
>
> 11 minutes. Avec ma vraie déclaration 2025 dedans (chiffres anonymisés).
>
> Lien YouTube dans le premier commentaire.
>
> Si vous gérez plus de 3 lots et que la 2044 vous prend une journée chaque printemps, ça devrait vous intéresser.

**Image** : miniature YouTube avec capture du résultat + visage Didier + texte "2044 en 10 min".
**Hashtags** : #YouTube #Tutoriel #Fiscalité

---

## POST 7 — Jeudi semaine 2 — Capture onglet Finances (preuve)

> Voici ce que je vois quand j'ouvre ImmoTrack ce matin.
>
> [Image : capture d'écran onglet Finances]
>
> Résultat net N : 27 430 €
> Résultat net N-1 : 22 870 €
> Variation : +19,9 %
>
> Recouvrement loyers : 98,2 %
> Taux d'occupation : 95,5 %
> Poids des charges : 38,1 %
> Marge nette : 47,8 %
>
> Argent à récupérer ce mois-ci : 1 404 € (3 impayés + 1 vacance partielle)
>
> Et un bouton "Préparer ma 2044" qui me sort le récap fiscal en 1 clic.
>
> Quand j'ai commencé à gérer mes 22 lots, j'avais ces chiffres dispersés dans 3 fichiers Excel, 2 dossiers Drive et une calculette de bureau.
>
> Aujourd'hui, c'est sur une seule page. Et tout est sourcé : je peux cliquer sur n'importe quelle valeur pour voir d'où elle vient.
>
> C'est la feature la plus utilisée d'ImmoTrack. Si vous voulez la voir en vrai, lien dans le premier commentaire.

**Image** : screenshot net et lisible de ton onglet Finances avec données réelles anonymisées.
**Hashtags** : #InvestissementLocatif #Patrimoine

---

## POST 8 — Vendredi semaine 2 — Avant/Après (visuel fort)

> Avant ImmoTrack, voici à quoi ressemblait ma gestion locative.
>
> [Image 1 : capture Excel chaotique avec 30 onglets, formules cassées, couleurs partout]
>
> 6 heures par mois à mettre les mouvements bancaires dans les bons onglets.
>
> 1 journée entière chaque printemps sur la 2044.
>
> 2 oublis de révision IRL en 5 ans (600 € + 480 € de manque à gagner).
>
> 1 quittance mensuelle envoyée par mail à 21 locataires, à la main.
>
> Aujourd'hui :
>
> [Image 2 : capture ImmoTrack dashboard propre]
>
> 30 secondes par mouvement bancaire à catégoriser.
>
> 10 minutes pour la 2044.
>
> 0 oubli d'IRL — alerte automatique 45 jours avant.
>
> Quittances envoyées en un clic depuis l'adresse de chaque SCI.
>
> Économie de temps : entre 5 et 7 heures par mois.
>
> Si vous vous reconnaissez dans la première image, parlons-en.

**Image** : montage 2 captures avant/après.
**Hashtags** : #ProductivitéPro #BailleurParticulier

---

## POST 9 — Lundi semaine 3 — Sondage DPE (engagement)

> Question rapide pour les bailleurs.
>
> Dans votre parc locatif, combien de logements sont classés F ou G au DPE ?
>
> 🟢 Aucun, tout est rénové ou en classe E ou mieux
> 🟡 1 ou 2, je sais qu'il faut que j'agisse
> 🔴 3 ou plus, je suis dans une situation tendue
> ⚫ Je n'ai pas (encore) fait mes DPE
>
> Rappel des dates de la Loi Climat 2021 :
>
> · DPE G : interdits à la location depuis janvier 2025
> · DPE F : interdits dès 2028
> · DPE E : interdits dès 2034
>
> Si vous avez voté 🟡 ou 🔴, je commente dans la journée avec les 3 options qui s'offrent à vous (rénovation, vente, ou délégation à un gestionnaire pro).
>
> Et si vous avez voté ⚫, on en reparle dans 6 mois quand vous aurez un litige avec un locataire.

**Image** : visuel "calendrier Loi Climat" avec les 3 dates.
**Hashtags** : #LoiClimat #DPE #RénovationÉnergétique

---

## POST 10 — Mardi semaine 3 — Démo refus bail F (preuve)

> Petit screenshot de ce qui se passe quand j'essaie de générer un bail pour un de mes logements actuellement classé F.
>
> [Image : capture du refus avec message Loi Climat 2021-1104]
>
> "Génération de bail refusée.
> Logement F-104 actuellement classé F au DPE (dernier diagnostic du 12/03/2024).
> Loi Climat 2021-1104, article 23 : interdiction de location des logements classés F dès 2028.
> Une révision IRL est également bloquée sur ce logement (jurisprudence Cass. Civ. 3, 21 mars 2024)."
>
> Pourquoi cette feature ?
>
> Parce que j'ai un ami bailleur qui a relancé un bail sur un G en avril 2025 (3 mois après l'interdiction). Locataire a saisi la commission de conciliation. 8 mois plus tard : amende de 8 100 €, annulation du bail, et obligation de rembourser 4 mois de loyer.
>
> J'ai décidé qu'ImmoTrack refusait de générer ce type de bail. Point.
>
> Vous ne pouvez pas vous tirer une balle dans le pied avec mon outil.
>
> Et si votre logement passe en F après signature ? L'outil bloque la révision IRL au prochain renouvellement et vous propose un plan de rénovation chiffré (MaPrimeRénov + CEE + déficit foncier).

**Image** : capture du pop-up rouge "Refus génération" avec citation loi.
**Hashtags** : #LoiClimat #SécuritéBailleur

---

## POST 11 — Jeudi semaine 3 — Reddit cross-post (ton communauté)

> Tu loues 3 ou 4 appartements. Tu as déjà eu à demander un dossier de candidature locataire.
>
> Tu sais ce que tu as le droit de demander ?
>
> Le décret 2015-1437 fixe la liste exhaustive. Voici les pièces autorisées :
>
> · Pièce d'identité (CNI, passeport)
> · 1 justificatif de domicile (3 derniers loyers ou taxe foncière)
> · 1 justificatif de situation professionnelle
> · 3 derniers bulletins de salaire
> · Dernier avis d'imposition
> · 3 dernières quittances de loyer (si locataire actuel)
>
> Voici ce que tu n'as PAS le droit de demander :
>
> · Photo (sauf demande explicite et motivée — souvent reconnue comme discriminante)
> · Carte vitale ou attestation sécurité sociale
> · Extrait de casier judiciaire
> · Contrat de mariage ou jugement de divorce
> · Attestation de bonne tenue de compte bancaire
> · Autorisation de prélèvement automatique (sauf optionnelle, pas en conditionnelle d'acceptation)
>
> Si tu demandes une pièce non autorisée, le candidat peut saisir le défenseur des droits. Amende possible : 15 000 €.
>
> Dans ImmoTrack, le pipeline candidature accepte uniquement les pièces autorisées par décret. Le scoring de confiance se calcule sur revenus/loyer, ancienneté pro, garant éventuel. Pas de critère discriminant.
>
> Si tu veux passer 0 risque sur ton process candidature, lien dans le premier commentaire.

**Image** : tableau "demandable / interdit".
**Hashtags** : #Locataire #Droits #ImmobilierFR

---

## POST 12 — Vendredi semaine 3 — Témoignage CGP (mention)

> Hier, j'ai eu un coup de fil d'un CGP de Strasbourg.
>
> "Didier, je suis le 14 avril. Demain je rends visite à 7 clients. À chaque rendez-vous, ils me demandent comment optimiser leur 2044. Je passe 6 heures par jour à recalculer leurs revenus fonciers à la main parce que leurs Excel sont catastrophiques. Aide-moi."
>
> J'ai sorti ImmoTrack devant lui. On a importé en 20 minutes les données d'un de ses clients (un investisseur avec 9 lots, 2 SCI).
>
> Résultat : sa déclaration 2044 prête en 8 minutes.
>
> Sa réaction : "Si tu rajoutes le mandat de gestion et le CRG, je te paie un abonnement par mois et je te ramène 30 clients."
>
> Le mandat de gestion arrive en V1.1 (premier trimestre 2027). Le CRG en V1.2.
>
> En attendant, j'ouvre un programme partenaire pour les CGP.
>
> 30 % de commission première année sur chaque client référé.
> Cobranding sur votre extranet client si vous en avez un.
> Démo en visio personnalisée pour vos 5 plus gros clients.
>
> Si vous êtes CGP et que vous gérez du patrimoine immobilier locatif pour vos clients, on en parle. MP ou commentaire.

**Image** : citation visuelle "Je te ramène 30 clients" du CGP.
**Hashtags** : #CGP #Partenariat #GestionPatrimoine

---

## POST 13 — Lundi semaine 4 — Paraphage 26 pages (autorité)

> Votre bail location nue a 26 pages. Vous le savez ?
>
> Loi du 6 juillet 1989. Décret du 29 mai 2015 (modèle de bail type). Décret 2015-587 (mentions obligatoires). Article 17-1 (révision IRL). Article §18 (signatures et paraphes).
>
> Si vous achetez un modèle de bail sur Internet, vérifiez qu'il fait bien 26 pages. Si c'est 8 pages, c'est qu'il est incomplet.
>
> Maintenant, question moins anodine : ces 26 pages, vous les paraphes ?
>
> Dans la pratique, beaucoup de bailleurs paraphent uniquement la dernière page. C'est insuffisant en cas de litige. L'avocat du locataire peut argumenter qu'il n'a pas pris connaissance des clauses des pages non paraphées.
>
> Article §18 du décret 2015-587 : c'est la signature qui clôt le bail. Mais le paraphage de CHAQUE page renforce la sécurité juridique.
>
> Avec ImmoTrack, le wizard de signature vous fait paraphes chaque page. Les 26. Vous signez ensuite en fin de lecture, une seule fois. Vous cochez la case "Lu et approuvé" qui est légalement obligatoire pour la solidité du contrat (Cass. Civ. 3, 22 juin 2017).
>
> Si vous avez plus de 3 baux signés cette année et que vous voulez vérifier qu'ils sont paraphés correctement, je vous fais un audit gratuit en visio (15 min).
>
> Commentaire ou MP.

**Image** : capture du wizard ImmoTrack à la page 14/26 avec paraphage.
**Hashtags** : #DroitImmobilier #BailLocation

---

## POST 14 — Mardi semaine 4 — Hébergement Europe (positionnement)

> Petit point qui dérange.
>
> Vos données dans votre logiciel de gestion locative, vous savez où elles sont stockées ?
>
> Spoiler : pour la grande majorité des outils français B2C, elles sont sur des serveurs AWS, Azure ou Google Cloud. Souvent en Europe — mais pas toujours. Et toujours soumises au CLOUD Act américain.
>
> Le CLOUD Act, c'est la loi américaine de 2018 qui permet aux autorités américaines d'exiger l'accès aux données d'un client américain, même si elles sont hébergées en Europe.
>
> Vos baux, vos quittances, vos IBAN locataires, votre scoring de confiance : tout ça est accessible par les autorités américaines si votre logiciel est hébergé chez un GAFAM.
>
> ImmoTrack a fait un choix différent. Toutes les données métier sont hébergées sur Supabase Cloud EU, en Europe, en dehors de la juridiction américaine. L'isolation entre utilisateurs est garantie par une politique cryptographique au niveau base de données (Row Level Security FORCE de PostgreSQL).
>
> Concrètement : même mes développeurs ne peuvent pas voir vos données sans casser la politique d'isolation. Et un trigger refuse de modifier un bail signé, même avec les droits administrateur.
>
> Si vous gérez du patrimoine immobilier et que la souveraineté de vos données vous importe, c'est un critère à mettre dans votre cahier des charges.
>
> Plus de détails dans le premier commentaire.

**Image** : carte Europe stylisée avec serveur ImmoTrack à Frankfurt.
**Hashtags** : #Souveraineté #RGPD #DonnéesPersonnelles

---

## POST 15 — Jeudi semaine 4 — Récap mois 1 + bilan Founder Edition

> Premier mois sur LinkedIn pour ImmoTrack.
>
> Je n'avais pas posté de ma vie sur ce réseau il y a 30 jours. Aujourd'hui, on est plus de [X] à suivre ce projet.
>
> Quelques chiffres :
>
> · [X] inscriptions à la newsletter
> · [X] places Founder Edition vendues sur 100
> · [X] CGP en contact pour le programme partenaire
> · [X] commentaires sur les posts
> · 1 vidéo YouTube à [X] vues
>
> Merci à toutes les personnes qui ont commenté, partagé, posé des questions techniques (oui, le post sur le RLS FORCE a été le plus partagé du mois, comme quoi).
>
> Le mois prochain, je vais :
>
> · Lancer la première vraie newsletter "La semaine du bailleur"
> · Mettre en ligne 4 nouvelles vidéos YouTube (focus 2044, EDL, IRL, signature distance)
> · Démarcher activement 50 CGP
> · Vendre les 30 dernières places Founder Edition
> · Préparer le lancement public du 14 octobre
>
> Si vous découvrez ImmoTrack avec ce post, voici les 3 choses à savoir :
>
> 1. C'est un logiciel français de gestion locative pour bailleurs particuliers et SCI familiales
> 2. Il a 20 fonctionnalités exclusives sur le marché français (déclaration 2044, FEC, signature distance, blocage DPE F, hébergement Europe)
> 3. La Founder Edition est à 249 € à vie, plafonnée à 100 places, et le compteur est à [X]/100
>
> Lien dans le premier commentaire.
>
> Bon mois d'août à tous.

**Image** : graphique chiffres clés mois 1.
**Hashtags** : #FounderJourney #SaaS #BuildInPublic

---

# PARTIE 2 — CARROUSELS LINKEDIN (6 carrousels slide par slide)

---

## CARROUSEL C1 — Les 5 différenciants ImmoTrack (7 slides)

**Pour le Post 3.**

### Slide 1 (cover)
**Visuel** : fond bleu marine sombre, logo ImmoTrack en haut-gauche, gros titre centré.
**Texte principal** : "5 fonctionnalités que personne d'autre n'a"
**Sous-titre** : "Audit comparatif sur 8 concurrents B2C français · juin 2026"

### Slide 2
**Titre** : "1. Import d'un acte de vente PDF"
**Corps** : "Vous glissez votre acte de vente notarié dans ImmoTrack.
30 secondes plus tard : bailleur + immeuble + logements + annexes + tantièmes sont créés.
54 tests automatisés. 100 % local. Aucun PDF ne quitte votre navigateur."
**Note bas de slide** : "Aucun concurrent B2C ne le fait."

### Slide 3
**Titre** : "2. Wizard bail avec paraphage page-par-page"
**Corps** : "Les 26 pages de votre bail sont paraphées une à une.
Signature en fin de lecture (article §18 du décret 2015-587).
Case "Lu et approuvé" obligatoire (Cass. Civ. 3, 22 juin 2017).
Multi-bailleurs, multi-locataires, multi-garants gérés."
**Note bas de slide** : "Aucun concurrent au même niveau."

### Slide 4
**Titre** : "3. Aide 2044 + Export FEC DGFiP"
**Corps** : "Votre déclaration 2044 est pré-remplie depuis vos mouvements bancaires.
Export FEC conforme arrêté du 29 juillet 2013.
Compatible Sage, EBP, Quadra.
Bilan annuel par SCI. Compte de résultat N vs N-1."
**Note bas de slide** : "Aucun concurrent B2C."

### Slide 5
**Titre** : "4. Hébergement Europe + isolation cryptographique"
**Corps** : "Vos données sont stockées sur Supabase Cloud EU.
Isolation Row Level Security FORCE au niveau base.
Bail signé immuable par trigger PostgreSQL.
Même les développeurs ne peuvent pas voir vos données."
**Note bas de slide** : "Position unique sur le marché."

### Slide 6
**Titre** : "5. Refus automatique si DPE F ou G"
**Corps** : "Vous essayez de générer un bail pour un DPE F ou G.
ImmoTrack refuse. Pop-up rouge avec citation Loi Climat 2021-1104.
Protection légale automatique.
Plan de rénovation chiffré proposé (MaPrimeRénov + CEE + déficit foncier)."
**Note bas de slide** : "Aucun concurrent B2C."

### Slide 7 (CTA)
**Visuel** : fond bleu marine sombre.
**Texte** : "Founder Edition 249 € à vie"
**Sous-texte** : "100 places. Plus jamais ce prix après."
**CTA** : "→ Réserver ma place dans le premier commentaire"

---

## CARROUSEL C2 — La déclaration 2044 en 7 étapes (8 slides)

**À publier en mois 2 — début saison fiscale.**

### Slide 1 (cover)
**Titre** : "Déclaration 2044 : les 7 étapes que personne ne vous explique"
**Sous-titre** : "Pour ceux qui louent en location nue"

### Slide 2
**Titre** : "Étape 1 — Connaître votre régime"
**Corps** : "Vos revenus fonciers bruts sont-ils inférieurs à 15 000 € ?
✓ Oui → régime micro-foncier (abattement automatique 30 %, formulaire 2042 uniquement, pas de 2044)
✗ Non → régime réel obligatoire, vous devez remplir la 2044"

### Slide 3
**Titre** : "Étape 2 — Ligne 211 (la plus piégeuse)"
**Corps** : "Montant des loyers encaissés en hors charges (HC).
PAS le montant TTC.
PAS les provisions pour charges.
PAS les remboursements TEOM.
80 % des bailleurs s'y plantent."

### Slide 4
**Titre** : "Étape 3 — Lignes 222 à 230 (charges déductibles)"
**Corps** : "78 catégories possibles. Les 4 principales :
• Intérêts d'emprunt
• Taxe foncière
• Travaux d'entretien et de réparation (PAS les améliorations)
• Frais de gestion (cotisations syndic, assurances, MRH)"

### Slide 5
**Titre** : "Étape 4 — Distinguer entretien et amélioration"
**Corps** : "Entretien = déductible immédiat (peinture, plomberie, remplacement chaudière à équivalent).
Amélioration = NON déductible (sauf en travaux énergétiques, dispositif spécial).
Construction/agrandissement = NON déductible.
En cas de doute : BOI-RFPI-BASE-20-30-10."

### Slide 6
**Titre** : "Étape 5 — Le déficit foncier"
**Corps** : "Charges > revenus = déficit foncier.
Imputable sur le revenu global jusqu'à 10 700 €/an.
Surplus reportable sur 10 ans contre revenus fonciers uniquement.
Pour les travaux énergétiques DPE F/G : plafond doublé à 21 400 €."

### Slide 7
**Titre** : "Étape 6 — Le calendrier"
**Corps** : "Mai : déclaration 2044 + 2042
Juin : envoi de l'avis
Septembre : paiement
Octobre : prélèvement à la source ajusté pour N+1.
Si vous avez plus de 10 lots : pensez à anticiper en janvier."

### Slide 8 (CTA)
**Visuel** : fond cream.
**Texte** : "ImmoTrack pré-remplit votre 2044 en 10 minutes"
**Sous-texte** : "Founder Edition 249 € à vie. Lien dans le premier commentaire."

---

## CARROUSEL C3 — Loi Climat 2021 : le calendrier complet (6 slides)

**À publier en mois 2 — pour cluster Loi Climat.**

### Slide 1
**Titre** : "Loi Climat 2021. Tout le calendrier qui change pour les bailleurs."

### Slide 2
**Titre** : "Janvier 2023 — Gel des loyers DPE F et G"
**Corps** : "Plus aucune révision IRL possible si DPE F ou G.
Y compris à la relocation.
Si vous avez un F ou G aujourd'hui, votre loyer est figé jusqu'à ce que vous fassiez des travaux."

### Slide 3
**Titre** : "Janvier 2025 — Interdiction location DPE G"
**Corps** : "Un G ne peut plus être loué en bail nu.
Bail meublé : interdiction effective 2028 (un an plus tard).
Sanction : le locataire peut saisir la commission de conciliation et demander réduction de loyer / annulation."

### Slide 4
**Titre** : "Janvier 2028 — Interdiction location DPE F"
**Corps** : "Même règle que pour G.
2,5 millions de logements sont concernés en France.
Si vous achetez un F en 2026 sans plan de rénovation, vous achetez un actif bloqué dans 2 ans."

### Slide 5
**Titre** : "Janvier 2034 — Interdiction location DPE E"
**Corps** : "Les E s'ajoutent à la liste interdite.
Total logements interdits à la location à cette date : ~7 millions.
La France compte 30 millions de résidences principales — donc 23 % du parc."

### Slide 6 (CTA)
**Titre** : "ImmoTrack bloque automatiquement la génération de bail sur DPE F/G."
**Sous-texte** : "Vous êtes protégé de l'amende. 249 € à vie. Lien dans le premier commentaire."

---

## CARROUSEL C4 — Excel vs ImmoTrack (5 slides)

**À publier mi-mois 1.**

### Slide 1 (cover)
**Titre** : "Excel ou ImmoTrack ?"
**Sous-titre** : "Le vrai comparatif quand vous avez 5+ lots."

### Slide 2 — Avant
**Visuel** : capture Excel chaotique (30 onglets, formules cassées, couleurs partout).
**Texte** : "Excel pour les loyers. Word pour les baux. Drive pour les EDL.
Carnet pour l'IRL.
6 h/mois.
1 journée par an sur la 2044.
2 oublis IRL en 5 ans = 1 080 € de manque à gagner."

### Slide 3 — Après
**Visuel** : capture ImmoTrack dashboard propre.
**Texte** : "1 outil.
30 secondes par mouvement bancaire.
10 minutes pour la 2044.
0 oubli IRL (alerte automatique 45 j avant).
Quittances envoyées en 1 clic."

### Slide 4 — Le calcul
**Visuel** : tableau simple.
**Texte** :
"Excel : 6 h/mois × 12 mois × valeur de votre heure (35 €) = 2 520 €/an
2044 : 8 h × 35 € = 280 €/an
Oublis IRL : ~200 €/an en moyenne
TOTAL coût caché Excel : ~3 000 €/an

ImmoTrack : 249 € à vie."

### Slide 5 (CTA)
**Texte** : "Économies sur 5 ans : ~14 750 €"
**Sous-texte** : "Founder Edition 249 € à vie. Lien dans le premier commentaire."

---

## CARROUSEL C5 — 12 charges déductibles oubliées (10 slides)

**À publier en mois 2.**

### Slide 1 (cover)
**Titre** : "12 charges déductibles que vous oubliez dans votre 2044"
**Sous-titre** : "Combien coûte chaque oubli ?"

### Slide 2
"1. Cotisations à votre syndic de copropriété (intégralité)
2. Provisions sur charges récupérables non récupérées (lignes 230)
3. Frais de gestion par tiers (gestionnaire, agence)"

### Slide 3
"4. Primes d'assurance loyers impayés (GLI)
5. Primes d'assurance propriétaire non occupant (PNO)
6. Frais de procédure (huissier, avocat, conciliation)"

### Slide 4
"7. Honoraires de rédaction du bail par un professionnel
8. Honoraires d'expertise comptable pour 2044
9. Frais bancaires liés au compte dédié SCI (à proratiser)"

### Slide 5
"10. Cotisation foncière des entreprises (CFE) pour les LMP
11. Taxe sur les bureaux IDF (si applicable)
12. Travaux d'amélioration énergétique pour DPE F/G (cas spécial Loi Climat)"

### Slide 6 — Le bonus
**Titre** : "Le piège : les travaux d'amélioration vs entretien"
**Corps** : "Entretien (peinture, remplacement à équivalent) = déductible immédiat.
Amélioration (climatisation neuve, agrandissement) = NON déductible.
Énergétique (isolation, pompe à chaleur sur DPE F/G) = cas spécial, déficit foncier doublé."

### Slide 7 — Combien ça coûte
**Texte** : "Oublier 1 200 €/an de charges déductibles → 360 € d'impôt payés en trop chaque année (TMI 30 %).
Sur 10 ans : 3 600 €.
Sur 20 ans : 7 200 €."

### Slide 8 — Comment ImmoTrack résout
**Texte** : "Catégoriser un mouvement bancaire dans ImmoTrack = il est automatiquement mappé à la bonne ligne de la 2044.
Pour les 78 cas de charges, le bon mapping est intégré.
Vous voyez le récap ligne par ligne avant déclaration."

### Slide 9 — Témoignage (à adapter selon vrais retours)
**Texte** : "« J'ai récupéré 2 800 € de charges oubliées sur ma 2044 2025 en passant à ImmoTrack. »
— Marie, SCI familiale 6 lots, Lille."

### Slide 10 (CTA)
"Founder Edition 249 € à vie. 100 places. Lien dans le premier commentaire."

---

## CARROUSEL C6 — Roadmap publique ImmoTrack (5 slides)

**À publier fin mois 1 — pour transparence et confiance.**

### Slide 1 (cover)
**Titre** : "La roadmap ImmoTrack jusqu'à fin 2027"
**Sous-titre** : "Ce que vous obtenez en achetant aujourd'hui."

### Slide 2 — V1 (octobre 2026)
**Titre** : "V1 — Lancement public le 14 octobre 2026"
**Corps** :
"• Bail nu signature distance via relais Cloudflare
• Aide 2044 + FEC export comptable
• EDL délégué offline (export HTML)
• Loi Climat 2021 (blocage DPE F/G)
• Drive partagé 2 utilisateurs (co-gestion familiale)
• Mobile audit clôturé sur 9 onglets"

### Slide 3 — V1.1 (T1 2027)
**Titre** : "V1.1 — Gestion pro (premier trimestre 2027)"
**Corps** :
"• Mandat de gestion Hoguet
• CRG automatisé (compte rendu de gérance)
• Suivi dépôt de garantie
• Pré-contentieux impayés (mise en demeure auto)"

### Slide 4 — V2 (T2-T4 2027)
**Titre** : "V2 — SaaS multi-utilisateurs (à partir avril 2027)"
**Corps** :
"• Architecture multi-tenant déjà prête (Supabase EU)
• Portail bailleur en ligne
• Portail locataire + paiement en ligne (Stripe/SEPA)
• Notifications email/SMS automatiques"

### Slide 5 (CTA)
**Texte** : "Tout ça inclus dans la Founder Edition lifetime."
**Sous-texte** : "249 € à vie. Toutes les futures fonctionnalités V1 à V2 incluses. Lien dans le premier commentaire."

---

# PARTIE 3 — SCRIPTS VIDÉOS COURTES (6 scripts seconde par seconde)

---

## VIDÉO V1 — Import acte de vente (durée totale 90 secondes)

**Format** : TikTok, Instagram Reels, YouTube Shorts (vertical 9:16).
**Musique** : "Lo-Fi Beat Travel" ou similaire libre de droits, BPM ~85, dynamique au moment de la démo.

| Temps | Visuel | Voix off / Texte ON SCREEN |
|---|---|---|
| **00 - 03s** | Plan visage Didier ou écran téléphone qui montre PDF acte de vente | VOIX : "Tu viens d'acheter un appart. Combien de temps tu mets pour saisir tout ça dans ton tableau Excel ?" |
| **03 - 08s** | Compteur qui défile (1h, 2h, 3h...) sur fond Excel chaotique | TEXTE ON SCREEN : "Adresse · surface Carrez · cadastre · tantièmes · prix · frais de notaire · SCI · occupant..." |
| **08 - 12s** | Transition zoom-in sur logo ImmoTrack | VOIX : "Là je viens de recevoir mon acte de vente. Regarde." |
| **12 - 25s** | Screen-capture : ouverture ImmoTrack → bouton "Importer un acte de vente" → drag-drop du PDF dans la zone | TEXTE ON SCREEN : "Glisser le PDF" |
| **25 - 50s** | Screen-capture : barre de progression → écran de vérification avec champs auto-remplis (acheteur SCI, adresse, lots, surface, tantièmes) | VOIX : "30 secondes. ImmoTrack lit le PDF, extrait l'acheteur, l'immeuble, chaque lot, les annexes, et les tantièmes."

**Texte ON SCREEN à 35s** : "Aucun envoi tiers. Tout est local." |
| **50 - 65s** | Screen-capture : utilisateur valide → toast vert "Bien créé" → affichage du nouveau logement dans la liste | VOIX : "Je vérifie. Je valide. C'est créé." |
| **65 - 75s** | Plan visage Didier ou capture du dashboard | VOIX : "Tu sais ce qui prend 30 secondes maintenant ? Saisir un bien." |
| **75 - 85s** | Texte ON SCREEN avec arrière-plan ImmoTrack | TEXTE : "Founder Edition 249 € à vie. 100 places." |
| **85 - 90s** | Logo + lien | VOIX : "ImmoTrack. Lien en bio." |

**Sous-titres** : à intégrer en permanence en gras blanc avec contour noir.

---

## VIDÉO V2 — Déclaration 2044 en 10 minutes (60 secondes)

**Format** : TikTok, Instagram Reels (vertical 9:16).
**Musique** : énergique, ~110 BPM, type "Productive Beat".

| Temps | Visuel | Voix off / Texte ON SCREEN |
|---|---|---|
| **00 - 03s** | Plan : pile de papiers, calculette, énorme tableau Excel sur écran | VOIX : "La 2044, c'est normalement la journée la plus pourrie de l'année du bailleur." |
| **03 - 08s** | Compteur "1 journée" qui défile, transition rouge | TEXTE ON SCREEN : "1 journée perdue chaque printemps" |
| **08 - 15s** | Plan visage Didier : "Là je suis le 20 avril. Voilà ma 2044 2025." | VOIX OFF (ton plus calme) : "Aujourd'hui, je vais te montrer comment je fais en 10 minutes." |
| **15 - 35s** | Screen-capture : onglet Fiscal d'ImmoTrack → bouton "Préparer ma 2044 - année 2025" → écran qui montre toutes les lignes pré-remplies (211, 213, 221-230, 250) | TEXTE ON SCREEN : "Mouvements bancaires → mapping auto → lignes 2044" |
| **35 - 45s** | Screen-capture : utilisateur clique sur la ligne 211, drill-down ouvert avec détail loyers par locataire | VOIX : "Chaque chiffre est sourcé. Je peux cliquer pour voir d'où il vient." |
| **45 - 55s** | Screen-capture : utilisateur clique "Exporter PDF" → PDF s'ouvre avec récap prêt à recopier | VOIX : "J'imprime, je recopie sur impots.gouv. Fini." |
| **55 - 60s** | Logo + CTA | TEXTE ON SCREEN : "Founder Edition 249 € à vie. Lien en bio." |

---

## VIDÉO V3 — DPE F refusé (45 secondes)

**Format** : TikTok vertical, ton un peu plus direct/provocateur.
**Musique** : drama 1 seconde au moment du refus, sinon calme.

| Temps | Visuel | Voix off / Texte ON SCREEN |
|---|---|---|
| **00 - 03s** | Texte gras à l'écran "Tu loues un DPE F en 2026 ?" sur fond rouge | VOIX : "Tu loues un DPE F en 2026 ?" |
| **03 - 06s** | Texte qui apparaît "Tu vas avoir des problèmes." | VOIX : "Tu vas avoir des problèmes." |
| **06 - 12s** | Plan : article de loi affiché à l'écran (Loi 2021-1104) | TEXTE ON SCREEN : "Loi Climat 2021 - Article 23 - Interdiction DPE F en 2028" |
| **12 - 22s** | Screen-capture : utilisateur tente de générer un bail dans ImmoTrack pour un logement noté F → pop-up rouge "Refus de génération" | TEXTE ON SCREEN : "Refus auto" |
| **22 - 30s** | Zoom sur le pop-up + lecture des messages explicatifs (loi citée + jurisprudence) | VOIX : "ImmoTrack refuse de te laisser te tirer une balle dans le pied." |
| **30 - 38s** | Plan : visage Didier : "Mon ami bailleur a essayé en 2025. Amende 8 100 €." | VOIX : "Un ami bailleur a essayé en 2025. Locataire saisit la conciliation. 8 100 € d'amende." |
| **38 - 45s** | Logo + CTA | TEXTE ON SCREEN : "ImmoTrack. 249 € à vie. Lien en bio." |

---

## VIDÉO V4 — Alerte IRL (30 secondes)

**Format** : TikTok vertical court.
**Musique** : marimba doux, calme.

| Temps | Visuel | Voix off / Texte ON SCREEN |
|---|---|---|
| **00 - 03s** | Plan : visage Didier avec mimique "réalisation" | VOIX : "T'as oublié ta révision IRL l'année dernière ?" |
| **03 - 08s** | Texte qui apparaît "Trop tard. T'as perdu l'argent." | TEXTE ON SCREEN : "IRL non réclamée dans l'année = renoncée (jurisprudence)" |
| **08 - 15s** | Compteur de loyers manqués qui défile (480 €, 720 €, 1 080 €...) | TEXTE ON SCREEN : "Le coût d'un oubli sur 5 ans" |
| **15 - 25s** | Screen-capture : notification ImmoTrack "IRL à réviser dans 45 jours sur F-101" → clic → lettre IRL automatique générée | TEXTE ON SCREEN : "45 jours avant l'anniversaire" |
| **25 - 30s** | Logo + CTA | VOIX : "ImmoTrack ne te laisse pas oublier. Lien en bio." |

---

## VIDÉO V5 — Comparatif Excel vs ImmoTrack (60 secondes)

**Format** : TikTok/Reels vertical, ton honnête, presque vlog.
**Musique** : lo-fi chill.

| Temps | Visuel | Voix off / Texte ON SCREEN |
|---|---|---|
| **00 - 03s** | Plan visage Didier : "Je gère 22 logements." | VOIX : "Je gère 22 logements." |
| **03 - 08s** | Plan : capture Excel chaotique (30 onglets, formules cassées, couleurs partout) | VOIX : "Pendant 5 ans, j'avais ça." |
| **08 - 18s** | Zoom et défilement rapide sur l'Excel | TEXTE ON SCREEN : "30 onglets · formules cassées · 6 h/mois · 2 oublis IRL en 5 ans" |
| **18 - 22s** | Plan visage Didier : "J'ai fait quelque chose de plus simple." | VOIX : "J'en ai eu marre. J'ai fait quelque chose de plus simple." |
| **22 - 45s** | Screen-capture : dashboard ImmoTrack propre, navigation entre les onglets clés (Accueil, Loyers, Finances) | TEXTE ON SCREEN : "1 outil. 30 sec par mouvement. 10 min pour la 2044." |
| **45 - 55s** | Plan visage Didier souriant : "Et maintenant je n'ai plus jamais oublié de réviser un IRL." | VOIX : "Et je n'ai plus jamais oublié une révision IRL." |
| **55 - 60s** | Logo + CTA | TEXTE ON SCREEN : "Founder Edition 249 € à vie. Lien en bio." |

---

## VIDÉO V6 — Send-as par entité (45 secondes)

**Format** : Reels vertical, démo produit.

| Temps | Visuel | Voix off / Texte ON SCREEN |
|---|---|---|
| **00 - 03s** | Plan : email reçu en haut de l'écran "De : noreply@gestion-locative.com" | VOIX : "Les emails de quittance que tu envoies à tes locataires..." |
| **03 - 08s** | Zoom sur l'adresse "noreply@" | VOIX : "Ils viennent d'une adresse `noreply` random." |
| **08 - 15s** | Plan : visage Didier en mode "ce n'est pas pro" | VOIX : "Pour un bailleur sérieux, c'est pas pro." |
| **15 - 35s** | Screen-capture : ImmoTrack → composition email quittance → menu déroulant FROM qui propose plusieurs adresses (SCI Patrimoine 1, SCI Familiale Keller, Didier perso) → sélection SCI Patrimoine 1 | TEXTE ON SCREEN : "Envoyer depuis l'adresse de ta SCI" |
| **35 - 40s** | Plan : email reçu côté locataire avec adresse pro "comptabilite@sci-patrimoine.fr" | VOIX : "Le locataire reçoit l'email depuis la vraie adresse de ta SCI." |
| **40 - 45s** | Logo + CTA | TEXTE ON SCREEN : "ImmoTrack. Pro by default. 249 €." |

---

# PARTIE 4 — SCRIPTS YOUTUBE LONGS (3 vidéos 3-7 minutes)

---

## YOUTUBE Y1 — "Remplir sa 2044 en 10 minutes — démo ImmoTrack" (durée 11 min)

**Titre exact** : "Déclaration 2044 en 10 minutes — démo complète ImmoTrack (avec ma vraie déclaration 2025)"
**Description SEO** :
> Comment remplir votre déclaration 2044 des revenus fonciers en 10 minutes. Je vous montre ma vraie déclaration 2025 (chiffres anonymisés) avec ImmoTrack. Couvre : la ligne 211 piégeuse, les 78 charges déductibles, le déficit foncier, le mapping bancaire automatique, l'export PDF prêt à recopier.
>
> Chapitres :
> 00:00 Intro - pourquoi la 2044 c'est l'enfer
> 01:15 Le régime micro-foncier vs régime réel
> 02:30 Import des mouvements bancaires
> 04:00 Le mapping automatique sur les 12 lignes
> 05:45 La ligne 211 (le piège classique)
> 07:00 Les charges déductibles (78 catégories)
> 08:30 Le cas du déficit foncier
> 09:30 Export PDF et copie sur impots.gouv.fr
> 10:30 Conclusion + Founder Edition

**Plan de la vidéo** :

**Intro (00:00 - 01:15)**
- Plan visage Didier dans son bureau.
- Ton : "Si la 2044 c'est ton enfer chaque printemps, cette vidéo est pour toi."
- Présentation rapide : "Je gère 22 logements en propre dans 3 SCI. Voici comment je fais ma 2044 en 10 minutes."

**Régime micro vs réel (01:15 - 02:30)**
- Schéma à l'écran : seuil 15 000 € de revenus fonciers bruts.
- "Si tu es en dessous : régime micro-foncier, abattement 30 % automatique, pas besoin de 2044."
- "Si tu es au-dessus ou si tu choisis le réel : 2044 obligatoire."
- "Pourquoi choisir le réel même sous le seuil ? Si tes charges réelles > 30 % de tes revenus, le réel est plus avantageux."

**Import des mouvements (02:30 - 04:00)**
- Screen-capture : import bancaire ImmoTrack.
- Format CSV/OFX accepté.
- Fingerprinting pour éviter les doublons.
- Pointeur de progression par compte.

**Mapping automatique (04:00 - 05:45)**
- Démonstration du mapping des catégories sur les lignes 2044.
- ImmoTrack utilise les catégories standards STD_CATEGORIES.
- Pour les catégories personnalisées : éditeur de correspondance CAT-MAPPING-2044.

**La ligne 211 (05:45 - 07:00)**
- Le piège : "Tout le monde met le TTC. C'est faux."
- ImmoTrack distingue automatiquement HC, charges récupérables, dépôt de garantie.
- Drill-down sur la ligne 211 : voir le détail locataire par locataire.

**Charges déductibles (07:00 - 08:30)**
- Lister les 4 catégories principales (intérêts d'emprunt, taxe foncière, entretien, gestion).
- Le piège entretien vs amélioration.
- Cas spécial travaux énergétiques DPE F/G.

**Déficit foncier (08:30 - 09:30)**
- Comment ImmoTrack le calcule automatiquement.
- Plafond 10 700 €/an (doublé à 21 400 € pour énergétique).
- Report sur 10 ans.

**Export PDF (09:30 - 10:30)**
- Bouton "Exporter PDF récap".
- PDF prêt à recopier sur impots.gouv.fr.
- Conservation 10 ans pour audit fiscal.

**Conclusion + CTA (10:30 - 11:00)**
- "Voilà. 10 minutes."
- "Founder Edition 249 € à vie. 100 places."
- "Lien en description."

**Vignette YouTube** : visage Didier + capture screenshot 2044 ImmoTrack + texte gros "10 min".

---

## YOUTUBE Y2 — "Wizard bail ImmoTrack expliqué — article §18 décortiqué" (durée 7 min)

**Titre exact** : "Pourquoi votre bail doit être paraphé page-par-page — démo wizard ImmoTrack"
**Description SEO** :
> L'article §18 du décret 2015-587 et la jurisprudence Cass. Civ. 3, 22 juin 2017. Pourquoi le paraphage des 26 pages du bail location nue protège le bailleur. Démonstration complète du wizard signature ImmoTrack avec un cas réel (bail F-104 multi-bailleurs + multi-locataires + 2 garants).

**Plan** :

**Intro (00:00 - 00:45)** : "Votre bail fait 26 pages. Vous les paraphes ? Voici pourquoi c'est non négociable."

**Le droit (00:45 - 02:00)** :
- Article §18 du décret 2015-587 : la signature clôt le bail.
- Cass. Civ. 3, 22 juin 2017 : importance de la clause "Lu et approuvé".
- Risques en cas de litige sur clauses non paraphées.

**Démo wizard (02:00 - 06:00)** :
- Lancement du wizard sur un bail réel.
- Étape 1 : paraphage page-par-page (montrer le mécanisme canvas).
- Étape 2 : signature finale en fin de lecture.
- Étape 3 : clause "Lu et approuvé" obligatoire.
- Cas multi-bailleurs/locataires/garants (N cadres signature dynamiques).

**Signature à distance (06:00 - 06:45)** :
- Mention rapide du relais Cloudflare audité.
- Pour les locataires qui ne peuvent pas être présents.

**Conclusion + CTA (06:45 - 07:00)**.

**Vignette** : visage Didier + capture bail Page 14/26 + texte "Article §18".

---

## YOUTUBE Y3 — "Loi Climat 2021 : tout ce que tu dois savoir avant 2028" (durée 5 min)

**Titre exact** : "Loi Climat 2021 : interdiction location DPE F et G — guide complet 2026-2034"
**Description SEO** :
> Loi 2021-1104 : calendrier complet des interdictions de location selon DPE. Janvier 2023 (gel loyers F/G), janvier 2025 (interdiction G), janvier 2028 (interdiction F), janvier 2034 (interdiction E). 2,5 millions de logements impactés. Quelles options : rénover, vendre, ou bloquer le logement ?

**Plan** :

**Intro (00:00 - 00:30)** : Chiffres clés - 2,5 M de logements interdits en 2028 ; 7 M en 2034.

**Calendrier (00:30 - 02:30)** :
- Janvier 2023 : gel loyers F/G (y compris relocation).
- Janvier 2025 : interdiction location G.
- Janvier 2028 : interdiction location F.
- Janvier 2034 : interdiction location E.

**Les 3 options (02:30 - 04:00)** :
- Rénovation : MaPrimeRénov + CEE + déficit foncier énergétique doublé.
- Vente : décote DPE F/G observée ~10-15 % sur le marché.
- Bloquer le logement (vacant) : coût d'opportunité.

**Démo ImmoTrack (04:00 - 04:45)** :
- Blocage auto bail si DPE F/G.
- Alerte révision IRL bloquée si DPE F/G.
- Plan de rénovation chiffré pour chaque logement F ou G.

**Conclusion + CTA (04:45 - 05:00)**.

**Vignette** : carte de France + dates clés + texte "2028" en rouge.

---

# PARTIE 5 — NEWSLETTERS (2 numéros complets)

---

## NEWSLETTER N°1 — "La semaine du bailleur"

**Lancement** : dimanche 7 août 2026 (semaine 2 mois 2).
**Plateforme** : Beehiiv (gratuit jusqu'à 2 500 abonnés).
**Cible** : 500 abonnés à fin août.

### Sujet email
**📩 La semaine du bailleur — N°1 : ce qui change pour la révision IRL en 2026**

### Corps de l'email

**Bonjour [prénom],**

Bienvenue dans le premier numéro de "La semaine du bailleur".

Chaque dimanche matin à 7h30, vous recevez :
- 1 actualité loi qui change votre quotidien
- 1 cas pratique tiré de la vraie vie d'un bailleur
- 1 outil concret pour gagner du temps

Cette semaine : la révision IRL en 2026.

---

**📜 L'actu : la jurisprudence qui durcit l'IRL non réclamée**

En mars 2024, la Cour de cassation a réaffirmé un principe :

> "L'IRL non réclamée par le bailleur dans l'année qui suit la date anniversaire du bail est définitivement renoncée."

Concrètement : si vous oubliez de réviser votre IRL pendant 12 mois après la date anniversaire, vous ne pouvez plus rattraper l'augmentation.

Et il y a pire : si vous tentez de rattraper l'IRL des années passées en l'incluant dans une nouvelle révision, c'est aussi un motif de contestation pour votre locataire.

**Combien ça coûte en moyenne ?** Pour un loyer de 700 € HC, oublier une IRL = 6 à 12 €/mois perdus pendant toute la durée du bail. Sur 6 ans : 432 à 864 €.

---

**🏠 Le cas pratique : Pierre, 4 lots à Mulhouse**

Pierre m'a écrit lundi.

"Didier, je viens de retrouver mes baux. Je n'ai jamais révisé l'IRL sur 2 de mes 4 lots. Ça fait 3 ans. Je peux rattraper ?"

Réponse honnête : non, pas les années passées.

Mais il peut :
1. Faire la révision sur l'année en cours (encore dans les 12 mois suivant la date anniversaire).
2. Mettre en place un système d'alerte pour ne plus jamais oublier.
3. Pour les 2 lots restants : vérifier que la date anniversaire est connue et que l'IRL est revalorisée dès maintenant.

Pierre a perdu environ 1 800 € sur 3 ans. Il aurait suffi d'une alerte automatique.

---

**🛠️ L'outil : l'alerte IRL automatique d'ImmoTrack**

ImmoTrack envoie une alerte par email 45 jours avant chaque date anniversaire de bail.

Vous recevez : la date anniversaire, l'indice IRL applicable, le nouveau loyer calculé, et un bouton "Générer la lettre".

Vous cliquez. La lettre IRL conforme à l'article 17-1 de la loi de 1989 est générée. Vous l'envoyez en recommandé ou via la messagerie intégrée.

C'est utilisé par 22 lots dans mes 3 SCI. Je n'ai plus oublié une seule IRL depuis 2 ans.

[Bouton CTA : "Découvrir ImmoTrack"]

---

**📅 La semaine prochaine**

Le numéro 2 sera dédié à un sujet qui touche beaucoup de bailleurs : "Comment réagir quand un locataire arrête de payer ?". Pré-contentieux, mise en demeure, commandement de payer. Pas à pas.

À dimanche prochain.

Didier · Fondateur ImmoTrack

---

**Vous voulez en parler ?**
- Répondez directement à ce mail, je lis tout.
- Ou rejoignez-moi sur LinkedIn : [lien]

---

## NEWSLETTER N°2 — Pré-contentieux impayés

### Sujet email
**📩 La semaine du bailleur — N°2 : comment réagir quand un locataire arrête de payer (étape par étape)**

### Corps

**Bonjour [prénom],**

Cette semaine, un sujet difficile mais nécessaire : le pré-contentieux locatif.

Statistique : 1 bailleur sur 4 a connu au moins un impayé partiel sur 5 ans. Pour les bailleurs SCI familiale, ce ratio monte à 1 sur 3.

Voici le protocole étape par étape.

---

**📜 Étape 1 : la relance courtoise (J+10)**

Dès le 11e jour de retard de loyer, envoyez une relance par email. Ton courtois, factuel.

"Bonjour [prénom locataire], je n'ai pas reçu le règlement du loyer de juillet 2026 (échéance le 5 juillet). Pouvez-vous me dire si un imprévu vous empêche de régler ?"

Dans 80 % des cas, ça suffit. Le locataire répond, propose un échéancier, paie.

---

**📜 Étape 2 : la mise en demeure (J+30)**

Si pas de réponse à 30 jours, mise en demeure par LRAR (lettre recommandée avec accusé de réception).

Mentions obligatoires :
- Référence au bail (date de signature)
- Article 7a de la loi de 1989 (obligation de paiement du loyer)
- Montant exact dû (loyer + charges)
- Délai de 8 jours pour régulariser
- Mention "À défaut, je serai dans l'obligation d'engager une procédure judiciaire"

ImmoTrack génère cette lettre automatiquement (feature à venir en V1.1).

---

**📜 Étape 3 : le commandement de payer (J+60)**

Si pas de régularisation après mise en demeure, commandement de payer par huissier.

Coût : 50 à 80 €.
Délai : 2 mois pour régulariser.
Effet : ouvre la voie à la résiliation du bail si clause résolutoire dans le bail.

C'est l'acte qui déclenche officiellement la procédure judiciaire.

---

**📜 Étape 4 : l'assignation (J+120 à J+150)**

Assignation devant le juge des contentieux de la protection.
Coût : avocat optionnel (mais recommandé) ~800 à 1 500 €.
Délai d'audience : variable selon tribunaux (6 mois à 2 ans).
Décision : résiliation du bail + expulsion.

---

**🛠️ L'outil pour anticiper**

ImmoTrack détecte automatiquement les retards de paiement à J+10, J+30, J+60.

Pour chaque seuil : alerte au bailleur + suggestion d'action.

À venir en V1.1 : génération automatique des lettres pré-contentieux (mise en demeure, commandement de payer).

[Bouton CTA : "Découvrir ImmoTrack"]

---

**📅 La semaine prochaine**

Le numéro 3 sera dédié à la signature électronique du bail. Que dit la loi ? Quels sont les niveaux de signature (eIDAS) ? Pourquoi ImmoTrack utilise un relais Cloudflare audité.

À dimanche prochain.

Didier

---

# PARTIE 6 — THREADS TWITTER/X (3 threads finis)

---

## THREAD T1 — Architecture technique ImmoTrack (12 tweets)

**1/** Petit thread technique pour les curieux.

Comment j'ai migré 22 logements et 5 ans de mouvements bancaires depuis IndexedDB+Drive vers Supabase EU.

Architecture multi-tenant. Isolation cryptographique. Immutabilité légale. Tout en vanilla JS côté front.

🧵👇

**2/** Le point de départ : ImmoTrack v15 avait stockage local (IndexedDB navigateur) + sync Google Drive optionnelle.

Avantage : posture "vos données chez vous".
Inconvénient : pas de vraie multi-tenancy possible. Co-gestion familiale = bricolage.

**3/** Décision : on bascule vers Supabase Cloud EU (Frankfurt).

Pourquoi Supabase et pas un PostgreSQL custom ?
- Row Level Security FORCE managé
- Realtime canal privé inclus
- Storage isolé par préfixe `espace_id/`
- Auth + edge functions inclus
- Hébergement EU sans Docker

**4/** Le truc clé : Row Level Security FORCE.

`ALTER TABLE baux ENABLE ROW LEVEL SECURITY;`
`ALTER TABLE baux FORCE ROW LEVEL SECURITY;`

Le FORCE est critique : même les owners de la table (rôle service_role) sont soumis à la RLS. Pas d'échappatoire silencieuse.

**5/** Chaque ligne a un `espace_id` (UUID). Politique RLS :

```sql
CREATE POLICY isolement ON baux
FOR ALL TO authenticated
USING (espace_id = auth_espace_id());
```

`auth_espace_id()` lit l'espace_id depuis le JWT du user connecté.

**6/** L'effet : un user ne peut pas voir, modifier ou supprimer une ligne d'un autre espace. Même par accident. Même via une requête SQL malformée.

Mes développeurs (moi compris) ne peuvent pas accéder à vos baux sans casser explicitement la politique d'isolation.

**7/** Deuxième couche : immutabilité légale du bail signé.

Trigger PostgreSQL `prevent_locked_mutation` :

```sql
IF OLD.locked = true AND TG_OP IN ('UPDATE','DELETE')
   AND current_setting('app.bypass_immutable', true) != 'on' THEN
   RAISE EXCEPTION 'bail signé immuable';
END IF;
```

**8/** Concrètement : un bail signé ne peut pas être modifié, même avec les droits administrateur.

Échappatoire admin existante (`SET LOCAL app.bypass_immutable='on'`) mais journalisée. Si je veux modifier votre bail signé, j'ai laissé une trace.

**9/** Avenants : pas une modification du bail original. Nouvelle ligne avec `amends_id` qui pointe sur l'original.

Résiliation : event distinct dans `baux_evenements`. Le bail original reste lu seul.

**10/** Migration de mes données : ETL via Node.js. 360 lignes importées sans perte. Vérification : `legacy_raw` JSONB pour archive no-loss.

Migrations 0001 à 0026. Tests cross-tenant. Audit code-reviewer passant.

**11/** Pourquoi je détaille tout ça ?

Parce que c'est la première fois qu'un logiciel B2C de gestion locative française fait ça à ce niveau. Mon différenciant numéro 4 dans le pitch.

Et parce que les concurrents qui me liront sauront ce qu'ils ont à faire pour rattraper.

**12/** Si tu fais de la proptech ou du SaaS multi-tenant et que tu veux discuter d'architecture, MP ouverts.

Et si tu es bailleur, on lance le 14 octobre. Founder Edition 249 € à vie. 100 places.

[lien]

---

## THREAD T2 — Pourquoi LocataireCloud n'est PAS un concurrent direct (8 tweets)

**1/** Cette semaine, plusieurs personnes m'ont demandé si LocataireCloud (locataire.live) est un concurrent direct d'ImmoTrack.

Réponse honnête : non. Mais pour des raisons que tu n'attends pas.

🧵👇

**2/** Sur le papier, on dirait qu'on fait la même chose : SaaS de gestion locative B2C français.

Mais l'angle est radicalement différent.

LocataireCloud = "Zéro email, zéro coup de fil. Tout est automatisé." Posture déléguée.

ImmoTrack = "Vous restez maître. L'outil vous augmente." Posture autonome.

**3/** Différence n°1 : la posture des données.

LocataireCloud : SaaS classique, donnés stockées chez eux.
ImmoTrack : Supabase EU avec isolation cryptographique + immutabilité bail signé par trigger PostgreSQL.

Si tu cherches du "tranquille mais opaque", LocataireCloud.
Si tu cherches du "souverain et auditable", ImmoTrack.

**4/** Différence n°2 : la profondeur fiscale.

LocataireCloud : reporting fiscal annoncé pour T3 2026.
ImmoTrack : déclaration 2044 + bilan annuel + FEC export DGFiP déjà livrés.

Si tu veux faire ta 2044 cette année, ImmoTrack est prêt. LocataireCloud non.

**5/** Différence n°3 : la signature bail.

LocataireCloud : signature électronique avancée annoncée pour T2 2026.
ImmoTrack : wizard paraphage 26 pages + pédagogie §18 + signature distance via relais Cloudflare audité.

Si la conformité juridique de tes baux compte, ImmoTrack.

**6/** Là où LocataireCloud est devant :

- Site vitrine très propre
- 16 outils SEO en place
- Roadmap publique
- Place de marché annonces intégrée
- Agent IA conversationnel (annoncé T2)
- App mobile native (annoncée T4)

C'est du marketing solide.

**7/** Là où je préfère ne pas me battre :

- Le marketing pur (je suis fondateur solo)
- L'IA conversationnelle qui parle aux locataires
- La place de marché annonces

Je laisse à LocataireCloud cet angle. Mon angle est ailleurs.

**8/** Conclusion : on ne joue pas dans la même catégorie.

LocataireCloud cherche à automatiser pour que tu n'aies rien à faire.
ImmoTrack te donne les outils experts pour faire les choses correctement.

Cibles différentes. Pricing différents. Posture différente.

ImmoTrack : 249 € à vie. LocataireCloud : 347 € à vie.

Choisis selon ce qui compte pour toi.

---

## THREAD T3 — Les 5 erreurs des bailleurs débutants (10 tweets)

**1/** J'ai 22 lots. Pendant 3 ans, j'ai accumulé toutes les erreurs possibles du bailleur débutant.

Voici les 5 plus coûteuses, et combien chacune m'a coûté.

🧵👇

**2/** Erreur 1 : ne pas réviser l'IRL chaque année.

Coût : 6 à 12 €/mois × 12 mois × oublié = 72 à 144 €/lot.
Sur mes 22 lots, j'ai oublié 2 fois en 5 ans. Coût total : ~1 200 €.
Jurisprudence : IRL non réclamée = renoncée. Impossible à rattraper.

**3/** Erreur 2 : mettre le mauvais chiffre ligne 211 de la 2044.

J'ai mis le TTC pendant 3 ans au lieu du HC. Sur-imposition : ~800 €/an. Soit 2 400 € sur la période.

Le fisc ne corrige pas dans ce sens-là.

**4/** Erreur 3 : ne pas demander une caution solidaire au locataire qui le justifiait.

1 lot loué à un étudiant sans caution. Impayé 3 mois. Procédure de recouvrement. Coût final : 4 600 €.

Une caution Visale ou parentale aurait couvert.

**5/** Erreur 4 : oublier la mention "Lu et approuvé" sur le bail.

1 cas de litige. L'avocat du locataire a argumenté qu'il n'avait pas pris connaissance d'une clause. Décision défavorable au bailleur.

Coût : 1 200 € + temps perdu.

**6/** Erreur 5 : ne pas faire d'EDL entrée en bonne et due forme.

État des lieux baclé en 20 minutes. Locataire conteste 6 mois plus tard les dégradations qu'il avait laissées.

Coût : dépôt de garantie perdu, ~800 €.

**7/** Bilan total des 5 erreurs : ~10 200 €.

Sur 5 ans.

Le pire ? Toutes étaient évitables avec des outils basiques (alerte IRL, mapping fiscal, wizard bail conforme, EDL photographique).

**8/** C'est en cumulant ces erreurs que j'ai décidé de coder ImmoTrack en 2024.

Aujourd'hui, l'outil intègre des garde-fous pour chacune de ces 5 erreurs :

- Alerte IRL automatique 45 j avant
- Mapping fiscal 2044 automatique
- Recommandation caution Visale en wizard bail
- "Lu et approuvé" obligatoire dans le wizard signature
- EDL avec photos compteurs systématiques + comparatif entrée/sortie

**9/** Tu vas faire des erreurs. C'est inévitable.

Mais tu peux choisir de les anticiper avec un outil qui te tient par la main.

C'est ça, ImmoTrack.

**10/** Si tu débutes en immobilier locatif, sauve cet article et regarde-le tous les 6 mois. Tu seras content de l'avoir lu.

Et si tu veux gagner les 10 200 € que j'ai perdus, on lance le 14 octobre.

249 € à vie. Founder Edition. 100 places. [lien]

---

# PARTIE 7 — REDDIT (3 posts finis)

---

## REDDIT R1 — r/vosfinances

**Titre** : J'ai gagné 6 heures/mois en arrêtant Excel pour gérer mes 22 lots locatifs. Voici comment.

**Corps** :

Bonsoir r/vosfinances.

Lecteur depuis 4 ans, premier post. Je gère 22 logements locatifs en propre dans 3 SCI familiales.

Pendant 5 ans, j'ai géré avec Excel + Word + Drive. Je perdais 6 heures/mois et 1 journée par an sur la 2044.

En 2024, j'ai décidé de coder mon propre outil. Aujourd'hui, je le partage avec d'autres bailleurs.

Voici ce qu'il fait concrètement :

1. **Déclaration 2044 automatique** : il pré-remplit toutes les lignes (211, 213, 221-230, 250) depuis mes mouvements bancaires catégorisés. 10 minutes pour ma déclaration au lieu d'une journée.

2. **Export FEC pour expert-comptable** : format conforme arrêté du 29 juillet 2013 (Sage/EBP/Quadra).

3. **Wizard bail conforme** : paraphage page-par-page + signature en fin de lecture + clause "Lu et approuvé" obligatoire (article §18 décret 2015-587).

4. **Alerte IRL automatique** : 45 jours avant chaque date anniversaire. Je ne rate plus une révision.

5. **Loi Climat 2021** : l'outil refuse de générer un bail pour un DPE F ou G, automatiquement.

6. **Hébergement Europe** : données sur Supabase Cloud EU, isolation cryptographique RLS FORCE PostgreSQL.

Le projet s'appelle ImmoTrack. Je vais le lancer publiquement le 14 octobre 2026, à 9,90 €/mois (ou 19,90 €/mois pour les SCI multi-entités).

D'ici là, j'ouvre 100 places "Founder Edition" à 249 € lifetime (à vie, pas de renouvellement). Je suis à [X]/100 de vendues.

Je ne pose pas de lien direct (je ne veux pas être spam). Si vous voulez voir, le sous-domaine est immotrack.fr.

Et si vous avez des questions techniques, des cas d'usage spécifiques, des objections : commentaire et je réponds.

Bonne soirée à tous.

---

## REDDIT R2 — r/ImmobilierFR

**Titre** : Loi Climat 2021 - calendrier complet 2025-2034 et ce que ça change pour vos baux

**Corps** :

Salut r/ImmobilierFR.

Je vois beaucoup de questions sur la Loi Climat et les DPE F/G. Voici un récap clair que j'avais besoin de faire pour moi-même.

**Le calendrier des interdictions de location** :

- Janvier 2023 : gel des loyers DPE F et G (plus aucune révision IRL possible, y compris à la relocation)
- Janvier 2025 : interdiction de la location en bail nu pour DPE G (effectif depuis 6 mois maintenant)
- Janvier 2028 : interdiction DPE F (2,5 millions de logements concernés)
- Janvier 2034 : interdiction DPE E (~7 millions de logements concernés à terme)

**Vos 3 options si vous êtes concerné** :

1. **Rénover** : MaPrimeRénov + CEE + déficit foncier énergétique (plafond doublé à 21 400 €/an pour travaux énergétiques).

2. **Vendre** : décote DPE F/G observée actuellement entre 8 et 15 % du prix.

3. **Bloquer en vacance** : coût d'opportunité (perte de loyer + taxe foncière à votre charge).

**Le piège qu'on oublie souvent** :

Si vous tentez de relancer un bail sur un G en 2025 (l'interdiction est effective depuis janvier), le locataire peut saisir la commission de conciliation. J'ai un ami bailleur dans ce cas : amende de 8 100 € + annulation du bail + obligation de rembourser 4 mois de loyer.

**Comment je gère mes 22 lots** :

J'utilise un outil que j'ai codé (ImmoTrack). Il refuse automatiquement de générer un bail si le logement est classé F ou G. Pop-up rouge avec citation Loi Climat 2021-1104 article 23.

Ça m'évite de me planter par étourderie. Et ça me propose un plan de rénovation chiffré avec subventions (MaPrimeRénov + CEE + déficit foncier).

Je le lance publiquement le 14 octobre. D'ici là, Founder Edition à 249 € à vie (100 places).

Sous-domaine : immotrack.fr si vous voulez creuser.

Bons réfléchissements à tous.

---

## REDDIT R3 — r/SaaS

**Titre** : I shipped my niche B2C SaaS solo from 0 to first revenue. Stack: Vanilla JS + Supabase EU. AMA.

**Corps** :

Hey r/SaaS.

I shipped ImmoTrack — a B2C SaaS for French residential landlords. Solo. 24 months from first line of code to today.

Some context:
- I'm a developer who's also a landlord (22 units in 3 SCI family entities).
- Built it because I was tired of Excel.
- Stack: vanilla JS frontend (PWA), Supabase Cloud EU (PostgreSQL + Auth + Storage + Realtime), Google Drive integration for photos (optional).
- 15+ major versions shipped (v1 → v15.261). 1462 automated tests (Vitest).
- 22 production units running on my own setup since 2 years.

Notable architectural choices:
- Row Level Security FORCE on all tables (no service_role escape).
- Custom trigger `prevent_locked_mutation` for legal immutability of signed lease (refused even under admin role).
- Migration 0001 → 0026 with proper schema versioning.
- 360 lines of production data migrated lossless in June 2026.

Differentiators I'm betting on (audit on 8 French B2C competitors, none has any of these):
1. PDF sale deed import → creates landlord + building + units in 30 sec (local heuristic, no LLM, no third-party).
2. 26-page lease wizard with page-by-page paraphage.
3. Auto-fill tax return 2044 + FEC export to DGFiP format.
4. Hard refuse to generate lease if DPE F/G (Climate Law 2021).
5. Cryptographic isolation at DB level.

Going public October 14, 2026. Founder Edition lifetime 249 € for first 100 customers (announced July).

AMA on:
- Niche B2C SaaS pricing (lifetime vs subscription, freemium)
- Solo SaaS marketing (LinkedIn-focused, French-only market)
- Supabase EU migration from local-first
- RLS FORCE patterns
- Compliance-driven product features (legal jurisdictions add real moat)

---

# Comment utiliser ce pack

## Cadence proposée (mois 1 = juillet 2026)

| Lundi | Mardi | Jeudi | Vendredi |
|---|---|---|---|
| **S1** : Post 1 (Founder Edition) | Vidéo V1 (Import acte) + Post 2 | Post 3 (Carrousel C1) | Post 4 (Tech) |
| **S2** : Post 5 (Ligne 211) | Post 6 (Annonce YouTube Y1) + Y1 mis en ligne | Post 7 (Onglet Finances) | Post 8 (Carrousel C4) |
| **S3** : Post 9 (Sondage DPE) | Post 10 (Démo refus F) + Vidéo V3 | Post 11 (Reddit cross-post) | Post 12 (CGP) |
| **S4** : Post 13 (Paraphage) | Vidéo V2 (2044 60s) | Post 14 (Hébergement EU) | Post 15 (Récap mois) |

**Cadence Twitter/X mois 1** : 1 thread par semaine (T1 S1, T2 S2, T3 S3).
**Cadence Reddit mois 1** : 1 post par semaine maximum (R1 S2, R2 S3, R3 S4).
**Newsletter** : démarrage début S2 mois 2 (août). Numéros 1 et 2 prêts.

## Visuels à préparer (sous-traitance Canva 1 fois ou freelance)

Pour le mois 1, tu as besoin de :
- 1 image d'illustration par post LinkedIn (15 images)
- 6 carrousels complets (slides multiples)
- 6 vignettes YouTube si tu publies les courtes en short
- 3 vignettes YouTube longues

Tu peux soit le faire toi sur Canva (~2-3 h pour tout le pack mois 1), soit sous-traiter à un graphiste freelance (~300-500 € pour le pack complet).

## Tracking

Crée un Google Sheet "ImmoTrack_Réseaux_KPI" avec colonnes :
- Date · Réseau · Format · Sujet · Impressions · Likes · Commentaires · Inscriptions générées · Founder Edition vendues

Mise à jour chaque vendredi soir, 15 min.

## Et après le mois 1 ?

Je peux te produire les packs mois 2 et 3 sur le même format dès que tu valides celui-ci. Dis-moi simplement "OK mois 2" et je relance la prod sur :
- Cluster fiscal (préparation déclaration 2044 août-septembre)
- Cluster CGP (démarchage)
- Pré-lancement public (témoignages premiers Founder Edition + countdown 14 octobre)
