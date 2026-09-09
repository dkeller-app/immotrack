/**
 * core/avenant.js — AVENANT AU CONTRAT DE BAIL
 *
 * Rédige un avenant modifiant un bail en cours (12 objets possibles), en réutilisant
 * les données du bail. PUR (sans DB / DOM) : génère du HTML de document + applique les
 * garde-fous légaux chiffrés. Le câblage UI / persistance / export vit dans index.html.
 *
 * Cadre légal (loi n° 89-462 du 6 juillet 1989) :
 *   - colocation / solidarité : art. 8-1, VI (fin de solidarité + caution du sortant, au
 *     plus tard 6 mois après le congé à défaut de colocataire entrant) ;
 *   - cautionnement : art. 22-1 ;
 *   - loyer / travaux d'amélioration : art. 17-1, II (accord exprès ; hausse annuelle ≤ 15 %
 *     du coût réel TTC des travaux ; travaux ≥ 1/2 année de loyer ; interdiction si DPE F/G) ;
 *   - charges : art. 23 (provisions, régularisation) / 23-1 (forfait, non régularisable) ;
 *   - sous-location / cession : art. 8 ; destination : art. 2.
 *
 * Tests Vitest miroir : __tests__/helpers/avenant.test.js
 */

const ROMAINS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
export function romain(n) { return ROMAINS[n - 1] || String(n); }

// Échappe une valeur saisie avant injection HTML (anti-XSS : le document est persisté dans
// bail.avenants[].html et sera rendu ailleurs, y compris en partage SCI multi-tenant).
export function esc(x) {
  return String(x == null ? '' : x)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function b(x) { return '<strong>' + esc(x) + '</strong>'; }
function num(x) { return Number(x) || 0; }
function frDate(iso) {
  if (!iso) return '…';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso);
}

/**
 * Garde-fous chiffrés de la hausse de loyer pour travaux d'amélioration.
 * @param {{loyer0:number, coutTTC:number, dpe:string, nouveau:number}} o
 *   dpe : classe DPE ('A'..'G'). F/G ⇒ majoration interdite.
 * @returns {{seuil, maxHausseMois, maxLoyer, hausse, passoire, ok, blocages:string[]}}
 */
export function loyerTravauxGuard(o) {
  o = o || {};
  const loyer0 = num(o.loyer0), coutTTC = num(o.coutTTC), nouveau = num(o.nouveau);
  const dpe = String(o.dpe || '').trim().toUpperCase().charAt(0);
  const seuil = Math.round(loyer0 * 6 * 100) / 100;                 // 1/2 année de loyer
  const maxHausseMois = Math.round((coutTTC * 0.15 / 12) * 100) / 100; // 15 % TTC / an → /mois
  const maxLoyer = Math.round((loyer0 + maxHausseMois) * 100) / 100;
  const hausse = Math.round((nouveau - loyer0) * 100) / 100;
  const passoire = (dpe === 'F' || dpe === 'G');
  const blocages = [];
  if (passoire) blocages.push('Logement classé ' + dpe + ' : majoration interdite (passoire énergétique, art. 17) tant qu\'une rénovation ne l\'en fait pas sortir.');
  if (coutTTC <= 0) blocages.push('Coût réel TTC des travaux non renseigné.');
  else if (coutTTC < seuil) blocages.push('Travaux insuffisants : ' + coutTTC + ' € < seuil ' + seuil + ' € (moitié d\'une année de loyer).');
  if (hausse > maxHausseMois) blocages.push('Hausse ' + hausse + ' €/mois > plafond ' + maxHausseMois + ' €/mois (15 % × ' + coutTTC + ' € TTC ÷ 12). Loyer maximal : ' + maxLoyer + ' €.');
  return { seuil, maxHausseMois, maxLoyer, hausse, passoire, ok: blocages.length === 0, blocages };
}

