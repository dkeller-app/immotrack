/**
 * PREMIERS PAS — module pur js/core/premiers-pas.js (CDC docs/CDC-PREMIERS-PAS.md, GO Didier 15/10/2026, D1 → D15).
 *   E  étapes de la liste, ordre, détection sur les données (jamais une case cochée à la main)
 *   V  qui voit la liste (D11), qui reçoit la visite automatique (D1)
 *   P  progression enregistrée : dates premières, « avant », repli à 7 jours (D10), masquer (D5)
 *   M  mesure : opposition (D6) — on ne garde alors que ce qui sert à l'écran
 *   T  visite : textes, transitions (passer, terminer, reprendre, relancer)
 *   B  placement de la bulle (jamais sur la barre du bas, jamais sur la zone)
 *   S  statistiques de la bêta (le script compte ce qui existe, aucun nombre de testeurs figé)
 */
import { describe, it, expect } from 'vitest'
import * as PP from '../../js/core/premiers-pas.js'

const T0 = '2026-12-02T09:00:00.000Z'
const T1 = '2026-12-03T10:00:00.000Z'
const jours = (iso, n) => new Date(Date.parse(iso) + n * 864e5).toISOString()
const vide = () => ({ entites: [], logements: [], baux: {}, mouvements: [], importRules: [], artisans: [], params: {} })
const ext0 = { cloud: false }
function rempli(over = {}) {
  return Object.assign(vide(), {
    entites: [{ id: 1, nom: 'SCI Les Tanneurs', type: 'SCI IR' }, { id: 2, nom: 'Camille Mercier', type: 'Personne physique' }],
    logements: [{ ref: 'A1', entity: 'SCI Les Tanneurs' }],
    baux: { A1: { debut: '2026-01-01', entity: 'SCI Les Tanneurs' } },
    mouvements: [{ id: 1, _source: 'bank_import', date: '2026-11-03' }],
  }, over)
}
const ids = (e) => e.liste.map((x) => x.id)
const step = (e, id) => e.liste.find((x) => x.id === id)

