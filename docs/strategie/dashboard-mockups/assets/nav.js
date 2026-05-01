/* ════════════════════════════════════════════════════════════════════
   DASH-PROFILES mockups — sélecteur de lentille + dark mode
   Chargé sur tous les mockups (dont index.html).
   ════════════════════════════════════════════════════════════════════ */
(function(){
  'use strict';

  // ── Liste des 8 lentilles + index ───────────────────────────────
  const LENSES = [
    { id:'home',        file:'index.html',                  icon:'🎛️', label:'Accueil — sélecteur',       num:'#'  },
    { id:'proprietaire',file:'lentille-1-proprietaire.html',icon:'🏠', label:'1. Propriétaire (par défaut)', num:'1' },
    { id:'financier',   file:'lentille-2-financier.html',   icon:'💶', label:'2. Financier',               num:'2' },
    { id:'gestionnaire',file:'lentille-3-gestionnaire.html',icon:'🛠️', label:'3. Gestionnaire',            num:'3' },
    { id:'fiscale',     file:'lentille-4-fiscale.html',     icon:'📋', label:'4. Préparation fiscale 2044',num:'4' },
    { id:'investisseur',file:'lentille-5-investisseur.html',icon:'📈', label:'5. Investisseur',            num:'5' },
    { id:'echeances',   file:'lentille-6-echeances.html',   icon:'⏰', label:'6. Échéances & alertes',     num:'6' },
    { id:'previsionnel',file:'lentille-7-previsionnel.html',icon:'🔮', label:'7. Prévisionnel',            num:'7' },
    { id:'patrimoine',  file:'lentille-8-patrimoine.html',  icon:'🛡️', label:'8. Patrimoine & conformité', num:'8' },
  ];

  // ── Dark mode (persiste localStorage) ───────────────────────────
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

  // ── Header (sélecteur + dark + retour accueil) ──────────────────
  function buildHeader(currentId){
    const cur = LENSES.find(l => l.id === currentId) || LENSES[0];
    const optsHtml = LENSES.map(l =>
      `<option value="${l.file}" ${l.id===currentId?'selected':''}>${l.icon} ${l.label}</option>`
    ).join('');

    const html = `
      <header class="mu-header">
        <a class="mu-brand" href="index.html" title="Retour à l'accueil">
          <span class="mu-brand-icon">🎛️</span>
          <span>ImmoTrack</span>
          <span class="mu-brand-tag">Aperçu</span>
        </a>
        ${currentId !== 'home' ? '<a class="mu-back-btn" href="index.html" title="Retour à l\\'accueil">← Accueil</a>' : ''}
        <div class="mu-spacer"></div>
        <div class="mu-lens-select" title="Choisir une lentille">
          <span class="mu-lens-label">Lentille</span>
          <select id="mu-lens-select" aria-label="Sélectionner une lentille">${optsHtml}</select>
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

    // Brancher événements après injection
    const sel = document.getElementById('mu-lens-select');
    if(sel) sel.addEventListener('change', e => {
      const file = e.target.value;
      if(file) window.location.href = file;
    });
    const btn = document.getElementById('mu-theme-btn');
    if(btn) btn.addEventListener('click', toggleTheme);
    initTheme();
  }

  // Expose minimum needed
  window.MU = { LENSES, injectHeader, applyTheme, toggleTheme };

  // Auto-init si data-current sur <body>
  document.addEventListener('DOMContentLoaded', () => {
    const cur = document.body && document.body.getAttribute('data-lens');
    if(cur !== null) injectHeader(cur);
    else initTheme();  // Au moins le thème sur les pages sans header (improbable)
  });
})();
