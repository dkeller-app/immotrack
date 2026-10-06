import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
let MHcur='auto'; const mh=s=>String(s).replaceAll('min-height:44px','min-height:'+MHcur);
const OUT='/home/user/immotrack/mockups/BAIL-EN-COURS/captures';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const fmts = { pc:{w:1280,h:860,s:1}, tab:{w:768,h:1024,s:1}, tel:{w:390,h:844,s:2} };
const NOM='Studio rez-de-chaussée gauche';
const CARD='display:flex;align-items:flex-start;gap:9px;cursor:pointer;margin:0;font-size:13px;border:1px solid var(--bor);border-radius:var(--r);padding:10px 12px;background:var(--sur2);min-height:44px';
const NOM_FIELD = `<div class="fg" id="mk-nom" style="margin-top:12px"><label>Nom affiché <span class="mu sm">(modifiable à tout moment — vide : la référence est affichée)</span></label><input class="inp" value="${NOM}"><div class="mu sm" style="margin-top:4px;font-size:11.5px">Libellé d'écran uniquement. Les documents (bail, quittances, lettres) gardent la référence et l'adresse.</div></div>`;
const EDL_HTML = `<div id="mk-edl" style="margin:12px 0"><label style="${CARD}"><input type="checkbox" checked style="margin-top:2px;width:20px;height:20px"><span><b>EDL fait en dehors de Propryo</b><span class="mu sm" style="display:block;font-size:11.5px;margin-top:2px">État des lieux déjà réalisé et signé sur papier. Date et sens (entrée / sortie) ci-dessus. Aucune saisie des pièces n'est demandée.</span></span></label>
<div class="fg" style="margin-top:10px"><label>Pièce jointe <span class="mu sm">(facultatif — ajoutable plus tard depuis la fiche du logement ou l'onglet Documents)</span></label>
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><div class="inp" style="flex:1;min-width:180px;display:flex;align-items:center;gap:8px;min-height:44px">📎 EDL-D-101-entree.pdf <span class="mu sm">· 2,4 Mo</span></div><button class="btn bs" type="button" style="min-height:44px">Remplacer</button><button class="btn bs" type="button" style="min-height:44px">Retirer</button></div></div></div>`;
async function boot(f, theme) {
  const ctx = await b.newContext({ viewport:{width:f.w,height:f.h}, deviceScaleFactor:f.s });
  const p = await ctx.newPage(); p.on('dialog', d=>d.accept());
  await p.goto('http://localhost:8765/index.html?sandbox=1', { waitUntil:'load' }); await p.waitForTimeout(2500);
  await p.evaluate(t=>{ _loadDemoDataset(); Object.assign(DB, JSON.parse(localStorage.getItem(KEY))); document.documentElement.setAttribute('data-theme', t); document.body.style.paddingTop='0'; document.getElementById('sandbox-banner')?.remove(); }, theme);
  return [ctx,p];
}
const clean = p => p.evaluate(()=>document.querySelectorAll('[class*=toast]').forEach(e=>e.remove()));
for (const theme of ['sobre','dark']) for (const [fk,f] of Object.entries(fmts)) {
  const tn = theme==='sobre'?'light':'dark'; MHcur = fk==='tel'?'44px':'auto';
  // 1. fiche du logement
  let [ctx,p] = await boot(f, theme);
  await p.evaluate(()=>openNewLog('D-101')); await p.waitForTimeout(1300);
  await p.evaluate(nom=>{ const r=document.getElementById('log-ref'); const row=r.closest('.fg').parentElement; row.insertAdjacentHTML('afterend', nom[0]);
    const w=document.getElementById('log-ref-rename-wrap'); if(w){ w.innerHTML='<span class="mu sm" style="display:inline-flex;align-items:center;gap:4px">🔒 Verrouillée : bail signé</span>'; }
    r.closest('.fg').querySelector('label').innerHTML='Référence * <span class="mu sm">(clé technique, ne change jamais)</span>'; }, [mh(NOM_FIELD)]);
  await p.evaluate(()=>document.getElementById('mk-nom').scrollIntoView({block:'center'})); await p.waitForTimeout(300); await clean(p);
  await p.screenshot({ path:`${OUT}/nom-fiche-${fk}-${tn}.png` }); await ctx.close();
  // 2. liste des logements
  [ctx,p] = await boot(f, theme);
  await p.evaluate(()=>go('biens')); await p.waitForTimeout(800);
  await p.evaluate(()=>{ const bt=[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&/^\s*Logements\s*$/.test(b.textContent)).pop(); bt&&bt.click(); }); await p.waitForTimeout(1200);
  await p.evaluate(nom=>{ const t=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.trim()==='D-101'&&e.offsetParent); if(t){ t.textContent=nom; t.insertAdjacentHTML('afterend','<div class="mu sm" style="font-size:11.5px;margin-top:2px">Réf. D-101</div>'); t.scrollIntoView({block:'center'}); } }, NOM);
  await p.waitForTimeout(300); await clean(p);
  await p.screenshot({ path:`${OUT}/nom-liste-${fk}-${tn}.png` }); await ctx.close();
}
await b.close();