describe('E · étapes, ordre, détection', () => {
  it('E-1 compte vide, hors cloud : 6 étapes dans l\'ordre du CDC (dû, payé, règle, distinctions), rien de fait', () => {
    const e = PP.etapesPremiersPas(vide(), ext0)
    expect(ids(e)).toEqual(['logement', 'bail', 'releve', 'regle', 'plafond', 'artisan'])
    expect(e.faits).toBe(0); expect(e.total).toBe(6); expect(e.fini).toBe(false)
    expect(e.suivante.id).toBe('logement')
  })
  it('E-2 cloud : l\'espace locataire s\'insère après la règle, l\'associé n\'apparaît qu\'avec une SCI', () => {
    expect(ids(PP.etapesPremiersPas(vide(), { cloud: true }))).toEqual(['logement', 'bail', 'releve', 'regle', 'espace', 'plafond', 'artisan'])
    expect(ids(PP.etapesPremiersPas(rempli(), { cloud: true }))).toEqual(['logement', 'bail', 'releve', 'regle', 'espace', 'plafond', 'artisan', 'associe'])
  })
  it('E-3 une tombstone ne compte pas ; un logement archivé compte (il a été ajouté)', () => {
    const D = vide(); D.logements = [{ ref: 'X', _deleted: true }]
    expect(step(PP.etapesPremiersPas(D, ext0), 'logement').fait).toBe(false)
    D.logements.push({ ref: 'Y', archived: true })
    expect(step(PP.etapesPremiersPas(D, ext0), 'logement').fait).toBe(true)
  })
  it('E-4 bail : n\'importe quel bail vivant de DB.baux (bail repris compris) ; un bail supprimé ne compte pas', () => {
    const D = vide(); D.baux = { A1: { _deleted: true } }
    expect(step(PP.etapesPremiersPas(D, ext0), 'bail').fait).toBe(false)
    D.baux['B@@2'] = { typeContrat: 'repris' }
    expect(step(PP.etapesPremiersPas(D, ext0), 'bail').fait).toBe(true)
  })
  it('E-5 relevé : seulement un mouvement importé de la banque (_source bank_import), pas une saisie', () => {
    const D = vide(); D.mouvements = [{ id: 1, montant: 10 }]
    expect(step(PP.etapesPremiersPas(D, ext0), 'releve').fait).toBe(false)
    D.mouvements.push({ id: 2, _source: 'bank_import', _deleted: true })
    expect(step(PP.etapesPremiersPas(D, ext0), 'releve').fait).toBe(false)
    D.mouvements.push({ id: 3, _source: 'bank_import' })
    expect(step(PP.etapesPremiersPas(D, ext0), 'releve').fait).toBe(true)
  })
  it('E-6 règle d\'import (D15) : au moins une règle vivante (Propryo n\'en livre aucune toute faite)', () => {
    const D = vide(); D.importRules = [{ id: 'r1', _deleted: true }]
    expect(step(PP.etapesPremiersPas(D, ext0), 'regle').fait).toBe(false)
    D.importRules.push({ id: 'r2', mots: ['LOYER'] })
    expect(step(PP.etapesPremiersPas(D, ext0), 'regle').fait).toBe(true)
  })
  it('E-7 plafond : validé une fois (valideLe) sur une structure vivante ; un plafond non validé ne compte pas', () => {
    const D = rempli(); D.entites[0].incidentReglages = { plafondTtc: 300, valideLe: null }
    expect(step(PP.etapesPremiersPas(D, ext0), 'plafond').fait).toBe(false)
    D.entites[0].incidentReglages.valideLe = T0
    expect(step(PP.etapesPremiersPas(D, ext0), 'plafond').fait).toBe(true)
  })
  it('E-8 artisan : les fiches créées par la migration automatique du carnet ne comptent pas', () => {
    const D = vide(); D.artisans = [{ id: 1, nom: 'Plomberie', source: 'migration' }]
    expect(step(PP.etapesPremiersPas(D, ext0), 'artisan').fait).toBe(false)
    D.artisans.push({ id: 2, nom: 'Élec', source: 'libre', _deleted: true })
    expect(step(PP.etapesPremiersPas(D, ext0), 'artisan').fait).toBe(false)
    D.artisans.push({ id: 3, nom: 'Chauffage', source: 'annuaire' })
    expect(step(PP.etapesPremiersPas(D, ext0), 'artisan').fait).toBe(true)
  })
  it('E-9 espace locataire : après le bail (bloqué sans bail), fait dès qu\'un accès est émis', () => {
    const sansBail = PP.etapesPremiersPas(vide(), { cloud: true, accesLocataire: 0 })
    expect(step(sansBail, 'espace').bloque).toBe(true)
    const e = PP.etapesPremiersPas(rempli(), { cloud: true, accesLocataire: 0 })
    expect(step(e, 'espace').bloque).toBe(false); expect(step(e, 'espace').fait).toBe(false)
    expect(step(PP.etapesPremiersPas(rempli(), { cloud: true, accesLocataire: 2 }), 'espace').fait).toBe(true)
    // nombre encore inconnu (lecture différée pas revenue) = pas fait, jamais une erreur
    expect(step(PP.etapesPremiersPas(rempli(), { cloud: true, accesLocataire: null }), 'espace').fait).toBe(false)
  })
  it('E-10 la prochaine étape saute une étape bloquée', () => {
    const D = vide(); D.logements = [{ ref: 'A' }]; D.mouvements = [{ _source: 'bank_import' }]; D.importRules = [{ id: 1 }]
    const e = PP.etapesPremiersPas(D, { cloud: true, accesLocataire: 0 })
    expect(e.suivante.id).toBe('bail')
  })
  it('E-11 associé : SCI reconnue par le type (mot entier « SCI » ou « société civile »), fait dès une invitation', () => {
    expect(PP.estSCI('SCI IR')).toBe(true)
    expect(PP.estSCI('sci à l\'IS')).toBe(true)
    expect(PP.estSCI('Société civile immobilière')).toBe(true)
    expect(PP.estSCI('Societe civile')).toBe(true)
    expect(PP.estSCI('Personne physique')).toBe(false)
    expect(PP.estSCI('SCIENCES')).toBe(false)
    expect(PP.estSCI(null)).toBe(false)
    expect(step(PP.etapesPremiersPas(rempli(), { cloud: true, invitations: 1 }), 'associe').fait).toBe(true)
  })
  it('E-12 tout fait → fini, aucune prochaine étape', () => {
    const D = rempli({ importRules: [{ id: 1 }], artisans: [{ id: 1, source: 'libre' }] })
    D.entites[0].incidentReglages = { valideLe: T0 }
    const e = PP.etapesPremiersPas(D, { cloud: true, accesLocataire: 1, invitations: 1 })
    expect(e.fini).toBe(true); expect(e.suivante).toBe(null); expect(e.faits).toBe(e.total)
  })
  it('E-13 multi-espaces : seules les données de l\'espace propre comptent (une SCI partagée par un autre ne coche rien)', () => {
    const D = vide()
    D.entites = [{ id: 9, nom: 'SCI Autre', type: 'SCI', _espaceId: 'E2' }]
    D.logements = [{ ref: 'Z', _espaceId: 'E2' }]
    const e = PP.etapesPremiersPas(D, { cloud: true, espacePropre: 'E1' })
    expect(step(e, 'logement').fait).toBe(false)
    expect(ids(e)).not.toContain('associe')
    D.logements.push({ ref: 'P', _espaceId: 'E1' })
    expect(step(PP.etapesPremiersPas(D, { cloud: true, espacePropre: 'E1' }), 'logement').fait).toBe(true)
  })
  it('E-14 libellés : complets, courts sur la pastille, infinitif (ton neutre), chaque étape a son action', () => {
    for (const x of PP.ETAPES) {
      expect(x.titre).toMatch(/^[A-ZÉ]/)
      expect(x.court.length).toBeLessThanOrEqual(18)
      expect(x.cta.length).toBeGreaterThan(3)
      expect(`${x.titre} ${x.sous} ${x.cta}`).not.toMatch(/\b(tu|ton|ta|tes|vous|votre|vos)\b/i)
      expect(`${x.titre} ${x.sous}`).not.toMatch(/…|\.\.\./)
    }
  })
})

