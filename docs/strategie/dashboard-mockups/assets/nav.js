/* ════════════════════════════════════════════════════════════════════
   DASH-PROFILES v2 — sélecteur d'onglet + dark mode
   Chargé sur les 3 vues actives (index + Propriétaire + Gestionnaire).
   Les 6 lentilles archivées dans _attic/ ont leur propre header inline
   et n'utilisent pas ce script.
   ════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // ── 3 entrées actives + 2 entrées "info" pour Complet/Custom ──
  const ENTRIES = [
    { id:'home',         file:'index.html',                  icon:'🎛️', label:'Accueil — aperçu',            type:'real' },
    { id:'proprietaire', file:'lentille-1-proprietaire.html',icon:'🏠', label:'Vue Propriétaire (1 écran)',  type:'real' },
    { id:'gestionnaire', file:'lentille-3-gestionnaire.html',icon:'🛠️', label:'Vue Gestionnaire',            type:'real' },
    { id:'complet',      file:null,                          icon:'📐', label:'Complet (= prod actuelle)',   type:'info', tip:'Pas de mockup : c\'est ton dashboard prod actuel tel quel.' },
    { id:'custom',       file:null,                          icon:'✎',  label:'Custom (= mode édition prod)',type:'info', tip:'Pas de mockup : c\'est le mode édition existant (Éditer + Widgets panel).' },
  ];

  function applyTheme(t){
    document.documentElement.setAttribute('data-theme', t);
    try{ localStorage.setItem('muTheme', t); }catch(e){}
    const btn = document.getElementById('mu-theme-btn');
    if(btn) btn.textContent = (t === 'dark' ? '☀️' : '🌙');
  }
  function initTheme(){
    let t = 'light';
    try{ t = localStorage.getItem('muTheme') || 'light'; }catch(e){}
    applyTheme(t);
  }
  function toggleTheme(){
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  }

  function buildHeader(currentId){
    const optsHtml = ENTRIES.map(e => {
      if (e.type === 'info') {
        return `<option value="__info_${e.id}" data-tip="${e.tip || ''}">${e.icon} ${e.label}</option>`;
      }
      return `<option value="${e.file}" ${e.id===currentId?'selected':''}>${e.icon} ${e.label}</option>`;
    }).join('');

    const html = `
      <header class="mu-header">
        <a class="mu-brand" href="index.html" title="Retour à l'aperçu">
          <span class="mu-brand-icon">🎛️</span>
          <span>ImmoTrack</span>
          <span class="mu-brand-tag">Aperçu v2</span>
        </a>
        ${currentId !== 'home' ? '<a class="mu-back-btn" href="index.html" title="Retour à l\\'aperçu">← Aperçu</a>' : ''}
        <div class="mu-spacer"></div>
        <div class="mu-lens-select" title="Naviguer entre les vues">
          <span class="mu-lens-label">Vue</span>
          <select id="mu-lens-select" aria-label="Sélectionner une vue">${optsHtml}</select>
        </div>
        <button class="mu-icon-btn" id="mu-theme-btn" aria-label="Bascule clair/sombre" title="Bascule clair/sombre">🌙</button>
      </header>
    `;
    return html;
  }

  function injectHeader(currentId){
    const slot = document.getElementById('mu-header-slot');
    if(!slot) return;
    slot.outerHTML = buildHeader(currentId);

    const sel = document.getElementById('mu-lens-select');
    if(sel) sel.addEventListener('change', e => {
      const val = e.target.value;
      if (val.startsWith('__info_')) {
        const opt = e.target.options[e.target.selectedIndex];
        alert(opt.getAttribute('data-tip') || 'Pas de mockup pour cette vue.');
        // Reset to current selected entry
        const cur = ENTRIES.find(x => x.id === document.body.getAttribute('data-lens'));
        if (cur) e.target.value = cur.file;
        return;
      }
      if (val) window.location.href = val;
    });
    const btn = document.getElementById('mu-theme-btn');
    if(btn) btn.addEventListener('click', toggleTheme);
    initTheme();
  }

  window.MU = { ENTRIES, injectHeader, applyTheme, toggleTheme };

  document.addEventListener('DOMContentLoaded', () => {
    const cur = document.body && document.body.getAttribute('data-lens');
    if(cur !== null) injectHeader(cur);
    else initTheme();
  });
})();
