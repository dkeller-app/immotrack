// Script atomique pour remplacer _heroV2 par la version cockpit
// Usage : node scripts/replace-herov2.mjs
import fs from 'fs';

const file = 'index-test.html';
let content = fs.readFileSync(file, 'utf8');

// Locate function signature
const sig = 'function _heroV2(ctx, col, row) {';
const start = content.indexOf(sig);
if (start === -1) {
  console.error('Function _heroV2 not found!');
  process.exit(1);
}

// Find matching closing brace by tracking depth (and skipping strings/comments)
let depth = 1;
let i = start + sig.length;
let inString = false;
let stringChar = '';
let inSingleComment = false;
let inMultiComment = false;
while (i < content.length && depth > 0) {
  const c = content[i];
  const next = content[i + 1];
  if (inSingleComment) {
    if (c === '\n') inSingleComment = false;
  } else if (inMultiComment) {
    if (c === '*' && next === '/') { inMultiComment = false; i++; }
  } else if (inString) {
    if (c === '\\') { i++; }
    else if (c === stringChar) inString = false;
  } else {
    if (c === '/' && next === '/') { inSingleComment = true; i++; }
    else if (c === '/' && next === '*') { inMultiComment = true; i++; }
    else if (c === "'" || c === '"' || c === '`') { inString = true; stringChar = c; }
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) break; }
  }
  i++;
}
const end = i + 1; // include the closing }