/**
 * Génère un article d'avenant.
 * @param {string} k - type d'objet
 * @param {object} d - données saisies
 * @param {object} [ctx] - { loyer0 }
 * @returns {{titre, html, base?, caution?}|null}
 */
export function avenantArticle(k, d, ctx) {
  d = d || {}; ctx = ctx || {};
  switch (k) {
    case 'coloc': {
      const act = String(d.act || '');
      const isAjout = act.indexOf('Ajout') === 0;
      const isDepart = act.indexOf('Départ') === 0;
      let h = '';
      if (!isAjout) {
        h += 'M. / Mme ' + b(d.sortant || '…') + ' cesse d\'être partie au contrat de bail à compter de la date d\'effet du présent avenant et libère les lieux à cette date, renonçant à tout droit d\'occupation sur le logement. Conformément à l\'article 8-1, VI de la loi du 6 juillet 1989, sa solidarité et celle de la personne qui s\'est portée caution pour lui prennent fin ' +
          (isDepart
            ? 'au plus tard à l\'expiration d\'un délai de six mois suivant la date d\'effet de son congé, à défaut de colocataire entrant inscrit au bail avant ce terme'
            : 'à la date d\'effet du présent avenant, un colocataire entrant lui étant substitué') + '. ';
      }
      if (!isDepart) {
        h += 'M. / Mme ' + b(d.entrant || '…') + ' est ' + (isAjout ? 'adjoint(e) au' : 'substitué(e) au colocataire sortant et devient partie au') +
          ' contrat de bail à compter de la date d\'effet. Il / elle déclare avoir pris connaissance du bail initial et de ses annexes, en accepter sans réserve l\'ensemble des clauses et conditions, et devient solidairement et indivisiblement tenu(e), avec le(s) colocataire(s) en place, du paiement des loyers, charges et accessoires ainsi que de l\'exécution de toutes les obligations du bail. Un acte de cautionnement distinct est régularisé pour garantir ses engagements. ';
      }
      h += 'Le(s) colocataire(s) demeurant dans les lieux poursuit / poursuivent le bail aux conditions initiales et fait / font leur affaire personnelle de la restitution éventuelle de la quote-part de dépôt de garantie au colocataire sortant.';
      return { titre: 'Modification de la colocation', html: h, base: 'art. 8-1, VI, loi du 6 juillet 1989', caution: !isDepart };
    }
    case 'caution': {
      const act = String(d.act || '');
      const ml = act.indexOf('Mainlevée') === 0;
      const h = ml
        ? 'Le bailleur donne mainlevée pleine et entière de l\'engagement de caution souscrit par ' + b(d.nom || '…') + ', qui se trouve déchargé(e) de toute obligation au titre du bail à compter de la date d\'effet du présent avenant.'
        : act + ' : ' + b(d.nom || '…') + ' s\'engage en qualité de caution solidaire à garantir l\'exécution de l\'ensemble des obligations du / des locataire(s), dans la limite de ' + b(num(d.plafond) + ' €') + ', pour la durée du bail et de son ou ses renouvellements. Cet engagement, conforme à l\'article 22-1 de la loi du 6 juillet 1989, fait l\'objet d\'un acte de cautionnement distinct portant les mentions requises, annexé au présent avenant.';
      return { titre: 'Cautionnement', html: h, base: 'art. 22-1, loi du 6 juillet 1989', caution: !ml };
    }
    case 'loyer': {
      const loyer0 = num(ctx.loyer0);
      const motif = String(d.motif || '');
      const trav = motif.indexOf('Travaux') === 0, baisse = motif.indexOf('Baisse') === 0;
      let h = 'Les parties rappellent ';
      if (trav) {
        h += 'que le bailleur a fait réaliser dans le logement, depuis la conclusion du bail, des travaux d\'amélioration (apport d\'un équipement ou service nouveau, à l\'exclusion de tout entretien, réparation ou remise en état) : ' + b(d.desc || '…') + ', pour un coût réel de ' + b(num(d.cout) + ' € TTC') + '. Par application de l\'article 17-1, II de la loi du 6 juillet 1989, qui autorise les parties à fixer par avenant la majoration de loyer consécutive à de tels travaux, et le montant de la majoration ayant été, par prudence, aligné sur le plafond retenu pour la relocation encadrée (hausse annuelle limitée à 15 % du coût réel TTC des travaux, ces derniers excédant la moitié de la dernière année de loyer), ';
      } else if (baisse) {
        h += 'qu\'il est consenti une baisse temporaire du loyer pendant la réalisation des travaux suivants : ' + b(d.desc || '…') + '. À ce titre, ';
      } else {
        h += 'leur volonté commune de réévaluer le loyer manifestement sous-évalué. En conséquence, ';
      }
      h += 'le loyer mensuel hors charges est porté de ' + b(loyer0 + ' €') + ' à ' + b(num(d.nouveau) + ' €') + ' à compter de la date d\'effet. Le locataire, dûment et préalablement informé de la nature ' + (trav ? 'des travaux et de leur coût' : 'du motif') + ', y consent expressément par la signature du présent avenant. La présente modification ne fait pas obstacle à la révision annuelle du loyer selon l\'indice de référence des loyers stipulée au bail.';
      return { titre: 'Modification du loyer', html: h, base: 'art. 17-1, II, loi du 6 juillet 1989' };
    }
    case 'charges': {
      const mode = String(d.mode || '');
      const forf = mode.toLowerCase().indexOf('forfait') >= 0;
      const h = 'Les modalités de règlement des charges récupérables sont modifiées comme suit : ' + b(mode.toLowerCase()) + '. Le montant ' + (forf ? 'du forfait' : 'des provisions mensuelles') + ' de charges est fixé à ' + b(num(d.montant) + ' €') + ' à compter de la date d\'effet. ' +
        (forf
          ? 'Ce forfait, applicable aux locations meublées et aux colocations, n\'est pas soumis à régularisation et ne peut donner lieu à complément, conformément aux articles 8-1 et 23-1 de la loi du 6 juillet 1989.'
          : 'Ces provisions donnent lieu à une régularisation annuelle au regard des charges réelles, sur justificatifs tenus à la disposition du locataire, conformément à l\'article 23 de la loi du 6 juillet 1989.');
      return { titre: 'Charges locatives', html: h, base: forf ? 'art. 23-1, loi du 6 juillet 1989' : 'art. 23, loi du 6 juillet 1989' };
    }
    case 'annexe': {
      const add = String(d.act || 'Adjonction') === 'Adjonction';
      const h = (add ? 'Est adjoint au contrat de bail, en qualité d\'accessoire du logement loué, ' : 'Est retiré de l\'assiette du contrat de bail ') + b((d.type || '') + ', ' + (d.design || '')) + '. ' +
        (add ? 'En contrepartie de cette adjonction, le loyer mensuel est majoré de ' + b(num(d.sup) + ' €') + ' à compter de la date d\'effet. ' : '') +
        'La jouissance de cette dépendance suit le sort du bail principal, dont elle ne peut être dissociée.';
      return { titre: (add ? 'Adjonction' : 'Retrait') + ' d\'une dépendance', html: h };
    }
    case 'duree': {
      const prorog = String(d.act || '').indexOf('Prorog') >= 0;
      const h = 'Le terme du contrat de bail est ' + (prorog ? 'prorogé' : 'fixé') + ' au ' + b(frDate(d.fin)) + '. La présente stipulation respecte la durée minimale légale applicable au contrat. Le bail se poursuit pour le surplus aux conditions initiales, la faculté de résiliation dans les conditions légales demeurant réservée à chacune des parties.';
      return { titre: 'Durée du bail', html: h };
    }
    case 'destination': {
      const h = 'La destination des lieux loués est modifiée pour devenir : ' + b(d.dest || '…') + ', à compter de la date d\'effet. Le locataire s\'engage à respecter les obligations et la réglementation propres à cet usage, ainsi que, le cas échéant, le règlement de copropriété de l\'immeuble.';
      return { titre: 'Destination des lieux', html: h, base: 'art. 2, loi du 6 juillet 1989' };
    }
    case 'travaux': {
      const loc = String(d.qui || 'le locataire') === 'le locataire';
      const h = 'Le bailleur autorise expressément ' + (d.qui || 'le locataire') + ' à faire réaliser les travaux suivants dans le logement : ' + b(d.nature || '…') + '. ' +
        (loc
          ? 'Les travaux sont exécutés sous la responsabilité du locataire, dans les règles de l\'art et sans porter atteinte à la structure ni à la destination du logement. Sauf convention contraire, les aménagements ainsi réalisés resteront acquis au bailleur en fin de bail, sans indemnité.'
          : 'Le bailleur en supporte le coût et informera le locataire du calendrier d\'exécution.') +
        (d.contre && d.contre !== '—' ? ' Contrepartie convenue : ' + b(d.contre) + '.' : '');
      return { titre: 'Autorisation de travaux', html: h };
    }
    case 'paiement': {
      const h = 'À compter de la date d\'effet, le loyer et les charges sont payables d\'avance le ' + b(d.jour || '…') + ' de chaque mois, par ' + b(d.mode || '…') + ', sur le compte du bailleur ouvert sous l\'IBAN ' + b(d.rib || '…') + '. La présente stipulation ne porte que sur les modalités de règlement et laisse inchangés le montant, l\'exigibilité et le terme du loyer.';
      return { titre: 'Modalités de paiement', html: h };
    }
    case 'souslocation': {
      const act = String(d.act || '');
      const sl = act.indexOf('sous-location') >= 0, ce = act.indexOf('cession') >= 0;
      const h = sl
        ? 'Le bailleur autorise le locataire à sous-louer le logement, ' + b(d.cond || '…') + '. Le prix du mètre carré de surface habitable de la sous-location ne peut excéder celui payé par le locataire principal ; ce dernier demeure seul tenu envers le bailleur de l\'exécution du bail, conformément à l\'article 8 de la loi du 6 juillet 1989.'
        : ce
          ? 'Le bailleur autorise le locataire à céder son droit au bail, ' + b(d.cond || '…') + '. Le cessionnaire est subrogé dans l\'ensemble des droits et obligations résultant du bail à compter de la date d\'effet.'
          : 'Le bailleur n\'autorise pas la sous-location ni la cession du présent bail, qui demeurent interdites sans son accord écrit préalable (art. 8 de la loi du 6 juillet 1989).';
      return { titre: 'Sous-location / cession', html: h, base: 'art. 8, loi du 6 juillet 1989' };
    }
    case 'clause':
      return { titre: esc(d.titre || 'Stipulation particulière'), html: b(d.texte || '…') };
    case 'correction': {
      const h = 'Les parties constatent qu\'une erreur purement matérielle affecte ' + b(d.champ || '…') + ' figurant au bail initial. En conséquence, la mention « ' + esc(d.anc || '…') + ' » est rectifiée et remplacée par « ' + b(d.nouv || '…') + ' ». Cette rectification n\'emporte ni novation, ni modification de l\'économie générale du contrat.';
      return { titre: 'Rectification d\'une erreur matérielle', html: h };
    }
    default:
      return null;
  }
}