describe('V · qui voit la liste, qui reçoit la visite', () => {
  it('V-1 compte neuf (aucune structure) : liste visible', () => {
    expect(PP.listeVisible(vide(), {})).toBe(true)
  })
  it('V-2 D11 : associé invité sans structure propre → pas de liste', () => {
    const D = vide(); D.entites = [{ nom: 'SCI Autre', _espaceId: 'E2' }]
    expect(PP.listeVisible(D, { espacePropre: 'E1' })).toBe(false)
    D.entites.push({ nom: 'Moi', _espaceId: 'E1' })
    expect(PP.listeVisible(D, { espacePropre: 'E1' })).toBe(true)
  })
  it('V-3 D1 : première évaluation sans logement → visite à proposer ; avec logements → pas de visite automatique', () => {
    const neuf = PP.initialiser(vide(), ext0, T0)
    expect(neuf.visite.etat).toBe('a_proposer'); expect(PP.doitLancerVisite(neuf)).toBe(true)
    const ancien = PP.initialiser(rempli(), ext0, T0)
    expect(ancien.visite.etat).toBe('non_proposee'); expect(PP.doitLancerVisite(ancien)).toBe(false)
  })
  it('V-4 compte existant : les étapes déjà faites à la première évaluation sont marquées « avant » (exclues des statistiques)', () => {
    const pp = PP.initialiser(rempli(), ext0, T0)
    expect(pp.etapes.logement).toEqual({ le: T0, avant: true })
    expect(pp.etapes.releve).toEqual({ le: T0, avant: true })
    expect(pp.etapes.plafond).toBeUndefined()
    expect(pp.v).toBe(PP.VERSION); expect(pp.creeLe).toBe(T0); expect(pp.mesure).toBe(true)
  })
})

