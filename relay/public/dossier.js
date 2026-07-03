/* ════════════════════════════════════════════════════════════════════════
   dossier.js — client de la page publique de candidature (relais Cloudflare).
   Wizard 4 étapes + upload multi-fichiers par case + autosave (reprise D13) +
   envoi. Le candidat ne voit JAMAIS de score (D7). Tokens via window.__*.
   ════════════════════════════════════════════════════════════════════════ */
const TOKEN = window.__CAND_TOKEN__;
const LINK_ID = window.__LINK_ID__;
const CAND = window.__CAND__ || {};
const API = `/api/candidatures/${LINK_ID}`;

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Catégories de pièces (décret n°2015-1437) — libellés validés mockup.
const CATS = [
  { key:'identite',   req:true,  title:"Pièce d'identité",           big:'Ajouter — CNI, passeport ou titre de séjour',        small:'Recto-verso accepté · plusieurs fichiers' },
  { key:'domicile',   req:true,  title:'Justificatif de domicile',   big:'Ajouter un justificatif récent',                     small:'Quittance, facture énergie, attestation hébergement…' },
  { key:'situation',  req:true,  title:'Situation professionnelle',  big:'Contrat de travail <b>et</b> 3 dernières fiches de paie', small:'Glissez plusieurs fichiers dans cette case (contrat + bulletins)' },
  { key:'ressources', req:true,  title:'Justificatif de ressources', big:"Dernier avis d'imposition",                          small:'PDF de préférence' },
  { key:'garant',     req:false, title:'Pièces du garant',           big:'Identité + ressources du garant',                    small:'Si vous avez indiqué un garant' }
];
const STEP_LABELS = ['Identité', 'Situation', 'Garant', 'Pièces'];

// ── État ─────────────────────────────────────────────────────────────────
const dossier = normalizeDossier(CAND.dossier);
const pieces = {}; CATS.forEach(c => { pieces[c.key] = []; });
(CAND.pieces || []).forEach(p => { (pieces[p.categorie] || (pieces[p.categorie] = [])).push({ ...p, status:'done' }); });
let step = 1;
let saveTimer = null;

