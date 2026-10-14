import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
let MHcur='auto'; const mh=s=>String(s).replaceAll('min-height:44px','min-height:'+MHcur);
const OUT='/home/user/immotrack/mockups/BAIL-EN-COURS/captures';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const fmts = { pc:{w:1280,h:860,s:1}, tab:{w:768,h:1024,s:1}, tel:{w:390,h:844,s:2} };
const ICON_SHIELD='<svg class="uic" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"></path><path d="M9 12l2 2 4-4"></path></svg>';
const CARD='display:flex;align-items:flex-start;gap:9px;cursor:pointer;margin:0;font-size:13px;border:1px solid var(--bor);border-radius:var(--r);padding:10px 12px;background:var(--sur2)';
const DG_HTML = `<label style="${CARD};min-height:44px" id="mk-dg"><input type="checkbox" checked style="margin-top:2px;width:20px;height:20px"><span><b>Dépôt de garantie versé</b><span class="mu sm" style="display:block;font-size:11.5px;margin-top:2px">Versé à la signature, ou reçu de l'ancien bailleur (bail repris). Aucun mouvement bancaire demandé.</span></span></label>`;
const HORS_HTML = `<div id="mk-hors" style="margin-top:12px"><label style="${CARD};min-height:44px"><input type="checkbox" checked style="margin-top:2px;width:20px;height:20px"><span>${ICON_SHIELD} <b>Bail signé en dehors de Propryo</b><span class="mu sm" style="display:block;font-size:11.5px;margin-top:2px">Signé sur papier, chez un notaire ou par le vendeur (bail repris). Aucune signature électronique n'est créée : la date de signature ci-dessus est conservée.</span></span></label>
<div class="fg" style="margin-top:10px"><label>Pièce jointe <span class="mu sm">(facultatif — ajoutable plus tard depuis la fiche du bail ou l'onglet Documents)</span></label>
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><div class="inp" style="flex:1;min-width:180px;display:flex;align-items:center;gap:8px;min-height:44px">📎 Bail-D-101-signe.pdf <span class="mu sm">· 1,2 Mo</span></div><button class="btn bs" type="button" style="min-height:44px">Remplacer</button><button class="btn bs" type="button" style="min-height:44px">Retirer</button></div></div></div>`;
for (const theme of ['sobre','dark']) for (const [fk,f] of Object.entries(fmts)) {
  const ctx = await b.newContext({ viewport:{width:f.w,height:f.h}, deviceScaleFactor:f.s });
  const p = await ctx.newPage(); p.on('dialog', d=>d.accept());
  await p.goto('http://localhost:8765/index.html?sandbox=1', { waitUntil:'load' }); await p.waitForTimeout(2500);
  await p.evaluate(()=>{ _loadDemoDataset(); Object.assign(DB, JSON.parse(localStorage.getItem(KEY))); go('logements'); });
  await p.waitForTimeout(600);
  await p.evaluate(t=>{ document.documentElement.setAttribute('data-theme', t); document.body.style.paddingTop='0'; document.getElementById('sandbox-banner')?.remove(); document.querySelectorAll('.toast,#toast,[class*=toast]').forEach(e=>e.remove()); openBail('D-101'); goBailStep(2); }, theme);
  await p.waitForTimeout(1200);
  await p.evaluate(([dg,hors])=>{
    const g=document.getElementById('b-dg').closest('.fg'); const empty=g.nextElementSibling; empty.innerHTML=dg; empty.style.alignSelf='end';
    const row=document.getElementById('b-dateSign-fg').parentElement; row.insertAdjacentHTML('afterend', hors);
    document.querySelectorAll('.toast,#toast,[class*=toast]').forEach(e=>e.remove());
  }, [mh(DG_HTML), mh(HORS_HTML)]);
  for (const [name,sel] of [['dg','#b-dg'],['hors','#mk-hors']]) {
    await p.evaluate(s=>document.querySelector(s).scrollIntoView({block:'center'}), sel); await p.waitForTimeout(350);
    await p.evaluate(()=>document.querySelectorAll('[class*=toast]').forEach(e=>e.remove()));
    await p.screenshot({ path:`${OUT}/bail-${name}-${fk}-${theme==='sobre'?'light':'dark'}.png` });
  }
  await ctx.close();
}
await b.close();
