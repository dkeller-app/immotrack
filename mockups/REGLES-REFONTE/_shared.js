/* Pilotage de la maquette : format (PC/tablette/téléphone) et thème (auto/clair/sombre). Aucune logique applicative. */
(function(){
  var root=document.documentElement;
  function get(k){try{return localStorage.getItem(k)}catch(e){return null}}
  function set(k,v){try{localStorage.setItem(k,v)}catch(e){}}
  function applyTheme(t){ if(t==='light'||t==='dark') root.setAttribute('data-theme',t); else root.removeAttribute('data-theme');
    document.querySelectorAll('[data-theme-btn]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.themeBtn===(t||'auto')))}); }
  function applyFormat(f){ document.querySelectorAll('.device').forEach(function(d){d.setAttribute('data-format',f)});
    document.querySelectorAll('[data-format-btn]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.formatBtn===f))}); }
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-theme-btn]'); if(b){var t=b.dataset.themeBtn;set('rr-theme',t);applyTheme(t==='auto'?null:t);return}
    b=e.target.closest('[data-format-btn]'); if(b){set('rr-format',b.dataset.formatBtn);applyFormat(b.dataset.formatBtn)}
  });
  var t=get('rr-theme')||'auto'; applyTheme(t==='auto'?null:t);
  var q=(location.search.match(/format=(pc|tab|tel)/)||[])[1]; applyFormat(q||get('rr-format')||'pc');
  var q2=(location.search.match(/theme=(light|dark)/)||[])[1]; if(q2) applyTheme(q2);
})();
/* Normalisation de comparaison : majuscules, sans accents (aide de maquette, pas de logique applicative). */
window.RR={norm:function(s){return String(s).normalize('NFD').replace(/[̀-ͯ]/g,'').toUpperCase()}};
