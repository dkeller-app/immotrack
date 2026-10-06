import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const OUT='/home/user/immotrack/mockups/BAIL-EN-COURS/captures';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const fmts = { pc:{w:1280,h:860,s:1}, tab:{w:768,h:1024,s:1}, tel:{w:390,h:844,s:2} };
const row=(ic,name,meta,acts)=>`<div class="logf-doc-card" style="margin:0"><div class="logf-doc-icon">${ic}</div><div class="logf-doc-info"><div class="logf-doc-name">${name}</div><div class="logf-doc-meta">${meta}</div></div><div class="logf-doc-actions">${acts}</div></div>`;
const btn=t=>`<button class="btn bs bb" type="button" style="min-height:44px">${t}</button>`;
const RADIO='display:flex;gap:8px;align-items:center;min-height:44px;font-size:13px;cursor:pointer';
const FORM=`<div style="display:flex;flex-direction:column;gap:12px;padding:4px 2px" id="mk-form">
<div style="font-size:13px"><b>Ajouter un EDL fait en dehors de Propryo</b><div class="mu sm" style="font-size:11.5px;margin-top:2px">État des lieux déjà réalisé et signé sur papier. Il est classé ici, sans parcours de saisie.</div></div>
<div style="display:flex;gap:18px;flex-wrap:wrap"><label style="${RADIO}"><input type="radio" name="mk-s" checked style="width:20px;height:20px"> Entrée</label><label style="${RADIO}"><input type="radio" name="mk-s" style="width:20px;height:20px"> Sortie</label></div>
<div class="fg"><label>Date de l'état des lieux</label><input class="inp" type="date" value="2023-09-01" style="min-height:44px"></div>
<div class="fg"><label>Pièce jointe <span class="mu sm">(PDF ou photo — facultatif)</span></label>
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><div class="inp" style="flex:1;min-width:180px;display:flex;align-items:center;gap:8px;min-height:44px">📎 EDL-D-101-entree.pdf <span class="mu sm">· 2,4 Mo</span></div>${btn('Remplacer')}</div></div>
<div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">${btn('Annuler')}<button class="btn bp" type="button" style="min-height:44px">Enregistrer l'EDL</button></div></div>`;
async function boot(f, theme) {
  const ctx = await b.newContext({ viewport:{width:f.w,height:f.h}, deviceScaleFactor:f.s });
  const p = await ctx.newPage(); p.on('dialog', d=>d.accept());
  await p.goto('http://localhost:8765/index.html?sandbox=1', { waitUntil:'load' }); await p.waitForTimeout(2500);
  await p.evaluate(t=>{ _loadDemoDataset(); Object.assign(DB, JSON.parse(localStorage.getItem(KEY))); document.documentElement.setAttribute('data-theme', t); document.body.style.paddingTop='0'; document.getElementById('sandbox-banner')?.remove(); go('biens'); }, theme);
  await p.waitForTimeout(700);
  await p.evaluate(()=>openLogFiche('D-101')); await p.waitForTimeout(1300);
  await p.evaluate(()=>setLogFicheTab('documents')); await p.waitForTimeout(1000);
  return [ctx,p];
}
const box = (p, txt) => p.evaluateHandle(t=>{ const e=[...document.querySelectorAll('*')].find(x=>x.children.length===0&&x.textContent.includes(t)&&x.offsetParent); return e.parentElement; }, txt);
for (const theme of ['sobre','dark']) for (const [fk,f] of Object.entries(fmts)) {
  const tn = theme==='sobre'?'light':'dark';
  for (const mode of ['ajout','resultat']) {
    const [ctx,p] = await boot(f, theme);
    await p.evaluate(([mode,FORM,rowBail,rowEdl])=>{
      const find=t=>{ const w=document.createTreeWalker(document.getElementById('log-fiche-content'),NodeFilter.SHOW_TEXT); let n; while(n=w.nextNode()){ if(n.textContent.includes(t)) return n.parentElement; } };
      const edl=find('Aucun EDL enregistré'); const bail=find('Bail en cours mais non signé');
      if(mode==='ajout'){ edl.innerHTML=FORM; edl.id='mk-edl'; edl.style.textAlign='left'; edl.style.fontStyle='normal'; }
      else { edl.innerHTML=rowEdl; edl.id='mk-edl'; edl.style.textAlign='left'; edl.style.fontStyle='normal'; bail.innerHTML=rowBail; bail.style.textAlign='left'; bail.style.fontStyle='normal'; }
      document.querySelectorAll('[class*=toast]').forEach(e=>e.remove());
      (mode==='ajout'?edl:bail).scrollIntoView({block:'start'}); window.scrollBy(0,-80);
    }, [mode, FORM, row('📄','Bail signé hors Propryo — Pierre Demo','Signé le 20/02/2026 · Bail-D-101-signe.pdf · 1,2 Mo',btn('Ouvrir')), row('📋','EDL d’entrée — fait hors Propryo','01/09/2023 · EDL-D-101-entree.pdf · 2,4 Mo',btn('Ouvrir')+btn('Supprimer'))]);
    await p.waitForTimeout(400);
    if(mode==='ajout') await p.evaluate(()=>document.getElementById('mk-edl').scrollIntoView({block:'center'}));
    await p.screenshot({ path:`${OUT}/edl-docs-${mode}-${fk}-${tn}.png` }); await ctx.close();
  }
}
await b.close();
