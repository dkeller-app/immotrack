// js/core/auth-storage.js — stockage du jeton de session Supabase, avec le choix « Rester connecté sur cet appareil ».
//
// Règle de confidentialité (F14.2, poste partagé) :
//   - par défaut (case décochée) : le jeton vit en sessionStorage → fermer l'onglet / le navigateur DÉCONNECTE ;
//     rien ne reste lisible pour la personne suivante sur un poste partagé ;
//   - case « Rester connecté » cochée : le jeton vit en localStorage → la session survit à la fermeture du
//     navigateur (poste personnel) ;
//   - application INSTALLÉE (PWA, display-mode standalone) : toujours localStorage (usage terrain : l'EDL hors
//     ligne exige que la session survive à la fermeture) — la case n'y est pas proposée.
// Interface = celle qu'attend supabase-js (`storage` : getItem / setItem / removeItem).
//
// AUCUN DRAPEAU « se souvenir » n'est stocké : un drapeau survivrait à la déconnexion et rendrait le poste persistant
// pour la PERSONNE SUIVANTE (audit). La persistance se déduit de l'endroit où le jeton EXISTE réellement ; une fois
// déconnecté (jetons effacés), tout redevient « session » par défaut et la case n'est jamais pré-cochée.
//   - choix de l'utilisateur : `persist`, en mémoire, posé par setPersist() AU CLIC sur « Se connecter » (avant l'écriture) ;
//   - un jeton déjà présent en local (session persistante d'un choix précédent, ou autre onglet) reste en local ;
//     un jeton présent seulement en sessionStorage y reste : un rafraîchissement de jeton, dans N'IMPORTE QUEL onglet,
//     est réécrit là où il se trouve — jamais déplacé (sinon l'autre onglet serait déconnecté).

export function createAuthStorage({ local, session, standalone = false }) {
  const sur = (fn) => { try { return fn() } catch (e) { return null } }
  const connus = new Set()           // clés écrites par ce stockage (jeton, code-verifier PKCE…)
  let persist = !!standalone

  const ou = (k) => (sur(() => local.getItem(k)) != null ? 'local' : (sur(() => session.getItem(k)) != null ? 'session' : null))
  const magasin = (nom) => (nom === 'local' ? local : session)

  return {
    // lit d'abord en local (session persistante), sinon en sessionStorage
    getItem(k) { const a = sur(() => local.getItem(k)); return a != null ? a : sur(() => session.getItem(k)) },
    // écrit là où le jeton EXISTE déjà, sinon selon le choix ; retire toute copie de l'autre stockage (jamais 2 jetons)
    setItem(k, v) {
      connus.add(k)
      const cible = standalone ? 'local' : (ou(k) || (persist ? 'local' : 'session'))
      sur(() => magasin(cible).setItem(k, v))
      sur(() => magasin(cible === 'local' ? 'session' : 'local').removeItem(k))
    },
    removeItem(k) { connus.delete(k); sur(() => local.removeItem(k)); sur(() => session.removeItem(k)) },
    // choix de l'utilisateur (case) : s'applique à l'ÉCRITURE qui suit ; déplace aussi un jeton déjà présent (cas
    // « se reconnecter sans avoir quitté la page »). Sans effet en application installée (toujours persistante).
    setPersist(b) {
      if (standalone) return
      persist = !!b
      for (const k of connus) {
        const ici = ou(k), voulu = persist ? 'local' : 'session'
        if (ici && ici !== voulu) {
          const v = sur(() => magasin(ici).getItem(k))
          if (v != null) { sur(() => magasin(voulu).setItem(k, v)); sur(() => magasin(ici).removeItem(k)) }
        }
      }
    },
    isPersistent() { return persist },
    isStandalone() { return !!standalone },
  }
}
