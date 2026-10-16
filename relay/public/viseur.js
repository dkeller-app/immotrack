/* ════════════════════════════════════════════════════════════════════════
   viseur.js — LECTURE-PHOTOS (D7) : viseur plein écran de la page de dépôt.
   Caméra arrière du téléphone, cadre de la page, code de l'État repéré EN DIRECT
   (lecture sur le téléphone, rien n'est envoyé), déclencheur. Caméra refusée ou
   absente → l'appareil photo du téléphone (champ de fichier « capture »).
   Chargé à la demande par dossier.js ; le lecteur (Worker) est fourni.
   ════════════════════════════════════════════════════════════════════════ */
const ICO = {
  retour: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  photo: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  ok: '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16 9.5"/></svg>'
};
const creerCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const horodatage = () => new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');

/**
 * @param {{lecteur:{lire:Function}, sourceVersGris:Function, surPhoto:(f:File, info:{repere:boolean})=>void, surRepli:()=>void}} p
 */
export async function ouvrirViseur({ lecteur, sourceVersGris, surPhoto, surRepli }) {
  const racine = document.createElement('div');
  racine.className = 'vs';
  racine.setAttribute('role', 'dialog'); racine.setAttribute('aria-modal', 'true'); racine.setAttribute('aria-label', 'Photo de la pièce');
  racine.innerHTML = `<video playsinline muted autoplay aria-hidden="true"></video>
    <div class="vs-haut"><button type="button" class="vs-btn vs-retour">${ICO.retour}Retour</button><span class="vs-titre">Photo de la pièce</span></div>
    <div class="vs-cadre" aria-hidden="true"></div>
    <div class="vs-puce" role="status" aria-live="polite">Page entière dans le cadre</div>
    <div class="vs-bas"><button type="button" class="vs-declic" disabled>${ICO.photo}Prendre la photo</button></div>`;
  document.body.appendChild(racine);
  document.body.classList.add('vs-ouvert');
  let flux = null, fini = false, occupe = false, repere = false;
  const fermer = () => {
    if (fini) return; fini = true;
    try { if (flux) flux.getTracks().forEach((t) => t.stop()); } catch { /* rien */ }
    racine.remove(); document.body.classList.remove('vs-ouvert'); document.removeEventListener('keydown', clavier);
  };
  const clavier = (e) => { if (e.key === 'Escape') fermer(); };
  document.addEventListener('keydown', clavier);
  racine.querySelector('.vs-retour').addEventListener('click', fermer);
  const puce = racine.querySelector('.vs-puce'), declic = racine.querySelector('.vs-declic'), video = racine.querySelector('video');

  // Caméra refusée ou absente : un bouton (geste de l'utilisateur) ouvre l'appareil photo du téléphone.
  const sansCamera = () => {
    racine.classList.add('vs-sans');
    puce.textContent = 'Caméra indisponible';
    declic.disabled = false;
    declic.innerHTML = ICO.photo + 'Ouvrir l\'appareil photo';
    declic.onclick = () => { fermer(); surRepli(); };
    declic.focus();
  };
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') { sansCamera(); return; }
  try {
    // 4:3 : format du capteur, comme une photo ; le téléphone donne la meilleure définition qu'il sait filmer
    flux = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 4032 }, height: { ideal: 3024 } } });
  } catch { if (!fini) sansCamera(); return; }
  if (fini) { flux.getTracks().forEach((t) => t.stop()); return; }
  video.srcObject = flux;
  try { await video.play(); } catch { /* lecture automatique : la vidéo démarre au premier geste */ }
  declic.disabled = false; declic.focus();

  // Repérage en direct : une image de la vidéo toutes les 0,7 s, lecture rapide dans le Worker (rien n'est envoyé).
  (async () => {
    while (!fini) {
      await new Promise((r) => setTimeout(r, 700));
      if (fini || occupe || repere || !video.videoWidth) continue;
      occupe = true;
      try {
        const g = sourceVersGris(video, video.videoWidth, video.videoHeight, creerCanvas, 2400);
        const r = await lecteur.lire(g, { rapide: true, essais: 8, delaiMs: 3000 });
        if (!fini && r && r.texte) { repere = true; puce.classList.add('ok'); puce.innerHTML = ICO.ok + 'Code de l\'État repéré'; }
      } catch { /* image suivante */ }
      occupe = false;
    }
  })();

  declic.onclick = async () => {
    if (!video.videoWidth) return;
    declic.disabled = true;
    const c = creerCanvas(video.videoWidth, video.videoHeight);
    c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
    const vu = repere;
    fermer();
    if (blob) surPhoto(new File([blob], 'photo-' + horodatage() + '.jpg', { type: 'image/jpeg' }), { repere: vu });
  };
}
