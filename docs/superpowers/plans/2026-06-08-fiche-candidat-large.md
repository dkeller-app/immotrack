# Fiche candidat — modale large (Variante A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Élargir la fiche candidat (modale `#ov-fiche-candidat`) en layout 2 colonnes — données à gauche, colonne décision (score + conversion) **collée** à droite — responsive PC/tablette/téléphone, sans changer la logique.

**Architecture:** Refacto purement présentation dans `index-candidature-test.html` : (1) CSS scopé `#ov-fiche-candidat` (largeur modale + nouvelles classes `.fc-layout/.fc-main/.fc-side` + responsive) ; (2) restructuration du wrapper du template `body.innerHTML` de `openFicheCandidat` — le **contenu interne de chaque carte reste verbatim**, seul l'emballage change. Aucune modification de logique/données/scoring/handlers.

**Tech Stack:** HTML/CSS inline (vanilla), tokens design system du thème. Pas de JS logique, pas de Vitest (aucun helper pur). Vérif = `node` syntax check des blocs inline + test visuel 3 formats.

**Spec :** `docs/superpowers/specs/2026-06-08-fiche-candidat-large-design.md`
**Mockup validé (référence visuelle) :** `mockups/candidature/fiche-candidat-redesign.html` — **Variante A**

---

## Contraintes (gravées)

- **Sandbox-first** : UNIQUEMENT `index-candidature-test.html`. Pas de prod (`index.html`).
- **Zéro régression fonctionnelle** : conserver tous les handlers/IDs (`toggleCandidatPiecesVerifiees`, `setCandidatStatut`, `refuserCandidat`, `demanderComplementCandidat`, `convertCandidatToBail`, `_editCandidatFromFiche`, `_renderAttachmentSection`, `tip-wrap`, `score-ring`, `stepper`).
- **Tokens** uniquement (`--sur --sur2 --bor --t1 --t2 --t3 --blu --grn --ora --red --rl --r`), pas de couleur en dur.
- **Commit tenu** : ne PAS pousser (arbre multi-session non démêlé) ; commit local par chemin explicite uniquement, après OK visuel user.
- **Test dans le vrai navigateur** via URL anti-cache `http://localhost:8080/index-candidature-test.html?v=fiche1` (le cache HTTP ne se vide pas au hard-refresh ici).

---

## Ancres réelles vérifiées (sandbox, 2026-06-08)

- CSS fiche : `<style>` scopé à partir de la ligne **2028**. `#ov-fiche-candidat .modal{max-width:920px}` ligne **2029**. `.fc-g2` ligne **2035**. Media query unique `@media (max-width:680px){...}` ligne **2079** (dernière ligne du bloc, juste avant `</style>`).
- Template : `body.innerHTML = \`` ligne **15148**. Structure actuelle :
  - `<div class="fc-hero">…</div>` (15149-15158)
  - `<div class="card mb16">` Pipeline (stepper + actions `<div class="flex-c" …>${actionsHtml}</div>` + `${complBanner}`) (15160-15165)
  - `<div class="fc-g2">` Identité | Situation (15167-15189)
  - `<div class="fc-g2">` Garant | Pièces (15191-15206)
  - `<div class="card mb16">` Score (15208-15223)
  - `${convHtml}` (15225)
  - fin `` ` `` ligne **15226**, puis `openM('ov-fiche-candidat');`

---

## Task 1 : Layout 2 colonnes + décision sticky

**Files:**
- Modify: `index-candidature-test.html` (CSS scopé `#ov-fiche-candidat` + template `openFicheCandidat`)

- [ ] **Step 1 : Élargir la modale + ajouter les classes de layout (CSS)**