describe('P · progression', () => {
  it('P-1 date PREMIÈRE de chaque étape : posée une fois, jamais réécrite', () => {
    let pp = PP.initialiser(vide(), ext0, T0)
    const D = vide(); D.logements = [{ ref: 'A' }]
    let r = PP.majProgression(pp, PP.etapesPremiersPas(D, ext0), T1)
    expect(r.change).toBe(true); expect(r.pp.etapes.logement).toEqual({ le: T1 })
    r = PP.majProgression(r.pp, PP.etapesPremiersPas(D, ext0), jours(T1, 3))
    expect(r.change).toBe(false); expect(r.pp.etapes.logement.le).toBe(T1)
  })
  it('P-2 n\'écrit rien quand rien ne change (pas d\'enregistrement à chaque affichage)', () => {
    const pp = PP.initialiser(vide(), ext0, T0)
    const r = PP.majProgression(pp, PP.etapesPremiersPas(vide(), ext0), T1)
    expect(r.change).toBe(false); expect(r.pp).toBe(pp)
  })
  it('P-3 ne mute pas l\'objet reçu', () => {
    const pp = PP.initialiser(vide(), ext0, T0); const copie = JSON.parse(JSON.stringify(pp))
    const D = vide(); D.logements = [{ ref: 'A' }]
    PP.majProgression(pp, PP.etapesPremiersPas(D, ext0), T1)
    expect(pp).toEqual(copie)
  })
  it('P-4 toutes faites → termineLe posé une fois ; liste repliée 7 jours après (D10)', () => {
    const D = rempli({ importRules: [{ id: 1 }], artisans: [{ id: 1, source: 'libre' }] }); D.entites[0].incidentReglages = { valideLe: T0 }
    const e = PP.etapesPremiersPas(D, ext0)
    const r = PP.majProgression(PP.initialiser(vide(), ext0, T0), e, T1)
    expect(r.pp.termineLe).toBe(T1)
    expect(PP.doitAfficherListe(r.pp, e, jours(T1, 6.9))).toBe(true)
    expect(PP.doitAfficherListe(r.pp, e, jours(T1, 7.1))).toBe(false)
    expect(PP.majProgression(r.pp, e, jours(T1, 2)).pp.termineLe).toBe(T1)
  })
  it('P-5 compte existant DÉJÀ complet à la première évaluation : aucune liste à montrer', () => {
    const D = rempli({ importRules: [{ id: 1 }], artisans: [{ id: 1, source: 'libre' }] }); D.entites[0].incidentReglages = { valideLe: T0 }
    const e = PP.etapesPremiersPas(D, ext0)
    const pp = PP.initialiser(D, ext0, T0)
    expect(pp.termineLe).toBe(T0)
    expect(PP.doitAfficherListe(pp, e, T0)).toBe(false)
  })
  it('P-6 masquer / afficher (Mon profil) ; masquer n\'arrête pas la mesure', () => {
    const pp = PP.initialiser(vide(), ext0, T0); const e = PP.etapesPremiersPas(vide(), ext0)
    const m = PP.masquer(pp, T1)
    expect(m.masqueLe).toBe(T1); expect(PP.doitAfficherListe(m, e, T1)).toBe(false); expect(m.mesure).toBe(true)
    expect(PP.doitAfficherListe(PP.afficher(m), e, T1)).toBe(true)
  })
  it('P-7 « Afficher » après le repli des 7 jours rouvre bien la liste', () => {
    const D = rempli({ importRules: [{ id: 1 }], artisans: [{ id: 1, source: 'libre' }] }); D.entites[0].incidentReglages = { valideLe: T0 }
    const e = PP.etapesPremiersPas(D, ext0)
    const pp = PP.initialiser(D, ext0, T0)
    const a = PP.afficher(pp, jours(T0, 30))
    expect(PP.doitAfficherListe(a, e, jours(T0, 31))).toBe(true)
  })
  it('P-8 pas de progression → pas de liste (attendre la première évaluation)', () => {
    expect(PP.doitAfficherListe(null, PP.etapesPremiersPas(vide(), ext0), T0)).toBe(false)
  })
})

describe('M · mesure et opposition (D6)', () => {
  it('M-1 opposition : dates des étapes, date de création et compteur de relances effacés ; le fonctionnement reste', () => {
    let pp = PP.initialiser(rempli(), ext0, T0)
    pp = PP.visiteRelancer(pp, T1)
    const o = PP.reglerMesure(pp, false)
    expect(o.mesure).toBe(false); expect(o.etapes).toEqual({}); expect(o.creeLe).toBeUndefined()
    expect(o.visite.relances).toBeUndefined(); expect(o.visite.le).toBeUndefined()
    expect(o.visite.etat).toBe('en_cours')
  })
  it('M-2 opposition : plus aucune date n\'est enregistrée ensuite, mais le repli à 7 jours fonctionne', () => {
    const o = PP.reglerMesure(PP.initialiser(vide(), ext0, T0), false)
    const D = rempli({ importRules: [{ id: 1 }], artisans: [{ id: 1, source: 'libre' }] }); D.entites[0].incidentReglages = { valideLe: T0 }
    const r = PP.majProgression(o, PP.etapesPremiersPas(D, ext0), T1)
    expect(r.pp.etapes).toEqual({}); expect(r.pp.termineLe).toBe(T1)
  })
  it('M-3 reprise de la mesure : déjà fait = « avant », la suite est datée normalement', () => {
    const o = PP.reglerMesure(PP.initialiser(rempli(), ext0, T0), false)
    const m = PP.reglerMesure(o, true, PP.etapesPremiersPas(rempli(), ext0), T1)
    expect(m.mesure).toBe(true)
    // étapes déjà faites au retour : « avant » (pas de faux départ dans les statistiques)
    expect(m.etapes.logement).toEqual({ le: T1, avant: true })
    expect(m.etapes.plafond).toBeUndefined()
    const D = rempli(); D.entites[0].incidentReglages = { valideLe: T1 }
    const r = PP.majProgression(m, PP.etapesPremiersPas(D, ext0), jours(T1, 1))
    expect(r.pp.etapes.plafond).toEqual({ le: jours(T1, 1) })
    expect(r.pp.etapes.logement.avant).toBe(true)
  })
})

