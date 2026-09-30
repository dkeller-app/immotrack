/**
 * __tests__/helpers/_extraction-source.js — outils de test COMMUNS pour extraire puis EXÉCUTER du
 * code de l'app (index.html, js/app/*.js) avec des doubles, et pour délimiter ses fonctions.
 *
 * Le parcours ignore les accolades situées dans les chaînes ('…', "…", `…` avec ${…} imbriqués),
 * les commentaires et les expressions régulières littérales : un `indexOf('{')` ou une regex `/[{]/`
 * ne décale plus l'appariement.
 */

const AVANT_REGEX = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^', '']);

/**
 * Parcourt du JavaScript de `debut` à `fin` et signale chaque accolade de CODE :
 * `surAccolade(index, '{' | '}')`. Rend l'index où le parcours s'est arrêté.
 * `arret(index, profondeur)` (optionnel) → true pour s'arrêter après une accolade fermante.
 */
export function parcourirJs(src, debut = 0, fin = src.length, surAccolade = () => {}, arret = null) {
  let i = debut, prof = 0, dernierSignificatif = '', dernierMot = '';
  const pileGabarits = [];   // profondeurs des ${ … } ouverts dans des gabarits
  const lireChaine = (q) => { i++; while (i < fin && src[i] !== q) { if (src[i] === '\\') i++; else if (src[i] === '\n' && q !== '`') break; i++; } };
  const lireGabarit = () => {   // depuis après le ` ; s'arrête sur ` fermant (i dessus) ou sur ${ (i après)
    while (i < fin) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') return 'fin';
      if (c === '$' && src[i + 1] === '{') { i += 2; return 'expr'; }
      i++;
    }
    return 'fin';
  };
  while (i < fin) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < fin && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? fin : e + 2; continue; }
    if (c === '\'' || c === '"') { lireChaine(c); i++; dernierSignificatif = 'x'; dernierMot = ''; continue; }
    if (c === '`') {
      i++;
      if (lireGabarit() === 'expr') { pileGabarits.push(prof); prof++; dernierSignificatif = '{'; continue; }
      i++; dernierSignificatif = 'x'; dernierMot = ''; continue;
    }
    if (c === '/' && (AVANT_REGEX.has(dernierSignificatif) || /^(return|typeof|case|in|of|delete|void|throw|new)$/.test(dernierMot))) {
      i++; let classe = false;
      while (i < fin) { const d = src[i]; if (d === '\\') { i += 2; continue; } if (d === '\n') break; if (classe) { if (d === ']') classe = false; } else if (d === '[') classe = true; else if (d === '/') break; i++; }
      i++; while (i < fin && /[a-z]/i.test(src[i])) i++;
      dernierSignificatif = 'x'; dernierMot = ''; continue;
    }
    if (c === '{') { surAccolade(i, '{'); prof++; dernierSignificatif = '{'; dernierMot = ''; i++; continue; }
    if (c === '}') {
      if (pileGabarits.length && pileGabarits[pileGabarits.length - 1] === prof - 1) {
        // fin d'un ${ … } : on reprend le gabarit
        pileGabarits.pop(); prof--; i++;
        if (lireGabarit() === 'expr') { pileGabarits.push(prof); prof++; dernierSignificatif = '{'; continue; }
        i++; dernierSignificatif = 'x'; dernierMot = ''; continue;
      }
      prof--; surAccolade(i, '}'); dernierSignificatif = '}'; dernierMot = ''; i++;
      if (arret && arret(i, prof)) return i;
      continue;
    }
    if (/[\w$]/.test(c)) { let j = i; while (j < fin && /[\w$]/.test(src[j])) j++; dernierMot = src.slice(i, j); dernierSignificatif = 'x'; i = j; continue; }
    dernierSignificatif = c; dernierMot = ''; i++;
  }
  return i;
}

/** Le bloc `{ … }` qui commence à `ouvre` (accolade comprise), apparié en ignorant chaînes, commentaires et regex. */
export function accolades(src, ouvre) {
  const finBloc = parcourirJs(src, ouvre, src.length, () => {}, (_i, prof) => prof === 0);
  return src.slice(ouvre, finBloc);
}

/** `function nom(…) { … }` extraite (la liste de paramètres peut contenir une déstructuration). */
export function extraireFonction(src, nom) {
  const debut = src.indexOf('function ' + nom + '(');
  if (debut < 0) throw new Error('fonction introuvable : ' + nom);
  let i = src.indexOf('(', debut), prof = 0;
  for (; i < src.length; i++) { if (src[i] === '(') prof++; else if (src[i] === ')') { prof--; if (prof === 0) break; } }
  const ouvre = src.indexOf('{', i);
  return src.slice(debut, ouvre) + accolades(src, ouvre);
}