function normalizeDossier(d) {
  d = d || {};
  return {
    identite: Object.assign({ civilite:'M.', nom:'', prenom:'', ddn:'', lieuNaiss:'', tel:'', email:'', adresseActuelle:'' }, d.identite),
    situation: Object.assign({ contrat:'CDI', employeur:'', revenus:'' }, d.situation),
    garant: d.garant ? Object.assign({ nom:'', adresse:'', ddn:'', lieuNaiss:'' }, d.garant) : null
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtSize(b){ return b<1024?b+' o':b<1048576?Math.round(b/1024)+' Ko':(b/1048576).toFixed(1).replace('.',',')+' Mo'; }
function kindOf(type){ if(type==='application/pdf')return{cls:'pdf',txt:'PDF'}; if(type==='image/png')return{cls:'img',txt:'PNG'}; return{cls:'img',txt:'JPG'}; }
function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return [...(root||document).querySelectorAll(sel)]; }

// ── Construction du DOM ──────────────────────────────────────────────────
function build() {
  const d = dossier;
  const civBtn = (v) => `<button type="button" data-civ="${esc(v)}" class="${d.identite.civilite===v?'on':''}">${esc(v)}</button>`;
  const piecesHtml = CATS.map(cat => {
    const inner = `
    <div class="uph"><span>${cat.title}</span>${cat.req?'<span class="req">*</span>':''}</div>
    <div class="drop" data-cat="${cat.key}"><span class="plus">+</span><div class="big">${cat.big}</div><div class="small">${cat.small}</div></div>
    <input type="file" multiple accept="image/jpeg,image/png,application/pdf" data-input="${cat.key}" hidden>
    <div class="tiles" id="tiles-${cat.key}"></div>`;
    // La pièce du garant n'a de sens que si un garant est déclaré (Q2) → conteneur masquable,
    // synchronisé avec le switch « J'ai un garant ». Sans garant, aucun dépôt garant proposé.
    if (cat.key === 'garant') return `<div class="upcat" id="upcat-garant"${d.garant?'':' hidden'}>${inner}</div>`;
    return inner;
  }).join('');

  document.getElementById('app').innerHTML = `
  <div class="pub">
    <div class="pub-head">
      <div class="pub-brand"><span class="dot">i</span> Dossier de candidature <span class="by">via ImmoTrack</span></div>
      <div class="prop">
        <span class="ico">🏠</span>
        <div style="flex:1"><div class="ttl">${esc(CAND.bienLabel||'Bien à louer')}</div></div>
        ${CAND.loyer?`<div class="rent">${esc(String(CAND.loyer))} €<br><span style="font-weight:500;color:var(--t3);font-size:11px">CC / mois</span></div>`:''}
      </div>
      <div class="reassure">🔒 <span><b>Transmission chiffrée</b> au propriétaire uniquement · données supprimées sous 30 j si non retenu</span></div>
    </div>

    <div class="cbanner" id="cbanner" hidden><span class="i">📌</span><div id="cbanner-txt"></div></div>

    <div class="steps" id="steps">
      ${STEP_LABELS.map((lb,i)=>`<div class="st${i===0?' cur':''}" data-step="${i+1}"><span class="n">${i+1}</span><span class="lb">${lb}</span></div>`).join('')}
    </div>

    <div class="scroll" id="scroll">
      <!-- 1 · Identité -->
      <section class="sec" data-step="1">
        <div class="sec-h"><span class="si">👤</span> Votre identité</div>
        <div class="sec-sub">Ces informations seront reportées telles quelles sur le bail si votre dossier est retenu.</div>
        <div class="field"><label>Civilité</label><div class="segc" id="civ">${['M.','Mme','Autre…'].map(civBtn).join('')}</div></div>
        <div class="row2">
          <div class="field"><label>Nom <span class="req">*</span></label><input class="inp" data-path="identite.nom" placeholder="Moreau"></div>
          <div class="field"><label>Prénom <span class="req">*</span></label><input class="inp" data-path="identite.prenom" placeholder="Camille"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Date de naissance <span class="req">*</span></label><input type="date" class="inp" data-path="identite.ddn" max="2010-12-31"></div>
          <div class="field"><label>Lieu de naissance</label><input class="inp" data-path="identite.lieuNaiss" placeholder="Lyon"></div>
        </div>
        <div class="row2">
          <div class="field"><label>Téléphone <span class="req">*</span></label><input class="inp" type="tel" data-path="identite.tel" placeholder="06 12 34 56 78"></div>
          <div class="field"><label>Email <span class="req">*</span></label><input class="inp" type="email" data-path="identite.email" placeholder="vous@email.fr"></div>
        </div>
        <div class="field"><label>Adresse actuelle</label><input class="inp" data-path="identite.adresseActuelle" placeholder="N°, rue, code postal, ville"></div>
      </section>

      <!-- 2 · Situation -->
      <section class="sec" data-step="2" hidden>
        <div class="sec-h"><span class="si">💼</span> Situation &amp; revenus</div>
        <div class="info" style="margin-bottom:12px"><span class="i">ℹ️</span><span>Ces éléments aident le propriétaire à évaluer votre dossier. Ils restent <b>déclaratifs</b> tant que vos justificatifs ne sont pas vérifiés. Aucun critère lié à l'origine, l'âge ou la situation familiale n'est demandé.</span></div>
        <div class="field"><label>Type de contrat <span class="req">*</span></label>
          <select class="inp" data-path="situation.contrat">${['CDI','CDD','Freelance / Indépendant','Étudiant','Retraité','Autre'].map(o=>`<option>${o}</option>`).join('')}</select>
        </div>
        <div class="field"><label>Employeur</label><input class="inp" data-path="situation.employeur" placeholder="Nom de l'employeur"></div>
        <div class="field"><label>Revenus mensuels nets (€) <span class="req">*</span></label><input class="inp" inputmode="numeric" data-path="situation.revenus" placeholder="ex. 3200"></div>
      </section>

      <!-- 3 · Garant -->
      <section class="sec" data-step="3" hidden>
        <div class="sec-h"><span class="si">🛡️</span> Garant <span class="opt">facultatif</span></div>
        <div class="switch-row" style="margin-bottom:12px">
          <div class="switch${d.garant?' on':''}" id="gsw"></div>
          <div class="tx">J'ai un garant<small>Un garant n'est pas obligatoire mais renforce votre dossier.</small></div>
        </div>
        <div id="gfields" ${d.garant?'':'hidden'}>
          <div class="field"><label>Nom complet du garant</label><input class="inp" data-path="garant.nom" placeholder="Nom Prénom"></div>
          <div class="field"><label>Adresse du garant</label><input class="inp" data-path="garant.adresse" placeholder="N°, rue, code postal, ville"></div>
          <div class="row2">
            <div class="field"><label>Date de naissance</label><input type="date" class="inp" data-path="garant.ddn" max="2010-12-31"></div>
            <div class="field"><label>Lieu de naissance</label><input class="inp" data-path="garant.lieuNaiss" placeholder="Ville"></div>
          </div>
        </div>
      </section>

      <!-- 4 · Pièces -->
      <section class="sec" data-step="4" hidden>
        <div class="sec-h"><span class="si">📎</span> Pièces justificatives</div>
        <div class="info" style="margin-bottom:12px"><span class="i">⚖️</span><span>Seules les pièces autorisées par la loi (décret n°2015-1437) vous sont demandées. <b>JPG, PNG ou PDF · 20 Mo max par fichier.</b> Vous pouvez en ajouter plusieurs et revenir plus tard avec ce lien.</span></div>
        ${piecesHtml}
        <div class="info warn" style="margin-top:12px"><span class="i">💡</span><span>Astuce mobile : photographiez vos documents un par un, la lumière du jour suffit. Vous pouvez revenir compléter avec le même lien.</span></div>
        <div class="rgpd" style="margin-top:14px"><a id="rgpd-toggle">Mentions d'information RGPD ▾</a></div>
        <div class="rgpd-panel" id="rgpd-panel" hidden><b>Responsable :</b> le propriétaire du bien ci-dessus. <b>Finalité :</b> étude de votre candidature à la location. <b>Destinataire :</b> le propriétaire uniquement. <b>Conservation :</b> supprimée automatiquement sous 30 jours si votre dossier n'est pas retenu ; conservée le temps du bail s'il est conclu. <b>Vos droits :</b> accès, rectification, suppression — par le contact indiqué par le propriétaire. Hébergement chiffré (Cloudflare), aucune donnée revendue.</div>
      </section>
    </div>

    <div class="actionbar" id="bar">
      <div class="pg" id="pgtxt"></div>
      <div class="btns">
        <button class="btn bs" id="prev" type="button" hidden>← Précédent</button>
        <button class="btn bp" id="next" type="button">Continuer →</button>
      </div>
    </div>
  </div>`;
}

// ── Liaison des champs (prefill + autosave) ──────────────────────────────
function setPath(obj, path, val){ const k=path.split('.'); if(k[0]==='garant'&&!obj.garant)return; let o=obj; for(let i=0;i<k.length-1;i++)o=o[k[i]]; o[k[k.length-1]]=val; }
function getPath(obj, path){ const k=path.split('.'); let o=obj; for(const p of k){ if(o==null)return ''; o=o[p]; } return o==null?'':o; }

function bindFields(){
  $all('[data-path]').forEach(inp => {
    inp.value = getPath(dossier, inp.dataset.path);
    inp.addEventListener('input', () => {
      inp.classList.remove('err');
      setPath(dossier, inp.dataset.path, inp.value);
      scheduleSave();
    });
  });
  // civilité
  $('#civ').addEventListener('click', e => {
    const b = e.target.closest('[data-civ]'); if(!b) return;
    $all('#civ button').forEach(x=>x.classList.remove('on')); b.classList.add('on');
    dossier.identite.civilite = b.dataset.civ; scheduleSave();
  });
  // garant toggle
  $('#gsw').addEventListener('click', () => {
    const sw = $('#gsw'); sw.classList.toggle('on');
    const on = sw.classList.contains('on');
    $('#gfields').hidden = !on;
    const uc = $('#upcat-garant'); if(uc) uc.hidden = !on; // Q2 : dépôt garant visible seulement avec garant
    dossier.garant = on ? Object.assign({ nom:'', adresse:'', ddn:'', lieuNaiss:'' }, dossier.garant || {}) : null;
    if(on) $all('#gfields [data-path]').forEach(inp => inp.value = getPath(dossier, inp.dataset.path));
    scheduleSave();
  });
  // RGPD panel
  $('#rgpd-toggle').addEventListener('click', () => { const p=$('#rgpd-panel'); p.hidden=!p.hidden; });
}

// ── Autosave ─────────────────────────────────────────────────────────────
function collect(){
  return {
    identite: { ...dossier.identite },
    situation: { ...dossier.situation, revenus: parseRevenus(dossier.situation.revenus) },
    garant: dossier.garant ? { ...dossier.garant } : null
  };
}
function parseRevenus(v){ const n = parseInt(String(v).replace(/[^\d]/g,''),10); return isNaN(n)?0:n; }
function scheduleSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 700); }
async function saveNow(){
  clearTimeout(saveTimer);
  try {
    await fetch(`${API}/dossier`, { method:'POST', headers:{ 'X-Cand-Token':TOKEN, 'content-type':'application/json' }, body: JSON.stringify(collect()) });
  } catch(_) { /* réseau : on réessaiera au prochain changement ou à l'envoi */ }
}

