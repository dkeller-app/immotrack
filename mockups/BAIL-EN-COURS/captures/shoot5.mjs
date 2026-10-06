import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
const OUT='/home/user/immotrack/mockups/BAIL-EN-COURS/captures';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const fmts = { pc:{w:1280,h:860,s:1}, tab:{w:768,h:1024,s:1}, tel:{w:390,h:844,s:2} };
const BTN=(t)=>`<button class="btn bs bb" type="button" style="min-height:44px">${t}</button>`;
const ALERT=`<div style="margin-top:8px;border-left:3px solid var(--warn);background:var(--warn-soft);padding:8px 10px;border-radius:0 var(--r) var(--r) 0;font-size:12px;color:var(--t2)">⚠️ Cette modification est déjà appliquée aux loyers de <b>septembre</b> et <b>octobre 2026</b>. La corriger ou l'annuler recalcule le dû de ces mois ; rien n'est bloqué.</div>`;
const CARDS=`<div style="display:flex;flex-direction:column;gap:10px;text-align:left;font-style:normal">
<div class="hl-card" data-dot="d-man"><div class="tt"><h4>Modification du loyer</h4><span class="hl-badge b-man">modification</span></div>
<div class="hl-desc">Loyer <b>640,00 € HC + 80,00 €</b> à compter du <b>01/09/2026</b>. Motif : accord avec le locataire.</div>
<div class="hl-foot" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">${BTN('Corriger la date')}${BTN('Annuler cette modification')}</div>${ALERT}</div>
<div class="hl-card" data-dot="d-bail"><div class="tt"><h4>Bail — Pierre Demo</h4><span class="hl-badge b-bail">bail</span></div>
<div class="hl-desc">Loyer initial <b>600,00 € HC + 80,00 €</b> de provision · dépôt de garantie dû 600,00 €.</div></div></div>`;
const FIELD=(l,v,t='text')=>`<div class="fg" style="margin-bottom:12px"><label>${l}</label><input class="inp" type="${t}" value="${v}" style="min-height:44px"></div>`;
const CORRIGER=`<div class="modal" style="max-width:520px;width:96%" onclick="event.stopPropagation()"><div class="m-head"><h3>Corriger la date d'effet</h3><button class="m-close" aria-label="Fermer">✕</button></div>
<div class="m-body"><p style="margin:0 0 12px;font-size:13.5px;line-height:1.5">Modification du loyer : <b>640,00 € HC + 80,00 €</b>, aujourd'hui à compter du <b>01/09/2026</b>.</p>
${FIELD('Nouvelle date d’effet','2026-10-01','date')}${FIELD('Motif de la correction <span class="mu sm">(inscrit au journal)</span>','Date saisie par erreur')}
<div style="border-left:3px solid var(--warn);background:var(--warn-soft);padding:8px 10px;border-radius:0 var(--r) var(--r) 0;font-size:12px;color:var(--t2)">⚠️ Le dû de <b>septembre 2026</b> repasse de 720,00 € à <b>680,00 €</b>. Un loyer déjà encaissé pour ce mois sera signalé en trop-perçu. Tu peux enregistrer quand même.</div></div>
<div class="m-foot"><button class="btn bs" style="min-height:44px">Fermer</button><button class="btn bp" style="min-height:44px">Enregistrer la correction</button></div></div>`;
const ANNULER=`<div class="modal" style="max-width:520px;width:96%" onclick="event.stopPropagation()"><div class="m-head"><h3>Annuler cette modification ?</h3><button class="m-close" aria-label="Fermer">✕</button></div>
<div class="m-body"><p style="margin:0 0 10px;font-size:14px;line-height:1.5">Le loyer redevient <b>600,00 € HC + 80,00 €</b> à compter du <b>01/09/2026</b>, comme avant la modification.</p>
<div style="border-left:3px solid var(--warn);background:var(--warn-soft);padding:8px 10px;border-radius:0 var(--r) var(--r) 0;font-size:12px;color:var(--t2)">⚠️ Le dû de <b>septembre</b> et <b>octobre 2026</b> est recalculé (720,00 € → 680,00 € par mois). Tu peux enregistrer quand même.</div>
<p style="margin:10px 0 0;font-size:12.5px;color:var(--t3);line-height:1.5">L'annulation est inscrite au journal du bail, la modification n'est pas effacée de l'historique.</p></div>
<div class="m-foot"><button class="btn bs" style="min-height:44px">Garder la modification</button><button class="btn bp" style="min-height:44px">Annuler la modification</button></div></div>`;
for (const theme of ['sobre','dark']) for (const [fk,f] of Object.entries(fmts)) {
  const tn = theme==='sobre'?'light':'dark';
  for (const mode of ['historique','corriger','annuler']) {
    const ctx = await b.newContext({ viewport:{width:f.w,height:f.h}, deviceScaleFactor:f.s });
    const p = await ctx.newPage(); p.on('dialog', d=>d.accept());
    await p.goto('http://localhost:8765/index.html?sandbox=1', { waitUntil:'load' }); await p.waitForTimeout(2500);
    await p.evaluate(t=>{ _loadDemoDataset(); Object.assign(DB, JSON.parse(localStorage.getItem(KEY))); document.documentElement.setAttribute('data-theme', t); document.body.style.paddingTop='0'; document.getElementById('sandbox-banner')?.remove(); go('biens'); }, theme);
    await p.waitForTimeout(700); await p.evaluate(()=>openLogFiche('D-101')); await p.waitForTimeout(1500);
    await p.evaluate(cards=>{ const w=document.createTreeWalker(document.getElementById('log-fiche-content'),NodeFilter.SHOW_TEXT); let n; while(n=w.nextNode()){ if(n.textContent.includes('Pas encore de loyer en vigueur')){ const box=n.parentElement; box.innerHTML=cards; box.id='mk-hist'; box.style.border='0'; box.style.background='transparent'; break; } }
      const h=document.getElementById('mk-hist'); h&&h.scrollIntoView({block:'center'}); document.querySelectorAll('[class*=toast]').forEach(e=>e.remove()); }, CARDS);
    if (mode!=='historique') {
      await p.evaluate(m=>{ const ov=document.createElement('div'); ov.id='ov-mk'; ov.className='ov'; ov.innerHTML=m; document.body.appendChild(ov); try{ openM('ov-mk'); }catch(e){ ov.classList.remove('hidden'); } }, mode==='corriger'?CORRIGER:ANNULER);
    }
    await p.waitForTimeout(500); await p.evaluate(()=>document.querySelectorAll('[class*=toast]').forEach(e=>e.remove()));
    await p.screenshot({ path:`${OUT}/modif-bail-${mode}-${fk}-${tn}.png` }); await ctx.close();
  }
}
await b.close();
