/**
 * R0-B (AUDIT-GLOBAL) — l'Accueil filtrait les impayés sur un CACHE, pas sur le moteur.
 *
 * `_computeImpayes` porte en commentaire : « Accueil = Finances au centime PAR CONSTRUCTION
 * (invariant testé) ». Elle lisait bien `byLot` du maître… puis filtrait sa sortie par
 * `scopeLogs.filter(l => l.locataire)`.
 *
 * Or `l.locataire` n'est qu'un cache dénormalisé : `_resyncLocatairesFromBaux` ne le remplit que
 * SI le bail porte un nom. Un bail repris à l'achat, ou une saisie en cours, le laisse vide.
 *
 * Scénario mesuré dans l'audit : lot à bail repris actif, 900 €/mois au barème, rien payé depuis
 * janvier. Finances compte 8 100 € de retard ; l'Accueil affichait 0 impayé. Et le moteur inclut
 * ces lots DÉLIBÉRÉMENT (`finances-monthly.js` : « un locataire qui ne paie RIEN de l'année est
 * le pire retard, il ne doit pas être invisible »). Le filtre annulait exactement la garantie
 * que le moteur venait de donner.
 *
 * Ces tests lisent la source d'`index.html` : la fonction vit dans le monolithe, et c'est le
 * CÂBLAGE qui était faux, pas un calcul.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');
let html;
beforeAll(() => { html = readFileSync(resolve(repoRoot, 'index.html'), 'utf8').replace(/\r/g, ''); });

const codeSeul = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
function corpsDe(src, nom) {
  const i = src.indexOf('function ' + nom + '(');
  if (i === -1) return null;
  const j = src.indexOf('\n}', i);
  return j === -1 ? null : src.slice(i, j + 2);
}

describe('R0-B — la bulle Impayés ne re-filtre plus la sortie du maître', () => {
  it('_computeImpayes existe (sinon ce fichier serait vrai par le vide)', () => {
    expect(corpsDe(html, '_computeImpayes')).toBeTruthy();
  });

  it('elle lit bien le moteur Finances', () => {
    const code = codeSeul(corpsDe(html, '_computeImpayes'));
    expect(code, 'la façade ne lit plus le maître').toMatch(/_finMonthly\s*\(/);
    expect(code).toMatch(/byLot/);
  });

  it('elle ne filtre PLUS les lots sur le cache `l.locataire`', () => {
    const code = codeSeul(corpsDe(html, '_computeImpayes'));
    expect(code, 'le cache re-filtre la sortie du moteur').not.toMatch(/filter\s*\(\s*l\s*=>\s*l\.locataire\s*\)/);
  });

  it('le seuil qui décide reste celui du maître', () => {
    // C'est `reste > 0.5` qui fait entrer un lot dans la bulle — pas la présence d'un nom.
    expect(codeSeul(corpsDe(html, '_computeImpayes'))).toMatch(/reste\s*>\s*0\.5/);
  });

  it('un impayé sans nom en cache reste lisible (repli sur le bail)', () => {
    const code = codeSeul(corpsDe(html, '_computeImpayes'));
    expect(code, 'une ligne d’impayé sans nom est illisible').toMatch(/_bienActiveBail/);
  });
});

describe('R0-E — le moteur d’occupation connaît la tacite reconduction', () => {
  it('`_calcOccDays` distingue le bail courant des baux archivés', () => {
    // Un bail d'historique est terminé PAR CONSTRUCTION et doit toujours être borné ;
    // le bail courant, lui, ne se termine que s'il est clôturé.
    const bilan = readFileSync(resolve(repoRoot, 'js/core/legal-bilan.js'), 'utf8').replace(/\r/g, '');
    expect(bilan).toMatch(/_calcOccDays\s*\(\s*bailCourant\s*,\s*hists?/);
    expect(bilan, 'l’ancienne signature mélangeait courant et archivés').not.toMatch(/_calcOccDays\s*\(\s*allBails/);
  });

  it('la fin d’un bail ne se déduit plus de sa seule date de fin', () => {
    const bilan = codeSeul(readFileSync(resolve(repoRoot, 'js/core/legal-bilan.js'), 'utf8').replace(/\r/g, ''));
    // L'ancienne forme : `b.fin ? … : toTs` — la date de fin décidait à elle seule.
    expect(bilan, 'un bail reconduit redeviendrait « vacant »').not.toMatch(/b\.fin\s*\?\s*new Date/);
    expect(bilan).toMatch(/cloture\s*\|\|\s*b\.finEffective/);
  });

  it('la liste des vacants ne s’appuie plus sur le cache non plus', () => {
    const bilan = codeSeul(readFileSync(resolve(repoRoot, 'js/core/legal-bilan.js'), 'utf8').replace(/\r/g, ''));
    expect(bilan, 'le cache décidait de la vacance').not.toMatch(/!bailCourant\s*&&\s*!l\.locataire/);
  });
});
