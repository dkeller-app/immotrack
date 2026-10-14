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
  it('filmer passe par l’accord tant qu’aucun accord n’est enregistré pour l’EDL', () => {
    const f = bloc.slice(bloc.indexOf('function _edlVideoFilmer('), bloc.indexOf('function _edlVideoVueAccord('));
    expect(f).toMatch(/if \(_edlVideoAccords\.length\) \{ _edlVideoDemarrer\(\); return; \}/);
    expect(f).toContain('lignesAccord(');
  });
  it('« Filmer » refusé sans l’accord de chaque présent ; accords horodatés enregistrés', () => {
    const f = bloc.slice(bloc.indexOf('function _edlVideoAccordOk('), bloc.indexOf('function _edlVideoSansVideo('));
    expect(f).toContain('peutFilmer(_EVX.accord).ok');
    expect(f).toContain('enregistrerAccords(_EVX.accord)');
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
  it('envoi reprenable (TUS), jamais d’écrasement ; un fichier existant compte comme envoyé', () => {
    expect(entry).toContain('window.__immoCloudUploadResumable = async function');
    expect(entry).toContain("if (r.ok || r.code === 'existe') return { ok: true, path");
    expect(lire('js/core/tus-client.js')).toContain("'x-upsert': 'false'");
  });
  it('registre 0058 tolérant (table absente / EDL pas synchronisé), sans écrasement', () => {
    expect(entry).toContain("upsert(ligne, { onConflict: 'storage_path', ignoreDuplicates: true })");
    expect(entry).toContain("'table_absente'");
  });
  it('limite de fichier = celle annoncée par le relais (plan gratuit : 50 Mo), contrôlée avant l’envoi', () => {
    expect(bloc).toContain('_EVX.video.fichierMaxOctets');
    expect(bloc).toMatch(/controlerFichier\(\{ octets: buf\.byteLength, maxOctets: _edlVideoMaxOctets\(\) \}\)/);
  });
  it('la copie locale n’est effacée qu’APRÈS l’envoi réussi', () => {
    const f = bloc.slice(bloc.indexOf('async function _edlVideoEnvoyer('), bloc.indexOf('async function _edlVideoEnregistrer('));
    expect(f.indexOf('meta.cloudKey = r.path')).toBeGreaterThan(0);
    expect(f.indexOf('st.del(id)')).toBeGreaterThan(f.indexOf('meta.cloudKey = r.path'));
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
