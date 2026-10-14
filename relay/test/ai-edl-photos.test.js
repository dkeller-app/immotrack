// Tâche edl-photos (état des lieux FILMÉ) : validation de l'entrée (navigateur), messages au modèle,
// validation de la sortie (modèle). « L'IA lit, la loi décide » : jamais d'état, jamais d'élément ou
// d'image inventés, cadres bornés.
import { describe, it, expect } from 'vitest';
import * as T from '../src/ai/tasks/edl-photos.js';
import { tache } from '../src/ai/tasks/index.js';
import { fauxEdlPhotos } from '../src/ai/fake.js';

import { PHOTOS_INPUT, JPEG } from './fixtures/edl-photos.js';
const ok = () => T.validerEntree(PHOTOS_INPUT).input;

describe('edl-photos — registre et contrat', () => {
  it('enregistrée dans le registre, marquée vidéo, plafond et délai propres', () => {
    expect(tache('edl-photos')).toBe(T);
    expect(T.video).toBe(true);
    expect(T.JSON_MAX).toBeGreaterThan(256 * 1024);
    expect(T.DELAI_MS).toBeGreaterThanOrEqual(25000);
    for (const k of ['nom', 'validerEntree', 'messages', 'jsonSchema', 'validerSortie']) expect(T[k]).toBeTruthy();
  });
});

describe('edl-photos — entrée', () => {
  it('accepte une pièce, ses éléments et 1 à 8 images en data URL', () => {
    const v = T.validerEntree(PHOTOS_INPUT);
    expect(v.ok).toBe(true);
    expect(v.input.images).toHaveLength(4);
    expect(v.input.elements.find((e) => e.id === '4').citeVers).toBeNull();
  });
  it('refuse plus de 8 images, aucune image, un identifiant ou un instant invalide', () => {
    const neuf = Array.from({ length: 9 }, (_, i) => ({ id: 'i' + i, t: i, data: JPEG }));
    expect(T.validerEntree({ ...PHOTOS_INPUT, images: neuf })).toMatchObject({ ok: false, raison: 'images_trop_nombreuses' });
    expect(T.validerEntree({ ...PHOTOS_INPUT, images: [] }).ok).toBe(false);
    expect(T.validerEntree({ ...PHOTOS_INPUT, images: [{ id: 'a b', t: 1, data: JPEG }] }).ok).toBe(false);
    expect(T.validerEntree({ ...PHOTOS_INPUT, images: [{ id: 'a', t: -1, data: JPEG }] }).ok).toBe(false);
    expect(T.validerEntree({ ...PHOTOS_INPUT, images: [{ id: 'a', t: 1, data: JPEG }, { id: 'a', t: 2, data: JPEG }] }).ok).toBe(false);
  });
  it('refuse ce qui n\'est pas une image JPEG / WEBP / PNG en base64, ou une image trop lourde', () => {
    for (const data of ['https://exemple.test/a.jpg', 'data:image/svg+xml;base64,AAAA', 'data:text/html;base64,AAAA', 'data:image/jpeg;base64,<script>', 'data:image/jpeg;base64,' + 'A'.repeat(T.LIMITES.imageMax)]) {
      expect(T.validerEntree({ ...PHOTOS_INPUT, images: [{ id: 'a', t: 1, data }] })).toMatchObject({ ok: false, raison: 'image_format' });
    }
  });
});

