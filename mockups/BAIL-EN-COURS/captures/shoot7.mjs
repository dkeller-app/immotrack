import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const OUT='/home/user/immotrack/mockups/BAIL-EN-COURS/captures';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const fmts = { pc:{w:1280,h:860,s:1}, tab:{w:768,h:1024,s:1}, tel:{w:390,h:844,s:2} };
const RAD=(on)=>`<input type="radio" name="mk-p" ${on?'checked':''} aria-label="Sélectionner cette période" style="width:22px;height:22px;margin:2px 10px 0 0;flex:none;accent-color:var(--cta)">`;
const card=(sel,radio,title,badge,bcls,desc)=>`<label class="hl-card" data-dot="d-man" style="display:flex;align-items:flex-start;cursor:${radio?'pointer':'default'};min-height:44px;${sel?'border-color:var(--cta);box-shadow:0 0 0 2px var(--acc-soft);':''}">${radio?RAD(sel):''}<span style="flex:1"><div class="tt"><h4>${title}</h4><span class="hl-badge ${bcls}">${badge}</span></div><div class="hl-desc">${desc}</div></span></label>`;
const BAR=`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;justify-content:space-between;border:1px solid var(--cta);background:var(--acc-soft);border-radius:var(--r);padding:10px 12px;margin-bottom:10px;font-size:13px"><span><b>Sélectionne la période à modifier</b></span><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn bs" type="button" style="min-height:44px">Annuler</button><button class="btn bp" type="button" style="min-height:44px">Modifier la période sélectionnée</button></span></div>`;
const LIST=(radio)=>`<div style="display:flex;flex-direction:column;gap:10px;text-align:left;font-style:normal">${radio?BAR:''}
${card(radio,radio,'Période du 01/09/2026','en vigueur','b-man','Loyer <b>640,00 € HC + 80,00 €</b>. Motif : accord avec le locataire.')}
${card(false,radio,'Période du 01/09/2023','bail initial','b-bail','Loyer <b>600,00 € HC + 80,00 €</b> · jusqu’au 31/08/2026.')}</div>`;
const FIELD=(l,v,t='text')=>`<div class="fg" style="margin-bottom:12px"><label>${l}</label><input class="inp" type="${t}" value="${v}" style="min-height:44px"></div>`;
const MODAL=`<div class="modal" style="max-width:520px;width:96%" onclick="event.stopPropagation()"><div class="m-head"><h3>Modifier la période du 01/09/2026</h3><button class="m-close" aria-label="Fermer">✕</button></div>
<div class="m-body">${FIELD('Date d’effet','2026-09-01','date')}<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${FIELD('Loyer HC (€)','640')}${FIELD('Charges (€)','80')}</div>${FIELD('Motif <span class="mu sm">(inscrit au journal)</span>','Accord avec le locataire')}
<div style="border-left:3px solid var(--warn);background:var(--warn-soft);padding:8px 10px;border-radius:0 var(--r) var(--r) 0;font-size:12px;color:var(--t2)">⚠️ Si tu changes la date au <b>01/10/2026</b>, le dû de septembre repasse de 720,00 € à <b>680,00 €</b>. Un loyer déjà encaissé sera signalé en trop-perçu. Tu peux enregistrer quand même.</div></div>
<div class="m-foot" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:space-between"><button class="btn bs" style="min-height:44px;color:var(--neg)">Supprimer cette période</button><span style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn bs" style="min-height:44px">Fermer</button><button class="btn bp" style="min-height:44px">Enregistrer</button></span></div></div>`;
for (const theme of ['sobre','dark']) for (const [fk,f] of Object.entries(fmts)) {
  const tn = theme==='sobre'?'light':'dark';
  for (const mode of ['historique','selection','modifier']) {
    const ctx = await b.newContext({ viewport:{width:f.w,height:f.h}, deviceScaleFactor:f.s });
    const p = await ctx.newPage(); p.on('dialog', d=>d.accept());
    await p.goto('http://localhost:8765/index.html?sandbox=1', { waitUntil:'load' }); await p.waitForTimeout(2500);
    await p.evaluate(t=>{ _loadDemoDataset(); Object.assign(DB, JSON.parse(localStorage.getItem(KEY))); document.documentElement.setAttribute('data-theme', t); document.body.style.paddingTop='0'; document.getElementById('sandbox-banner')?.remove(); go('biens'); }, theme);
    await p.waitForTimeout(700); await p.evaluate(()=>openLogFiche('D-101')); await p.waitForTimeout(1500);
    await p.evaluate(([html,mode])=>{ const root=document.getElementById('log-fiche-content');
      const btn=[...root.querySelectorAll('button')].find(x=>/Corriger une période/.test(x.textContent)); if(btn){ btn.textContent='✏️ Modifier'; btn.style.minHeight='44px'; }
      const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT); let n; while(n=w.nextNode()){ if(n.textContent.includes('Pas encore de loyer en vigueur')){ const box=n.parentElement; box.innerHTML=html; box.id='mk-hist'; box.style.border='0'; box.style.background='transparent'; break; } }
      const h=document.getElementById('mk-hist'); h&&h.scrollIntoView({block:'center'}); window.scrollBy(0,-60); }, [LIST(mode!=='historique'), mode]);
    if (mode==='modifier') await p.evaluate(m=>{ const ov=document.createElement('div'); ov.id='ov-mk'; ov.className='ov'; ov.innerHTML=m; document.body.appendChild(ov); try{ openM('ov-mk'); }catch(e){ ov.classList.remove('hidden'); } }, MODAL);
    await p.waitForTimeout(500);
    // retire la notification « Migration v15.232… » (bruit de l'environnement de test) : élément dont le texte la contient
    await p.evaluate(()=>{ [...document.querySelectorAll('body *')].filter(e=>e.children.length<=2&&/Migration v15\.232/.test(e.textContent||'')).forEach(e=>{ let t=e; while(t.parentElement&&t.parentElement!==document.body&&getComputedStyle(t).position!=='fixed') t=t.parentElement; t.remove(); }); });
    await p.screenshot({ path:`${OUT}/periodes-${mode}-${fk}-${tn}.png` }); await ctx.close();
  }
}
await b.close();
