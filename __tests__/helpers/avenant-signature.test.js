/**
 * Tests — AVENANT-REFONTE lot 3b : signature d'un avenant figé (parties lues dans le document, images posées).
 */
import { describe, it, expect } from 'vitest';
import { buildAvenantHtml, avenantPartiesSignature, avenantHtmlSigne } from '../../js/core/avenant.js';

const LUS3 = [true, true, true];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const ctx = (x) => Object.assign({ no: 2, bailleur: 'SCI Les <Tilleuls> & Co', locataires: ['Alice Martin', 'Bruno Leroy'],
  locDetail: [{ nom: 'Alice Martin', civilite: 'Mme' }, { nom: 'Bruno Leroy', civilite: 'M.' }], garants: [],
  bien: '12 rue des Lilas', dateBail: '2025-01-01', bailSigne: true, loyer0: 800, effetIso: '2026-10-01', ville: 'Lyon',
  objets: [{ k: 'coloc', data: { act: 'Départ (séparation), sans remplaçant', sortant: 'Bruno Leroy', cautionSortant: 'Aucune caution' } }] }, x || {});

describe('avenantPartiesSignature — le document fait foi', () => {
  it('bailleur, locataire qui reste, colocataire sortant — dans l\'ordre des cadres, texte brut', () => {
    const p = avenantPartiesSignature(buildAvenantHtml(ctx()).html);
    expect(p.map(x => [x.role, x.nom])).toEqual([
      ['Le bailleur', 'SCI Les <Tilleuls> & Co'], ['La locataire', 'Alice Martin'], ['Le colocataire sortant', 'Bruno Leroy']]);
  });
  it('entrant ajouté en dernier ; document sans cadre → liste vide', () => {
    const p = avenantPartiesSignature(buildAvenantHtml(ctx({ objets: [{ k: 'coloc', data: { act: 'Ajout d\'un colocataire', entrant: 'Chloé', civEntrant: 'Mme' } }] })).html);
    expect(p[p.length - 1]).toMatchObject({ role: 'La colocataire entrante', nom: 'Chloé' });
    expect(avenantPartiesSignature('<p>rien</p>')).toEqual([]);
    expect(avenantPartiesSignature(null)).toEqual([]);
  });
});

describe('avenantHtmlSigne', () => {
  const html = buildAvenantHtml(ctx()).html;
  it('une image par cadre, dans l\'ordre ; date de l\'acte à la place de la ligne à compléter', () => {
    const s = avenantHtmlSigne(html, [PNG, PNG, PNG], '2026-09-29', LUS3);
    expect((s.match(/<img src="data:image\/png/g) || []).length).toBe(3);
    expect(s).toContain('29/09/2026');
    expect(s).not.toContain('____________________');
    expect(avenantPartiesSignature(s).map(x => x.nom)).toEqual(['SCI Les <Tilleuls> & Co', 'Alice Martin', 'Bruno Leroy']);
  });
  it('nombre de signatures différent des cadres, ou image non conforme → null (jamais un document incohérent)', () => {
    expect(avenantHtmlSigne(html, [PNG, PNG], '2026-09-29', [true, true])).toBeNull();
    expect(avenantHtmlSigne(html, [PNG, PNG, '"><script>alert(1)</script>'], '2026-09-29', LUS3)).toBeNull();
    expect(avenantHtmlSigne(html, [PNG, PNG, 'data:image/svg+xml;base64,AAAA'], '2026-09-29', LUS3)).toBeNull();
    expect(avenantHtmlSigne('<p>sans cadre</p>', [], '2026-09-29')).toBeNull();
  });
  it('le document d\'origine n\'est pas modifié', () => {
    const avant = String(html);
    avenantHtmlSigne(html, [PNG, PNG, PNG], '2026-09-29', LUS3);
    expect(html).toBe(avant);
  });
});

describe('audit lot 3b', () => {
  it('I5 : document forgé (cadres ouverts non fermés) → analyse en temps linéaire', () => {
    const forge = '<div class="pro-sigcase"><div class="pro-sigspace">'.repeat(4000) + 'x';
    const t0 = Date.now();
    expect(avenantPartiesSignature(forge)).toEqual([]);
    expect(avenantPartiesSignature(forge + '</div>')).toEqual([]);   // une seule fermeture, tout au bout
    expect(avenantPartiesSignature(forge.replace(/sigspace">/g, 'sigspace"></div><div class="pro-signbox">'))).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(500);
  });
  it('M1 : des soulignés saisis dans une clause ne reçoivent pas la date ; « Fait le » oui', () => {
    const h = buildAvenantHtml(ctx({ objets: [{ k: 'clause', data: { titre: 'Parking', texte: 'Place n° ____________________ attribuée.' } }] })).html;
    const n = avenantPartiesSignature(h).length;
    const s = avenantHtmlSigne(h, Array(n).fill(PNG), '2026-09-29', Array(n).fill(true));
    expect(s).toContain(', le 29/09/2026, en autant');
    expect(s).toContain('____________________');   // celui de la clause, intact
  });
});