describe('T · visite', () => {
  it('T-1 une bulle d\'accueil + 6 étapes, textes du CDC, ton neutre, aucune troncature', () => {
    expect(PP.VISITE.map((v) => v.k)).toEqual(['intro', 'presse', 'biens', 'espace', 'incident', 'edl', 'candidats'])
    for (const v of PP.VISITE) {
      const t = `${v.titre} ${v.txt} ${v.txtTel || ''}`
      expect(t).not.toMatch(/\b(tu|ton|ta|tes|vous|votre|vos)\b/i)
      expect(t).not.toMatch(/…|\.\.\./)
    }
    expect(PP.VISITE.find((v) => v.k === 'biens').txt).toMatch(/DPE par son numéro/)
    expect(PP.VISITE.filter((v) => v.ia).map((v) => v.k)).toEqual(['incident', 'edl'])
  })
  it('T-2 passer → « passee », plus jamais relancée seule ; terminer → « finie »', () => {
    let pp = PP.initialiser(vide(), ext0, T0)
    pp = PP.visiteEtape(pp, 2, T1)
    expect(pp.visite).toMatchObject({ etat: 'en_cours', etape: 2 })
    expect(PP.doitLancerVisite(pp)).toBe(true)
    const p = PP.visiteFin(pp, 'passee', T1)
    expect(p.visite).toMatchObject({ etat: 'passee', etape: 2, le: T1 }); expect(PP.doitLancerVisite(p)).toBe(false)
    expect(PP.visiteFin(pp, 'finie', T1).visite.etat).toBe('finie')
  })
  it('T-3 reprise : une visite interrompue reprend à la même étape', () => {
    const pp = PP.visiteEtape(PP.initialiser(vide(), ext0, T0), 4, T1)
    expect(PP.etapeDeReprise(pp)).toBe(4)
    expect(PP.etapeDeReprise(PP.initialiser(vide(), ext0, T0))).toBe(0)
  })
  it('T-4 relance (Paramètres) : repart de l\'étape 1, compte les relances', () => {
    let pp = PP.visiteFin(PP.initialiser(vide(), ext0, T0), 'passee', T0)
    pp = PP.visiteRelancer(pp, T1)
    expect(pp.visite).toMatchObject({ etat: 'en_cours', etape: 1, relances: 1 })
    expect(PP.visiteRelancer(pp, T1).visite.relances).toBe(2)
  })
  it('T-5 bornes : une étape hors de la visite est ramenée dans [0, 6]', () => {
    const pp = PP.initialiser(vide(), ext0, T0)
    expect(PP.visiteEtape(pp, 99, T1).visite.etape).toBe(6)
    expect(PP.visiteEtape(pp, -3, T1).visite.etape).toBe(0)
  })
})

