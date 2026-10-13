/**
 * TRAVAUX : QUI PAIE ? — moteur de règles (js/core/qui-paie.js).
 *
 *   Q-1  chaque règle R1-R16 rend le bon payeur, la bonne confiance et cite ses textes.
 *   Q-2  chaque zone grise rend « à arbitrer » avec EXACTEMENT deux lectures, jamais d'affirmation.
 *   Q-3  entrées incomplètes : jamais « locataire » par défaut sur une cause inconnue.
 *   Q-4  balayage exhaustif : aucune combinaison ne lève, toutes les sorties sont bien formées,
 *        chaque texte cité est un extrait Légifrance non vide.
 *   Q-5  urgences, checklist sinistre, message au locataire (ton neutre), qualification.
 */
import { describe, it, expect } from 'vitest';
import {
  quiPaie, PAYEURS, CONFIANCE, TEXTES, ELEMENTS, NATURES, INTERVENTIONS, CAUSES, URGENCES,
  consignesUrgence, checklistSinistre, messageLocataire, QUALIFS, qualificationSuggeree,
  QP_VERSION, MENTION_LEGALE, elementDef,
} from '../../js/core/qui-paie.js';

const ids = (v) => v.textes.map((t) => t.id);
const lectIds = (v, i) => v.lectures[i].textes.map((t) => t.id);
const nu = { meuble: false, copro: true };