// ── Pièces (upload multi-fichiers + tuiles) ──────────────────────────────
function makeTile(cat, { name, sizeTxt, type, mode, sub, pieceId }){
  const k = kindOf(type);
  const tile = document.createElement('div');
  tile.className = 'tile' + (mode==='err'?' err':'');
  tile.innerHTML = `<span class="ft ${k.cls}">${k.txt}</span>
    <span class="nm"><span class="f">${esc(name)}</span><span class="s">${esc(sub)}</span>${mode==='up'?'<div class="pbar"><i style="width:0%"></i></div>':''}</span>
    ${mode==='done'?'<span class="ok">✓</span>':'<button class="x" type="button" aria-label="Retirer">✕</button>'}`;
  if(pieceId) tile.dataset.pieceId = pieceId;
  tile.dataset.cat = cat;
  const x = tile.querySelector('.x');
  if(x) x.addEventListener('click', () => removeTile(tile));
  $('#tiles-'+cat).appendChild(tile);
  return tile;
}
function setTileProgress(tile, pct){ const b=tile.querySelector('.pbar i'); if(b)b.style.width=pct+'%'; const s=tile.querySelector('.s'); if(s)s.textContent=pct+' %'; }
function tileDone(tile, pieceId, sizeTxt){
  tile.dataset.pieceId = pieceId; tile.classList.remove('err');
  tile.querySelector('.s').textContent = sizeTxt + ' · envoyé';
  const pbar = tile.querySelector('.pbar'); if(pbar) pbar.remove();
  const x = tile.querySelector('.x'); if(x){ x.outerHTML = '<span class="ok">✓</span>'; }
}
function tileError(tile, msg){ tile.classList.add('err'); tile.querySelector('.s').textContent = msg; const pbar=tile.querySelector('.pbar'); if(pbar)pbar.remove(); }
async function removeTile(tile){
  const pieceId = tile.dataset.pieceId, cat = tile.dataset.cat;
  if(pieceId){
    try { await fetch(`${API}/piece/${pieceId}`, { method:'DELETE', headers:{ 'X-Cand-Token':TOKEN } }); } catch(_){}
    pieces[cat] = (pieces[cat]||[]).filter(p => p.pieceId !== pieceId);
  }
  tile.remove();
}
function uploadFile(cat, file){
  const sizeTxt = fmtSize(file.size);
  if(!ALLOWED.includes(file.type)){ makeTile(cat, { name:file.name, type:file.type, mode:'err', sub:'format non accepté (JPG, PNG, PDF)' }); return; }
  if(file.size > MAX_BYTES){ makeTile(cat, { name:file.name, type:file.type, mode:'err', sub:sizeTxt+' · trop lourd (20 Mo max)' }); return; }
  const tile = makeTile(cat, { name:file.name, type:file.type, mode:'up', sub:'0 %' });
  const xhr = new XMLHttpRequest();
  xhr.open('POST', `${API}/piece`);
  xhr.setRequestHeader('X-Cand-Token', TOKEN);
  xhr.setRequestHeader('content-type', file.type);
  xhr.setRequestHeader('X-Piece-Categorie', cat);
  xhr.setRequestHeader('X-Piece-Filename', encodeURIComponent(file.name));
  xhr.upload.onprogress = e => { if(e.lengthComputable) setTileProgress(tile, Math.round(e.loaded/e.total*100)); };
  xhr.onload = () => {
    if(xhr.status === 201){ const { pieceId } = JSON.parse(xhr.responseText); tileDone(tile, pieceId, sizeTxt); pieces[cat].push({ pieceId, filename:file.name, status:'done' }); }
    else if(xhr.status === 409){ tileError(tile, 'dossier déjà envoyé'); }
    else { tileError(tile, 'échec de l\'envoi — réessayez'); }
  };
  xhr.onerror = () => tileError(tile, 'connexion perdue');
  xhr.send(file);
}
function bindUploads(){
  CATS.forEach(cat => {
    const drop = $(`.drop[data-cat="${cat.key}"]`);
    const input = $(`input[data-input="${cat.key}"]`);
    drop.addEventListener('click', () => input.click());
    input.addEventListener('change', () => { [...input.files].forEach(f => uploadFile(cat.key, f)); input.value=''; });
    ['dragover','dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragover'); }));
    ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragover'); }));
    drop.addEventListener('drop', e => { [...(e.dataTransfer?.files||[])].forEach(f => uploadFile(cat.key, f)); });
  });
}
function renderExistingPieces(){
  CATS.forEach(cat => (pieces[cat.key]||[]).forEach(p =>
    makeTile(cat.key, { name:p.filename, type:guessType(p.filename), mode:'done', sub:'envoyé', pieceId:p.pieceId })));
}
function guessType(name){ const n=(name||'').toLowerCase(); if(n.endsWith('.pdf'))return'application/pdf'; if(n.endsWith('.png'))return'image/png'; return'image/jpeg'; }

