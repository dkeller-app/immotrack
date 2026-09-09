/**
 * Tests — AVENANT AU BAIL. Module js/core/avenant.js
 */
import { describe, it, expect } from 'vitest';
import { loyerTravauxGuard, avenantArticle, buildAvenantHtml, romain, esc, avenantChampsManquants } from '../../js/core/avenant.js';

describe('champ vide → marqueur « à compléter » (jamais un « … » final)', () => {
  it('clause sans texte → marqueur av-todo, pas de …', () => {
    const a = avenantArticle('clause', { titre: 'Animal', texte: '' });
    expect(a.html).toMatch(/av-todo/);
    expect(a.html).not.toMatch(/…/);
  });
  it('caution sans nom → marqueur', () => {
    const a = avenantArticle('caution', { act: 'Ajout d\'une caution', nom: '' });
    expect(a.html).toMatch(/à compléter/);
  });
});

describe('avenantChampsManquants — validation avant impression', () => {
  it('liste les champs vides par objet', () => {
    const m = avenantChampsManquants([
      { k: 'clause', data: { titre: '', texte: '' } },
      { k: 'loyer', data: { motif: 'Travaux d\'amélioration réalisés par le bailleur', nouveau: '', desc: '' } }
    ]);
    const clause = m.find(x => x.k === 'clause'), loyer = m.find(x => x.k === 'loyer');
    expect(clause.champs).toContain('intitulé de la clause');
    expect(clause.champs).toContain('texte de la clause');
    expect(loyer.champs).toContain('nouveau loyer');
    expect(loyer.champs).toContain('nature des travaux');
  });
  it('objet complet → rien', () => {
    const m = avenantChampsManquants([{ k: 'charges', data: { mode: 'Révision du montant des provisions', montant: 95 } }]);
    expect(m).toEqual([]);
  });
  it('coloc départ seul → n\'exige PAS l\'entrant', () => {
    const m = avenantChampsManquants([{ k: 'coloc', data: { act: 'Départ (séparation), sans remplaçant', sortant: 'DUBOIS Léa', entrant: '' } }]);
    expect(m).toEqual([]);
  });
});

describe('esc — anti-XSS des champs saisis', () => {
  it('échappe le HTML injecté', () => {
    expect(esc('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(esc('a & "b" \'c\'')).toBe('a &amp; &quot;b&quot; &#39;c&#39;');
  });
  it('clause avec HTML → échappée dans l\'article', () => {
    const a = avenantArticle('clause', { titre: '<b>x</b>', texte: '<script>alert(1)</script>' });
    expect(a.html).not.toMatch(/<script>/);
    expect(a.html).toMatch(/&lt;script&gt;/);
    expect(a.titre).toBe('&lt;b&gt;x&lt;/b&gt;');
  });
  it('buildAvenantHtml échappe bien / bailleur / entrant', () => {
    const r = buildAvenantHtml({ bailleur: '<b>SCI</b>', locataires: ['A'], bien: '<i>rue</i>', dateBail: '2023-01-01', effetIso: '2026-01-01', ville: '<u>X</u>',
      objets: [{ k: 'coloc', data: { act: 'Ajout d\'un colocataire', entrant: '<img src=x>' } }] });
    expect(r.html).not.toMatch(/<b>SCI<\/b>/);
    expect(r.html).not.toMatch(/<img src=x>/);
    expect(r.html).toMatch(/&lt;img src=x&gt;/);
  });
});

describe('romain', () => {
  it('numérote correctement (XI inclus)', () => {
    expect(romain(1)).toBe('I');
    expect(romain(11)).toBe('XI');
    expect(romain(12)).toBe('XII');
  });
});

const _warns = r => r.alertes.filter(a => a.n === 'warn').map(a => a.m).join(' ');
const _infos = r => r.alertes.filter(a => a.n === 'info').map(a => a.m).join(' ');
describe('loyerTravauxGuard — alertes zone-aware, NON bloquantes', () => {
  it('zone non tendue : hausse libre → info, aucun warn (même au-delà de 15 %)', () => {
    const r = loyerTravauxGuard({ loyer0: 650, coutTTC: 9000, dpe: 'D', nouveau: 900, zoneEncadree: false, motif: 'Travaux d\'amélioration réalisés par le bailleur' });
    expect(r.alertes.some(a => a.n === 'warn')).toBe(false);
    expect(_infos(r)).toMatch(/non tendue|plafond/);
  });
  it('zone encadrée : dépassement du plafond 15 % → warn', () => {
    const r = loyerTravauxGuard({ loyer0: 650, coutTTC: 9000, dpe: 'D', nouveau: 900, zoneEncadree: true, motif: 'Travaux d\'amélioration réalisés par le bailleur' });
    expect(r.maxHausseMois).toBe(112.5);
    expect(_warns(r)).toMatch(/plafond|15 %/);
  });
  it('zone encadrée : travaux sous ½ année → warn', () => {
    const r = loyerTravauxGuard({ loyer0: 650, coutTTC: 2000, dpe: 'D', nouveau: 660, zoneEncadree: true, motif: 'Travaux d\'amélioration réalisés par le bailleur' });
    expect(_warns(r)).toMatch(/moitié|inférieur/);
  });
  it('DPE F/G → warn partout (même zone non tendue)', () => {
    const r = loyerTravauxGuard({ loyer0: 650, coutTTC: 9000, dpe: 'F (passoire)', nouveau: 690, zoneEncadree: false, motif: 'Travaux d\'amélioration réalisés par le bailleur' });
    expect(r.passoire).toBe(true);
    expect(_warns(r)).toMatch(/passoire|interdite/);
  });
  it('baisse sous un motif de hausse → warn incohérence, JAMAIS « conforme »', () => {
    const r = loyerTravauxGuard({ loyer0: 577.64, coutTTC: 9000, dpe: 'D', nouveau: 100, zoneEncadree: false, motif: 'Travaux d\'amélioration réalisés par le bailleur' });
    expect(r.baisse).toBe(true);
    expect(_warns(r)).toMatch(/inférieur|incohérent/);
  });
  it('motif « baisse » + hausse → warn', () => {
    const r = loyerTravauxGuard({ loyer0: 650, coutTTC: 0, dpe: 'D', nouveau: 700, zoneEncadree: false, motif: 'Baisse temporaire pendant travaux' });
    expect(_warns(r)).toMatch(/baisse.*supérieur|supérieur/i);
  });
});

