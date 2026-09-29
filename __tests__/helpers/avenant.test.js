/**
 * Tests — AVENANT AU BAIL. Module js/core/avenant.js
 */
import { describe, it, expect } from 'vitest';
import { loyerTravauxGuard, avenantArticle, buildAvenantHtml, romain, esc, avenantChampsManquants, avenantMontant, avenantEntrant } from '../../js/core/avenant.js';

describe('avenantMontant — lecture des montants saisis', () => {
  it('champ vide → montant en vigueur conservé', () => {
    expect(avenantMontant('', 750)).toEqual({ ok: true, v: 750 });
    expect(avenantMontant('  ', 80)).toEqual({ ok: true, v: 80 });
    expect(avenantMontant(null, 80)).toEqual({ ok: true, v: 80 });
  });
  it('charges à 0 € acceptées (charges supprimées)', () => {
    expect(avenantMontant('0', 80)).toEqual({ ok: true, v: 0 });
  });
  it('loyer à 0 € refusé (strictPositif)', () => {
    expect(avenantMontant('0', 750, { strictPositif: true })).toEqual({ ok: false });
    expect(avenantMontant('', 750, { strictPositif: true })).toEqual({ ok: true, v: 750 });
  });
  it('négatif ou illisible refusé', () => {
    expect(avenantMontant('-50', 80)).toEqual({ ok: false });
    expect(avenantMontant('abc', 80)).toEqual({ ok: false });
  });
  it('virgule décimale et espaces, arrondi au centime', () => {
    expect(avenantMontant('1 234,567', 0)).toEqual({ ok: true, v: 1234.57 });
  });
});

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
  it('parties en blocs + articles numérotés + clôture (AVENANT-REFONTE §7)', () => {
    const r = buildAvenantHtml(ctx);
    expect(r.html).toMatch(/class="pro-parties"/);
    expect(r.html).toMatch(/<h2>Le bailleur<\/h2><span class="pro-qui">SCI des Tilleuls/);
    expect(r.html).toMatch(/<h2>Les locataires<\/h2><span class="pro-qui">MARTIN Sophie<br>DUBOIS Léa/);
    expect(r.html).toMatch(/Article I —/);
    expect(r.html).toMatch(/Prise d\'effet/);
    expect(r.html).toMatch(/Stipulations inchangées/);
    expect(r.html).not.toMatch(/class="pro-kv"/);   // plus de tableau qui répète le titre
  });
  it('non-novation dite UNE fois (préambule), plus dans « Stipulations inchangées »', () => {
    const r = buildAvenantHtml(Object.assign({}, ctx, { objets: [{ k: 'clause', data: { titre: 'T', texte: 'x' } }] }));
    expect((r.html.match(/novation/g) || []).length).toBe(1);
  });
  it('« Fait le » = date de l\'acte, jamais la date d\'effet ; ligne à remplir tant que non signé', () => {
    const sans = buildAvenantHtml(ctx).html;
    expect(sans).toMatch(/class="pro-lieu">Fait à Strasbourg, le ____/);
    expect(sans).not.toMatch(/Fait à Strasbourg, le 01\/10\/2026/);
    const avec = buildAvenantHtml(Object.assign({}, ctx, { dateActeIso: '2026-09-28' })).html;
    expect(avec).toMatch(/Fait à Strasbourg, le 28\/09\/2026/);
  });
  it('UNE seule zone de signature, bailleur d\'abord, sortant désigné comme tel, entrant ajouté', () => {
    const h = buildAvenantHtml(Object.assign({}, ctx, { representant: 'Didier Keller, gérant' })).html;
    expect((h.match(/class="pro-signzone/g) || []).length).toBe(1);
    const roles = [...h.matchAll(/<div class="pro-signbox">([^<]*)<br>/g)].map(m => m[1]);
    expect(roles).toEqual(['Le bailleur', 'Le locataire', 'Le colocataire sortant', 'Le colocataire entrant']);
    expect(h).toMatch(/représenté par Didier Keller, gérant/);
    expect(h).toMatch(/<div class="pro-sigspace"><\/div>/);   // espace de signature au-dessus du filet
  });
  it('images de signature posées dans leur cadre quand elles sont fournies (data-URL validée)', () => {
    const h = buildAvenantHtml(Object.assign({}, ctx, { signatures: ['data:image/png;base64,AAA='] })).html;
    expect(h).toMatch(/<div class="pro-sigspace"><img src="data:image\/png;base64,AAA="><\/div><div class="pro-signbox">Le bailleur/);
  });
  it('signature autre qu\'une image data-URL (HTML, javascript:, SVG) → ignorée (HTML conservé et partagé SCI)', () => {
    const h = buildAvenantHtml(Object.assign({}, ctx, { signatures: [
      '<img src=x onerror=alert(1)>', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AA"onerror="x'] })).html;
    expect(h).not.toMatch(/onerror|javascript:|svg\+xml/);
    expect((h.match(/<div class="pro-sigspace"><\/div>/g) || []).length).toBe(4);
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

// AUDIT AVENANT 27/09 — bail sans signature dans l'app (papier / repris) : pas de « signé le ».
describe('accords : singulier / pluriel selon les colocataires qui restent, genre selon la civilité (retour 28/09)', () => {
  const locDetail = [{ nom: 'Alice Martin', civilite: 'Mme' }, { nom: 'Bruno Leroy', civilite: 'M.' }, { nom: 'Chloé Dubois', civilite: 'Mme' }];
  const art = (data, locs) => avenantArticle('coloc', data, { locataires: locs, locDetail }).html;
  it('départ, UNE colocataire reste → singulier, féminin, civilités réelles, plus de « (s) » ni de « / »', () => {
    const h = art({ act: 'Départ (séparation), sans remplaçant', sortant: 'Bruno Leroy' }, ['Alice Martin', 'Bruno Leroy']);
    expect(h).toMatch(/^M\. <strong>Bruno Leroy<\/strong> cesse/);
    expect(h).toMatch(/caution pour lui prennent fin/);
    expect(h).toMatch(/Mme <strong>Alice Martin<\/strong>, qui demeure dans les lieux, poursuit le bail aux conditions initiales et fait son affaire personnelle/);
    expect(h).toMatch(/au colocataire sortant\.$/);
    expect(h).not.toMatch(/\(s\)|\(e\)|M\. \/ Mme|poursuit \/|fait \/|Il \/ elle/);
  });
  it('départ, DEUX colocataires restent → pluriel avec leurs noms', () => {
    const h = art({ act: 'Départ (séparation), sans remplaçant', sortant: 'Bruno Leroy' }, ['Alice Martin', 'Bruno Leroy', 'Chloé Dubois']);
    expect(h).toMatch(/Les colocataires qui demeurent dans les lieux, Mme <strong>Alice Martin<\/strong> et Mme <strong>Chloé Dubois<\/strong>, poursuivent le bail aux conditions initiales et font leur affaire personnelle/);
  });
  it('sortante → « pour elle », « à la colocataire sortante »', () => {
    const h = art({ act: 'Départ (séparation), sans remplaçant', sortant: 'Alice Martin' }, ['Alice Martin', 'Bruno Leroy']);
    expect(h).toMatch(/^Mme <strong>Alice Martin<\/strong> cesse/);
    expect(h).toMatch(/caution pour elle/);
    expect(h).toMatch(/M\. <strong>Bruno Leroy<\/strong>, qui demeure dans les lieux, poursuit/);
    expect(h).toMatch(/à la colocataire sortante\.$/);
  });
  it('remplacement par une entrante → « substituée », « Elle déclare », « tenue », avec la colocataire en place nommée', () => {
    const h = art({ act: 'Remplacement (départ + arrivée)', sortant: 'Bruno Leroy', entrant: 'Emma Petit', civEntrant: 'Mme' }, ['Alice Martin', 'Bruno Leroy']);
    expect(h).toMatch(/Mme <strong>Emma Petit<\/strong> est substituée au colocataire sortant/);
    expect(h).toMatch(/Elle déclare/);
    expect(h).toMatch(/indivisiblement tenue, avec Mme <strong>Alice Martin<\/strong>, du paiement/);
  });
  it('ajout d\'un entrant → « adjoint », pas de phrase sur la restitution au sortant (il n\'y en a pas)', () => {
    const h = art({ act: 'Ajout d\'un colocataire', entrant: 'Hugo Bernard', civEntrant: 'M.' }, ['Alice Martin']);
    expect(h).toMatch(/M\. <strong>Hugo Bernard<\/strong> est adjoint au contrat/);
    expect(h).toMatch(/Il déclare/);
    expect(h).toMatch(/Mme <strong>Alice Martin<\/strong>, qui demeure dans les lieux, poursuit le bail aux conditions initiales\.$/);
    expect(h).not.toMatch(/dépôt de garantie/);
  });
  it('civilité inconnue → formes neutres conservées (jamais un genre deviné)', () => {
    const h = avenantArticle('coloc', { act: 'Remplacement (départ + arrivée)', sortant: 'X', entrant: 'Y', civEntrant: '—' }, { locataires: ['X', 'Z'], locDetail: [] }).html;
    expect(h).toMatch(/^M\. \/ Mme <strong>X<\/strong>/);
    expect(h).toMatch(/substitué\(e\)/);
    expect(h).toMatch(/Il \/ elle déclare/);
  });
  it('caution : « déchargée » pour Mme, « du locataire » / « des locataires » selon le bail, société sans civilité', () => {
    const ml = avenantArticle('caution', { act: 'Mainlevée (fin de caution)', civ: 'Mme', nom: 'Paule Martin' }, { locataires: ['A'] }).html;
    expect(ml).toMatch(/souscrit par Mme <strong>Paule Martin<\/strong>, qui se trouve déchargée/);
    const aj = avenantArticle('caution', { act: 'Ajout d\'une caution', civ: '—', nom: 'Action Logement', plafond: 1000 }, { locataires: ['A', 'B'] }).html;
    expect(aj).toMatch(/: <strong>Action Logement<\/strong> s'engage/);
    expect(aj).toMatch(/obligations des locataires/);
  });
  it('cautions nommées (retour 28/09) : celle du sortant prend fin, celle qui reste est maintenue', () => {
    const h = avenantArticle('coloc', { act: 'Départ (séparation), sans remplaçant', sortant: 'Bruno Leroy', cautionSortant: 'Jean Leroy' },
      { locataires: ['Alice Martin', 'Bruno Leroy'], locDetail, garants: ['Paul Martin', 'Jean Leroy'] }).html;
    expect(h).toMatch(/sa solidarité et celle de la personne qui s'est portée caution pour lui, <strong>Jean Leroy<\/strong>, prennent fin/);
    expect(h).toMatch(/L'engagement de <strong>Paul Martin<\/strong>, caution, n'est pas modifié par le présent avenant et demeure régi par son acte de cautionnement\./);
  });
  it('« Aucune caution » → seule la solidarité du sortant (singulier), cautions du bail maintenues', () => {
    const h = avenantArticle('coloc', { act: 'Départ (séparation), sans remplaçant', sortant: 'Bruno Leroy', cautionSortant: 'Aucune caution' },
      { locataires: ['Alice Martin', 'Bruno Leroy'], locDetail, garants: ['Paul Martin'] }).html;
    expect(h).toMatch(/1989, sa solidarité prend fin au plus tard/);
    expect(h).toMatch(/L'engagement de <strong>Paul Martin<\/strong>, caution, n'est pas modifié/);
  });
  it('caution non précisée → formule générique, et on ne prétend rien sur les autres cautions', () => {
    const h = avenantArticle('coloc', { act: 'Départ (séparation), sans remplaçant', sortant: 'Bruno Leroy', cautionSortant: '— À préciser' },
      { locataires: ['Alice Martin', 'Bruno Leroy'], locDetail, garants: ['Paul Martin', 'Jean Leroy'] }).html;
    expect(h).toMatch(/celle de la personne qui s'est portée caution pour lui prennent fin/);
    expect(h).not.toMatch(/n'est pas modifié|ne sont pas modifiés|À préciser/);
  });
  it('homonymes : seul le 1er « Jean Martin » part, l\'autre reste nommé avec SA civilité', () => {
    const ld = [{ nom: 'Jean Martin', civilite: 'Mme' }, { nom: 'Jean Martin', civilite: 'M.' }, { nom: 'Léa Roy', civilite: 'Mme' }];
    const locs = ['Jean Martin', 'Jean Martin', 'Léa Roy'];
    const h = avenantArticle('coloc', { act: 'Départ (séparation), sans remplaçant', sortant: 'Jean Martin' }, { locataires: locs, locDetail: ld }).html;
    expect(h).toMatch(/^Mme <strong>Jean Martin<\/strong> cesse/);
    expect(h).toMatch(/caution pour elle/);
    expect(h).toMatch(/M\. <strong>Jean Martin<\/strong> et Mme <strong>Léa Roy<\/strong>, poursuivent/);
    const doc = buildAvenantHtml({ bailleur: 'SCI', locataires: locs, locDetail: ld, effetIso: '2026-09-30', ville: 'Lyon',
      objets: [{ k: 'coloc', data: { act: 'Départ (séparation), sans remplaçant', sortant: 'Jean Martin' } }] }).html;
    const roles = [...doc.matchAll(/<div class="pro-signbox">([^<]*)<br>/g)].map(m => m[1]);
    expect(roles).toEqual(['Le bailleur', 'La colocataire sortante', 'Le locataire', 'La locataire']);
  });
  it('ajout avec plusieurs colocataires : « Les colocataires en place » (personne ne « demeure », personne ne part)', () => {
    const h = art({ act: 'Ajout d\'un colocataire', entrant: 'Hugo Bernard', civEntrant: 'M.' }, ['Alice Martin', 'Bruno Leroy']);
    expect(h).toMatch(/Les colocataires en place, Mme <strong>Alice Martin<\/strong> et M\. <strong>Bruno Leroy<\/strong>, poursuivent le bail aux conditions initiales\.$/);
  });
  it('entrant saisi avec des espaces seuls → pas d\'entrant (ni cadre vide, ni case de paraphe)', () => {
    expect(avenantEntrant([{ k: 'coloc', data: { act: 'Ajout d\'un colocataire', entrant: '   ' } }])).toBe('');
    expect(avenantEntrant([{ k: 'coloc', data: { act: 'Ajout d\'un colocataire', entrant: ' Hugo ' } }])).toBe('Hugo');
    expect(avenantEntrant([{ k: 'coloc', data: { act: 'Départ (séparation), sans remplaçant', entrant: 'Hugo' } }])).toBe('');
  });
  it('document : « La locataire », « La colocataire sortante » dans les parties et les cadres', () => {
    const h = buildAvenantHtml({ bailleur: 'SCI', locataires: ['Alice Martin', 'Bruno Leroy'], locDetail, effetIso: '2026-09-30', ville: 'Lyon',
      objets: [{ k: 'coloc', data: { act: 'Départ (séparation), sans remplaçant', sortant: 'Alice Martin' } }] }).html;
    const roles = [...h.matchAll(/<div class="pro-signbox">([^<]*)<br>/g)].map(m => m[1]);
    expect(roles).toEqual(['Le bailleur', 'La colocataire sortante', 'Le locataire']);
    const seule = buildAvenantHtml({ bailleur: 'SCI', locataires: ['Alice Martin'], locDetail, effetIso: '2026-09-30', ville: 'Lyon', objets: [] }).html;
    expect(seule).toMatch(/<h2>La locataire<\/h2>/);
  });
});

describe('mention du bail modifié', () => {
  const base = { bailleur: 'SCI', locataires: ['A', 'B'], bien: 'rue X', dateBail: '2023-01-01', effetIso: '2026-01-01', ville: 'Colmar',
                 objets: [{ k: 'clause', data: { titre: 'T', texte: 'x' } }] };
  it('bail signé dans l\'app → « signé le »', () => {
    expect(buildAvenantHtml({ ...base, bailSigne: true }).html).toMatch(/Bail d'habitation signé le/);
  });
  it('bail NON signé dans l\'app → « en date du » (jamais « signé le » affirmé à tort)', () => {
    const h = buildAvenantHtml({ ...base, bailSigne: false }).html;
    expect(h).toMatch(/Bail d'habitation en date du/);
    expect(h).not.toMatch(/signé le/);
  });
  it('rétrocompat : bailSigne absent → « signé le » (comportement historique)', () => {
    expect(buildAvenantHtml({ ...base }).html).toMatch(/signé le/);
  });
  it('une dateBail non-date est échappée (plus de rendu brut)', () => {
    const h = buildAvenantHtml({ ...base, dateBail: '<img src=x onerror=1>' }).html;
    expect(h).not.toMatch(/<img/);
  });
});
