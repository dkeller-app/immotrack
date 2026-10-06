// Arrivée depuis propryo.fr par « Connexion » (?connexion) ou « Créer mon compte » (?inscription) : l'application
// montre TOUJOURS le formulaire — elle ferme d'abord une session existante, par le chemin protégé du menu Compte
// (refus si du travail n'est pas synchronisé : on garde alors la session, jamais de perte de données).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const entry = readFileSync(resolve(root, 'js/app/supabase-entry.js'), 'utf8').replace(/\r/g, '')

// extrait l'expression régulière de détection du source (elle EST le contrat avec les liens du site)
const m = /if \((\/\[\?&\]\(connexion\|inscription\)[^\n]*?\/)\.test\(location\.search/.exec(entry)
const RE = m ? new Function('return ' + m[1])() : null

describe('liens propryo.fr → application', () => {
  it('la détection reconnaît ?connexion et ?inscription (avec ou sans autres paramètres), pas autre chose', () => {
    expect(RE).toBeTruthy()
    for (const q of ['?connexion', '?inscription', '?x=1&connexion', '?inscription&from=header', '?connexion=1']) expect(RE.test(q), q).toBe(true)
    for (const q of ['', '?sandbox=1', '?invite=abc', '?connexions', '?inscriptions', '?pre-connexion-x', '?x=connexion']) expect(RE.test(q), q).toBe(false)
  })

  it('la fermeture de session passe par le chemin PROTÉGÉ (_teardownSession flush, SANS forcer), avant la vérification de session', () => {
    const i = entry.indexOf('(connexion|inscription)')
    const bloc = entry.slice(i, entry.indexOf('const { user, error: _errAuth } = await api.currentUserOrError()'))
    expect(bloc).toContain('_teardownSession({ flush: true })')
    expect(bloc).not.toMatch(/forcer\s*:\s*true/)                       // jamais forcé : le refus protège le travail non synchronisé
    expect(bloc).toMatch(/r\.ok !== false\)\s*\{[\s\S]*?location\.reload\(\)/)   // déconnecté → rechargement → formulaire
    expect(bloc).toContain('session conservée')                         // refus → on garde la session, on continue
    expect(bloc).toContain("showToast(")                                // et on l'explique à l'utilisateur
  })

  it('HORS LIGNE : jamais de fermeture de session (le formulaire exige le réseau → technicien enfermé dehors)', () => {
    const bloc = entry.slice(entry.indexOf('(connexion|inscription)'), entry.indexOf('const { user, error: _errAuth } = await api.currentUserOrError()'))
    expect(bloc).toContain('navigator.onLine === false')
    expect(bloc).toContain('__immoHorsLigne')
    // la condition du teardown exige explicitement « pas hors ligne »
    expect(bloc).toMatch(/sess && sess\.user && !dejaTente && !horsLigne/)
  })

  it('anti-boucle : drapeau d’onglet posé AVANT le rechargement, lu et effacé à l’arrivée suivante', () => {
    const bloc = entry.slice(entry.indexOf('(connexion|inscription)'), entry.indexOf('const { user, error: _errAuth } = await api.currentUserOrError()'))
    expect(bloc).toMatch(/getItem\('imsb-deja-deconnecte'\)[\s\S]*?removeItem\('imsb-deja-deconnecte'\)/)
    expect(bloc.indexOf("setItem('imsb-deja-deconnecte'")).toBeLessThan(bloc.indexOf('location.reload()'))
  })

  it('le lien d’invitation (?invite) garde la priorité', () => {
    expect(entry.indexOf("get('invite')")).toBeLessThan(entry.indexOf('(connexion|inscription)'))
  })

  it('?inscription ouvre le formulaire en mode « Créer un compte » (détection côté wireLoginForm)', () => {
    expect(entry).toMatch(/\[\?&\]inscription/)
  })
})