describe('Q-1 · règles R1 à R16', () => {
  it('R1 — robinet, joint usé par l\'usage normal : locataire, texte explicite, annexe IV d + art. 7 d', () => {
    const v = quiPaie({ element: 'robinet', nature: 'fuite', intervention: 'petite_piece', cause: 'usage_normal', contexte: nu });
    expect(v.payeur).toBe(PAYEURS.LOCATAIRE);
    expect(v.regle).toBe('R1');
    expect(v.confiance).toBe(CONFIANCE.EXPLICITE);
    expect(ids(v)).toEqual(['ann-IVd-robinet', 'a7d']);
    expect(v.lectures).toEqual([]);
  });
  it('R1 — entretien courant d\'un élément listé : locataire même si la cause n\'est pas renseignée', () => {
    const v = quiPaie({ element: 'sanitaire', nature: 'entretien', intervention: 'entretien', cause: 'inconnue' });
    expect(v.payeur).toBe(PAYEURS.LOCATAIRE);
    expect(ids(v)).toContain('ann-IVe');
  });
  it('R2 — même élément, vétusté : bailleur, lecture probable, art. 7 d + C. civ. 1755', () => {
    const v = quiPaie({ element: 'robinet', nature: 'fuite', intervention: 'petite_piece', cause: 'vetuste' });
    expect(v.payeur).toBe(PAYEURS.BAILLEUR);
    expect(v.regle).toBe('R2');
    expect(v.confiance).toBe(CONFIANCE.PROBABLE);
    expect(ids(v)).toEqual(['a7d', 'c1755']);
  });
  it('R3 — malfaçon ou vice : bailleur ; vitre cassée par force majeure cite aussi C. civ. 1754', () => {
    expect(quiPaie({ element: 'serrure', intervention: 'petite_piece', cause: 'malfacon_vice' })).toMatchObject({ payeur: 'bailleur', regle: 'R3' });
    const v = quiPaie({ element: 'vitre', nature: 'casse', intervention: 'petite_piece', cause: 'force_majeure' });
    expect(v.payeur).toBe('bailleur');
    expect(ids(v)).toContain('c1754-vitres');
  });
  it('R4 — élément hors liste (ballon), cause inconnue : bailleur, texte explicite, C. civ. 1720 + art. 6 c', () => {
    const v = quiPaie({ element: 'ballon', nature: 'panne', intervention: 'remplacement_complet', cause: 'inconnue', urgences: ['chauffage'] });
    expect(v.payeur).toBe(PAYEURS.BAILLEUR);
    expect(v.regle).toBe('R4');
    expect(v.confiance).toBe(CONFIANCE.EXPLICITE);
    expect(ids(v)).toEqual(['c1720', 'a6c']);
    expect(v.urgence.consignes.length).toBeGreaterThan(1);
  });
  it('R4 — élément listé mais remplacement complet par usure : bailleur, lecture probable', () => {
    const v = quiPaie({ element: 'sol', intervention: 'remplacement_complet', cause: 'usage_normal' });
    expect(v).toMatchObject({ payeur: 'bailleur', regle: 'R4', confiance: CONFIANCE.PROBABLE });
  });
  it('R5 — faute du locataire : locataire, lecture probable (charge de la preuve), art. 7 c', () => {
    const v = quiPaie({ element: 'toiture', cause: 'faute_locataire' });
    expect(v).toMatchObject({ payeur: 'locataire', regle: 'R5', confiance: CONFIANCE.PROBABLE });
    expect(ids(v)).toEqual(['a7c']);
    expect(quiPaie({ element: 'porte_fenetre', intervention: 'petite_piece', cause: 'faute_locataire' }).payeur).toBe('locataire');
  });
  it('R6 — chaudière, entretien annuel : locataire (R224-41-5), bailleur si clause du bail', () => {
    const v = quiPaie({ element: 'chaudiere', nature: 'entretien', intervention: 'entretien' });
    expect(v).toMatchObject({ payeur: 'locataire', regle: 'R6', confiance: CONFIANCE.EXPLICITE });
    expect(ids(v)).toContain('env-r22415');
    const c = quiPaie({ element: 'chaudiere', intervention: 'entretien', contexte: { clauseChaudiereBailleur: true } });
    expect(c.payeur).toBe('bailleur');
  });
  it('R7 — chaudière, remplacement : bailleur probable ; à arbitrer si défaut d\'entretien allégué', () => {
    expect(quiPaie({ element: 'chaudiere', intervention: 'remplacement_complet', cause: 'vetuste' })).toMatchObject({ payeur: 'bailleur', regle: 'R7', confiance: CONFIANCE.PROBABLE });
    const v = quiPaie({ element: 'chaudiere', intervention: 'remplacement_complet', cause: 'defaut_entretien' });
    expect(v).toMatchObject({ payeur: 'a_arbitrer', regle: 'R7' });
    expect(v.lectures.map((l) => l.payeur)).toEqual(['bailleur', 'locataire']);
  });
  it('R8 — chaufferie collective, entretien : syndic en copropriété, bailleur en monopropriété (R224-41-5 al. 2)', () => {
    const s = quiPaie({ element: 'chauffage_coll', intervention: 'entretien', contexte: { copro: true } });
    expect(s).toMatchObject({ payeur: 'syndic', regle: 'R8', confiance: CONFIANCE.EXPLICITE });
    expect(ids(s)).toEqual(['env-r22415-coll']);
    expect(quiPaie({ element: 'chauffage_coll', intervention: 'entretien', contexte: { copro: false } }).payeur).toBe('bailleur');
  });
  it('R9 — ramonage : locataire (annexe VI d)', () => {
    const v = quiPaie({ element: 'conduit', nature: 'entretien', intervention: 'entretien' });
    expect(v).toMatchObject({ payeur: 'locataire', regle: 'R9' });
    expect(ids(v)).toContain('ann-VId');
  });
  it('R10 — détecteur de fumée, installation : bailleur (CCH R142-3)', () => {
    const v = quiPaie({ element: 'detecteur', intervention: 'installation', contexte: { meuble: false } });
    expect(v).toMatchObject({ payeur: 'bailleur', regle: 'R10', confiance: CONFIANCE.EXPLICITE });
    expect(ids(v)).toEqual(['cch-r1423']);
  });
  it('R11 — détecteur, remplacement : occupant en location nue, bailleur en meublé, à arbitrer si inconnu', () => {
    expect(quiPaie({ element: 'detecteur', intervention: 'remplacement_complet', contexte: { meuble: false } }).payeur).toBe('locataire');
    const m = quiPaie({ element: 'detecteur', intervention: 'remplacement_complet', contexte: { meuble: true } });
    expect(m.payeur).toBe('bailleur');
    expect(ids(m)).toEqual(['cch-r1423-meuble']);
    expect(quiPaie({ element: 'detecteur', intervention: 'remplacement_complet' }).payeur).toBe('a_arbitrer');
  });
  it('R12 — électroménager mentionné au bail, menue réparation par l\'usage : locataire (VI a)', () => {
    const v = quiPaie({ element: 'electromenager', intervention: 'petite_piece', cause: 'usage_normal' });
    expect(v).toMatchObject({ payeur: 'locataire', regle: 'R12' });
    expect(ids(v)).toContain('ann-VIa');
  });
  it('R13 — électroménager, remplacement pour usure : bailleur, lecture probable', () => {
    expect(quiPaie({ element: 'electromenager', intervention: 'remplacement_complet', cause: 'usage_normal' })).toMatchObject({ payeur: 'bailleur', regle: 'R13', confiance: CONFIANCE.PROBABLE });
  });
  it('R14 — partie commune : syndic en copropriété (loi 65-557 art. 14), bailleur en monopropriété, à arbitrer si inconnu', () => {
    const s = quiPaie({ element: 'toiture', contexte: { partieCommune: true, copro: true } });
    expect(s).toMatchObject({ payeur: 'syndic', regle: 'R14' });
    expect(ids(s)).toEqual(['l6557-14']);
    expect(quiPaie({ element: 'toiture', contexte: { partieCommune: true, copro: false } }).payeur).toBe('bailleur');
    const a = quiPaie({ element: 'toiture', contexte: { partieCommune: true } });
    expect(a.payeur).toBe('a_arbitrer');
    expect(a.lectures.map((l) => l.payeur)).toEqual(['syndic', 'bailleur']);
  });
  it('R15 — sinistre (dégât des eaux) : circuit assurance, pas de responsable, checklist avec délai L113-2', () => {
    const v = quiPaie({ element: 'mur_plafond', nature: 'degat_eaux', contexte: { copro: true } });
    expect(v).toMatchObject({ payeur: 'assurance', regle: 'R15' });
    expect(ids(v)).toContain('assur-l1132');
    expect(v.sinistre.checklist.map((c) => c.k)).toEqual(['mrh', 'constat', 'pno', 'syndic', 'photos', 'conserver']);
    expect(v.sinistre.checklist[0].detail).toMatch(/délai fixé par le contrat/);
    expect(quiPaie({ element: 'serrure', cause: 'sinistre' }).payeur).toBe('assurance');
  });
  it('R16 — humidité, moisissures : à arbitrer, lectures bailleur (décence) / locataire (aération)', () => {
    const v = quiPaie({ element: 'mur_plafond', nature: 'humidite', cause: 'inconnue' });
    expect(v).toMatchObject({ payeur: 'a_arbitrer', regle: 'R16', confiance: CONFIANCE.ARBITRER });
    expect(v.lectures.map((l) => l.payeur)).toEqual(['bailleur', 'locataire']);
    expect(lectIds(v, 0)).toEqual(['a6-al1', 'a6c']);
    expect(lectIds(v, 1)).toEqual(['a7c']);
  });
});