describe('B · placement de la bulle', () => {
  const vue = { l: 1280, h: 900 }
  it('B-1 PC, cible dans la barre latérale : à droite, centrée verticalement, flèche à gauche', () => {
    const p = PP.placerBulle({ cible: { left: 10, top: 200, width: 200, height: 40 }, bulle: { width: 380, height: 220 }, vue, tel: false })
    expect(p.cote).toBe('droite'); expect(p.left).toBe(226)
    expect(p.top).toBe(110)
  })
  it('B-2 cible large en haut : dessous ; cible en bas : dessus — jamais sur la zone', () => {
    const c = { left: 240, top: 80, width: 1000, height: 100 }
    const p = PP.placerBulle({ cible: c, bulle: { width: 380, height: 220 }, vue, tel: false })
    expect(p.cote).toBe('dessous'); expect(p.top).toBeGreaterThanOrEqual(c.top + c.height)
    const b = { left: 240, top: 700, width: 1000, height: 150 }
    const q = PP.placerBulle({ cible: b, bulle: { width: 380, height: 220 }, vue, tel: false })
    expect(q.cote).toBe('dessus'); expect(q.top + 220).toBeLessThanOrEqual(b.top)
  })
  it('B-3 téléphone : pleine largeur à 12 px, jamais sur la barre du bas', () => {
    const tel = { l: 390, h: 844 }
    const barre = { top: 787, height: 57 }
    const p = PP.placerBulle({ cible: { left: 20, top: 640, width: 350, height: 90 }, bulle: { width: 366, height: 260 }, vue: tel, barreBas: barre, tel: true })
    expect(p.left).toBe(12)
    expect(p.top + 260).toBeLessThanOrEqual(barre.top)
    expect(p.cote).toBe('dessus')
    // cible = un bouton de la barre du bas : la bulle se pose au-dessus de la barre
    const q = PP.placerBulle({ cible: { left: 80, top: 790, width: 70, height: 50 }, bulle: { width: 366, height: 260 }, vue: tel, barreBas: barre, tel: true })
    expect(q.top + 260).toBeLessThanOrEqual(barre.top)
  })
  it('B-4 bulle toujours dans l\'écran (marge 12 px)', () => {
    const p = PP.placerBulle({ cible: { left: 1200, top: 850, width: 60, height: 40 }, bulle: { width: 380, height: 300 }, vue, tel: false })
    expect(p.left).toBeGreaterThanOrEqual(12); expect(p.left + 380).toBeLessThanOrEqual(1280 - 12)
    expect(p.top).toBeGreaterThanOrEqual(12)
  })
  it('B-5 la flèche reste dans la bulle et vise le centre de la cible', () => {
    const p = PP.placerBulle({ cible: { left: 500, top: 80, width: 100, height: 40 }, bulle: { width: 380, height: 220 }, vue, tel: false })
    expect(p.flecheDecalage).toBeGreaterThanOrEqual(16); expect(p.flecheDecalage).toBeLessThanOrEqual(380 - 30)
    expect(Math.abs(p.left + p.flecheDecalage + 7 - 550)).toBeLessThanOrEqual(1)
  })
})

describe('S · statistiques de la bêta', () => {
  const ligne = (email, inscritLe, pp) => ({ email, inscritLe, pp })
  it('S-1 compte ce qui existe : inscrits, visite, mise en route complète, par étape (hors « avant »), délai médian', () => {
    const D = rempli({ importRules: [{ id: 1 }], artisans: [{ id: 1, source: 'libre' }] }); D.entites[0].incidentReglages = { valideLe: T0 }
    let complet = PP.initialiser(vide(), ext0, T0)
    complet = PP.majProgression(complet, PP.etapesPremiersPas(D, ext0), jours(T0, 4)).pp
    complet = PP.visiteFin(complet, 'finie', T0)
    let partiel = PP.initialiser(vide(), ext0, T0)
    const P = vide(); P.logements = [{ ref: 'A' }]
    partiel = PP.majProgression(partiel, PP.etapesPremiersPas(P, ext0), jours(T0, 1)).pp
    partiel = PP.visiteFin(partiel, 'passee', T0)
    const ancien = PP.initialiser(rempli(), ext0, T0)
    const s = PP.statsPremiersPas([
      ligne('a@x.fr', T0, complet), ligne('b@x.fr', T0, partiel), ligne('c@x.fr', T0, null), ligne('d@x.fr', T0, ancien),
      ligne('e@x.fr', T0, PP.reglerMesure(PP.initialiser(vide(), ext0, T0), false)),
    ])
    expect(s.inscrits).toBe(5)
    expect(s.sansDonnees).toBe(1)
    expect(s.opposition).toBe(1)
    expect(s.visite).toEqual({ finie: 1, passee: 1, en_cours: 0, a_proposer: 0, non_proposee: 1 })
    expect(s.miseEnRouteComplete).toBe(1)
    expect(s.parEtape.logement).toBe(2)       // complet + partiel ; l'ancien est « avant »
    expect(s.parEtape.releve).toBe(1)
    expect(s.delaiMedianJours).toBe(4)
  })
  it('S-2 aucune ligne → zéros, jamais d\'erreur', () => {
    const s = PP.statsPremiersPas([])
    expect(s.inscrits).toBe(0); expect(s.delaiMedianJours).toBe(null)
  })
})
