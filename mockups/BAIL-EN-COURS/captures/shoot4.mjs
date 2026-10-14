import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
let MHcur='auto'; const mh=s=>String(s).replaceAll('min-height:44px','min-height:'+MHcur);
const OUT='/home/user/immotrack/mockups/BAIL-EN-COURS/captures';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args:['--no-sandbox'] });
const fmts = { pc:{w:1280,h:860,s:1}, tab:{w:768,h:1024,s:1}, tel:{w:390,h:844,s:2} };
const PILL='<span style="display:inline-flex;align-items:center;background:#fee2e2;border:1.5px solid #dc2626;border-radius:6px;padding:5px 10px;font-size:11px;color:#991b1b;font-weight:bold;min-height:32px">⚠️ Session expirée</span>';
const BTN=(t,st='')=>`<button class="btn bs bb" type="button" style="min-height:44px;${st}">${t}</button>`;
const ACTIONS = PILL + BTN('🔄 Relancer','background:#7c3aed;color:#fff') + BTN('Signé hors Propryo') + BTN('Annuler la session') + BTN('··· Plus')
  + `<div class="mu sm" id="mk-help" style="flex-basis:100%;font-size:11.5px;margin-top:4px">La signature à distance n'a pas abouti avant la fin du délai. <b>Relancer</b> crée une nouvelle session · <b>Signé hors Propryo</b> enregistre un bail signé sur papier (date + pièce jointe) · <b>Annuler la session</b> remet le bail en « non signé ».</div>`;
const MODAL = `<div class="modal" style="max-width:480px;width:96%" onclick="event.stopPropagation()"><div class="m-head"><h3>Annuler la session de signature ?</h3><button class="m-close" aria-label="Fermer">✕</button></div>
<div class="m-body"><p style="margin:0 0 10px;font-size:14px;line-height:1.5">La session de signature à distance de <b>Pierre Demo</b> (envoyée le 01/09/2026) a expiré. Elle sera annulée et le bail redeviendra <b>non signé</b>.</p>
<p style="margin:0;font-size:13px;color:var(--t3);line-height:1.5">Rien n'est supprimé du bail. Tu pourras relancer une signature à distance, ou déclarer le bail signé hors Propryo, à tout moment.</p></div>
<div class="m-foot"><button class="btn bs" style="min-height:44px">Garder la session</button><button class="btn bp" style="min-height:44px">Annuler la session</button></div></div>`;
for (const theme of ['sobre','dark']) for (const [fk,f] of Object.entries(fmts)) {
  const tn = theme==='sobre'?'light':'dark'; MHcur = fk==='tel'?'44px':'auto';
  for (const mode of ['actions','confirm']) {
    const ctx = await b.newContext({ viewport:{width:f.w,height:f.h}, deviceScaleFactor:f.s });
    const p = await ctx.newPage(); p.on('dialog', d=>d.accept());
    await p.goto('http://localhost:8765/index.html?sandbox=1', { waitUntil:'load' }); await p.waitForTimeout(2500);
    await p.evaluate(t=>{ _loadDemoDataset(); Object.assign(DB, JSON.parse(localStorage.getItem(KEY))); document.documentElement.setAttribute('data-theme', t); document.body.style.paddingTop='0'; document.getElementById('sandbox-banner')?.remove();
      DB.baux['D-101'].signatures={ remoteSession:{ status:'expired', sessionId:'s1', createdAt:'2026-09-01T09:00:00Z', signers:[{role:'bailleur',nom:'SCI DEMO',email:'a@b.fr',signedAt:'2026-09-01T10:00:00Z'},{role:'locataire',nom:'Pierre Demo',email:'pierre@demo.fr',signedAt:null}] } }; go('biens'); }, theme);
    await p.waitForTimeout(700); await p.evaluate(()=>openLogFiche('D-101')); await p.waitForTimeout(1500);
    await p.evaluate(h=>{ const a=document.querySelector('.logf-bail-actions'); a.innerHTML=h; a.style.flexWrap='wrap'; a.style.display='flex'; a.style.gap='8px'; a.style.alignItems='center'; a.scrollIntoView({block:'center'}); document.querySelectorAll('[class*=toast]').forEach(e=>e.remove()); }, mh(ACTIONS));
    if (mode==='confirm') {
      await p.evaluate(m=>{ const ov=document.createElement('div'); ov.id='ov-mk'; ov.className='ov'; ov.innerHTML=m; document.body.appendChild(ov); try{ openM('ov-mk'); }catch(e){ ov.classList.remove('hidden'); } }, mh(MODAL));
    }
    await p.waitForTimeout(500); await p.evaluate(()=>document.querySelectorAll('[class*=toast]').forEach(e=>e.remove()));
    await p.evaluate(()=>{ const bt=[...document.querySelectorAll('#log-fiche-content button')].find(x=>/Corriger une période/.test(x.textContent)); if(bt) bt.textContent='✏️ Modifier'; });
await p.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.children.length<=2&&/Migration v15\.232/.test(e.textContent||'')).forEach(e=>{let t=e; while(t.parentElement&&t.parentElement!==document.body&&getComputedStyle(t).position!=='fixed') t=t.parentElement; t.remove();}));
    await p.screenshot({ path:`${OUT}/signature-expiree-${mode}-${fk}-${tn}.png` }); await ctx.close();
  }
}
await b.close();