/**
 * Assemble le document HTML complet de l'avenant.
 * @param {object} ctx - { no, bailleur, locataires:[nom], bien, dateBail, loyer0, effetIso, ville, objets:[{k,data}] }
 * @returns {{html, caution, nbArticles, entrant}}
 */
export function buildAvenantHtml(ctx) {
  ctx = ctx || {};
  const locs = Array.isArray(ctx.locataires) ? ctx.locataires : [];
  const objets = Array.isArray(ctx.objets) ? ctx.objets : [];
  const effet = frDate(ctx.effetIso);
  let n = 1, arts = '', caution = false, entrant = '';
  objets.forEach(o => {
    const a = avenantArticle(o.k, o.data, { loyer0: ctx.loyer0 });
    if (!a) return;
    if (a.caution) caution = true;
    if (o.k === 'coloc' && String((o.data || {}).act || '').indexOf('Départ') !== 0 && (o.data || {}).entrant) entrant = o.data.entrant;
    arts += '<h3>Article ' + romain(n++) + ' — ' + a.titre + '</h3><p>' + a.html + (a.base ? ' <em style="color:#8b94a5">(' + a.base + ')</em>' : '') + '</p>';
  });
  arts += '<h3>Article ' + romain(n++) + ' — Prise d\'effet</h3><p>Le présent avenant prend effet le ' + b(effet) + '.</p>';
  arts += '<h3>Article ' + romain(n++) + ' — Stipulations inchangées</h3><p>À l\'exception des modifications qui précèdent, l\'ensemble des clauses et conditions du bail initial demeure applicable et inchangé. Le présent avenant forme un tout indivisible avec le bail auquel il demeure annexé, et ne vaut ni novation ni conclusion d\'un nouveau bail.</p>';

  const signataires = locs.map(nom => ({ role: 'Le locataire', nom }));
  if (entrant) signataires.push({ role: 'Le colocataire entrant', nom: entrant });
  signataires.push({ role: 'Le bailleur', nom: ctx.bailleur || '' });
  const sigHtml = signataires.map(s =>
    '<div><strong>' + s.role + '</strong><br><em>' + esc(s.nom) + '</em>' +
    '<div class="sig-bloc"><em style="font-size:8.5pt">Précéder la signature de la mention « Lu et approuvé »</em></div></div>').join('');

  // CORPS au gabarit Propryo (.pro-doc) — l'habillage (bandeau logos, titre, pied) est posé par _docPage.
  const html =
    '<p class="pro-lead" style="font-variant:small-caps;letter-spacing:.03em">Entre les soussignés :</p>' +
    '<p>' + b(ctx.bailleur || '…') + ', ci-après « le bailleur », d\'une part,</p>' +
    '<p>Et ' + b(locs.join(' & ') || '…') + ', ci-après « le(s) locataire(s) », d\'autre part,</p>' +
    '<table class="pro-kv"><tr><td>Bail modifié</td><td>Contrat d\'habitation signé le <strong>' + frDate(ctx.dateBail) + '</strong></td></tr>' +
    '<tr><td>Logement</td><td>' + esc(ctx.bien || '…') + '</td></tr>' +
    '<tr><td>Loyer mensuel HC en vigueur</td><td>' + num(ctx.loyer0) + ' €</td></tr></table>' +
    '<p style="font-variant:small-caps;letter-spacing:.03em">Il a été préalablement exposé ce qui suit :</p>' +
    '<p>Les parties sont convenues d\'apporter au bail les modifications ci-après, sans que celles-ci n\'emportent novation ni conclusion d\'un nouveau bail.</p>' +
    '<p style="font-variant:small-caps;letter-spacing:.03em">Ceci exposé, il a été convenu ce qui suit :</p>' +
    arts +
    (caution ? '<div class="alerte">La ou les cautions concernées doivent réitérer leur engagement par un nouvel acte de cautionnement couvrant les présentes modifications, à peine de décharge (art. 22-1 de la loi du 6 juillet 1989).</div>' : '') +
    '<p style="margin-top:4mm">Fait à ' + esc(ctx.ville || '…') + ', le ' + effet + ', en autant d\'exemplaires originaux que de parties, chacune reconnaissant en avoir reçu un.</p>' +
    '<h3>Signatures</h3><div class="grid2">' + sigHtml + '</div>';
  return { html, caution, nbArticles: n - 1, entrant };
}
