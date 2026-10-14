/**
 * TON NEUTRE — garde-fou : l'interface vue par le propriétaire n'emploie NI « tu » NI « vous ».
 *
 * Règle (Didier, 14/10/2026) : infinitif ou tournure générique. « Session expirée : les modifications… »,
 * « Exporter le relevé », « Possible de s'arrêter à tout moment ».
 *
 * Ce test balaie les fichiers d'interface propriétaire (hors commentaires) et échoue sur toute ligne qui contient :
 *   - un pronom / possessif de 2e personne (tu, toi, ton, ta, tes, te, t', vous, votre, vos) ;
 *   - une forme verbale de vouvoiement en -ez (cliquez, saisissez, ajoutez…) ;
 *   - un impératif de tutoiement parmi les verbes d'interface les plus fréquents (exporte, reprends, appuie…).
 *
 * EXCLUSIONS ASSUMÉES (vouvoiement voulu — documents ou messages adressés à des TIERS, pas à l'utilisateur) :
 *   - fichiers entiers : courriers / e-mails aux locataires, candidats et garants, congé, texte officiel de la
 *     déclaration d'occupation (impots.gouv), motifs de pièces de candidature ;
 *   - lignes isolées (liste TIERS ci-dessous) : message envoyé au locataire / candidat / invité, texte imprimé
 *     d'un bail ou d'un décompte de charges, assistant de signature présentiel (le signataire lit l'écran).
 * Une ligne nouvelle qui tutoie ou vouvoie le propriétaire fait donc échouer ce test : la reformuler, jamais
 * l'ajouter à la liste sans raison « tiers » écrite.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '..', '..')

// ── fichiers d'interface propriétaire ───────────────────────────────────────────────────────────────────────
const lister = (dir, re) => fs.readdirSync(path.join(ROOT, dir)).filter(f => re.test(f)).sort().map(f => dir + '/' + f)

const EXCLUS_FICHIERS = new Set([
  'js/core/email-compose.js',            // modèles de courriers aux locataires / garants (vouvoiement voulu)
  'js/core/email-pdf-attachment.js',     // pièces jointes PDF adressées au locataire
  'js/core/conge.js',                    // congé / résiliation : lettre au locataire
  'js/core/candidature.js',              // message au candidat
  'js/core/declaration-occupation.js',   // libellés officiels du formulaire impots.gouv (« Votre bien est… »)
  'js/core/pieces-candidature.js',       // expressions régulières de détection dans les pièces
])

const FICHIERS = [
  'index.html',
  'js/app/app-part1.js', 'js/app/app-part2.js', 'js/app/app-part3.js',
  'js/app/supabase-entry.js', 'js/app/supabase-boot.js', 'js/app/doc-express.js', 'js/app/espace-locataire-app.js',
  ...lister('js/core', /\.js$/),
  ...lister('js/components', /\.js$/),
  ...lister('js/helpers', /\.global\.js$/),
  'js/main.js', 'sw.js',
].filter(f => !EXCLUS_FICHIERS.has(f) && fs.existsSync(path.join(ROOT, f)))

// ── lignes « tiers » : [fichier, fragment distinctif de la ligne, raison] ──────────────────────────────────────
const TIERS = [
  // messages envoyés au locataire / signataire (signature à distance)
  ['js/app/app-part1.js', "Votre bail' + (bien ? ' concernant '", 'message au signataire'],
  ['js/app/app-part1.js', 'Cliquez sur votre lien sécurisé', 'message au signataire'],
  ['js/app/app-part1.js', 'Vous recevrez un code de vérification', 'message au signataire'],
  ['js/app/app-part1.js', "'Votre bail à signer'", 'objet du message au signataire'],
  ['js/app/app-part1.js', "'Votre bail à signer en ligne : '", 'SMS au signataire'],
  ['js/app/app-part1.js', 'Veuillez trouver le lien vers votre bail signé', 'message au locataire'],
  ['js/app/app-part1.js', "'Votre bail signé'", 'objet du message au locataire'],
  ['js/app/app-part1.js', "'Votre bail signé : '", 'SMS au locataire'],
  // messages envoyés au candidat
  ['js/app/app-part1.js', "intérêt que vous portez", 'message au candidat'],
  ['js/app/app-part1.js', 'je vous invite à déposer votre dossier', 'message au candidat'],
  ['js/app/app-part1.js', "Aucun compte n\\'est nécessaire. Vous pouvez interrompre", 'message au candidat'],
  ['js/app/app-part1.js', 'Conformément au RGPD, vos données ne sont utilisées', 'message au candidat'],
  ['js/app/app-part1.js', "'Votre dossier de location'", 'objet du message au candidat'],
  ['js/app/app-part1.js', 'Dépôt de votre dossier de location', 'SMS au candidat'],
  ['js/app/app-part1.js', 'Merci de compléter votre dossier', 'note proposée au candidat'],
  ['js/app/app-part1.js', 'anil.org/votre-adil', 'URL externe'],
  // libellé officiel du formulaire CERFA 2044, ligne 214 (texte légal reproduit mot pour mot)
  ['js/app/app-part2.js', 'dont vous vous réservez la jouissance', 'libellé officiel CERFA 2044'],
  // texte imprimé d'un bail
  ['js/app/app-part1.js', "consultez un professionnel du droit pour les clauses spécifiques", 'texte du bail'],
  ['js/app/app-part1.js', 'Contrat hors régime standard — Consultez', 'texte du bail'],
  // décompte de régularisation / courriers au locataire
  ['js/app/app-part1.js', 'estimé à votre crédit', 'décompte au locataire'],
  ['js/app/app-part1.js', 'tenues à votre disposition lors du décompte définitif', 'décompte au locataire'],
  ['js/app/app-part1.js', 'Dans le cadre de votre départ', 'courrier au locataire'],
  ['js/app/app-part1.js', 'nous vous adressons le décompte de régularisation', 'décompte au locataire'],
  ['js/app/app-part1.js', "(à votre crédit)", 'décompte au locataire'],
  ['js/app/app-part1.js', 'sont tenues à votre disposition pendant', 'décompte au locataire'],
  ['js/app/app-part1.js', 'vous pouvez saisir la <b>Commission Départementale', 'décompte au locataire'],
  ['js/app/app-part1.js', 'vous sera restitué dans le mois suivant', 'décompte au locataire'],
  ['js/app/app-part1.js', "à votre crédit (trop-perçu)", 'décompte au locataire'],
  ['js/app/app-part1.js', 'Le décompte de régularisation des charges pour l', 'e-mail au locataire'],
  ['js/app/app-part2.js', 'Nous vous remercions de bien vouloir régulariser', 'relance au locataire'],
  ['js/app/app-part2.js', 'Nous vous demandons de procéder au règlement', 'relance au locataire'],
  ['js/app/app-part2.js', 'nous vous informons de la révision annuelle du loyer', 'lettre IRL au locataire'],
  ['js/app/app-part2.js', "Nous vous prions d'agréer", 'courrier au locataire'],
  // invitation envoyée à la personne invitée
  ['js/app/app-part3.js', 'Vous êtes invité·e à accéder', 'SMS à l\'invité'],
  ['js/app/app-part3.js', 'Je vous invite à accéder à mon espace', 'message à l\'invité'],
  ['js/app/app-part3.js', 'Cliquez sur le lien ci-dessous pour créer votre compte', 'message à l\'invité'],
  // assistant de signature présentiel : le signataire (bailleur OU locataire) lit l'écran (fenêtre d'impression)
  ['js/app/app-part1.js', "Veuillez parapher cette page", 'assistant de signature'],
  ['js/app/app-part1.js', 'au signataire suivant', 'assistant de signature'],
  ['js/app/app-part1.js', 'Vous signerez à la <b>dernière étape</b>', 'assistant de signature'],
  ['js/app/app-part1.js', 'Faites défiler le bail', 'assistant de signature'],
  ['js/app/app-part1.js', 'Tracez vos <b>initiales', 'assistant de signature'],
  ['js/app/app-part1.js', 'Votre paraphe n', 'assistant de signature'],
  ['js/app/app-part1.js', 'Tracez votre paraphe avant de valider', 'assistant de signature'],
  ['js/app/app-part1.js', 'Phase 2 — Signature locataire', 'assistant de signature (locataire)'],
  ['js/app/app-part1.js', 'Affichée au-dessus de votre signature', 'assistant de signature'],
  ['js/app/app-part1.js', 'Cliquez sur <b>« ✓ Sauvegarder', 'assistant de signature'],
]

// ── détection ───────────────────────────────────────────────────────────────────────────────────────────────
const L = '(?<![\\p{L}\\p{N}_])'
const R = '(?![\\p{L}\\p{N}_])'
// pronoms sûrs (jamais un identifiant)
const RE_PRONOMS = new RegExp(L + "(?:tu|toi|toi-même|tes|vous|votre|vos|vous-même|vôtre)" + R, 'iu')
// ton / ta / te : ambigus avec des identifiants (ta = textarea, te = type, ton = tonalité) → seulement suivis d'un mot français
const RE_AMBIGUS = new RegExp(L + "(?:ton|ta|te) [a-zàâçéèêëîïôûùüÿœ]{3,}", 'iu')
const RE_ELISION = /(?<![\p{L}\p{N}_])t['’](?:es|as|en|y|a|attend|emm|ar|app|arr|ai|in|un|ex|ou|oub)[\p{L}]*/iu
// vouvoiement : impératif / présent en -ez
const NON_VERBES_EZ = new Set(['assez', 'chez', 'nez', 'carrez', 'rendez-vous', 'rez', 'lez', 'mez', 'prez', 'bez', 'vez'])
const RE_EZ = /(?<![\p{L}\p{N}_-])([\p{L}]{3,}ez)(?![\p{L}\p{N}_])/giu
// tutoiement : impératifs d'interface (les formes qui ont existé dans l'app avant ce chantier)
const VERBES_TU = ['exporte', 'reprends', 'appuie', 'ajoute', 'utilise', 'dépose', 'range', 'choisis', 'vérifie', 'saisis', 'renseigne',
  'complète', 'clique', 'sélectionne', 'importe', 'retire', 'corrige', 'reconnecte', 'connecte', 'recharge', 'réessaie', 'attends',
  'coche', 'décoche', 'tape', 'rouvre', 'ouvre', 'reviens', 'élargis', 'rattache', 'signale', 'patiente', 'configure', 'attache',
  'envoie', 'télécharge', 'enregistre', 'termine', 'conserve', 'compare', 'ajuste', 'recopie', 'précise',
  'autorise', 'recommence', 'glisse', 'réessaye', 'pense']