describe('avenantArticle — colocataire (3 situations)', () => {
  it('départ sans remplaçant → solidarité 6 mois, pas d\'entrant, pas de caution', () => {
    const a = avenantArticle('coloc', { act: 'Départ (séparation), sans remplaçant', sortant: 'DUBOIS Léa' });
    expect(a.titre).toMatch(/colocation/i);
    expect(a.html).toMatch(/six mois/);
    expect(a.html).not.toMatch(/adjoint|substitué/);
    expect(a.caution).toBe(false);
    expect(a.base).toMatch(/8-1/);
  });
  it('ajout → entrant solidaire + caution requise', () => {
    const a = avenantArticle('coloc', { act: 'Ajout d\'un colocataire', entrant: 'BERNARD Hugo' });
    expect(a.html).toMatch(/adjoint/);
    expect(a.html).toMatch(/BERNARD Hugo/);
    expect(a.caution).toBe(true);
  });
  it('remplacement → sortant ET entrant', () => {
    const a = avenantArticle('coloc', { act: 'Remplacement (départ + arrivée)', sortant: 'DUBOIS Léa', entrant: 'BERNARD Hugo' });
    expect(a.html).toMatch(/DUBOIS Léa/);
    expect(a.html).toMatch(/BERNARD Hugo/);
    expect(a.html).toMatch(/substitué/);
    expect(a.caution).toBe(true);
  });
});

describe('avenantArticle — autres objets', () => {
  it('loyer travaux cite art. 17-1 II + montants', () => {
    const a = avenantArticle('loyer', { motif: 'Travaux d\'amélioration réalisés par le bailleur', desc: 'double vitrage', cout: 9000, nouveau: 690 }, { loyer0: 650 });
    expect(a.html).toMatch(/650 €/);
    expect(a.html).toMatch(/690 €/);
    expect(a.html).toMatch(/15 %/);
    expect(a.base).toMatch(/17-1/);
  });
  it('charges forfait → art. 23-1 non régularisable', () => {
    const a = avenantArticle('charges', { mode: 'Passage au forfait de charges', montant: 95 });
    expect(a.html).toMatch(/n\'est pas soumis à régularisation/);
    expect(a.base).toMatch(/23-1/);
  });
  it('charges provisions → art. 23 régularisation', () => {
    const a = avenantArticle('charges', { mode: 'Révision du montant des provisions', montant: 95 });
    expect(a.html).toMatch(/régularisation annuelle/);
    expect(a.base).toBe('art. 23, loi du 6 juillet 1989');
  });
  it('sous-location → plafond prix au m² art. 8', () => {
    const a = avenantArticle('souslocation', { act: 'Autorisation de sous-location', cond: 'durée du bail' });
    expect(a.html).toMatch(/mètre carré/);
    expect(a.base).toMatch(/art\. 8/);
  });
  it('objet inconnu → null', () => {
    expect(avenantArticle('inexistant', {})).toBe(null);
  });
});

describe('buildAvenantHtml — assemblage', () => {
  const ctx = {
    no: 1, bailleur: 'SCI des Tilleuls', locataires: ['MARTIN Sophie', 'DUBOIS Léa'],
    bien: '12 rue des Tilleuls', dateBail: '2023-09-01', loyer0: 650, effetIso: '2026-10-01', ville: 'Strasbourg',
    objets: [
      { k: 'coloc', data: { act: 'Remplacement (départ + arrivée)', sortant: 'DUBOIS Léa', entrant: 'BERNARD Hugo' } },
      { k: 'loyer', data: { motif: 'Travaux d\'amélioration réalisés par le bailleur', desc: 'double vitrage', cout: 9000, nouveau: 690 } }
    ]
  };
  it('préambule + articles numérotés + clôture', () => {
    const r = buildAvenantHtml(ctx);
    expect(r.html).toMatch(/Entre les soussignés/);
    expect(r.html).toMatch(/Ceci exposé/);
    expect(r.html).toMatch(/Article I —/);
    expect(r.html).toMatch(/Prise d\'effet/);
    expect(r.html).toMatch(/Stipulations inchangées/);
    expect(r.html).toMatch(/Lu et approuvé/);
  });
  it('signale la caution + expose le colocataire entrant comme signataire', () => {
    const r = buildAvenantHtml(ctx);
    expect(r.caution).toBe(true);
    expect(r.entrant).toBe('BERNARD Hugo');
    expect(r.html).toMatch(/colocataire entrant/);
    expect(r.html).toMatch(/BERNARD Hugo/);
  });
  it('sans objet → uniquement prise d\'effet + stipulations inchangées', () => {
    const r = buildAvenantHtml(Object.assign({}, ctx, { objets: [] }));
    expect(r.nbArticles).toBe(2);
    expect(r.caution).toBe(false);
  });
});
