#!/usr/bin/env node
// VERIF-DOCUMENTS — instantané hors ligne de la liste de confiance 2D-Doc (js/vendor/2ddoc-instantane.json).
// Récupère, comme le relais (relay/src/deux-d-doc-confiance.js), les annuaires de certificats et les listes de
// révocation des autorités ANCRÉES (js/core/deux-d-doc-ancres.js). Données publiques, aucune donnée personnelle.
// L'app ne s'en sert que si le relais ne répond pas ; tout y est revérifié contre les ancres, et une liste de
// révocation périmée rend le contrôle « reporté » (jamais « valide »). À relancer avant chaque livraison :
//   node tools/2ddoc-instantane.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collecter } from '../relay/src/deux-d-doc-confiance.js';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const d = await collecter((u, o) => fetch(u, o));
d.source = 'instantane';
const vides = Object.entries(d.autorites).filter(([, a]) => !a.certificats.length).map(([k]) => k);
const sansCrl = Object.entries(d.autorites).filter(([, a]) => !a.crl).map(([k]) => k);
if (vides.length === Object.keys(d.autorites).length) { console.error('Aucune autorité joignable : instantané non écrit.'); process.exit(1); }
const cible = path.join(racine, 'js', 'vendor', '2ddoc-instantane.json');
fs.writeFileSync(cible, JSON.stringify(d));
console.log(`Instantané écrit : ${cible} (${Math.round(fs.statSync(cible).size / 1024)} Ko) — ${d.genereLe}`);
for (const [k, a] of Object.entries(d.autorites)) console.log(`  ${k} : ${a.certificats.length} certificats, liste de révocation ${a.crl ? 'oui' : 'NON'}`);
if (vides.length) console.log('  Annuaires injoignables : ' + vides.join(', '));
if (sansCrl.length) console.log('  Révocations injoignables : ' + sansCrl.join(', '));
