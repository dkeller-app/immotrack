// Signature manuscrite (canvas). Navigateur uniquement (DOM). Non testé unitairement.
// Port de initPad (index.html:17491-17505).
export function initPad(canvas, { clearBtn } = {}) {
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#1a1a8c';
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  let drawing = false;
  let dirty = false;

  function xy(e) {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    const sx = canvas.width / r.width, sy = canvas.height / r.height;
    return { x: (src.clientX - r.left) * sx, y: (src.clientY - r.top) * sy };
  }
  function start(e) { drawing = true; dirty = true; const p = xy(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function move(e) { if (!drawing) return; const p = xy(e); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
  function end() { drawing = false; ctx.beginPath(); }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); start(e); }, { passive: false });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); move(e); }, { passive: false });
  canvas.addEventListener('touchend', end);

  function clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; }
  if (clearBtn) clearBtn.addEventListener('click', clear);

  return {
    isEmpty: () => !dirty,
    clear,
    toDataURL: () => canvas.toDataURL('image/png')
  };
}