// ── Navigation wizard ────────────────────────────────────────────────────
function showStep(n){
  step = Math.min(4, Math.max(1, n));
  $all('.scroll > .sec').forEach(s => { s.hidden = (+s.dataset.step !== step); });
  $all('#steps .st').forEach((st,i) => { st.classList.remove('cur','done'); const k=i+1; if(k<step)st.classList.add('done'); if(k===step)st.classList.add('cur'); });
  $('#pgtxt').textContent = `Étape ${step} sur 4 — ${STEP_LABELS[step-1]}`;
  $('#prev').hidden = step===1;
  const next = $('#next'); next.textContent = step===4 ? 'Envoyer mon dossier' : 'Continuer →';
  $('#scroll').scrollTop = 0;
}
function bindNav(){
  $('#prev').addEventListener('click', () => showStep(step-1));
  $('#next').addEventListener('click', () => { if(step<4){ showStep(step+1); } else { submit(); } });
}

// ── Validation client (miroir léger de validateDossier) ──────────────────
function validateClient(){
  const errs = [];
  const id = dossier.identite;
  if(!id.nom)    errs.push({ path:'identite.nom', step:1 });
  if(!id.prenom) errs.push({ path:'identite.prenom', step:1 });
  if(!id.ddn)    errs.push({ path:'identite.ddn', step:1 });
  if(!id.tel)    errs.push({ path:'identite.tel', step:1 });
  if(!id.email || !EMAIL_RE.test(id.email)) errs.push({ path:'identite.email', step:1 });
  if(!dossier.situation.contrat) errs.push({ path:'situation.contrat', step:2 });
  if(!parseRevenus(dossier.situation.revenus)) errs.push({ path:'situation.revenus', step:2 });
  return errs;
}