describe('Q-2 · zones grises : deux lectures, jamais d\'affirmation', () => {
  const ZG = [
    ['Z1 quelques éléments / réfection', { element: 'sol', intervention: 'inconnue', cause: 'usage_normal' }],
    ['Z3 canalisation bouchée, cause inconnue', { element: 'canalisation', nature: 'panne', intervention: 'petite_piece', cause: 'inconnue' }],
    ['Z4 chaudière en panne', { element: 'chaudiere', nature: 'panne', intervention: 'inconnue', cause: 'inconnue' }],
    ['Z5 ballon entartré', { element: 'ballon', nature: 'entretien', intervention: 'entretien' }],
    ['R16 moisissures', { element: 'mur_plafond', nature: 'humidite' }],
    ['Z7 électroménager en meublé', { element: 'electromenager', nature: 'panne', intervention: 'inconnue', cause: 'usage_normal', contexte: { meuble: true } }],
    ['Z8 perte de clés / serrure usée', { element: 'serrure', nature: 'panne', intervention: 'petite_piece', cause: 'inconnue' }],
    ['Z9 nuisibles', { element: 'autre', nature: 'nuisibles' }],
    ['Z10 tiers', { element: 'vitre', nature: 'casse', intervention: 'petite_piece', cause: 'tiers' }],
  ];
  ZG.forEach(([nom, input]) => {
    it(nom, () => {
      const v = quiPaie(input);
      expect(v.payeur).toBe(PAYEURS.ARBITRER);
      expect(v.confiance).toBe(CONFIANCE.ARBITRER);
      expect(v.textes).toEqual([]);                 // aucune citation « affirmative »
      expect(v.lectures).toHaveLength(2);
      expect(v.lectures[0].payeur).not.toBe(v.lectures[1].payeur);
      v.lectures.forEach((l) => { expect(l.si.length).toBeGreaterThan(10); expect(l.textes.length).toBeGreaterThan(0); });
      expect(v.pieces.length).toBeGreaterThan(0);
    });
  });
});

describe('Q-3 · entrées incomplètes', () => {
  it('entrée vide ou nulle : à arbitrer, jamais une exception', () => {
    expect(quiPaie().payeur).toBe('a_arbitrer');
    expect(quiPaie(null).payeur).toBe('a_arbitrer');
    expect(quiPaie({}).payeur).toBe('a_arbitrer');
  });
  it('valeurs inconnues normalisées (élément « autre », cause « inconnue »)', () => {
    const v = quiPaie({ element: 'licorne', nature: 'x', intervention: 'y', cause: 'z' });
    expect(v.payeur).toBe('a_arbitrer');
  });
  it('cause inconnue sur un élément listé : jamais « locataire » hors entretien courant', () => {
    ELEMENTS.filter((e) => e.ann).forEach((e) => {
      INTERVENTIONS.filter((i) => i.k !== 'entretien').forEach((i) => {
        const v = quiPaie({ element: e.k, nature: 'panne', intervention: i.k, cause: 'inconnue', contexte: { meuble: false, copro: true } });
        expect(v.payeur, `${e.k}/${i.k}`).not.toBe('locataire');
      });
    });
  });
  it('urgences inconnues ignorées', () => {
    expect(quiPaie({ element: 'ballon', urgences: ['volcan'] }).urgence).toBeNull();
  });
});

