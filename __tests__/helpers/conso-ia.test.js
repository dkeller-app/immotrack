// CONSO-IA — calculs purs de l'affichage (js/core/conso-ia.js).
import { describe, it, expect } from 'vitest'
import { lignes, etatGlobal, phraseEtat, messagePause, avertissement, syntheseAdmin, dateCourte, moisLong, euros, lirePlafond, enAffichage } from '../../js/core/conso-ia.js'

// Offre Investisseur : 90 min, 120 pages, 150 demandes, 60 factures (dictée en secondes en base).
const PLAF = { offre: 'investisseur', nom: 'Investisseur', sans_plafond: false, surcharge: false, dictee: 5400, pieces: 120, liens: 150, factures: 60, video: null }
const usage = (unites) => ({ mois: '2026-12-01', renouvellement: '2027-01-01', plafonds: PLAF, unites: { dictee: 0, pieces: 0, liens: 0, factures: 0, video: 0, ...unites } })

describe('dates et montants', () => {
  it('1er du mois, mois long, euros à la virgule', () => {
    expect(dateCourte('2027-01-01')).toBe('1er janvier')
    expect(dateCourte('2026-11-15')).toBe('15 novembre')
    expect(dateCourte('?')).toBe('le mois prochain')
    expect(moisLong('2026-12-01')).toBe('Décembre 2026')
    expect(euros(4550000)).toBe('4,55 €')
    expect(euros(null)).toBe('0,00 €')
  })
  it('dictée affichée en minutes arrondies au supérieur', () => {
    expect(enAffichage('dictee', 61)).toBe(2)
    expect(enAffichage('pieces', 3)).toBe(3)
  })
})

describe('lignes de l\'utilisateur', () => {
  it('maquette : 24 min sur 90 (≈ 8 EDL restants), 16 pages sur 120 (≈ 13 dossiers)', () => {
    const ls = lignes(usage({ dictee: 24 * 60, pieces: 16, liens: 9, factures: 3 }))
    expect(ls.map((l) => l.cle)).toEqual(['dictee', 'pieces', 'liens', 'factures'])   // vidéo absente (éteinte, jamais consommée)
    expect(ls[0]).toMatchObject({ utilise: 24, plafond: 90, pct: 27, etat: 'ok', gestes: '≈ 8 EDL dictés restants' })
    expect(ls[1]).toMatchObject({ utilise: 16, plafond: 120, pct: 13, gestes: '≈ 13 dossiers candidats restants' })
    expect(ls[2].gestes).toBe(null)
  })
  it('états : proche à 80 %, pause au plafond, sans plafond', () => {
    expect(lignes(usage({ dictee: 72 * 60 }))[0].etat).toBe('proche')
    expect(lignes(usage({ dictee: 90 * 60 }))[0]).toMatchObject({ etat: 'pause', pct: 100, gestes: '≈ 0 EDL dicté restant' })
    expect(lignes({ plafonds: { ...PLAF, sans_plafond: true }, unites: { dictee: 999999 } })[0]).toMatchObject({ etat: 'sans', pct: null, plafond: null })
    expect(lignes({ plafonds: { ...PLAF, factures: 0 }, unites: {} })[3]).toMatchObject({ etat: 'pause', pct: 100 })
  })
  it('état d\'un coup d\'œil : la famille la plus avancée', () => {
    expect(phraseEtat(usage({ dictee: 24 * 60, pieces: 16 }))).toEqual({ etat: 'ok', titre: 'Rien à signaler', texte: '27 % au plus, sur la dictée d’EDL.' })
    expect(phraseEtat(usage({ pieces: 100 })).etat).toBe('proche')
    expect(phraseEtat(usage({ pieces: 120 }))).toMatchObject({ etat: 'pause', titre: 'Lecture des pièces en pause' })
    expect(phraseEtat({ plafonds: { sans_plafond: true }, unites: {} }).titre).toBe('Sans plafond')
    expect(etatGlobal(usage({ liens: 140 }))).toMatchObject({ etat: 'proche', pct: 93, cle: 'liens' })
  })
})

describe('messages (ton neutre, jamais bloquant)', () => {
  it('pause : la saisie manuelle reste nommée', () => {
    const m = messagePause('dictee', '2027-01-01')
    expect(m.titre).toBe('Dictée en pause jusqu’au 1er janvier')
    expect(m.texte).toMatch(/saisie à la main reste disponible/)
    for (const k of ['dictee', 'pieces', 'factures', 'video', 'liens']) expect(messagePause(k, '2027-01-01').texte).not.toMatch(/\b(tu|vous|votre|ton)\b/i)
  })
  it('avertissement à 80 % seulement', () => {
    const [l] = lignes(usage({ dictee: 72 * 60 }))
    expect(avertissement(l, '2027-01-01')).toBe('80 % de la dictée du mois utilisés (72 sur 90 min). Remise à zéro le 1er janvier.')
    expect(avertissement(lignes(usage({ dictee: 60 }))[0], '2027-01-01')).toBe(null)
    expect(avertissement(lignes(usage({ dictee: 5400 }))[0], '2027-01-01')).toBe(null)
  })
})

