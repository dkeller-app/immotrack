// relay/scripts/eval-edl.mjs — MESURE DE QUALITÉ RÉELLE de la dictée d'EDL (fournisseur Mistral).
//
// Usage (Node ≥ 18, depuis relay/) — la clé ne s'écrit jamais dans un fichier versionné :
//   MISTRAL_API_KEY=… node scripts/eval-edl.mjs                         # structuration seule, texte de référence
//   MISTRAL_API_KEY=… node scripts/eval-edl.mjs chemin/vers/audio.m4a   # transcription Voxtral + structuration
//   AI_MODEL_STRUCTURE=mistral-medium-latest MISTRAL_API_KEY=… node scripts/eval-edl.mjs   # comparer un modèle
//   AI_PROVIDER=fake node scripts/eval-edl.mjs                          # base : fournisseur simulé
// Sortie : mesures (cf. src/ai/eval-edl.js), durées, jetons. Aucun contenu n'est envoyé ailleurs qu'à Mistral.
import { readFile } from 'node:fs/promises';
import { makeAiProvider } from '../src/ai/provider.js';
import * as T from '../src/ai/tasks/edl-piece.js';
import { mesurerEdl } from '../src/ai/eval-edl.js';
import { CUISINE_INPUT, CUISINE_ATTENDU } from '../test/fixtures/edl-cuisine.js';

const env = { ...process.env };
const ia = makeAiProvider(env);
if (!ia) { console.error('Aucun fournisseur : définir MISTRAL_API_KEY (ou AI_PROVIDER=fake).'); process.exit(2); }

let texte = CUISINE_INPUT.texte;
const fichier = process.argv[2];
if (fichier) {
  const audio = await readFile(fichier);
  const mime = fichier.endsWith('.webm') ? 'audio/webm' : fichier.endsWith('.mp3') ? 'audio/mpeg' : fichier.endsWith('.wav') ? 'audio/wav' : 'audio/mp4';
  const t0 = Date.now();
  const t = await ia.transcrire({ audio, mime, langue: 'fr', vocabulaire: T.VOCABULAIRE });
  console.log(`Transcription (${t.modele}) : ${t.audioSec} s d'audio en ${Date.now() - t0} ms`);
  console.log(t.text);
  texte = t.text;
}
const input = T.validerEntree({ ...CUISINE_INPUT, texte }).input;
const t1 = Date.now();
const r = await ia.structurer({ tache: 'edl-piece', messages: T.messages(input), jsonSchema: T.jsonSchema, input });
const v = T.validerSortie(r.data, input);
console.log(`Structuration (${r.modele}) : ${Date.now() - t1} ms, jetons ${r.jetonsE} → ${r.jetonsS}, rejets ${v.ok ? v.rejets : 'sortie illisible'}`);
if (!v.ok) process.exit(1);
for (const p of v.data.propositions) console.log(`- ${input.elements[Number(p.elementId)].nom} | ${p.etat || '—'} | ${p.observation || ''} | « ${p.source} »${p.aVerifier ? ' | à vérifier : ' + p.aVerifier : ''}`);
for (const a of v.data.aAjouter) console.log(`+ à ajouter : ${a.nom} | « ${a.source} »`);
const m = mesurerEdl(v.data, CUISINE_ATTENDU);
console.log(JSON.stringify(m, null, 2));
if (fichier) console.log('NB : mesure faite sur la transcription Voxtral (les extraits attendus peuvent différer de Whisper).');