// ── Envoi ────────────────────────────────────────────────────────────────
async function submit(){
  const errs = validateClient();
  if(errs.length){
    showStep(errs[0].step);
    errs.forEach(e => { const f=$(`[data-path="${e.path}"]`); if(f && f.dataset.step===undefined){ f.classList.add('err'); } else if(f){ f.classList.add('err'); } });
    return;
  }
  const next = $('#next'); next.disabled = true; next.textContent = 'Envoi…';
  await saveNow();
  try {
    const r = await fetch(`${API}/submit`, { method:'POST', headers:{ 'X-Cand-Token':TOKEN } });
    if(r.ok){ showSent(); return; }
    const body = await r.json().catch(()=>({}));
    next.disabled = false; next.textContent = 'Envoyer mon dossier';
    if(body.error){ const f = body.error.startsWith('identite') ? $(`[data-path="${body.error}"]`) : null; if(f){ showStep(1); f.classList.add('err'); } else { alert('Vérifiez les champs obligatoires de votre dossier.'); } }
  } catch(_){ next.disabled=false; next.textContent='Envoyer mon dossier'; alert('Connexion perdue — réessayez.'); }
}

// ── Écrans d'état pleins ─────────────────────────────────────────────────
function showSent(){
  document.getElementById('app').innerHTML = `<div class="pub"><div class="state">
    <div class="em ok">✅</div>
    <h2>Dossier envoyé !</h2>
    <p>Votre candidature pour <b>${esc(CAND.bienLabel||'ce bien')}</b> a bien été transmise au propriétaire.</p>
    <p>Il va l'étudier et pourra vous recontacter.</p>
    <button id="reopen-self" class="btn bp" style="flex:0 0 auto;width:100%;max-width:300px;margin-top:14px">📎 Compléter mon dossier</button>
    <div class="tip">Besoin d'ajouter une pièce ou de corriger une info ? Rouvrez votre dossier avec ce bouton — rien n'est à ressaisir. Possible tant que le propriétaire ne l'a pas traité.</div>
  </div></div>`;
  const b = document.getElementById('reopen-self');
  if(b) b.addEventListener('click', reopenSelf);
}

