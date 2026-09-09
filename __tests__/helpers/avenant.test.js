/**
 * Tests — AVENANT AU BAIL. Module js/core/avenant.js
 */
import { describe, it, expect } from 'vitest';
import { loyerTravauxGuard, avenantArticle, buildAvenantHtml, romain, esc } from '../../js/core/avenant.js';

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

describe('loyerTravauxGuard — encadrement art. 17-1 II', () => {
  it('conforme : plafond 15 % TTC / 12, seuil 1/2 année atteint', () => {
    const r = loyerTravauxGuard({ loyer0: 650, coutTTC: 9000, dpe: 'D', nouveau: 690 });
    expect(r.seuil).toBe(3900);
    expect(r.maxHausseMois).toBe(112.5);   // 9000 × 15 % ÷ 12
    expect(r.maxLoyer).toBe(762.5);
    expect(r.hausse).toBe(40);
    expect(r.ok).toBe(true);
    expect(r.blocages).toEqual([]);
  });
  it('hausse au-dessus du plafond → bloquée', () => {
    const r = loyerTravauxGuard({ loyer0: 650, coutTTC: 9000, dpe: 'D', nouveau: 800 });
    expect(r.ok).toBe(false);
    expect(r.blocages.join(' ')).toMatch(/plafond/);
  });
  it('travaux sous le seuil (½ année) → bloqués', () => {
    const r = loyerTravauxGuard({ loyer0: 650, coutTTC: 2000, dpe: 'D', nouveau: 660 });
    expect(r.ok).toBe(false);
    expect(r.blocages.join(' ')).toMatch(/insuffisants/);
  });
  it('DPE F ou G → majoration interdite', () => {
    const f = loyerTravauxGuard({ loyer0: 650, coutTTC: 9000, dpe: 'F', nouveau: 690 });
    expect(f.passoire).toBe(true);
    expect(f.ok).toBe(false);
    expect(f.blocages.join(' ')).toMatch(/passoire|interdite/);
    const g = loyerTravauxGuard({ loyer0: 650, coutTTC: 9000, dpe: 'G (passoire)', nouveau: 690 });
    expect(g.passoire).toBe(true);
  });
  it('coût des travaux non renseigné → bloqué (pas de conformité par défaut)', () => {
    const r = loyerTravauxGuard({ loyer0: 650, coutTTC: 0, dpe: 'C', nouveau: 650 });
    expect(r.ok).toBe(false);
    expect(r.blocages.join(' ')).toMatch(/non renseigné/);
  });
  it('pile au plafond → conforme', () => {
    const r = loyerTravauxGuard({ loyer0: 1000, coutTTC: 12000, dpe: 'C', nouveau: 1150 });
    expect(r.maxHausseMois).toBe(150); // 12000×15%÷12
    expect(r.hausse).toBe(150);
    expect(r.ok).toBe(true);
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