Remplacer la ligne `#ov-fiche-candidat .modal{max-width:920px}` (2029) par :
```css
#ov-fiche-candidat .modal{width:92vw;max-width:1280px}
/* Variante A — données (gauche) + colonne décision collée (droite) */
#ov-fiche-candidat .fc-layout{display:grid;grid-template-columns:1.7fr 1fr;gap:18px;align-items:start}
#ov-fiche-candidat .fc-main{min-width:0;display:flex;flex-direction:column;gap:16px}
#ov-fiche-candidat .fc-side{position:sticky;top:8px;align-self:start;display:flex;flex-direction:column;gap:16px;min-width:0}
#ov-fiche-candidat .fc-main>.card,#ov-fiche-candidat .fc-side>.card,#ov-fiche-candidat .fc-main>.fc-g2{margin-bottom:0}
#ov-fiche-candidat .fc-sub-stack{display:flex;flex-direction:column;gap:14px}
```

- [ ] **Step 2 : Adapter le responsive (CSS)**

Remplacer la media query ligne 2079 par :
```css
@media (max-width:1000px){
  #ov-fiche-candidat .fc-layout{grid-template-columns:1fr}
  #ov-fiche-candidat .fc-side{position:static}
}
@media (max-width:680px){#ov-fiche-candidat .fc-g2{grid-template-columns:1fr}#ov-fiche-candidat .score-hero{flex-direction:column;align-items:flex-start}#ov-fiche-candidat .crit .cbar{width:80px}}
@media (max-width:560px){
  #ov-fiche-candidat .modal{width:96vw}
  #ov-fiche-candidat .fc-actions .btn{flex:1 1 100%}
  #ov-fiche-candidat .step{min-width:64px}
}
```

- [ ] **Step 3 : Marquer la rangée d'actions (template)**

Dans `openFicheCandidat`, la rangée d'actions du pipeline : remplacer
```js
      <div class="flex-c" style="gap:8px;flex-wrap:wrap;margin-top:18px">${actionsHtml}</div>
```
par (ajout classe `fc-actions` pour le responsive téléphone) :
```js
      <div class="flex-c fc-actions" style="gap:8px;flex-wrap:wrap;margin-top:18px">${actionsHtml}</div>
```

- [ ] **Step 4 : Restructurer le wrapper du template (Variante A)**

Dans `openFicheCandidat`, **remplacer tout le bloc** depuis `<div class="fc-hero">` jusqu'à `${convHtml}` inclus (le contenu de `body.innerHTML`, 15149-15225) par la structure ci-dessous. **Le contenu interne de chaque carte (stepper, kv-grid Identité, kv-grid Situation, garantHtml, toggle+piecesFlags+gedHtml, score-hero+crits, convHtml) reste IDENTIQUE** — on ne fait que ré-emballer.

Structure cible (calquée sur le mockup Variante A) :
```
<div class="fc-hero"> … hero inchangé … </div>
<div class="fc-layout">
  <div class="fc-main">
    <div class="card"> … Pipeline (stepper + .fc-actions + complBanner) … </div>
    <div class="fc-g2">
      <div class="card"> … Identité … </div>
      <div class="fc-sub-stack">
        <div class="card"> … Situation … </div>
        <div class="card"> … Garant … </div>
      </div>
    </div>
    <div class="card"> … Pièces (toggle + piecesFlags + gedHtml) … </div>
  </div>
  <div class="fc-side">
    <div class="card"> … Score (score-hero + crits + alert légal) … </div>
    ${convHtml}
  </div>
</div>
```