// New function body (cockpit jauge + 4 satellites)
const newFn = `function _heroV2(ctx, col, row) {
  // v15.33 Phase B Étape A — refonte JAUGE COCKPIT (mockup galerie-FINALE)
  const {scopeLogs, mvs, mvsYTD, mvsPrev, yr, mo} = ctx;
  const totalCr = mvs.reduce((s,m)=>s+(m.cr||0), 0);
  const totalDb = mvs.reduce((s,m)=>s+(m.db||0), 0);
  const prevCr  = (mvsPrev||[]).reduce((s,m)=>s+(m.cr||0), 0);
  const prevDb  = (mvsPrev||[]).reduce((s,m)=>s+(m.db||0), 0);
  const crYTD   = (mvsYTD||[]).reduce((s,m)=>s+(m.cr||0), 0);
  const dbYTD   = (mvsYTD||[]).reduce((s,m)=>s+(m.db||0), 0);
  const cf      = totalCr - totalDb;
  const prevCf  = prevCr - prevDb;
  const cfYTD2  = crYTD - dbYTD;
  const occupiedLogs = scopeLogs.filter(l => l && l.locataire);
  const nbOcc = occupiedLogs.length;
  const nbTotal = scopeLogs.length;
  const nbVacants = Math.max(0, nbTotal - nbOcc);
  const pctOcc = nbTotal > 0 ? Math.round(nbOcc / nbTotal * 100) : 0;
  const objMens = occupiedLogs.reduce((s,l)=>s + ((Number(l.hc)||0) + (Number(l.ch)||0)), 0);
  const pctCollecte = objMens > 0 ? Math.min(100, Math.round(totalCr / objMens * 100)) : 0;
  const pctVar = (cur, prev) => prev !== 0 ? Math.round((cur - prev) / Math.abs(prev) * 1000) / 10 : null;
  const dCr = pctVar(totalCr, prevCr);
  const dDb = pctVar(totalDb, prevDb);
  const dCf = pctVar(cf, prevCf);
  const periodLabel = mo ? _DMF[parseInt(mo)-1] + ' ' + yr : 'annee ' + yr;
  _DD['hero'] = (typeof _buildHeroDrill === 'function')
    ? _buildHeroDrill(ctx, cf, prevCf, cfYTD2)
    : {title:'Cash-flow', html:'<div>Detail indisponible</div>'};
  const r = 92;
  const circumference = 2 * Math.PI * r;
  const dashoffset = circumference - (circumference * pctCollecte / 100);
  const heroStatus = cf >= 0 ? 'grn' : 'red';
  const deltaPill = (d, inverse) => {
    if (d === null) return '<div class="cockpit-sat-delta neu">pas d historique</div>';
    const isPos = inverse ? (d < 0) : (d > 0);
    const isNeu = d === 0;
    const cls = isNeu ? 'neu' : (isPos ? 'pos' : 'neg');
    const arr = d > 0 ? '\\u2191' : (d < 0 ? '\\u2193' : '\\u00b7');
    return '<div class="cockpit-sat-delta ' + cls + '">' + arr + ' ' + Math.abs(d).toFixed(1) + ' % vs N-1</div>';
  };
  const occDelta = nbVacants > 0
    ? '<div class="cockpit-sat-delta warn">' + nbVacants + ' vacant' + (nbVacants > 1 ? 's' : '') + '</div>'
    : '<div class="cockpit-sat-delta pos">Tout occupe</div>';
  const body = '<button type="button" class="cockpit-v2" onclick="_dashCardClick(\\'hero\\',event)" aria-label="Voir le detail du cash-flow">'
    + '<div class="cockpit-glow" aria-hidden="true"></div>'
    + '<div class="cockpit-gauge">'
    +   '<svg width="220" height="220" viewBox="0 0 220 220" aria-hidden="true">'
    +     '<circle cx="110" cy="110" r="' + r + '" stroke="var(--sur3,var(--bor))" stroke-width="18" fill="none"/>'
    +     '<circle cx="110" cy="110" r="' + r + '" stroke="var(--cta,var(--fg-success))" stroke-width="18" fill="none" '
    +       'stroke-dasharray="' + circumference.toFixed(1) + '" stroke-dashoffset="' + dashoffset.toFixed(1) + '" '
    +       'stroke-linecap="round" class="cockpit-gauge-fill"/>'
    +   '</svg>'
    +   '<div class="cockpit-gauge-text">'
    +     '<div class="cockpit-gauge-pct">' + pctCollecte + '<small>%</small></div>'
    +     '<div class="cockpit-gauge-lbl">Loyers ' + escHtml(periodLabel) + '</div>'
    +   '</div>'
    + '</div>'
    + '<div class="cockpit-body">'
    +   '<div class="cockpit-eyebrow">Cockpit financier \\u00b7 ' + escHtml(periodLabel) + '</div>'
    +   '<div class="cockpit-title">' + fmt(totalCr) + ' \\u20ac recus sur ' + fmt(objMens) + ' \\u20ac attendus</div>'
    +   '<div class="cockpit-sats">'
    +     '<div class="cockpit-sat">'
    +       '<div class="cockpit-sat-lbl">Recettes</div>'
    +       '<div class="cockpit-sat-val">' + fmt(totalCr) + ' \\u20ac</div>'
    +       deltaPill(dCr, false)
    +     '</div>'
    +     '<div class="cockpit-sat">'
    +       '<div class="cockpit-sat-lbl">Charges</div>'
    +       '<div class="cockpit-sat-val">\\u2212 ' + fmt(totalDb) + ' \\u20ac</div>'
    +       deltaPill(dDb, true)
    +     '</div>'
    +     '<div class="cockpit-sat">'
    +       '<div class="cockpit-sat-lbl">Cash-flow</div>'
    +       '<div class="cockpit-sat-val ' + (cf >= 0 ? 'pos' : 'neg') + '">' + (cf >= 0 ? '+' : '') + fmt(cf) + ' \\u20ac</div>'
    +       deltaPill(dCf, false)
    +     '</div>'
    +     '<div class="cockpit-sat">'
    +       '<div class="cockpit-sat-lbl">Occupation</div>'
    +       '<div class="cockpit-sat-val">' + pctOcc + ' %</div>'
    +       occDelta
    +     '</div>'
    +   '</div>'
    + '</div>'
    + '<span class="cockpit-drill-ind" aria-hidden="true">\\u2197</span>'
    + '</button>';
  return {body: body, foot: '', status: heroStatus};
}`;

const newContent = content.substring(0, start) + newFn + content.substring(end);
fs.writeFileSync(file, newContent, 'utf8');
console.log('Replaced _heroV2 successfully. Old length=' + (end - start) + ', new length=' + newFn.length);
