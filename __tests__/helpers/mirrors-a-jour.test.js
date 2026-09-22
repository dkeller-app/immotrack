/**
 * mirrors-a-jour.test.js — LE garde-fou contre un correctif qui ne s'applique pas.
 *
 * LE PIÈGE, constaté pour de vrai sur ce dépôt (correctif AUDIT-C1, import bancaire) :
 * le module ES `js/core/bank-import.js` avait été corrigé, ses tests étaient verts, et le
 * mirror `js/helpers/bank-import.global.js` — jamais régénéré — portait encore l'ancienne
 * logique. Or le mirror n'est pas décoratif : c'est lui que le navigateur exécute en mode
 * `file://`, et chaque fois que `js/main.js` n'est pas servi (service-worker périmé). Le
 * correctif existait, ses tests passaient, et il ne s'appliquait pas.
 *
 * Rien ne pouvait le détecter : `tools/sync-helpers-global-mirrors.mjs` n'avait qu'un mode
 * ÉCRITURE. Il fallait le lancer puis lire `git status` — ce que personne ne fait.
 *
 * Deux barrières ici, volontairement différentes :
 *  1. STRUCTURELLE — le générateur en mode `--check` : AUCUN mirror ne diverge de sa source.
 *     Générique, elle couvre les 23 paires sans rien à maintenir.
 *  2. COMPORTEMENTALE — on exécute le MIRROR (pas le module) et on lui repose la question
 *     d'argent qui avait été manquée. Une barrière structurelle seule pourrait être
 *     contournée par une régénération à partir d'une source elle-même cassée.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dir, '../..');

describe('Mirrors — aucun `js/helpers/*.global.js` ne diverge de sa source', () => {
  it('le générateur en mode --check ne signale aucune dérive', () => {
    let sortie = '';
    let code = 0;
    try {
      sortie = execFileSync(
        process.execPath,
        [resolve(repoRoot, 'tools/sync-helpers-global-mirrors.mjs'), '--check'],
        { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
      );
    } catch (e) {
      code = e.status == null ? -1 : e.status;
      sortie = String(e.stdout || '') + String(e.stderr || '');
    }
    // Le message d'échec PORTE la sortie : sinon on lit « exit 1 » sans savoir pourquoi.
    // Et il ne PRÉSUME pas de la cause : le générateur sort aussi en 1 sur une source absente,
    // un import non supporté ou un sanity check rouge. Annoncer « dérive » dans ces cas-là
    // enverrait chercher au mauvais endroit — la sortie ci-dessous, elle, dit la vérité.
    expect(code, 'le contrôle des mirrors a échoué (dérive, source absente ou sanity check) :\n' + sortie).toBe(0);
  });

  it('… et le mode --check n\'écrit rien (sinon il masquerait la dérive au lieu de la dire)', () => {
    const cible = resolve(repoRoot, 'js/helpers/bank-import.global.js');
    const avant = readFileSync(cible, 'utf8');
    try {
      execFileSync(process.execPath,
        [resolve(repoRoot, 'tools/sync-helpers-global-mirrors.mjs'), '--check'],
        { cwd: repoRoot, encoding: 'utf8', stdio: 'ignore' });
    } catch (e) { /* le code de sortie est l'affaire du test précédent */ }
    expect(readFileSync(cible, 'utf8')).toBe(avant);
  });
});

/**
 * Charge un mirror IIFE comme le ferait un `<script src>` : il s'attache à `window`.
 * On interroge ensuite EXACTEMENT les symboles que le navigateur verrait.
 */
function chargerMirror(chemin) {
  const code = readFileSync(resolve(repoRoot, chemin), 'utf8');
  const bac = { window: {}, console };
  vm.createContext(bac);
  vm.runInContext(code, bac, { filename: chemin });
  return bac.window;
}