describe('synthèse admin', () => {
  const DATA = {
    mois: '2026-12-01', aujourdhui: '2026-12-16',
    par_jour: [{ jour: '2026-12-01', cout: 120000, appels: 10 }, { jour: '2026-12-16', cout: 750000, appels: 40 }],
    par_fonction: [{ fonction: 'dictee', appels: 96, audio_sec: 612 * 60, cout: 1660000 }, { fonction: 'pieces', appels: 520, pages: 520, cout: 2290000 }],
    comptes: [
      { user_id: 'a', email: 'testeur-03@exemple.fr', cout: 940000, appels: 30, par_fonction: { dictee: 900000, pieces: 40000 }, plafonds: { nom: 'Bêta', dictee: 18000, pieces: 400, liens: 500, factures: 200, video: null }, unites: { dictee: 258 * 60, pieces: 40 } },
      { user_id: 'b', email: 'testeur-07@exemple.fr', cout: 1960000, appels: 400, par_fonction: { pieces: 1960000 }, plafonds: { nom: 'Bêta', dictee: 18000, pieces: 400, liens: 500, factures: 200 }, unites: { pieces: 400 } },
      { user_id: 'c', email: 'testeur-01@exemple.fr', cout: 710000, appels: 20, par_fonction: { dictee: 710000 }, plafonds: { nom: 'Bêta', sans_plafond: true }, unites: { dictee: 99999 } },
      { user_id: 'd', email: null, cout: 0, appels: 0, par_fonction: {}, plafonds: { nom: 'Gratuit', dictee: 600 }, unites: {} },
    ],
  }
  it('total, jours remplis jusqu\'à aujourd\'hui, comptes triés par coût', () => {
    const s = syntheseAdmin(DATA)
    expect(s.total).toBe(870000)
    expect(s.jours).toHaveLength(16)
    expect(s.jours[1]).toEqual({ jour: '2026-12-02', cout: 0 })
    expect(s.comptes.map((c) => c.userId)).toEqual(['b', 'a', 'c', 'd'])
    expect(s.actifs).toBe(3)
    expect(s.comptes[3].email).toBe('(compte supprimé)')
  })
  it('à regarder : pause d\'abord, puis proche ; sans plafond jamais signalé', () => {
    const s = syntheseAdmin(DATA)
    expect(s.aRegarder.map((x) => [x.userId, x.etat, x.libelle])).toEqual([['b', 'pause', 'Lecture des pièces'], ['a', 'proche', 'Dictée d’EDL']])
    expect(s.comptes.find((c) => c.userId === 'c')).toMatchObject({ etat: 'sans', pct: null })
    expect(s.comptes.find((c) => c.userId === 'a')).toMatchObject({ pct: 86, fonctionPrincipale: 'Dictée d’EDL' })
  })
  it('par fonction : les 6 fonctions, vidéo éteinte, détails en unités', () => {
    const s = syntheseAdmin(DATA)
    expect(s.fonctions.map((f) => f.cle)).toEqual(['dictee', 'pieces', 'locataire', 'artisan', 'factures', 'video'])
    expect(s.fonctions[0].detail).toBe('612 min · 96 appels')
    expect(s.fonctions[1].detail).toBe('520 pages lues')
    expect(s.fonctions[5].off).toBe(true)
  })
  it('mois passé : tous les jours du mois', () => {
    expect(syntheseAdmin({ mois: '2026-11-01', aujourdhui: '2026-12-16', par_jour: [] }).jours).toHaveLength(30)
  })
})

describe('saisie d\'un plafond', () => {
  it('vide = sans plafond ; entier borné ; le reste invalide', () => {
    expect(lirePlafond('')).toBe(null)
    expect(lirePlafond(' 90 ')).toBe(90)
    expect(lirePlafond('0')).toBe(0)
    expect(lirePlafond('-3')).toBe(undefined)
    expect(lirePlafond('2,5')).toBe(undefined)
    expect(lirePlafond('2000000')).toBe(undefined)
  })
})

describe('coût maximal par offre (grille validée) — cohérent avec la grille de prix du relais', () => {
  it('dictée et page tirées de relay/src/ai/prix.js', async () => {
    const { COUT_MAX_UNITE } = await import('../../js/core/conso-ia.js')
    const { coutMicroEur } = await import('../../relay/src/ai/prix.js')
    expect(COUT_MAX_UNITE.dictee).toBe(coutMicroEur({ audioSec: 60 }))
    expect(COUT_MAX_UNITE.pieces).toBe(coutMicroEur({ pages: 1 }))
  })
  it('Gratuit ≈ 0,12 € ; Investisseur ≈ 1,57 € ; Patrimoine + ≈ 5,2 € ; sans plafond → null', async () => {
    const { coutMaxOffre, gestesOffre } = await import('../../js/core/conso-ia.js')
    expect(euros(coutMaxOffre({ dictee: 10, pieces: 8, liens: 10, factures: 5 }))).toBe('0,12 €')
    expect(euros(coutMaxOffre({ dictee: 90, pieces: 120, liens: 150, factures: 60 }))).toBe('1,57 €')
    expect(euros(coutMaxOffre({ dictee: 300, pieces: 400, liens: 500, factures: 200 }))).toBe('5,22 €')
    expect(coutMaxOffre({ dictee: null, pieces: 1, liens: 1, factures: 1 })).toBe(null)
    expect(gestesOffre('dictee', 90)).toBe('≈ 11 EDL')
    expect(gestesOffre('pieces', 120)).toBe('≈ 15 dossiers')
    expect(gestesOffre('liens', null)).toBe('sans plafond')
  })
})
