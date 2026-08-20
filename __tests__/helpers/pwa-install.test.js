/**
 * __tests__/helpers/pwa-install.test.js — chantier EDL TERRAIN, lot 2.
 *
 * CDC docs/CDC-EDL.md §3 verrou 4 : sans installation, Safari purge photos et
 * miroir à 7 jours. L'invitation est ce qui rend le hors-ligne durable.
 * Elle ne doit ni harceler, ni s'afficher là où elle ne sert à rien.
 */
import { describe, it, expect } from 'vitest';
import {
  detectPlateforme, estInstalle, decideInvitation, texteInvitation,
  REPROPOSER_APRES_MS, LARGEUR_TELEPHONE_MAX,
} from '../../js/core/pwa-install.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

describe('detectPlateforme', () => {
  it('reconnaît un iPhone', () => expect(detectPlateforme(IPHONE)).toBe('ios'));
  it('reconnaît un Android', () => expect(detectPlateforme(ANDROID)).toBe('android'));
  it('un Mac reste un Mac', () => expect(detectPlateforme(MAC, 0)).toBe('autre'));
  it('un iPad moderne se déclare Macintosh mais a un écran tactile', () => {
    expect(detectPlateforme(MAC, 5)).toBe('ios');
  });
  it('ne plante pas sans userAgent', () => expect(detectPlateforme(undefined)).toBe('autre'));
});

describe('estInstalle — on n’invite jamais quelqu’un qui a déjà installé', () => {
  it('display-mode standalone', () => expect(estInstalle({ standaloneMedia: true })).toBe(true));
  it('iOS écran d’accueil', () => expect(estInstalle({ navigatorStandalone: true })).toBe(true));
  it('lancé depuis une TWA Android', () => expect(estInstalle({ referrer: 'android-app://com.x' })).toBe(true));
  it('onglet de navigateur ordinaire', () => expect(estInstalle({})).toBe(false));
});

describe('decideInvitation', () => {
  const base = { largeur: 375, installe: false, plateforme: 'ios', maintenant: 1_000_000_000 };

  it('sur iPhone en navigateur : on invite, avec le geste à décrire', () => {
    const d = decideInvitation(base);
    expect(d).toEqual({ afficher: true, mode: 'ios', motif: 'ios-sans-api' });
  });

  it('sur Android, seulement si le navigateur nous a donné son prompt', () => {
    expect(decideInvitation({ ...base, plateforme: 'android', promptDisponible: true }).mode).toBe('bouton');
    expect(decideInvitation({ ...base, plateforme: 'android', promptDisponible: false }).afficher).toBe(false);
  });

  it('jamais sur tablette ni sur PC — l’enjeu est le téléphone', () => {
    expect(decideInvitation({ ...base, largeur: 768 }).motif).toBe('pas-un-telephone');
    expect(decideInvitation({ ...base, largeur: 1280 }).afficher).toBe(false);
    expect(decideInvitation({ ...base, largeur: LARGEUR_TELEPHONE_MAX }).afficher).toBe(true);
  });

  it('jamais quand l’app est déjà installée', () => {
    expect(decideInvitation({ ...base, installe: true }).motif).toBe('deja-installe');
  });

  it('un refus est respecté 30 jours, puis on repropose une fois', () => {
    const t = base.maintenant;
    expect(decideInvitation({ ...base, refuseA: t - 1000 }).motif).toBe('refus-recent');
    expect(decideInvitation({ ...base, refuseA: t - (REPROPOSER_APRES_MS - 1) }).afficher).toBe(false);
    expect(decideInvitation({ ...base, refuseA: t - REPROPOSER_APRES_MS }).afficher).toBe(true);
  });

  it('« déjà installée » prime sur tout le reste', () => {
    expect(decideInvitation({ largeur: 375, installe: true, plateforme: 'ios', refuseA: 0, maintenant: 1 }).afficher).toBe(false);
  });
});

describe('texteInvitation — dire POURQUOI, pas seulement quoi faire', () => {
  it('sur iOS, la conséquence réelle est nommée et le geste décrit', () => {
    const t = texteInvitation('ios');
    expect(t.corps).toMatch(/7 jours/);
    expect(t.corps).toMatch(/écran d’accueil/);
    expect(t.action).toBeNull();
  });
  it('sur Android, un bouton fait le travail', () => {
    expect(texteInvitation('bouton').action).toBe('Installer');
  });
});
