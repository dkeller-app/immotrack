# IRL-DPE-FG — Pas de révision IRL si bail en DPE F ou G (loi Climat 2021)

**Status** : ⬜ À faire · **Prio** : P1 · **Taille** : S
**Détecté** : 2026-04-28
**Lié à** : V3-REFONTE-IRL · IRL-VALIDATION · BUG-IRL-001

## Contexte
Depuis le **24 août 2022** (loi Climat & Résilience n° 2021-1104, art. 23 + décret n° 2022-945) :
**les logements classés F ou G en DPE ne peuvent plus bénéficier de la révision annuelle IRL**.
Le loyer reste figé tant que le DPE n'est pas remonté à E ou mieux.

S'applique à tout bail signé avec un DPE F ou G, et même aux baux antérieurs (dès leur date anniversaire post-24/08/2022).

**Calendrier des interdictions de location associées** (à connaître mais hors scope strict de ce sujet) :
- 1er janvier 2023 : G+ (conso > 450 kWh/m²/an) → interdits nouvelle location
- 1er janvier 2025 : G → interdits nouvelle location
- 1er janvier 2028 : F → interdits nouvelle location
- 1er janvier 2034 : E → interdits nouvelle location

ImmoTrack doit donc, lors d'une révision IRL :
1. Lire le DPE du logement (champ à ajouter si pas déjà présent)
2. Si DPE = F ou G → **bloquer la révision** (ou avertir avec confirmation explicite)
3. Idéalement : afficher dans le dashboard une alerte "Logement gelé en révision (DPE F/G)"

## Scope
- [ ] Vérifier que le champ DPE existe sur le logement (si non, l'ajouter : A à G + date diagnostic + validité 10 ans)
- [ ] Dans le calculateur IRL : check DPE avant calcul → si F/G, retourner 0 € de révision + message clair
- [ ] UI lettre IRL : ne pas générer si DPE F/G (ou générer avec mention "Loyer maintenu, logement classé F/G — gel loi Climat")
- [ ] Alerte dashboard : compter les logements F/G dans "Logements à risque" / "Loyers gelés"

## Décisions à prendre
- [ ] **Bloquer dur** la révision IRL si F/G, ou **avertir + permettre override manuel** ?
  - Recommandation : bloquer dur (la loi est claire, override = risque juridique)
- [ ] Date du DPE : prendre en compte la validité 10 ans ? Si DPE expiré, alerter pour le refaire avant la révision

## Notes utilisateur
> 💬 2026-04-28 : "IRL : si bail en DPE F & G pas d'IRL possible"

## Journal
- 2026-04-28 : créé · contrainte légale forte (loi Climat 2021-1104)