Concrètement :
- Le **hero** reste tel quel.
- Ouvrir `<div class="fc-layout"><div class="fc-main">` juste après le hero.
- **Pipeline** : conserver la carte telle quelle (avec la classe `fc-actions` du Step 3). Retirer `mb16` (le gap de `.fc-main` gère l'espacement).
- **Identité | Situation+Garant** : garder la 1ʳᵉ `fc-g2`, mettre la carte **Identité** en 1ʳᵉ cellule, et en 2ᵉ cellule un `<div class="fc-sub-stack">` contenant la carte **Situation** PUIS la carte **Garant** (déplacée depuis l'ancienne 2ᵉ `fc-g2`).
- **Pièces** : sortir la carte Pièces de l'ancienne `fc-g2` Garant|Pièces et la mettre **seule, pleine largeur** de `.fc-main`. Supprimer le wrapper `<div class="fc-g2">` Garant|Pièces devenu vide.
- Fermer `</div>` (fc-main), ouvrir `<div class="fc-side">`, y mettre la carte **Score** (retirer `mb16`) puis `${convHtml}`, fermer `</div>` (fc-side) puis `</div>` (fc-layout).

- [ ] **Step 5 : Vérifier la syntaxe des blocs inline**

Run :
```bash
node -e "const fs=require('fs'),vm=require('vm');const h=fs.readFileSync('index-candidature-test.html','utf8');const re=/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;let m,i=0,e=0;while((m=re.exec(h))){const a=m[1]||'';if(/type\s*=\s*[\"']module[\"']/.test(a)||/\ssrc\s*=/.test(a))continue;i++;try{new vm.Script(m[2])}catch(x){e++;console.log('ERR bloc',i,x.message)}}console.log(i+' blocs, '+e+' erreur(s)')"
```
Expected: `4 blocs, 0 erreur(s)` + équilibre des `<div>` inchangé (le nb d'ouvrantes/fermantes du template doit rester cohérent : on ajoute fc-layout+fc-main+fc-side+fc-sub-stack = +4 paires, on retire 1 wrapper fc-g2 = -1 paire).

- [ ] **Step 6 : Test visuel dans le vrai navigateur**

Ouvrir `http://localhost:8080/index-candidature-test.html?v=fiche1`, ouvrir une fiche candidat. Vérifier contre le mockup Variante A :
1. **PC large** : modale ~92vw (plafond 1280px), 2 colonnes ; en scrollant les données (Identité/Situation/Garant/Pièces) à gauche, la colonne **Score + Conversion** reste **collée** visible à droite. Plus aéré qu'avant.
2. **Tablette** (DevTools ~834px) : 1 colonne, score repasse sous les données, pas de sticky, rien coupé.
3. **Téléphone** (DevTools ~390px) : 1 colonne, sous-grilles empilées, boutons d'action **pleine largeur**, anneau score + barres lisibles, liste GED lisible.
4. **Fonctions intactes** : toggle « Pièces vérifiées » bascule, boutons pipeline (Valider/Refuser/Demander complément) marchent, tip score s'ouvre, « + Ajouter » / voir / supprimer pièces OK, CTA conversion selon statut.
Expected : conforme mockup, aucune régression, aucune erreur console.

- [ ] **Step 7 : Commit (LOCAL — ne pas pousser)**

⚠️ L'arbre multi-session n'est pas démêlé → commit **local** uniquement, par chemin explicite. (Le hook tentera un push qui peut échouer en non-fast-forward — c'est attendu, le commit local est conservé.)
```bash
git add index-candidature-test.html
git commit -m "feat(candidature): fiche candidat en modale large 2 colonnes + décision sticky (sandbox)"
```

---

## Self-Review

**1. Spec coverage**
- Modale 92vw/1280px → Step 1 ✅
- Layout 2-col données/décision sticky → Steps 1,4 ✅
- Responsive tablette (1-col, sticky off) + téléphone (1-col, boutons pleine largeur) → Step 2 ✅
- Périmètre présentation seulement, contenu interne verbatim → Step 4 (ré-emballage explicite) ✅
- Sandbox-first, tokens, test 3 formats vrai navigateur → Steps 1-6 ✅

**2. Placeholder scan** : aucun TBD/TODO ; CSS complet, restructuration décrite avec ancres exactes + référence mockup. Le contenu interne des cartes n'est pas recopié **volontairement** (consigne = le laisser verbatim pour éviter toute perte) — ce n'est pas un placeholder mais une contrainte de non-régression.

**3. Cohérence**
- Classes : `.fc-layout/.fc-main/.fc-side/.fc-sub-stack/.fc-actions` définies (Steps 1-2) et utilisées (Steps 3-4) à l'identique. ✅
- Media queries : 1000px (collapse 2→1 col + sticky off), 680px (existant, fc-g2→1col + score-hero), 560px (modale 96vw + actions pleine largeur). Cohérent (1000 ⊃ 680 ⊃ 560). ✅
- Aucun handler/ID touché (Step 4 ré-emballe seulement). ✅
