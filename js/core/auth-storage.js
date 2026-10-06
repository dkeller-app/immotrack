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
// Le MODE (local / session) est choisi AVANT l'écriture du jeton (au clic sur « Se connecter ») ; le choix est
// retenu dans localStorage (REMEMBER_KEY, simple drapeau, pas un secret) pour que le jeton rafraîchi plus tard
// soit réécrit au même endroit et pour cocher la case au prochain affichage du formulaire.

export const REMEMBER_KEY = 'immo-rester-connecte'

export function createAuthStorage({ local, session, standalone = false }) {
  const sur = (fn) => { try { return fn() } catch (e) { return null } }
  let persist = !!standalone || sur(() => local.getItem(REMEMBER_KEY)) === '1'

  return {
    // lit d'abord en local (session persistante d'un choix précédent), sinon en sessionStorage
    getItem(k) { const a = sur(() => local.getItem(k)); return a != null ? a : sur(() => session.getItem(k)) },
    // écrit dans le stockage voulu ET retire l'éventuelle copie de l'autre (jamais deux jetons à deux endroits)
    setItem(k, v) {
      const [vers, autre] = persist ? [local, session] : [session, local]
      vers.setItem(k, v)
      sur(() => autre.removeItem(k))
    },
    removeItem(k) { sur(() => local.removeItem(k)); sur(() => session.removeItem(k)) },
    // choix de l'utilisateur (case à cocher) ; sans effet en application installée (toujours persistante)
    setPersist(b) {
      if (standalone) return
      persist = !!b
      sur(() => { if (persist) local.setItem(REMEMBER_KEY, '1'); else local.removeItem(REMEMBER_KEY) })
    },
    isPersistent() { return persist },
    isStandalone() { return !!standalone },
  }
}
