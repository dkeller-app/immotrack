import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const OUT='/home/user/immotrack/mockups/BAIL-EN-COURS/captures';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const fmts = { pc:{w:1280,h:860,s:1}, tab:{w:768,h:1024,s:1}, tel:{w:390,h:844,s:2} };
const BAR=`<div id="mk-bar" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;border:1px solid var(--bor);border-left:3px solid var(--cta);background:var(--sur2);border-radius:var(--r);padding:8px 10px;margin:0 0 12px;font-size:13px"><span><b>Sélectionne la période à modifier</b></span><span style="display:flex;gap:8px"><button class="btn bs bb" type="button" style="min-height:__MH__">Annuler</button><button class="btn bp bb" type="button" style="min-height:__MH__">Modifier</button></span></div>`;
const FIELD=(l,v,t='text')=>`<div class="fg" style="margin-bottom:12px"><label>${l}</label><input class="inp" type="${t}" value="${v}" style="min-height:__MH__"></div>`;
const MODAL=`<div class="modal" style="max-width:520px;width:96%" onclick="event.stopPropagation()"><div class="m-head"><h3>Modifier la période du 01/09/2026</h3><button class="m-close" aria-label="Fermer">✕</button></div>
<div class="m-body">${FIELD('Date d’effet','2026-09-01','date')}<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${FIELD('Loyer HC (€)','640')}${FIELD('Charges (€)','80')}</div>${FIELD('Motif <span class="mu sm">(inscrit au journal)</span>','Accord avec le locataire')}
<div style="border-left:3px solid var(--warn);background:var(--warn-soft);padding:8px 10px;border-radius:0 var(--r) var(--r) 0;font-size:12px;color:var(--t2)">⚠️ Si tu changes la date au <b>01/10/2026</b>, le dû de septembre repasse de 720,00 € à <b>680,00 €</b>. Un loyer déjà encaissé sera signalé en trop-perçu. Tu peux enregistrer quand même.</div></div>
<div class="m-foot" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between"><button class="btn bs bb" style="min-height:__MH__;color:var(--neg)">Supprimer cette période</button><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn bs bb" style="min-height:__MH__">Fermer</button><button class="btn bp bb" style="min-height:__MH__">Enregistrer</button></span></div></div>`;
for (const theme of ['sobre','dark']) for (const [fk,f] of Object.entries(fmts)) {
  const MH = fk==='tel' ? '44px' : 'auto'; const RS = fk==='tel' ? '22px' : '18px';
  const tn = theme==='sobre'?'light':'dark';
  for (const mode of ['historique','selection','modifier']) {
    const ctx = await b.newContext({ viewport:{width:f.w,height:f.h}, deviceScaleFactor:f.s });
    const p = await ctx.newPage(); p.on('dialog', d=>d.accept());
    await p.goto('http://localhost:8765/index.html?sandbox=1', { waitUntil:'load' }); await p.waitForTimeout(2500);
    await p.evaluate(t=>{ _loadDemoDataset(); Object.assign(DB, JSON.parse(localStorage.getItem(KEY))); document.documentElement.setAttribute('data-theme', t); document.body.style.paddingTop='0'; document.getElementById('sandbox-banner')?.remove();
      DB.loyerBareme=[{ref:'D-101',debut:'2023-09-01',fin:'2026-08-31',hc:600,ch:80,source:'bail',bailDebut:'2023-09-01',note:''},{ref:'D-101',debut:'2026-09-01',fin:null,hc:640,ch:80,source:'manuel',bailDebut:'2023-09-01',note:'Accord avec le locataire'}]; go('biens'); }, theme);
    await p.waitForTimeout(700); await p.evaluate(()=>openLogFiche('D-101')); await p.waitForTimeout(1500);
    await p.evaluate(([bar,mode,MH,RS])=>{ const root=document.getElementById('log-fiche-content');
      const btn=[...root.querySelectorAll('button')].find(x=>/Corriger une période/.test(x.textContent)); if(btn){ btn.textContent='✏️ Modifier'; btn.style.minHeight=MH; }
      if(mode!=='historique'){
        const rows=[...root.querySelectorAll('.hl-period')]; rows[0].parentElement.insertAdjacentHTML('afterbegin', bar);
        rows.forEach((r,i)=>{ r.style.display='flex'; r.style.alignItems='center'; r.style.flexWrap='wrap'; r.style.gap='8px'; r.style.padding='6px 8px'; r.style.borderRadius='var(--r)'; r.style.minHeight='44px'; r.style.cursor='pointer';
          [r,r.querySelector('.tag'),r.querySelector('.span')].forEach(e=>{ if(e){ e.style.margin='0'; e.style.position='static'; e.style.left='auto'; e.style.transform='none'; } });
          r.insertAdjacentHTML('afterbegin','<input type="radio" name="mk-p" aria-label="Sélectionner cette période" style="width:'+RS+';height:'+RS+';flex:none;accent-color:var(--cta)'+'" '+(i===0?'checked':'')+'>');
          if(i===0){ r.style.outline='1px solid var(--cta)'; r.style.background='var(--acc-soft)'; } });
        root.querySelectorAll('.hl-card').forEach(c=>{ if(/Dépôt de garantie|^Bail —/.test(c.querySelector('h4')?.textContent||'')) c.style.opacity='.5'; });
      }
      const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT); let n; while(n=w.nextNode()){ if(n.textContent.includes('Historique du bail')){ n.parentElement.scrollIntoView({block:'start'}); break; } } window.scrollBy(0,-20); }, [BAR.replaceAll('__MH__',MH), mode, MH, RS]);
    if (mode==='modifier') await p.evaluate(m=>{ const ov=document.createElement('div'); ov.id='ov-mk'; ov.className='ov'; ov.innerHTML=m; document.body.appendChild(ov); try{ openM('ov-mk'); }catch(e){ ov.classList.remove('hidden'); } }, MODAL.replaceAll('__MH__',MH));
    await p.waitForTimeout(500);
    await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.children.length<=2&&/Migration v15\.232/.test(e.textContent||'')).forEach(e=>{let t=e; while(t.parentElement&&t.parentElement!==document.body&&getComputedStyle(t).position!=='fixed') t=t.parentElement; t.remove();}));
    await p.screenshot({ path:`${OUT}/periodes-${mode}-${fk}-${tn}.png` }); await ctx.close();
  }
}
await b.close();
