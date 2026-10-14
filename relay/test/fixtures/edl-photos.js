// Jeu de test de la tâche edl-photos (état des lieux filmé) : 4 images factices, 4 éléments de la cuisine.
export const JPEG = 'data:image/jpeg;base64,' + 'A'.repeat(400) + '==';
export const PHOTOS_INPUT = {
  piece: 'Cuisine', mode: 'entree',
  elements: [
    { id: '0', nom: 'Sol', citeVers: 26.1 },
    { id: '4', nom: 'Fenêtre' },
    { id: '13', nom: 'Plaques de cuisson', citeVers: 39.6 },
    { id: '24', nom: 'Autres observations', note: true },
  ],
  images: [
    { id: 't0270', t: 27, data: JPEG },
    { id: 't0330', t: 33, data: JPEG },
    { id: 't0410', t: 41, data: JPEG },
    { id: 't0490', t: 49, data: JPEG },
  ],
};
