/**
 * __tests__/helpers/edl-video-cablage.test.js — chantier EDL-VIDEO-IA : le monolithe (gelé) ne fait qu'APPELER
 * les modules testés. Ces tests lisent le code source pour vérifier les points de câblage qui protègent
 * les données et tiennent les décisions de Didier (14/10) : interrupteur, accord, persistance, PDF, gestes.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..', '..');
const lire = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const p2 = lire('js/app/app-part2.js');
const entry = lire('js/app/supabase-entry.js');
const bloc = p2.slice(p2.indexOf('EDL-VIDEO-IA — FILMER LA PIÈCE'), p2.indexOf('EDL-TÉLÉPHONE — CHARTE MOBILE'));

describe('interrupteur : « Filmer » seulement si le relais ouvre la vidéo', () => {
  it('le statut du relais pilote _EVX.video ; « Filmer » exige video.actif === true', () => {
    expect(p2).toContain("_EVX.video = r.video || { actif: false };");
    expect(bloc).toMatch(/function _edlVideoOuverte\(\) \{[\s\S]*?_EVX\.video\.actif === true/);
    expect(bloc).toMatch(/function _edlVideoDispo\(\) \{[\s\S]*?_edlVoixDispo\(\)[\s\S]*?_edlVideoOuverte\(\)/);
  });
  it('la barre de pièce garde « Dicter la pièce » quand la vidéo est éteinte', () => {
    const s = p2.slice(p2.indexOf('function _edlVoixSlotInner(pi)'), p2.indexOf('function _edlVoixBoutonPC(pi)'));
    expect(s).toContain('M.EdlVoixVues.barrePiece(pi');
    expect(s).toContain('barrePieceVideo(pi');
  });
});

describe('accord des locataires présents (décisions 1-2)', () => {
  it('filmer passe par l’accord dès qu’un locataire de l’EDL n’a pas d’accord (arrivé, ajouté, absent plus tôt)', () => {
    const f = bloc.slice(bloc.indexOf('function _edlVideoFilmer('), bloc.indexOf('function _edlVideoVueAccord('));
    expect(f).toContain('if (!M.EdlVideo.accordManquant(noms, _edlVideoAccords)) { _edlVideoDemarrer(); return; }');
    expect(f).toContain('lignesAccordAvec(noms, _edlVideoAccords)');
  });
  it('« Filmer » refusé sans l’accord de chaque présent ; accords horodatés enregistrés', () => {
    const f = bloc.slice(bloc.indexOf('function _edlVideoAccordOk('), bloc.indexOf('function _edlVideoSansVideo('));
    expect(f).toContain('peutFilmer(_EVX.accord).ok');
    expect(f).toContain('enregistrerAccords(_EVX.accord, { existants: _edlVideoAccords, version: M.IaTransparence.versionNoticeVideo() })');
  });
});

describe('persistance dans l’EDL (et dans l’instantané signé)', () => {
  it('saveEDL enregistre videos (metaVideo) et videoAccords ; rechargés à l’ouverture ; remis à zéro', () => {
    expect(p2).toMatch(/videos: \(window\.EdlVideo \? _edlVideos\.map\(window\.EdlVideo\.metaVideo\)/);
    expect(p2).toContain('videoAccords: JSON.parse(JSON.stringify(_edlVideoAccords || []))');
    const open = p2.slice(p2.indexOf('async function openEditEDL('), p2.indexOf('async function openEditEDL(') + 5000);
    expect(open).toContain('_edlVideos = Array.isArray(e.videos)');
    const reset = p2.slice(p2.indexOf('function _edlResetGlobalState()'), p2.indexOf('function _edlResetGlobalState()') + 900);
    expect(reset).toContain('_edlVideos = []; _edlVideoAccords = [];');
  });
  it('les champs de l’enregistrement passent AVANT la capture de l’instantané signé', () => {
    const save = p2.slice(p2.indexOf('const record={'), p2.indexOf('record.signatures.edlSnapshot = JSON.parse'));
    expect(save).toContain('videos:');
  });
});

describe('envoi et registre', () => {
  it('envoi reprenable (TUS), jamais d’écrasement ; un fichier déjà présent n’est tenu pour envoyé qu’après contrôle de sa taille', () => {
    expect(entry).toContain('window.__immoCloudUploadResumable = async function');
    expect(entry).toContain("if (r.code === 'existe') return { ok: true, path, url: '', existait: true }");
    const f = bloc.slice(bloc.indexOf('async function _edlVideoEnvoyerUne('), bloc.indexOf('function _edlVideoPoserChemin('));
    expect(f).toMatch(/if \(r\.existait\) \{[\s\S]*?taille !== local\.buf\.byteLength[\s\S]*?return; \}/);
    expect(lire('js/core/tus-client.js')).toContain("'x-upsert': 'false'");
  });
  it('registre 0058 tolérant (table absente / EDL pas synchronisé), sans écrasement', () => {
    expect(entry).toContain("client.from('edl_medias').insert(ligne)");
    expect(entry).toContain("String(ex.edl_legacy_id) === String(o.edlLocalId) ? { ok: true } : { ok: false, code: 'conflit' }");
    expect(entry).toContain("'table_absente'");
    expect(entry).toContain(".eq('espace_id', o.espace).eq('edl_legacy_id'");
  });
  it('limite de fichier = celle annoncée par le relais (plan gratuit : 50 Mo), contrôlée avant l’envoi', () => {
    expect(bloc).toContain('_EVX.video.fichierMaxOctets');
    expect(bloc).toMatch(/controlerFichier\(\{ octets: buf\.byteLength, maxOctets: _edlVideoMaxOctets\(\) \}\)/);
  });
  it('relecture C1 : chemin posé sur l’enregistrement VIVANT, copie locale effacée seulement si l’écriture a réussi', () => {
    const f = bloc.slice(bloc.indexOf('async function _edlVideoEnvoyerUne('), bloc.indexOf('function _edlVideoPoserChemin('));
    expect(f).toContain('const ecrit = _edlVideoPoserChemin(id, r.path);');
    expect(f).toContain('if (ecrit) { try { await st.del(id); } catch (_) {} }');
    const p = bloc.slice(bloc.indexOf('function _edlVideoPoserChemin('), bloc.indexOf('async function _edlVideoRetrouver('));
    expect(p).toContain('const recV = _edlVideoRecDe(id);');
    expect(p).toContain("saveDB({ autosave: true, quoi: 'edl-photo' })");
  });
  it('relecture I1/I8 : envois en série (un seul à la fois), jamais deux du même objet ; rien tenté hors ligne', () => {
    const f = bloc.slice(bloc.indexOf('function _edlVideoEnvoyer('), bloc.indexOf('async function _edlVideoEnvoyerUne('));
    expect(f.indexOf('_EVX.venvoyant.add(id)')).toBeLessThan(f.indexOf('_edlVideoEnvoyerUne(id)'));
    expect(f).toContain('_EVX.vchaine = (_EVX.vchaine || Promise.resolve()).then(');
    expect(bloc).toMatch(/function _edlVideoReprendreEnvois\(\) \{[\s\S]*?navigator\.onLine !== false[\s\S]*?if \(!enLigne\) continue;/);
  });
  it('relecture I5 : la conservation lit aussi les baux archivés (restitution du dépôt), sans les supprimés', () => {
    expect(bloc).toContain("[...Object.values(DB.baux || {}), ...(DB.baux_historique || [])].filter((b) => b && typeof b === 'object' && !b._deleted && b.ref === ref)");
  });
  it('relecture I4 : « Terminer la relecture » ne jette pas en silence les photos « vu, pas dit »', () => {
    const f = p2.slice(p2.indexOf('async function _edlVoixFinRelecture('), p2.indexOf('async function _edlVoixFinRelecture(') + 1600);
    expect(f).toContain('vusRestants');
    expect(f).toContain('confirm2(');
  });
});

describe('relecture : photos gardées avec « Accepter », retirées par « Annuler »', () => {
  it('_edlVoixInscrireProp ajoute les photos non écartées et les note dans la décision', () => {
    const f = p2.slice(p2.indexOf('async function _edlVoixInscrireProp('), p2.indexOf('function _edlVoixApresEcriture('));
    expect(f).toContain('_edlVideoAjouterPhotos(x, eid, pi, ei)');
    expect(f).toContain('photos } : {})');
  });
  it('Annuler retire ces photos ; les photos de la vidéo portent la preuve indexée', () => {
    expect(p2).toContain('_edlVideoRetirerPhotos(d.pi, d.ei, d.photos)');
    expect(bloc).toContain('ph.video = M.EdlVideo.metaPhotoVideo(');
    expect(bloc).toContain('_edlIngestPhoto(blob)');
  });
});

describe('PDF', () => {
  const gen = p2.slice(p2.indexOf('async function generateEDLPdfNative('), p2.indexOf('async function uploadEDLPDFToDrive('));
  it('légende des photos de la vidéo (instant) et cadre « Vidéos » avec empreinte, accord, copie sur demande', () => {
    expect(gen).toContain('legendePhoto(ph.video');
    expect(gen).toContain('Vidéos de l’état des lieux');
    expect(gen).toContain('lignesVideosPdf(edl)');
    expect(gen).toContain('MENTION_COPIE_VIDEO');
  });
  it('le cadre « Vidéos » précède les signatures (aucune coordonnée de signature ne bouge après)', () => {
    expect(gen.indexOf('Vidéos de l’état des lieux')).toBeLessThan(gen.indexOf("pdf.text('Le(s) locataire(s)'"));
  });
});

describe('gestes', () => {
  it('aucun geste vidéo ne commence par edl[A-Z] (autosave au clic)', () => {
    const vues = lire('js/core/edl-video-vues.js');
    for (const m of vues.matchAll(/onclick="([^"]+)"/g)) expect(m[1]).not.toMatch(/^\s*edl[A-Z]/);
    for (const m of bloc.matchAll(/^(?:async )?function (\w+)\(/gm)) expect(m[1]).toMatch(/^_/);
  });
});