describe('Q-4 · balayage exhaustif', () => {
  it('toutes les combinaisons rendent un verdict bien formé', () => {
    const ctxs = [{}, { meuble: true, copro: true }, { meuble: false, copro: false }, { partieCommune: true, copro: true }, { clauseChaudiereBailleur: true }];
    const P = Object.values(PAYEURS), C = Object.values(CONFIANCE);
    const bad = [];
    let n = 0;
    ELEMENTS.forEach((e) => NATURES.forEach((na) => INTERVENTIONS.forEach((it) => CAUSES.forEach((c) => ctxs.forEach((ctx) => {
      const v = quiPaie({ element: e.k, nature: na.k, intervention: it.k, cause: c.k, contexte: ctx });
      n++;
      const k = `${e.k}/${na.k}/${it.k}/${c.k}/${JSON.stringify(ctx)}`;
      const ok = P.includes(v.payeur) && C.includes(v.confiance) && v.version === QP_VERSION && v.mention === MENTION_LEGALE
        && typeof v.regle === 'string' && v.resume.length > 20
        && (v.payeur === 'a_arbitrer'
          ? (v.lectures.length === 2 && v.confiance === CONFIANCE.ARBITRER)
          : (v.textes.length > 0 && v.confiance !== CONFIANCE.ARBITRER))
        && [...v.textes, ...v.lectures.flatMap((l) => l.textes)].every((t) => /^https:\/\/www\.legifrance\.gouv\.fr\//.test(t.url) && t.extrait.length > 5);
      if (!ok) bad.push(k);
    })))));
    expect(bad).toEqual([]);
    expect(n).toBeGreaterThan(10000);
  });
  it('chaque texte du référentiel est complet (référence, URL Légifrance, extrait sans élision)', () => {
    Object.entries(TEXTES).forEach(([id, t]) => {
      expect(t.ref, id).toBeTruthy();
      expect(t.url, id).toMatch(/^https:\/\/www\.legifrance\.gouv\.fr\//);
      expect(t.extrait, id).not.toMatch(/\[…\]|\.\.\.|…/);
    });
  });
  it('chaque élément a un métier (sauf « autre ») et une rubrique existante', () => {
    ELEMENTS.forEach((e) => {
      if (e.ann) expect(TEXTES[e.ann], e.k).toBeTruthy();
      if (e.k !== 'autre') expect(e.metier, e.k).toBeTruthy();
    });
    expect(elementDef('nope')).toBeNull();
  });
});

describe('Q-5 · urgences, sinistre, message, qualification', () => {
  it('consignes : dédoublonnées, terminées par le 112 / 18', () => {
    const c = consignesUrgence(['eau', 'gaz']);
    expect(c.urgences).toEqual(['De l\'eau coule', 'Odeur de gaz']);
    expect(c.consignes[c.consignes.length - 1]).toMatch(/112 ou 18/);
    expect(consignesUrgence([])).toBeNull();
  });
  it('checklist : pas de syndic quand l\'immeuble n\'est pas en copropriété', () => {
    expect(checklistSinistre(false).some((c) => c.k === 'syndic')).toBe(false);
    expect(checklistSinistre(true).some((c) => c.k === 'syndic')).toBe(true);
  });
  it('message au locataire : seulement si le locataire paie ; cite les textes ; rappelle l\'assurance ; ton neutre', () => {
    const v = quiPaie({ element: 'robinet', intervention: 'petite_piece', cause: 'usage_normal' });
    const m = messageLocataire(v, { element: 'Robinet de la cuisine', dateSignalement: '2 octobre 2026', bien: 'T2 Altkirch', signataire: 'SCI Les Hauts' });
    expect(m).toMatch(/Remplacement des joints, clapets et presse-étoupes des robinets/);
    expect(m).toMatch(/assurance habitation est obligatoire/);
    expect(m).toMatch(/SCI Les Hauts$/);
    expect(m).not.toMatch(/\b(tu|ton|ta|tes|vous|votre|vos)\b/i);
    expect(messageLocataire(quiPaie({ element: 'ballon' }), {})).toBeNull();
    expect(messageLocataire(null)).toBeNull();
  });
  it('qualification : trois catégories existantes, suggestion « entretien / réparation »', () => {
    expect(QUALIFS.map((q) => q.cat)).toEqual([
      'Travaux (entretien, réparation, amélioration)',
      'Travaux de rénovation énergétique',
      'Travaux de construction / agrandissement (non déductible)',
    ]);
    expect(qualificationSuggeree()).toBe('travaux');
  });
  it('les URGENCES ont toutes au moins une consigne', () => {
    URGENCES.forEach((u) => expect(u.consignes.length).toBeGreaterThan(0));
  });
});