// début de texte : après une ouverture de chaîne / de balise, une ponctuation ou un tiret — jamais au milieu d'un mot (« s'ouvre »)
const TU_DEBUT = /(?:^\s*|(?<![\p{L}\p{N}\\])['"`>(]\s*|[.!?:;—–]\s+|\s—\s|,\s|[•·→⤷↔↳]\s*)/u
const TU_SUITE = /(?:(?:-[a-zà-ÿ]+)? [a-zà-ÿ’'«"]+|[.!?](?![\p{L}\p{N}_]))/u
const RE_TU = new RegExp(TU_DEBUT.source + '(?:' + VERBES_TU.join('|') + ')' + TU_SUITE.source, 'iu')
// impératif + pronom enclitique (« corrige-le », « saisis-la », « reconnecte-toi », « crée-en une »)
const RE_ENCLITIQUE = /(?<![\p{L}\p{N}_-])[\p{L}]{3,}[es]-(?:le|la|les|en|y|toi|moi|nous)(?![\p{L}\p{N}_-])/iu

// lignes qui ressemblent à un tutoiement sans en être un (3e personne, participe, nom) : [fichier, fragment, raison]
const FAUX_POSITIFS = [
  ['js/app/app-part1.js', 'recharge en fluide frigorigène', 'décret 87-712 : nom « recharge »'],
  ['js/app/app-part1.js', 'vérifie son email par code', '3e personne : le signataire vérifie son e-mail'],
]

/** Tous les indices de 2e personne d'une ligne (déjà privée de ses commentaires). */
function suspects(l) {
  const hits = []
  const m1 = l.match(RE_PRONOMS); if (m1) hits.push(m1[0])
  const m2 = l.match(RE_AMBIGUS); if (m2) hits.push(m2[0])
  const m3 = l.match(RE_ELISION); if (m3) hits.push(m3[0])
  for (const m of l.matchAll(RE_EZ)) { if (!NON_VERBES_EZ.has(m[1].toLowerCase())) hits.push(m[1]) }
  const m4 = l.match(RE_TU); if (m4) hits.push(m4[0].trim())
  const m5 = l.match(RE_ENCLITIQUE); if (m5) hits.push(m5[0])
  return hits
}

function sansCommentaires(src) {
  const out = []
  let bloc = false, html = false
  for (const brut of src.split(/\r?\n/)) {
    let l = brut
    if (bloc) { if (l.includes('*/')) { bloc = false; l = l.slice(l.indexOf('*/') + 2) } else { out.push(''); continue } }
    if (html) { if (l.includes('-->')) { html = false; l = l.slice(l.indexOf('-->') + 3) } else { out.push(''); continue } }
    const t = l.trim()
    if (t.startsWith('//') || t.startsWith('*')) { out.push(''); continue }
    if (t.startsWith('/*')) { if (!t.includes('*/')) bloc = true; out.push(''); continue }
    l = l.replace(/<!--.*?-->/g, '')
    if (l.includes('<!--')) { html = true; l = l.slice(0, l.indexOf('<!--')) }
    l = l.replace(/\s\/\*[^*]*\*\//g, ' ')
    // commentaire de fin de ligne : « code ;   // texte » (guillemets équilibrés avant)
    const m = l.match(/\s\/\/\s/)
    if (m) {
      const avant = l.slice(0, m.index)
      const q = (avant.match(/['"`]/g) || []).length
      if (q % 2 === 0) l = avant
    }
    out.push(l)
  }
  return out
}

function violations(rel) {
  // lecture par descripteur : le setup des tests sert un index.html « assemblé » à readFileSync(chemin) — ici on veut le fichier réel
  const fd = fs.openSync(path.join(ROOT, rel), 'r')
  const src = fs.readFileSync(fd, 'utf8')
  fs.closeSync(fd)
  const lignes = sansCommentaires(src)
  const res = []
  lignes.forEach((l, i) => {
    if (!l.trim()) return
    const hits = suspects(l)
    if (!hits.length) return
    if (TIERS.some(([f, frag]) => f === rel && l.includes(frag))) return
    if (FAUX_POSITIFS.some(([f, frag]) => f === rel && l.includes(frag))) return
    res.push({ ligne: i + 1, hits, texte: l.trim().slice(0, 200) })
  })
  return res
}

describe('ton neutre — interface propriétaire', () => {
  it('le balayage couvre bien les fichiers attendus', () => {
    expect(FICHIERS).toContain('js/app/app-part1.js')
    expect(FICHIERS).toContain('js/app/app-part2.js')
    expect(FICHIERS).toContain('js/core/offline-boot.js')
    expect(FICHIERS).toContain('js/core/pwa-install.js')
    expect(FICHIERS).toContain('index.html')
    expect(FICHIERS).not.toContain('js/core/email-compose.js')
  })

  it('la détection reconnaît bien le tutoiement et le vouvoiement (le test ne passe pas à vide)', () => {
    const exemples = [
      'Ta session a expiré', 'Tu peux t’arrêter', 'Exporte ton relevé', 'Reprends où tu t’étais arrêté',
      'Vos modifications seront perdues', 'tapez le nom exact de votre espace', 'Cliquez sur « Ajouter »',
      'Appuie sur Partager', 'Dépose ici tes diagnostics', 'Reconnecte-toi à un réseau', 'à toi de choisir',
      '— corrige-le ou passe-le en présentiel', 'Saisis-la à la main', 'Crée-en une depuis la liste', 'Veuillez parapher',
    ]
    for (const e of exemples) {
      const l = "'" + e + "'"
      expect(suspects(l).length > 0, e).toBe(true)
    }
  })

  it('la détection laisse passer le ton neutre', () => {
    const neutres = [
      'Session expirée : les modifications ne sont plus enregistrées', 'Exporter le relevé', 'Possible de s’arrêter à tout moment',
      'Reprendre là où l’on s’était arrêté', 'Les modifications seront perdues', 'Taper le nom exact de l’espace',
      'Cliquer sur « Ajouter »', 'Se reconnecter à un réseau', 'Disponible dès le retour du réseau', 'Appartement T3 · Rez-de-chaussée',
    ]
    for (const e of neutres) {
      const l = "'" + e + "'"
      expect(suspects(l), e).toEqual([])
    }
  })

  for (const rel of FICHIERS) {
    it('aucun tu / vous dans ' + rel, () => {
      const v = violations(rel)
      expect(v.map(x => rel + ':' + x.ligne + ' [' + x.hits.join(',') + '] ' + x.texte)).toEqual([])
    })
  }

  it('chaque exclusion « tiers » correspond encore à une ligne existante (pas de liste fantôme)', () => {
    const cache = {}
    const orphelines = TIERS.filter(([f, frag]) => {
      cache[f] = cache[f] || fs.readFileSync(path.join(ROOT, f), 'utf8')
      return !cache[f].includes(frag)
    })
    expect(orphelines.map(o => o[0] + ' :: ' + o[1])).toEqual([])
  })
})
