#!/usr/bin/env node
/**
 * Build index-standalone.html : index.html avec css/main.css INLINÉ.
 * Usage : node scripts/build-standalone.mjs
 *
 * Permet d'uploader UN SEUL fichier sur GitHub Pages / hébergement statique
 * sans avoir à uploader le dossier css/ séparément.
 *
 * v15.38 — créé suite à test user GitHub Pages où le css/main.css n'avait
 * pas été uploadé (rendu HTML brut sans style).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'index.html');
const CSS = path.join(ROOT, 'css', 'main.css');
const OUT = path.join(ROOT, 'index-standalone.html');

const html = fs.readFileSync(SRC, 'utf8');
const css  = fs.readFileSync(CSS, 'utf8');
const needle = '<link rel="stylesheet" href="css/main.css">';

if (!html.includes(needle)) {
  console.error('FAIL: link <link rel="stylesheet" href="css/main.css"> introuvable dans index.html');
  process.exit(1);
}

const out = html.replace(needle, '<style>\n' + css + '\n</style>');
fs.writeFileSync(OUT, out, 'utf8');

const kb = (out.length / 1024).toFixed(0);
console.log(`✓ index-standalone.html généré (${kb} KB) — prêt à uploader`);
