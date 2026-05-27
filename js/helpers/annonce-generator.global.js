/**
 * annonce-generator.global.js — Wrapper browser (window.AnnonceGenerator)
 * (LOG-ANNONCE Étape 4, v15.210)
 *
 * Mirror du module ES `__tests__/helpers/annonce-generator.js` testé via Vitest.
 * Ici on retire les `export` et on attache à `window.AnnonceGenerator` pour
 * usage direct dans index.html sans bundler.
 *
 * ⚠️ Source de vérité : __tests__/helpers/annonce-generator.js
 *    Toute modification de logique doit être faite côté module ES + tests,
 *    puis copiée ici (les 2 fichiers doivent rester synchronisés).
 */
(function(global) {
  'use strict';

  // ─── PRNG (Mulberry32) ─────────────────────────────────────────
  let _seed = 1;
  function setSeed(s) { _seed = (s | 0) || 1; }
  function rand() {
    let t = _seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function pick(arr) {
    if (!arr || !arr.length) return '';
    return arr[Math.floor(rand() * arr.length)];
  }
  function seedFromString(s, counter) {
    counter = counter || 0;
    let hash = 0;
    if (!s) return counter || 1;
    for (let i = 0; i < s.length; i++) hash = (hash + s.charCodeAt(i) * 7919) | 0;
    return Math.abs(hash + (counter | 0) * 7919) || 1;
  }

  // ─── MAPS ───────────────────────────────────────────────────────
  const MAP_EXPO = Object.freeze({
    'sud': 'plein sud', 'sud-est': 'sud-est', 'sud-ouest': 'sud-ouest',
    'est': 'est', 'ouest': 'ouest',
    'traversant-eo': 'traversant est-ouest', 'double-ns': 'double exposition nord-sud',
    'nord': 'nord'
  });
  const MAP_VUE = Object.freeze({
    'degagee': 'vue dégagée', 'jardin': 'sur jardin',
    'cour': 'sur cour intérieure', 'parc': 'sur parc',
    'monument': 'sur monument', 'mer-montagne': 'vue mer/montagne'
  });
  const MAP_LUM = Object.freeze({
    'lumineux': 'lumineux', 'tres-lumineux': 'très lumineux',
    'traversant': 'traversant', 'baigne-lumiere': 'baigné de lumière'
  });
  const MAP_CALM = Object.freeze({
    'rue-calme': 'rue calme', 'cour-interieure': 'côté cour au calme',
    'quartier-residentiel': 'quartier résidentiel',
    'quartier-verdoyant': 'quartier verdoyant'
  });
  const MAP_CAR = Object.freeze({
    'moulures-parquet': 'moulures et parquet ancien',
    'cheminee-deco': 'cheminée décorative',
    'hauts-plafonds': 'hauts plafonds',
    'batisse-caractere': 'bâtisse de caractère'
  });
  const TONS_VALIDES = Object.freeze(['factuel', 'storytelling', 'convivial', 'haut-gamme']);
  const FORMATS_VALIDES = Object.freeze(['leboncoin', 'detaille', 'sms']);

  // ─── HELPERS ────────────────────────────────────────────────────
  function etageLabel(etage) {
    if (etage == null || etage === '') return '';
    const n = parseInt(etage, 10);
    if (n === 0 || /^rdc/i.test(String(etage))) return 'rez-de-chaussée';
    if (n === 1) return '1er étage';
    return n + 'ème étage';
  }
  function adjLifestyle(log) {
    const s = (log && log.surf) || 0;
    if (s > 100) return pick(['généreusement dimensionné', 'spacieux', 'aux volumes confortables']);
    if (s > 70)  return pick(['agréablement spacieux', 'aux belles proportions', 'parfaitement agencé']);
    if (s > 45)  return pick(['fonctionnel', 'à l\'agencement réfléchi', 'bien pensé']);
    return pick(['cosy', 'au format idéal pour un pied-à-terre', 'intelligemment optimisé']);
  }
  function surfTxt(ext, withSpace) {
    if (!ext || typeof ext !== 'object') return '';
    const s = +ext.surface;
    if (!s || s <= 0) return '';
    return (withSpace === false ? '' : ' ') + s + ' m²';
  }
  function dpeClasse(log) { return (log && log.dpe && log.dpe.classe) || ''; }
  function formaterDateFr(d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
    catch (e) { return String(d); }
  }
  function garantiesLabel(g) {
    if (!Array.isArray(g) || !g.length) return '';
    const m = { 'caution_solidaire': 'Caution solidaire', 'visale': 'Visale (gratuit, Action Logement)', 'gli': 'GLI', 'garant_perso': 'Garant personnel' };
    return g.map(x => m[x] || x).join(' ou ');
  }

  // ─── BANQUE TITRES ──────────────────────────────────────────────
  const BANQUE_TITRES = Object.freeze({
    storytelling: [
      { si: (l) => l.presentation && l.presentation.exposition === 'sud' && l.exterieurs && l.exterieurs.balcon && l.exterieurs.balcon.present,
        tpl: (l, i) => `✨ Coup de cœur ${l.type} ${l.surf}m² plein sud + balcon - ${i.ville}` },
      { si: (l) => l.presentation && l.presentation.vue === 'mer-montagne',
        tpl: (l, i) => `🌊 Vue mer ${l.type} ${l.surf}m² + terrasse - ${i.ville}` },
      { si: (l) => l.exterieurs && l.exterieurs.jardin_privatif && l.exterieurs.jardin_privatif.present && l.type === 'Maison',
        tpl: (l, i) => `🌿 Belle maison ${l.surf}m² avec jardin${surfTxt(l.exterieurs.jardin_privatif)} - ${i.ville}` },
      { si: (l) => l.presentation && l.presentation.caractere_ancien === 'moulures-parquet' && l.exterieurs && l.exterieurs.balcon && l.exterieurs.balcon.present,
        tpl: (l, i) => `🏛 ${l.type} de caractère ${l.surf}m² + balcon - ${i.ville} centre` },
      { si: (l) => l.presentation && l.presentation.exposition === 'sud',
        tpl: (l, i) => `☀️ ${l.type} ${l.surf}m² plein sud - ${i.ville} centre` },
      { si: (l) => l.presentation && l.presentation.caractere_ancien,
        tpl: (l, i) => `🏛 Charme de l'ancien - ${l.type} ${l.surf}m² ${i.ville}` },
      { si: (l) => l.exterieurs && l.exterieurs.terrasse && l.exterieurs.terrasse.present && (+l.exterieurs.terrasse.surface > 15),
        tpl: (l, i) => `🌞 ${l.type} ${l.surf}m² + terrasse${surfTxt(l.exterieurs.terrasse)} - ${i.ville}` },
      { si: (l) => l.exterieurs && l.exterieurs.balcon && l.exterieurs.balcon.present,
        tpl: (l, i) => `🌿 ${l.type} ${l.surf}m² avec balcon - ${i.ville}` },
      { si: (l) => l.presentation && l.presentation.luminosite === 'baigne-lumiere',
        tpl: (l, i) => `🌞 ${l.type} baigné de lumière ${l.surf}m² - ${i.ville}` },
      { si: (l) => l.presentation && l.presentation.luminosite && MAP_LUM[l.presentation.luminosite],
        tpl: (l, i) => `🌞 ${l.type} ${l.surf}m² ${MAP_LUM[l.presentation.luminosite]} - ${i.ville}` },
      { si: (l, i) => parseInt(l.etage, 10) >= 4 && i.equipementsCommuns && i.equipementsCommuns.ascenseur,
        tpl: (l, i) => `🌆 ${l.type} ${l.surf}m² ${etageLabel(l.etage)} ascenseur - ${i.ville}` },
      { si: (l) => l.presentation && l.presentation.calme === 'rue-calme',
        tpl: (l, i) => `🤫 Havre de paix ${l.type} ${l.surf}m² - ${i.ville}` },
      { si: (l) => l.typeUsage === 'habitation-meuble',
        tpl: (l, i) => `🛋 ${l.type} meublé ${l.surf}m² ${i.ville}` },
      { si: (l) => dpeClasse(l) && dpeClasse(l) <= 'B' && l.exterieurs && l.exterieurs.jardin_privatif && l.exterieurs.jardin_privatif.present,
        tpl: (l, i) => `🌱 ${l.type} ${l.surf}m² DPE ${dpeClasse(l)} + jardin - ${i.ville}` },
      { si: (l) => dpeClasse(l) === 'A',
        tpl: (l, i) => `⚡ ${l.type} ${l.surf}m² DPE A - basse conso - ${i.ville}` },
    ],
    factuel: [
      { si: () => true, tpl: (l, i) => `${l.type} ${l.surf}m² ${l.npp} pièces - ${i.ville} ${i.codePostal}` },
      { si: (l) => l.exterieurs && l.exterieurs.balcon && l.exterieurs.balcon.present, tpl: (l, i) => `${l.type} ${l.surf}m² avec balcon - ${i.ville}` },
      { si: (l) => l.exterieurs && l.exterieurs.jardin_privatif && l.exterieurs.jardin_privatif.present, tpl: (l, i) => `${l.type} ${l.surf}m² + jardin${surfTxt(l.exterieurs.jardin_privatif)} - ${i.ville}` },
      { si: (l) => parseInt(l.etage, 10) >= 1, tpl: (l, i) => `${l.type} ${l.surf}m² ${etageLabel(l.etage)} - ${i.ville}` },
      { si: (l) => l.typeUsage === 'habitation-meuble', tpl: (l, i) => `${l.type} meublé ${l.surf}m² - ${i.ville}` },
      { si: () => true, tpl: (l, i) => `Location ${l.type} ${l.surf}m² - ${i.ville}` },
    ],
    convivial: [
      { si: (l) => l.exterieurs && l.exterieurs.jardin_privatif && l.exterieurs.jardin_privatif.present, tpl: (l, i) => `🏡 Votre future maison ${l.surf}m² avec jardin - ${i.ville}` },
      { si: (l) => l.exterieurs && l.exterieurs.balcon && l.exterieurs.balcon.present && l.presentation && l.presentation.exposition === 'sud', tpl: (l, i) => `☕ Cosy ${l.type} ${l.surf}m² + balcon ensoleillé - ${i.ville}` },
      { si: (l) => l.npp >= 3, tpl: (l, i) => `👨‍👩‍👧 ${l.type} familial ${l.surf}m² - ${i.ville} ${i.codePostal}` },
      { si: (l) => l.typeUsage === 'habitation-meuble' && l.surf < 35, tpl: (l, i) => `🎒 Joli studio meublé ${l.surf}m² étudiants OK - ${i.ville}` },
      { si: (l) => l.presentation && l.presentation.caractere_ancien, tpl: (l, i) => `🏛 Le charme de l'ancien à votre service - ${l.type} ${l.surf}m² - ${i.ville}` },
      { si: () => true, tpl: (l, i) => `🏠 Bel appart ${l.type} ${l.surf}m² qui n'attend que vous - ${i.ville}` },
    ],
    'haut-gamme': [
      { si: (l) => l.presentation && l.presentation.vue === 'mer-montagne', tpl: (l, i) => `🌊 Exceptionnel ${l.type} ${l.surf}m² vue mer - ${i.ville}` },
      { si: (l) => l.exterieurs && l.exterieurs.terrasse && l.exterieurs.terrasse.present && (+l.exterieurs.terrasse.surface > 20), tpl: (l, i) => `💎 ${l.type} d'exception ${l.surf}m² + terrasse - ${i.ville}` },
      { si: (l, i) => i.equipementsCommuns && i.equipementsCommuns.gardien && i.equipementsCommuns.videosurv, tpl: (l, i) => `🔐 ${l.type} ${l.surf}m² résidence sécurisée - ${i.ville}` },
      { si: (l) => l.presentation && l.presentation.caractere_ancien && l.exterieurs && l.exterieurs.balcon && l.exterieurs.balcon.present, tpl: (l, i) => `🎩 Élégant ${l.type} de caractère ${l.surf}m² - ${i.ville}` },
      { si: (l) => dpeClasse(l) === 'A', tpl: (l, i) => `🌿 ${l.type} ${l.surf}m² basse conso A - ${i.ville}` },
      { si: () => true, tpl: (l, i) => `🎯 ${l.type} de standing ${l.surf}m² - ${i.ville}` },
    ]
  });

  // ─── BANQUE ACCROCHES (raccourci : utiliser fallback factuel pour brièveté) ───
  const BANQUE_ACCROCHES = Object.freeze({
    storytelling: [
      { si: (l) => l.presentation && l.presentation.exposition === 'sud' && l.exterieurs && l.exterieurs.balcon && l.exterieurs.balcon.present,
        tpl: (l, i) => `Vous cherchez un cocon lumineux en plein cœur de ${i.ville} ? Coup de cœur garanti pour ce ${l.type} ${adjLifestyle(l)}, idéalement situé ${pick(['à deux pas du centre', 'au calme d\'une rue paisible', 'dans un quartier vivant et résidentiel'])}, baigné de soleil tout au long de la journée grâce à son ${MAP_EXPO[l.presentation.exposition] || 'exposition idéale'}.` },
      { si: (l) => l.exterieurs && l.exterieurs.jardin_privatif && l.exterieurs.jardin_privatif.present,
        tpl: (l, i) => `Imaginez vos petits-déjeuners dans le jardin, vos dîners d'été en terrasse, vos enfants courant pieds nus dans l'herbe. Cette ${l.type === 'Maison' ? 'maison' : 'résidence'} ${adjLifestyle(l)} de ${l.surf} m² avec son jardin privatif${surfTxt(l.exterieurs.jardin_privatif)} ${l.exterieurs.terrasse && l.exterieurs.terrasse.present ? `et sa terrasse${surfTxt(l.exterieurs.terrasse)} ` : ''}vous offre tout cet art de vivre.` },
      { si: (l) => l.presentation && l.presentation.vue === 'mer-montagne',
        tpl: (l, i) => `Réveillez-vous chaque matin face à la mer. Ce ${l.type} ${adjLifestyle(l)} de ${l.surf} m² au ${etageLabel(l.etage)} ${l.exterieurs && l.exterieurs.terrasse && l.exterieurs.terrasse.present ? `avec terrasse${surfTxt(l.exterieurs.terrasse)} ` : ''}offre une ${MAP_VUE[l.presentation.vue] || 'belle vue'} qui transforme chaque jour en moment privilégié.` },
      { si: (l) => l.presentation && l.presentation.caractere_ancien === 'moulures-parquet' && l.presentation.luminosite,
        tpl: (l, i) => `Le charme de l'ancien intact, le confort moderne au quotidien. Niché au cœur de ${i.ville}, ce ${l.type} ${adjLifestyle(l)} conjugue ${MAP_CAR[l.presentation.caractere_ancien] || 'caractère préservé'} et une luminosité ${MAP_LUM[l.presentation.luminosite] || 'remarquable'}. Une rare opportunité pour les amateurs d'authenticité.` },
      { si: (l) => l.typeUsage === 'habitation-meuble' && l.surf < 35,
        tpl: (l, i) => `Étudiants, jeunes actifs : voici votre futur pied-à-terre à ${i.ville}. Ce ${l.type === 'Studio' ? 'studio' : l.type} ${adjLifestyle(l)} de ${l.surf} m² entièrement meublé et équipé vous attend, ${l.presentation && l.presentation.calme === 'cour-interieure' ? 'au calme d\'une cour intérieure' : 'parfaitement situé'} pour conjuguer études/travail et qualité de vie.` },
      { si: (l) => l.npp >= 4,
        tpl: (l, i) => `La famille s'agrandit ? Vous cherchez un cocon pour grandir, partager, recevoir ? Cette ${l.type === 'Maison' ? 'belle maison' : 'généreuse résidence'} de ${l.surf} m² à ${i.ville} déploie ses ${l.npp} pièces ${l.exterieurs && l.exterieurs.jardin_privatif && l.exterieurs.jardin_privatif.present ? `avec son jardin${surfTxt(l.exterieurs.jardin_privatif)} ` : ''}pour répondre à vos rêves de vie de famille.` },
      { si: (l) => dpeClasse(l) && dpeClasse(l) <= 'B',
        tpl: (l, i) => `Bien performant, conscience tranquille. Avec son DPE classe ${dpeClasse(l)}${l.dpe && l.dpe.valConv ? ` (${l.dpe.valConv} kWh/m²/an)` : ''}, ce ${l.type} ${adjLifestyle(l)} de ${l.surf} m² conjugue confort moderne et factures maîtrisées.` },
    ],
    factuel: [
      { si: () => true, tpl: (l, i) => `Appartement de type ${l.type} d'une surface habitable de ${l.surf} m² (loi Carrez) composé de ${l.npp} pièces principales, situé au ${etageLabel(l.etage)}${i.equipementsCommuns && i.equipementsCommuns.ascenseur ? ' (avec ascenseur)' : ''} d'un immeuble en ${(i.regimeJuridique || 'monopropriété').toLowerCase()}, ${i.codePostal} ${i.ville}.` },
      { si: () => true, tpl: (l, i) => `${l.type} de ${l.surf} m², ${l.npp} pièces principales, ${etageLabel(l.etage)}, situé à ${i.adr}, ${i.codePostal} ${i.ville}.` },
    ],
    convivial: [
      { si: (l) => l.exterieurs && l.exterieurs.jardin_privatif && l.exterieurs.jardin_privatif.present, tpl: (l, i) => `Une jolie maison pleine de promesses vous attend à ${i.ville} ! ${l.surf} m² baignés de soleil, un jardin${surfTxt(l.exterieurs.jardin_privatif)} pour les enfants et les week-ends entre amis, et tout le confort dont vous rêvez.` },
      { si: (l) => l.presentation && l.presentation.exposition === 'sud' && l.exterieurs && l.exterieurs.balcon && l.exterieurs.balcon.present, tpl: (l, i) => `Un balcon plein sud + un appart' lumineux à ${i.ville}, vous en pensez quoi ? Ce ${l.type} de ${l.surf} m² au ${etageLabel(l.etage)} a tout pour devenir votre prochain chez-vous.` },
      { si: (l) => l.typeUsage === 'habitation-meuble', tpl: (l, i) => `Vous arrivez à ${i.ville} et vous cherchez un pied-à-terre tout prêt ? Voici votre solution : ${l.type === 'Studio' ? 'studio' : l.type} meublé de ${l.surf} m², tout équipé.` },
      { si: () => true, tpl: (l, i) => `On vous présente votre future adresse à ${i.ville} : un ${l.type} ${adjLifestyle(l)} de ${l.surf} m² avec tous les atouts pour bien vivre au quotidien.` },
    ],
    'haut-gamme': [
      { si: (l) => l.presentation && l.presentation.vue === 'mer-montagne' && l.exterieurs && l.exterieurs.terrasse && l.exterieurs.terrasse.present, tpl: (l, i) => `Pour les amateurs d'exception. Ce ${l.type} de ${l.surf} m² au ${etageLabel(l.etage)} offre une vue mer panoramique sublimée par une terrasse${surfTxt(l.exterieurs.terrasse)}.` },
      { si: (l) => l.exterieurs && l.exterieurs.jardin_privatif && l.exterieurs.jardin_privatif.present && l.surf > 100, tpl: (l, i) => `Une demeure de standing dans un cadre privilégié. Cette ${l.type === 'Maison' ? 'maison' : 'propriété'} de ${l.surf} m² conjugue espaces généreux, finitions soignées et jardin privatif${surfTxt(l.exterieurs.jardin_privatif)}.` },
      { si: (l) => l.presentation && l.presentation.caractere_ancien && l.surf > 60, tpl: (l, i) => `Le ${l.type} d'exception que vous cherchiez : ${l.surf} m² de caractère préservé, une adresse prestigieuse à ${i.ville}.` },
      { si: () => true, tpl: (l, i) => `${l.type} de prestige de ${l.surf} m² à ${i.ville}, aux belles proportions et finitions soignées, à découvrir.` },
    ]
  });

  // ─── GENERATEURS ────────────────────────────────────────────────
  function _filterCandidates(banque, log, imm) {
    return banque.filter(c => { try { return c.si(log, imm); } catch (e) { return false; } });
  }
  function genererTitre(log, imm, ton) {
    ton = ton || 'storytelling';
    const banque = BANQUE_TITRES[ton] || BANQUE_TITRES.storytelling;
    const candidats = _filterCandidates(banque, log, imm);
    if (!candidats.length) return `${log.type || 'Bien'} ${log.surf || ''}m² à louer - ${imm.ville || ''}`.trim();
    return pick(candidats).tpl(log, imm);
  }
  function genererAccroche(log, imm, ton) {
    ton = ton || 'storytelling';
    const banque = BANQUE_ACCROCHES[ton] || BANQUE_ACCROCHES.storytelling;
    const candidats = _filterCandidates(banque, log, imm);
    if (!candidats.length) return `${log.type || 'Bien'} ${log.surf || ''}m² à ${imm.ville || ''}.`;
    return pick(candidats).tpl(log, imm);
  }
  function genererDescription(log, ton) {
    ton = ton || 'storytelling';
    const cuisine = (log.equipements && log.equipements.cuisine) || {};
    const sanits = (log.equipements && log.equipements.sanitaires) || {};
    const nbChambres = Math.max(0, (log.npp || 1) - 1);

    if (ton === 'factuel') {
      return `Composition : entrée, séjour${log.surf > 50 ? ' spacieux' : ''}, cuisine ${cuisine.equipee ? 'équipée' : 'non équipée'}, ${nbChambres} chambre${nbChambres > 1 ? 's' : ''}, salle de bain ${sanits.bain && sanits.douche ? 'avec baignoire et douche' : ''}${sanits.wc_separe ? ', WC séparé' : ''}.`;
    }
    if (ton === 'convivial') {
      return `À l'intérieur, vous trouverez un séjour ${adjLifestyle(log)} qui appelle aux longues soirées entre amis, ${cuisine.equipee ? 'une cuisine entièrement équipée' : 'une cuisine prête à accueillir vos équipements'}, ${nbChambres > 1 ? `${nbChambres} jolies chambres` : 'une chambre confortable'}, et une salle de bain ${sanits.bain && sanits.douche ? 'avec baignoire ET douche italienne' : 'fonctionnelle'}${sanits.wc_separe ? ', WC séparé' : ''}.`;
    }
    if (ton === 'haut-gamme') {
      const cuisineOuverte = (cuisine.customs || []).find(c => /ouverte/i.test(c));
      return `L'appartement déploie un séjour aux volumes ${log.surf > 70 ? 'généreux' : 'soignés'} ouvert sur une ${cuisineOuverte ? 'cuisine américaine entièrement équipée' : 'cuisine équipée haut de gamme'}${cuisine.lave_vaisselle ? ' (lave-vaisselle intégré)' : ''}. ${nbChambres > 1 ? `${nbChambres} chambres confortables` : 'Une chambre principale'}${sanits.wc_separe ? ', WC indépendant' : ''}.`;
    }
    const cuisineOuverte = (cuisine.customs || []).find(c => /ouverte/i.test(c));
    const equipsLst = [cuisine.four && 'four', cuisine.plaques && 'plaques', cuisine.lave_vaisselle && 'lave-vaisselle', cuisine.micro_ondes && 'micro-ondes'].filter(Boolean);
    const ouvertures = [
      `Côté salon, ${log.surf > 70 ? 'imaginez vos dîners entre amis ' : 'on s\'imagine vite '}dans ce séjour ${adjLifestyle(log)} ${cuisineOuverte ? 'ouvert sur une cuisine américaine entièrement équipée' : cuisine.equipee ? 'avec sa cuisine équipée' : ''}${cuisine.lave_vaisselle ? ` (${equipsLst.join(', ')} — tout est là)` : ''}.`,
      `Le séjour ${adjLifestyle(log)} accueille vos moments du quotidien ${cuisineOuverte ? 'autour d\'une cuisine ouverte entièrement équipée' : 'avec cuisine équipée attenante'}.`,
      `${log.surf > 60 ? 'Le séjour spacieux, ouvert sur la cuisine,' : 'Le coin séjour, ouvert sur la cuisine équipée,'} est pensé pour partager les moments du quotidien.`
    ];
    const chambresPhrases = nbChambres > 1 ? [
      `Côté nuit, ${nbChambres} chambres confortables offrent à chacun son espace.`,
      `${nbChambres} chambres confortables accueillent vos nuits paisibles.`,
      `Les ${nbChambres} chambres, ${adjLifestyle(log)}, garantissent le repos après la journée.`
    ] : [
      `Une chambre confortable ${log.presentation && log.presentation.calme === 'cour-interieure' ? 'côté cour intérieure pour un sommeil au calme' : 'pour des nuits paisibles'}.`,
      `Une chambre principale ${log.presentation && log.presentation.luminosite ? 'baignée de lumière' : 'confortable'} pour vos moments de récupération.`,
    ];
    const sdbPhrases = [
      `Salle de bain ${sanits.bain && sanits.douche ? 'avec baignoire ET douche italienne (rare !)' : sanits.douche ? 'avec douche italienne' : sanits.bain ? 'avec baignoire' : 'fonctionnelle'}${sanits.wc_separe ? ', et WC séparé pour le confort de tous' : ''}.`,
      `Pour le quotidien : salle de bain ${sanits.bain && sanits.douche ? 'équipée d\'une baignoire et d\'une douche italienne' : 'avec ' + (sanits.bain ? 'baignoire' : 'douche italienne')}${sanits.wc_separe ? ', WC indépendant' : ''}.`,
    ];
    return `${pick(ouvertures)} ${pick(chambresPhrases)} ${pick(sdbPhrases)}`;
  }

  function genererAtouts(log, imm) {
    const atouts = [];
    const p = log.presentation || {};
    const ext = log.exterieurs || {};
    const eq = log.equipements || {};
    const ann = log.annexes || {};
    const ec = (imm && imm.equipementsCommuns) || {};

    if (p.exposition === 'sud') atouts.push('Exposition plein sud — lumière généreuse toute la journée');
    else if (p.exposition && p.exposition !== 'nord') atouts.push(`Exposition ${MAP_EXPO[p.exposition]} — belle luminosité`);
    if (p.luminosite === 'baigne-lumiere') atouts.push('Appartement baigné de lumière (rares vis-à-vis)');
    if (ext.balcon && ext.balcon.present) {
      const taille = ext.balcon.surface ? `de ${ext.balcon.surface} m² ` : '';
      const calme = p.calme === 'cour-interieure' ? ' côté cour au calme' : p.calme === 'rue-calme' ? ' donnant sur rue calme' : '';
      atouts.push(`Balcon privatif ${taille}${calme}`.trim());
    }
    if (ext.terrasse && ext.terrasse.present) {
      const taille = ext.terrasse.surface ? `de ${ext.terrasse.surface} m² ` : '';
      atouts.push(`Terrasse ${taille}${p.exposition === 'sud' || p.exposition === 'sud-ouest' ? '(idéale pour les repas d\'été)' : ''}`.trim());
    }
    if (ext.jardin_privatif && ext.jardin_privatif.present) {
      const taille = ext.jardin_privatif.surface ? `de ${ext.jardin_privatif.surface} m² ` : '';
      atouts.push(`Jardin privatif ${taille}(rare en ${imm.ville})`.trim());
    }
    const etage = parseInt(log.etage, 10);
    if (etage >= 3 && ec.ascenseur) atouts.push(`${etageLabel(log.etage)} avec ascenseur`);
    else if (etage === 0) atouts.push('Rez-de-chaussée surélevé — accès direct, idéal seniors/PMR');
    const sec = [ec.interphone && 'interphone', ec.digicode && 'digicode', ec.videosurv && 'vidéosurveillance', ec.gardien && 'gardien'].filter(Boolean);
    if (sec.length) atouts.push(`Immeuble sécurisé (${sec.join(', ')})`);
    if (eq.cuisine && eq.cuisine.equipee) {
      const eqList = [eq.cuisine.four && 'four', eq.cuisine.plaques && 'plaques induction', eq.cuisine.hotte && 'hotte', eq.cuisine.lave_vaisselle && 'lave-vaisselle', eq.cuisine.micro_ondes && 'micro-ondes'].filter(Boolean);
      atouts.push(`Cuisine entièrement équipée${eqList.length ? ' (' + eqList.join(', ') + ')' : ''}`);
    }
    if (eq.sanitaires && eq.sanitaires.bain && eq.sanitaires.douche) atouts.push('Salle de bain avec baignoire ET douche italienne (rare)');
    if (eq.sanitaires && eq.sanitaires.wc_separe) atouts.push('WC séparé');
    if (ann.cave && ann.cave.present && ann.parking && ann.parking.present) atouts.push(`Cave ${ann.cave.num ? `n° ${ann.cave.num}` : ''} et ${ann.parking.type === 'box' ? 'box' : 'parking'} ${ann.parking.num ? `n° ${ann.parking.num}` : ''} inclus`.replace(/\s+/g, ' ').trim());
    else if (ann.cave && ann.cave.present) atouts.push(`Cave incluse${ann.cave.num ? ` (n° ${ann.cave.num})` : ''}`);
    else if (ann.parking && ann.parking.present) atouts.push(`${ann.parking.type === 'box' ? 'Box parking' : 'Place de parking'}${ann.parking.num ? ` n° ${ann.parking.num}` : ''} inclus`);
    if (Array.isArray(ann.customs)) ann.customs.forEach(c => atouts.push(c));
    if (eq.technologies && eq.technologies.fibre) atouts.push('Fibre optique installée');
    if (p.caractere_ancien) atouts.push(`Charme de l'ancien (${MAP_CAR[p.caractere_ancien]}) avec confort moderne`);
    if (log.dpe && log.dpe.classe && log.dpe.classe <= 'B') atouts.push(`DPE ${log.dpe.classe} (${log.dpe.valConv || '?'} kWh/m²/an) — charges énergétiques maîtrisées`);
    return atouts;
  }

  function genererQuartier(log, imm, ton) {
    const q = log.quartier;
    if (!q || typeof q !== 'object') return `Situé ${imm.adr || ''}, ${imm.codePostal || ''} ${imm.ville || ''}.`.trim();
    ton = ton || 'storytelling';
    const phrases = [];
    const T = q.transports || {};
    const transports = [];
    if (T.metro)    transports.push(`métro à ${T.metro} min`);
    if (T.tramway)  transports.push(`tramway à ${T.tramway} min`);
    if (T.bus)      transports.push(`bus à ${T.bus} min`);
    if (T.gare)     transports.push(`gare SNCF à ${T.gare} min`);
    if (transports.length) phrases.push(`Côté transports : ${transports.join(', ')}.`);
    const C = q.commerces || {};
    const comm = [];
    if (C.boulangerie) comm.push(`boulangerie ${typeof C.boulangerie === 'string' ? C.boulangerie : `à ${C.boulangerie} min`}`);
    if (C.supermarche) comm.push(`supermarché à ${C.supermarche} min`);
    if (C.pharmacie)   comm.push(`pharmacie à ${C.pharmacie} min`);
    if (C.marche)      comm.push(`marché ${C.marche}`);
    if (comm.length) phrases.push(`Tous commerces de proximité : ${comm.join(', ')}.`);
    const S = q.services || {};
    const services = [];
    if (S.ecoles_primaires) services.push('écoles maternelle/primaire à pied');
    if (S.college)          services.push('collège');
    if (S.lycee)            services.push('lycée');
    if (S.parc)             services.push('parc/espace vert');
    if (S.restaurants)      services.push('restaurants');
    if (S.sport)            services.push('salle de sport');
    if (services.length) phrases.push(`Services à proximité : ${services.join(', ')}.`);
    if (Array.isArray(q.reperes) && q.reperes.length) {
      if (ton === 'storytelling' || ton === 'haut-gamme') phrases.push(`À deux pas : ${q.reperes.join(' · ')}.`);
      else phrases.push(`Repères du quartier : ${q.reperes.join(', ')}.`);
    }
    const carac = q.caractere || [];
    const caracMap = { 'centre-historique': 'centre historique', 'quartier-residentiel': 'quartier résidentiel', 'quartier-etudiant': 'quartier étudiant', 'quartier-affaires': 'quartier d\'affaires', 'bord-de-mer': 'bord de mer', 'proche-nature': 'proche nature', 'quartier-festif': 'quartier vivant et festif', 'haut-de-gamme': 'quartier haut de gamme' };
    if (carac.length) {
      const labels = carac.map(c => caracMap[c]).filter(Boolean);
      if (ton === 'storytelling') phrases.push(`Vivre dans ce ${labels[0]} c'est conjuguer ${labels.length > 1 ? labels.slice(1).join(' et ') + ' et qualité de vie' : 'authenticité et confort'}.`);
      else phrases.push(`Quartier ${labels.join(', ')}.`);
    }
    return phrases.join(' ');
  }

  function genererDossier() {
    return {
      pieces: [
        '✓ Pièce d\'identité (CNI recto-verso ou passeport)',
        '✓ Justificatif de domicile actuel < 3 mois',
        '✓ 3 dernières fiches de paie',
        '✓ Dernier avis d\'imposition complet',
        '✓ Contrat de travail (CDI/CDD) ou attestation employeur',
        '✓ RIB français à votre nom',
        '✓ Si garant : mêmes pièces + 3 dernières fiches de paie du garant'
      ],
      astuce: '💡 Astuce : utilisez DossierFacile.fr (service gratuit de l\'État) — dossier numérique unique certifié, prêt à transmettre en 1 clic.'
    };
  }

  function genererAnnonce(log, imm, bail, opts) {
    opts = opts || {};
    if (!log) log = {};
    if (!imm) imm = {};
    if (!bail) bail = {};
    const ton = TONS_VALIDES.indexOf(opts.ton) >= 0 ? opts.ton : 'storytelling';
    const format = FORMATS_VALIDES.indexOf(opts.format) >= 0 ? opts.format : 'leboncoin';
    const includeDossier = opts.includeDossier !== false;

    if (opts.seed != null) setSeed(opts.seed);
    else setSeed(seedFromString(log.ref || 'X', opts.counter || 0));

    const titre = genererTitre(log, imm, ton);
    const hc = +bail.hc || 0;
    const ch = +bail.ch || 0;
    const dg = +bail.dg || 0;
    const total = hc + ch;

    if (format === 'sms') {
      const parts = [`📍 ${log.type || 'Bien'} ${log.surf || ''}m² ${imm.ville || ''}`];
      if (log.presentation && log.presentation.exposition === 'sud') parts.push('plein sud');
      if (log.exterieurs && log.exterieurs.balcon && log.exterieurs.balcon.present) parts.push(`balcon ${log.exterieurs.balcon.surface || ''}m²`);
      if (log.exterieurs && log.exterieurs.jardin_privatif && log.exterieurs.jardin_privatif.present) parts.push(`jardin ${log.exterieurs.jardin_privatif.surface || ''}m²`);
      if (log.exterieurs && log.exterieurs.terrasse && log.exterieurs.terrasse.present) parts.push(`terrasse ${log.exterieurs.terrasse.surface || ''}m²`);
      if (log.equipements && log.equipements.cuisine && log.equipements.cuisine.equipee) parts.push('cuisine équipée');
      if (log.presentation && log.presentation.caractere_ancien) parts.push("charme ancien");
      if (log.annexes && log.annexes.parking && log.annexes.parking.present) parts.push('parking');
      parts.push(`${total}€ CC`);
      if (log.locationInfo && log.locationInfo.disponibilite) parts.push(`libre ${formaterDateFr(log.locationInfo.disponibilite)}`);
      if (log.dpe && log.dpe.classe) parts.push(`DPE ${log.dpe.classe}`);
      return { titre: titre, body: parts.join(' · '), stats: { caracteres: parts.join(' · ').length, mots: parts.join(' · ').split(/\s+/).length, titreLen: titre.length }, format: 'sms', ton: ton };
    }

    const SEP = '━━━━━━━━━━━━━━━━━━━━━━━━';
    const accroche = genererAccroche(log, imm, ton);
    const description = genererDescription(log, ton);
    const atouts = genererAtouts(log, imm);
    const quartier = genererQuartier(log, imm, ton);

    const lines = [];
    lines.push(SEP, '🏠 LE BIEN', '', accroche, '', description, '');
    lines.push(SEP, '✨ LES ATOUTS', '');
    atouts.forEach(a => lines.push('✓ ' + a));
    lines.push('');
    lines.push(SEP, '📍 LE QUARTIER', '', quartier, '');

    if (format === 'detaille') {
      lines.push(SEP, '👥 PROFIL RECHERCHÉ', '');
      if (log.typeUsage === 'habitation-meuble' && log.surf < 35) lines.push('Idéal étudiant, jeune actif, mobilité professionnelle.');
      else if (log.npp >= 4) lines.push('Idéal pour famille avec stabilité professionnelle.');
      else lines.push('Bien convient à couple, jeune cadre, profession libérale.');
      lines.push('Nous recherchons un locataire sérieux et soigneux.');
      lines.push('');
    }

    if (includeDossier) {
      const doss = genererDossier(log);
      lines.push(SEP, '📂 DOSSIER À FOURNIR', '', 'Pour étudier votre candidature, merci de joindre :');
      doss.pieces.forEach(p => lines.push(p));
      lines.push('', doss.astuce, '');
    }

    lines.push(SEP, '💰 PRATIQUE', '');
    lines.push(`Loyer : ${hc} € HC + ${ch} € charges = ${total} € CC/mois`);
    if (dg) lines.push(`Dépôt de garantie : ${dg} €`);
    if (log.locationInfo && log.locationInfo.disponibilite) lines.push(`Disponibilité : ${formaterDateFr(log.locationInfo.disponibilite)}`);
    const garanties = garantiesLabel(log.locationInfo && log.locationInfo.garanties_acceptees);
    if (garanties) lines.push(`Garanties acceptées : ${garanties}`);
    lines.push('Honoraires : aucun (annonce directe propriétaire)');
    if (log.dpe && log.dpe.classe) lines.push(`DPE : Classe ${log.dpe.classe}${log.dpe.valConv ? ` (${log.dpe.valConv} kWh/m²/an)` : ''}${log.dpe.ges ? ` — GES ${log.dpe.ges}` : ''}`);

    lines.push('', SEP, '', 'Contact : par messagerie du site uniquement. Merci de préciser votre situation professionnelle et le nombre d\'occupants dès votre 1er message.');

    const body = lines.join('\n');
    return { titre: titre, body: body, stats: { caracteres: body.length, mots: body.split(/\s+/).length, titreLen: titre.length }, format: format, ton: ton };
  }

  // ─── EXPORT GLOBAL ───────────────────────────────────────────────
  global.AnnonceGenerator = {
    setSeed: setSeed, rand: rand, pick: pick, seedFromString: seedFromString,
    MAP_EXPO: MAP_EXPO, MAP_VUE: MAP_VUE, MAP_LUM: MAP_LUM, MAP_CALM: MAP_CALM, MAP_CAR: MAP_CAR,
    TONS_VALIDES: TONS_VALIDES, FORMATS_VALIDES: FORMATS_VALIDES,
    etageLabel: etageLabel, adjLifestyle: adjLifestyle, formaterDateFr: formaterDateFr, garantiesLabel: garantiesLabel,
    BANQUE_TITRES: BANQUE_TITRES, BANQUE_ACCROCHES: BANQUE_ACCROCHES,
    genererTitre: genererTitre, genererAccroche: genererAccroche,
    genererDescription: genererDescription, genererAtouts: genererAtouts,
    genererQuartier: genererQuartier, genererDossier: genererDossier,
    genererAnnonce: genererAnnonce
  };
})(typeof window !== 'undefined' ? window : globalThis);
