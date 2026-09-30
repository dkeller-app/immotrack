// js/core/bail-paraphes.js — PARAPHE-UNIQUE (v15.709, option A validée par Didier le 30/09).
//
// POURQUOI : en signature en présence (document défilant), chaque signataire trace son paraphe UNE
// fois, puis l'appose d'un clic page par page. L'ancienne persistance recopiait la même image dans
// chaque page : `signatures.paraphes = { page → { sigId → dataURL } }`. Sérialisé dans le miroir
// local, la ligne cloud `baux.signatures` et les instantanés, cela faisait ≈ 0,5 M caractères par
// bail à 2 signataires, dont 80 % de recopie (constat mockups/STOCKAGE/BAUX-POIDS.md).
//
// FORME STOCKÉE (nouveaux baux) :
//   signatures.parapheImg   = { sigId → dataURL }            une image par signataire
//   signatures.parapheTimes = { page → { sigId → ISO } }     existait déjà : pages paraphées + heure
//   signatures.paraphes     = { page → { sigId → dataURL } } ne garde que les signataires dont les
//                              paraphes NE SE RÉDUISENT PAS à une image unique (ancien bail repris,
//                              page sans heure) ; {} dans le cas normal. Toujours présent : une
//                              version antérieure de l'app (≤ v15.708, cache non rafraîchi) qui
//                              le lit ne plante pas ; elle régénère seulement un PDF SANS paraphes
//                              (vérifié). Le PDF archivé à la signature reste la pièce de référence.
// FORME ANCIENNE (baux signés avant v15.709, VERROUILLÉS, jamais réécrits) : `paraphes` seul,
// parfois avec des images différentes par page (avant v15.697). Elle se lit telle quelle.
//
// Les images n'entrent pas dans l'empreinte légale (bail-content-hash.js : liste blanche).
//
// ⚠️ Ces fonctions sont sérialisées par toString() dans la popup de signature (document
// about:blank, cf. previewBailData) : AUCUNE variable libre hors d'elles-mêmes, sauf `parapheDe`
// appelée par `parapheCarte` (injectée sous ce nom). __tests__/helpers/popup-signature-bundle.test.js
// rejoue l'injection.

/**
 * Lecteur UNIQUE : image du paraphe du signataire `sigId` sur la page `page`, ou null.
 * Les deux formes : `paraphes[page][sigId]` (explicite, ancienne forme) prime ; sinon
 * `parapheImg[sigId]` si le signataire a une heure de paraphe sur cette page.
 */
export function parapheDe(sig, page, sigId) {
  var s = sig || {};
  var parPage = s.paraphes && s.paraphes[page];
  if (parPage && parPage[sigId]) return parPage[sigId];
  var img = s.parapheImg && s.parapheImg[sigId];
  var heure = s.parapheTimes && s.parapheTimes[page] && s.parapheTimes[page][sigId];
  return (img && heure) ? img : null;
}

/**
 * Carte complète { page → { sigId → dataURL } } (clés de page en chaînes), reconstruite pour le
 * PDF et la réouverture d'un bail signé. Une page sans aucun paraphe n'y figure pas, SAUF si elle
 * est explicitement présente (même vide) dans `paraphes` : l'ancien parcours (v12.94, pads absents)
 * a pu enregistrer `paraphes[page] = {}`, et la réouverture en déduit « page à cases de paraphe »
 * (pied dessiné, cases vides) — on garde ce rendu à l'identique.
 */
export function parapheCarte(sig) {
  var s = sig || {}, out = {}, pages = {}, k, id;
  for (k in (s.paraphes || {})) {
    if (Object.prototype.hasOwnProperty.call(s.paraphes, k) && s.paraphes[k] && typeof s.paraphes[k] === 'object') out[k] = {};
  }
  var sources = [s.paraphes || {}, s.parapheTimes || {}];
  for (var i = 0; i < sources.length; i++) {
    for (k in sources[i]) {
      if (!Object.prototype.hasOwnProperty.call(sources[i], k) || !sources[i][k]) continue;
      pages[k] = pages[k] || {};
      for (id in sources[i][k]) if (Object.prototype.hasOwnProperty.call(sources[i][k], id)) pages[k][id] = true;
    }
  }
  for (k in pages) {
    for (id in pages[k]) {
      var img = parapheDe(s, k, id);
      if (img) { out[k] = out[k] || {}; out[k][id] = img; }
    }
  }
  return out;
}

/**
 * Écriture : à partir de la carte en mémoire de la popup ({ page → { sigId → dataURL } }) et des
 * heures ({ page → { sigId → ISO } }), rend { parapheImg, paraphes } à stocker À CÔTÉ de
 * parapheTimes. Un signataire passe en image unique si et seulement si la relecture est EXACTE :
 * une seule image sur toutes ses pages ET une heure sur exactement ces pages-là. Sinon ses pages
 * restent explicites dans `paraphes` (aucune perte, aucun paraphe fantôme). N'altère pas l'entrée.
 */
export function compacterParaphes(carte, heures) {
  var c = carte || {}, h = heures || {}, parSig = {}, k, id;
  for (k in c) {
    if (!Object.prototype.hasOwnProperty.call(c, k) || !c[k]) continue;
    for (id in c[k]) {
      if (!Object.prototype.hasOwnProperty.call(c[k], id) || !c[k][id]) continue;
      parSig[id] = parSig[id] || { imgs: {}, pages: {} };
      parSig[id].imgs[c[k][id]] = true;
      parSig[id].pages[String(k)] = c[k][id];
    }
  }
  var parapheImg = {}, paraphes = {};
  // Page présente mais sans aucun paraphe (ancien bail, cf. parapheCarte) : gardée telle quelle.
  for (k in c) {
    if (!Object.prototype.hasOwnProperty.call(c, k) || !c[k] || typeof c[k] !== 'object') continue;
    var vide = true;
    for (id in c[k]) if (Object.prototype.hasOwnProperty.call(c[k], id) && c[k][id]) { vide = false; break; }
    if (vide) paraphes[String(k)] = {};
  }
  for (id in parSig) {
    var imgs = Object.keys(parSig[id].imgs), pagesImg = Object.keys(parSig[id].pages).sort();
    var pagesHeure = [];
    for (k in h) if (Object.prototype.hasOwnProperty.call(h, k) && h[k] && h[k][id]) pagesHeure.push(String(k));
    pagesHeure.sort();
    if (imgs.length === 1 && pagesHeure.join('|') === pagesImg.join('|')) {
      parapheImg[id] = imgs[0];
    } else {
      for (var j = 0; j < pagesImg.length; j++) {
        paraphes[pagesImg[j]] = paraphes[pagesImg[j]] || {};
        paraphes[pagesImg[j]][id] = parSig[id].pages[pagesImg[j]];
      }
    }
  }
  return { paraphes: paraphes, parapheImg: parapheImg };
}