describe('AUDIT-C1 — le correctif d\'argent est VRAIMENT dans le fichier que le navigateur charge', () => {
  let _bankDedup;
  beforeAll(() => { _bankDedup = chargerMirror('js/helpers/bank-import.global.js')._bankDedup; });

  const mv = (o) => ({ id: 1, date: '2026-08-05', lib: 'X', db: 0, cr: 0, _source: 'bank_import', ...o });

  it('le mirror expose bien _bankDedup (sinon les cas suivants seraient vrais par le vide)', () => {
    expect(typeof _bankDedup).toBe('function');
  });

  it('Même empreinte sur un AUTRE compte → PAS un doublon certain', () => {
    // Deux SCI, même syndic : même jour, même montant, même libellé. Sans le scoping au
    // compte, l'opération du 2e compte était déclarée « doublon certain » et écartée SANS
    // un clic — un encaissement ou une charge manquant dans les livres, en silence.
    const base = [mv({ id: 7, cr: 850, _fingerprint: 'FP-X', _bankAccountId: 1 })];
    const r = _bankDedup(
      [{ date: '2026-08-05', libelle: 'SYNDIC', debit: 0, credit: 850, _fingerprint: 'FP-X' }],
      base, { accountId: 2, legacyFallback: false });
    expect(r[0].dupLevel).not.toBe('certain');
  });

  it('Même empreinte sur le MÊME compte → doublon certain (la dédup reste utile)', () => {
    const base = [mv({ id: 7, cr: 850, _fingerprint: 'FP-X', _bankAccountId: 1 })];
    const r = _bankDedup(
      [{ date: '2026-08-05', libelle: 'SYNDIC', debit: 0, credit: 850, _fingerprint: 'FP-X' }],
      base, { accountId: 1, legacyFallback: false });
    expect(r[0].dupLevel).toBe('certain');
  });

  it('Empreinte d\'un mouvement legacy sans compte → toujours reconnue', () => {
    // Les imports d'avant le suivi par compte ne doivent pas redevenir invisibles.
    const base = [mv({ id: 7, cr: 850, _fingerprint: 'FP-Y' })];
    const r = _bankDedup(
      [{ date: '2026-08-05', libelle: 'X', debit: 0, credit: 850, _fingerprint: 'FP-Y' }],
      base, { accountId: 9, legacyFallback: false });
    expect(r[0].dupLevel).toBe('certain');
  });

  it('La ressemblance date/montant ne traverse pas non plus la frontière du compte', () => {
    // Stratégie 3 (heuristique date ±3 j / montant ±1 €) : le SECOND volet du correctif
    // (`scopedAlive`). ⚠️ SURTOUT PAS de `legacyFallback: false` ici : c'est le drapeau qui
    // ÉTEINT la stratégie 3 (`bank-import.js`, « if (!isDuplicate && legacyFallback) »), et
    // l'assertion devenait vraie par construction — le test passait à l'identique sur
    // l'ancien mirror. La production, elle, n'envoie que `{ accountId }` : le repli est ACTIF.
    // Sans ce garde-fou, une opération du compte B ressortait « doublon probable », ce qui
    // BLOQUE la validation de l'import et pousse à écarter une opération réelle.
    const base = [mv({ id: 7, cr: 850, lib: 'SYNDIC MARTIN', _bankAccountId: 1 })];
    const r = _bankDedup(
      [{ date: '2026-08-05', libelle: 'SYNDIC MARTIN', debit: 0, credit: 850 }],
      base, { accountId: 2 });
    expect(r[0].isDuplicate).toBe(false);
  });

  it('… mais sur le MÊME compte, la ressemblance reste signalée (le repli garde son utilité)', () => {
    const base = [mv({ id: 7, cr: 850, lib: 'SYNDIC MARTIN', _bankAccountId: 1 })];
    const r = _bankDedup(
      [{ date: '2026-08-05', libelle: 'SYNDIC MARTIN', debit: 0, credit: 850 }],
      base, { accountId: 1 });
    expect(r[0].dupLevel).toBe('probable');
  });
});