describe('edl-photos — messages', () => {
  it('texte + une image_url par image ; règles « jamais d\'état » dans le système', () => {
    const m = T.messages(ok());
    expect(m[0].role).toBe('system');
    expect(m[0].content).toMatch(/JAMAIS d'état/);
    const parts = m[1].content;
    expect(parts.filter((p) => p.type === 'image_url')).toHaveLength(4);
    expect(parts[0].text).not.toContain('Autres observations');   // ligne « note » jamais envoyée
  });
});

describe('edl-photos — sortie', () => {
  const sortie = (raw) => T.validerSortie(raw, ok());
  it('garde éléments et images connus, cadres bornés, 3 images au plus par élément', () => {
    const r = sortie({
      elements: [
        { elementId: '13', images: [{ imageId: 't0410', x: 0, y: 0.42, l: 1, h: 0.38 }, { imageId: 't0330', x: 0.1, y: 0.1, l: 0.5, h: 0.5 }], vu: 'Rayures visibles sur la plaque noire.' },
      ],
      personnes: [],
    });
    expect(r.ok).toBe(true);
    expect(r.rejets).toBe(0);
    expect(r.data.elements[0]).toMatchObject({ elementId: '13', vu: 'Rayures visibles sur la plaque noire.' });
    expect(r.data.elements[0].images[0]).toEqual({ imageId: 't0410', t: 41, cadre: { x: 0, y: 0.42, l: 1, h: 0.38 } });
  });
  it('écarte élément inventé, ligne note, image inconnue, cadre hors image ou minuscule, doublon, 4e image', () => {
    const im = (imageId, x = 0.1, y = 0.1, l = 0.5, h = 0.5) => ({ imageId, x, y, l, h });
    const r = sortie({
      elements: [
        { elementId: '99', images: [im('t0270')], vu: null },
        { elementId: '24', images: [im('t0270')], vu: null },
        { elementId: '0', images: [im('inconnue'), im('t0270', 0.8, 0.1, 0.5, 0.5), im('t0270', 0.1, 0.1, 0.01, 0.5), im('t0270'), im('t0270'), im('t0330'), im('t0410'), im('t0490')], vu: null },
        { elementId: '0', images: [im('t0270')], vu: null },
      ],
      personnes: ['t0490', 'inventee'],
    });
    expect(r.data.elements).toHaveLength(1);
    expect(r.data.elements[0].images.map((x) => x.imageId)).toEqual(['t0270', 't0330', 't0410']);
    expect(r.data.personnes).toEqual(['t0490']);
    expect(r.rejets).toBeGreaterThanOrEqual(7);
  });
  it('JAMAIS d\'état ni de responsabilité dans le constat visuel (retiré, la photo reste)', () => {
    for (const vu of ['Bon état apparent', "État d'usage", 'mauvais etat', 'Neuf', 'Usure normale du sol', 'Dégradation imputable au locataire', 'À la charge du bailleur', 'Placards neufs', 'Peintures neuves', 'Dégradations visibles']) {
      const r = sortie({ elements: [{ elementId: '0', images: [{ imageId: 't0270', x: 0, y: 0, l: 1, h: 1 }], vu }], personnes: [] });
      expect(r.data.elements[0].vu).toBeNull();
      expect(r.rejets).toBe(1);
    }
  });
  it('élément sans aucune image valable = pas de proposition', () => {
    const r = sortie({ elements: [{ elementId: '4', images: [], vu: 'Fenêtre bois blanche.' }], personnes: [] });
    expect(r.data.elements).toEqual([]);
  });
  it('structure illisible → ok:false', () => {
    expect(sortie(null).ok).toBe(false);
    expect(sortie([]).ok).toBe(false);
    expect(sortie({ elements: 'x' }).ok).toBe(false);
  });
  it('le faux fournisseur produit une sortie valide (cités seulement, jamais d\'état)', () => {
    const r = sortie(fauxEdlPhotos(ok()));
    expect(r.ok).toBe(true);
    expect(r.data.elements.map((e) => e.elementId).sort()).toEqual(['0', '13']);
    expect(r.rejets).toBe(0);
  });
});

describe('edl-photos — fournisseur Mistral (fetch injecté)', () => {
  it('les images partent en image_url vers le même modèle (mistral-small-latest), délai propre à la tâche', async () => {
    const { makeAiProvider } = await import('../src/ai/provider.js');
    let corps = null;
    const f = async (url, init) => { corps = JSON.parse(init.body); return new Response(JSON.stringify({ model: 'mistral-small-2603', choices: [{ message: { content: JSON.stringify({ elements: [], personnes: [] }) } }], usage: { prompt_tokens: 1800, completion_tokens: 20 } }), { status: 200 }); };
    const ia = makeAiProvider({ AI_PROVIDER: 'mistral', MISTRAL_API_KEY: 'k' }, f);
    const r = await ia.structurer({ tache: 'edl-photos', messages: T.messages(ok()), jsonSchema: T.jsonSchema, delaiMs: T.DELAI_MS });
    expect(corps.model).toBe('mistral-small-latest');
    expect(corps.response_format.json_schema.strict).toBe(true);
    expect(corps.messages[1].content.filter((p) => p.type === 'image_url')).toHaveLength(4);
    expect(r).toMatchObject({ jetonsE: 1800, jetonsS: 20 });
  });
});
