#!/usr/bin/env node
// VERIF-DOCUMENTS — vérifie que le point d'accès UE de Mistral (api.eu.mistral.ai) sert la lecture de documents
// (/v1/ocr avec annotation structurée) AVANT d'allumer AI_OCR (cf. relay/src/ai/ocr.js). Aucune donnée personnelle :
// la page envoyée est une image blanche synthétique.
// Usage : copier la clé Mistral dans le presse-papiers (ou MISTRAL_API_KEY dans l'environnement), puis
//   node relay/scripts/verif-ocr-ue.mjs
// La clé n'est jamais affichée ni écrite.
import { execFileSync } from 'node:child_process';

const BASE = 'https://api.eu.mistral.ai';
let cle = process.env.MISTRAL_API_KEY || '';
if (!cle) { try { cle = execFileSync('powershell', ['-NoProfile', '-Command', 'Get-Clipboard -Raw'], { encoding: 'utf8' }).trim(); } catch { cle = ''; } }
if (!/^[A-Za-z0-9_-]{20,}$/.test(cle)) { console.error('Clé Mistral absente : la copier dans le presse-papiers (ou MISTRAL_API_KEY), puis relancer.'); process.exit(1); }
const auth = { Authorization: `Bearer ${cle}` };
// PNG blanc 64×64 (synthétique).
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAd0lEQVR4AeXBAQEAAAiAIPP/5+qHMPsIkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJkziJk7gDVToEfLfAjjsAAAAASUVORK5CYII=';

const m = await fetch(`${BASE}/v1/models`, { headers: auth });
if (!m.ok) { console.error(`Liste des modèles sur ${BASE} : HTTP ${m.status}.`); process.exit(2); }
const ids = ((await m.json()).data || []).map((x) => x.id);
const ocr = ids.filter((id) => /ocr/i.test(id));
console.log(`Modèles d'OCR servis par ${BASE} : ${ocr.length ? ocr.join(', ') : 'AUCUN'}`);
if (!ocr.length) { console.error('Le point d\'accès UE ne sert pas de modèle d\'OCR : laisser AI_OCR éteint (décision : brique reportée).'); process.exit(3); }

const schema = { type: 'object', additionalProperties: false, required: ['lisible', 'netAPayer'], properties: { lisible: { type: 'boolean' }, netAPayer: { type: ['number', 'null'] } } };
const r = await fetch(`${BASE}/v1/ocr`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({
  model: 'mistral-ocr-latest', document: { type: 'image_url', image_url: PNG }, include_image_base64: false,
  document_annotation_format: { type: 'json_schema', json_schema: { name: 'essai', schema, strict: true } },
  document_annotation_prompt: 'Document de test vide : lisible = false, netAPayer = null.' }) });
const corps = await r.text();
if (!r.ok) { console.error(`/v1/ocr sur ${BASE} : HTTP ${r.status} — ${corps.slice(0, 200)}`); process.exit(4); }
const j = JSON.parse(corps);
let annot = null; try { annot = typeof j.document_annotation === 'string' ? JSON.parse(j.document_annotation) : j.document_annotation; } catch { annot = null; }
console.log(`/v1/ocr sur ${BASE} : OK (modèle ${j.model || '?'}, pages ${j.usage_info ? j.usage_info.pages_processed : '?'}), annotation ${annot ? 'structurée reçue' : 'ABSENTE'}.`);
if (!annot) process.exit(5);
console.log('Point d\'accès UE vérifié. Étapes suivantes : rétention zéro demandée à Mistral, puis AI_OCR = "true" (wrangler.toml ou tableau de bord).');