// Candidat : rouvre LUI-MÊME son dépôt (submitted → open) pour le compléter, sans message au bailleur.
async function reopenSelf(){
  const b = document.getElementById('reopen-self');
  if(b){ b.disabled = true; b.textContent = 'Réouverture…'; }
  try {
    const r = await fetch(`${API}/reopen-self`, { method:'POST', headers:{ 'X-Cand-Token':TOKEN } });
    if(r.ok){ CAND.status = 'open'; start(); return; }
    if(r.status === 409){ CAND.status = 'open'; start(); return; } // déjà rouvert (autre onglet) → on édite
    if(r.status === 410){ showTreated(); return; } // le bailleur a tranché entre-temps → verrouillé
    if(b){ b.disabled = false; b.textContent = '📎 Compléter mon dossier'; }
    alert('Réouverture impossible — réessayez dans un instant.');
  } catch(_){ if(b){ b.disabled=false; b.textContent='📎 Compléter mon dossier'; } alert('Connexion perdue — réessayez.'); }
}

// Écran verrouillé : le bailleur a déjà validé/refusé (lien révoqué). Plus modifiable.
function showTreated(){
  document.getElementById('app').innerHTML = `<div class="pub"><div class="state">
    <div class="em no">🔒</div>
    <h2>Dossier traité</h2>
    <p>Le propriétaire a étudié votre candidature pour <b>${esc(CAND.bienLabel||'ce bien')}</b>.</p>
    <p>Votre dossier n'est plus modifiable. Il vous recontactera s'il a besoin d'informations.</p>
  </div></div>`;
}

// ── Démarrage ────────────────────────────────────────────────────────────
function start(){
  if(CAND.status === 'submitted'){ build(); showSent(); return; }
  build();
  bindFields();
  bindUploads();
  bindNav();
  renderExistingPieces();
  if(CAND.complementNote){
    const b = $('#cbanner'); b.hidden = false;
    $('#cbanner-txt').innerHTML = `Le propriétaire vous demande un complément : <b>${esc(CAND.complementNote)}</b>. Ajoutez-le ci-dessous puis renvoyez — le reste de votre dossier est conservé.`;
    showStep(4);
  } else {
    showStep(1);
  }
}
start();
