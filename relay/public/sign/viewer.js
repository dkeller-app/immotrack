// Rendu lecture du PDF (PDF.js), page par page. Navigateur uniquement. Non testé unitairement.
let pdfjsLib;
async function ensureLib() {
  if (!pdfjsLib) {
    pdfjsLib = await import('/vendor/pdf.min.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
  }
  return pdfjsLib;
}

// bytes : Uint8Array (DOIT être une copie — PDF.js détache le buffer). Charge une fois.
export async function loadDocument(bytes) {
  const lib = await ensureLib();
  return lib.getDocument({ data: bytes }).promise; // → pdf (numPages, getPage)
}

// Rend UNE page (1-based) dans container (vidé au préalable). Retourne le canvas.
export async function renderPageInto(pdf, pageNum, container, { scale = 1.3 } = {}) {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.className = 'pdf-page';
  container.innerHTML = '';
  container.appendChild(canvas);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas;
}
