/**
 * Les comportements que l'audit demandait de PROUVER plutôt que de relire dans la source :
 * la décision de sortie partagée, la détection des actes formels, et la correspondance entre
 * les marqueurs posés et les libellés qui les nomment.
 *
 * Cette dernière est sournoise : une faute de frappe d'un côté ne casse rien, elle dégrade
 * seulement le message — « ‹signataire› » au lieu de « le signataire de l'acte ». Un garde-fou
 * qui nomme mal ce qui manque est un garde-fou qu'on cesse de lire.
 */

import { describe, it, expect } from 'vitest';
import { sortieAutorisee, mentionsManquantes } from '../../js/core/actes-mentions.js';
import { acteFormel, _emailCompose } from '../../js/core/email-compose.js';

describe('sortieAutorisee — la décision, une seule fois pour les deux garde-fous', () => {
  const M = (n) => '\u2039' + n + '\u203a';

  it('aucun marqueur : passe sans jamais ouvrir de dialogue', () => {
    let ouvert = false;
    expect(sortieAutorisee('Bonjour, tout va bien.', 'Copier', () => { ouvert = true; return false; })).toBe(true);
    expect(ouvert, 'un dialogue a été ouvert alors qu’il n’y avait rien à dire').toBe(false);
  });

  it('marqueur + refus → la sortie est interdite', () => {
    expect(sortieAutorisee('au prix de ' + M('prix'), 'Envoyer', () => false)).toBe(false);
  });

  it('marqueur + acceptation → la sortie est autorisée (l’app alerte, elle n’interdit pas)', () => {
    expect(sortieAutorisee('au prix de ' + M('prix'), 'Envoyer', () => true)).toBe(true);
  });

  it('SANS dialogue disponible → refus, pas passage silencieux', () => {
    expect(sortieAutorisee(M('prix'), 'Envoyer', null)).toBe(false);
    expect(sortieAutorisee(M('prix'), 'Envoyer', undefined)).toBe(false);
    expect(sortieAutorisee(M('prix'), 'Envoyer', 'pas une fonction')).toBe(false);
  });

  it('le verbe du bouton arrive dans la question posée', () => {
    let q = '';
    sortieAutorisee(M('prix'), 'Envoyer maintenant', (m) => { q = m; return false; });
    expect(q).toContain('Envoyer maintenant');
    expect(q).toContain('NUL');
  });

  it('texte vide ou absent : rien à dire', () => {
    expect(sortieAutorisee('', 'X', () => false)).toBe(true);
    expect(sortieAutorisee(null, 'X', () => false)).toBe(true);
    expect(sortieAutorisee(undefined, 'X', () => false)).toBe(true);
  });
});

describe('acteFormel — exécuté, pas relu', () => {
  it('les actes qui se clôturent par « Fait à … » sont reconnus', () => {
    for (const t of ['bail-conge-bailleur-6mois', 'rappel-impaye-3',
                     'bail-resiliation-amiable', 'attestation-logement-libere']) {
      expect(acteFormel(t), t + ' n’est plus reconnu comme acte formel').toBe(true);
    }
  });

  it('un email courant n’en est pas un', () => {
    for (const t of ['notification-visite', 'bail-preavis-recu', 'quittance']) {
      expect(acteFormel(t), t + ' est traité à tort comme un acte formel').toBe(false);
    }
  });

  it('un type inconnu ne jette pas', () => {
    expect(acteFormel('n’existe-pas')).toBe(false);
    expect(acteFormel(undefined)).toBe(false);
  });
});

describe('Les marqueurs d’identité sont bien NOMMÉS par actes-mentions', () => {
  const ctxNu = { entite: { nom: '' }, locataire: { nom: 'Martin' }, bail: { adrBien: '1 rue X' } };

  it('une entité sans siège ni gérant produit deux marqueurs, tous deux libellés', () => {
    const { body } = _emailCompose('bail-conge-bailleur-6mois', ctxNu);
    const m = mentionsManquantes(body);
    const parMarqueur = Object.fromEntries(m.map((x) => [x.marqueur, x]));
    expect(parMarqueur['lieu de rédaction'], 'marqueur de siège absent ou renommé').toBeTruthy();
    expect(parMarqueur['signataire'], 'marqueur de signataire absent ou renommé').toBeTruthy();
    // Le libellé doit Être une phrase lisible, pas le marqueur recopié faute de correspondance.
    expect(parMarqueur['lieu de rédaction'].libelle).not.toBe('lieu de rédaction');
    expect(parMarqueur['signataire'].libelle).not.toBe('signataire');
    // Ni l’un ni l’autre n’emporte nullité : aucun texte n’impose le lieu de rédaction.
    expect(parMarqueur['lieu de rédaction'].nullite).toBe(false);
    expect(parMarqueur['signataire'].nullite).toBe(false);
  });

  it('un bailleur PARTICULIER (nom, pas de gérant) ne déclenche aucune alerte de signataire', () => {
    // Sinon il verrait un dialogue à chaque acte, et apprendrait à cliquer « Continuer » avant
    // le jour où le dialogue dira « cet acte serait NUL ».
    const { body } = _emailCompose('bail-conge-bailleur-6mois',
      { entite: { nom: 'Didier Keller', siege: 'Colmar' }, locataire: { nom: 'Martin' }, bail: {} });
    expect(mentionsManquantes(body)).toEqual([]);
    expect(body).toContain('Didier Keller');
  });

  it('un email courant garde « (inconnu) » : la frontière entre les deux conventions tient', () => {
    const { body } = _emailCompose('notification-visite', ctxNu);
    expect(mentionsManquantes(body), 'un email courant pose des marqueurs d’acte').toEqual([]);
    expect(body).toContain('(inconnu)');
  });
});

describe('La signature d’un acte nomme la personne UNE fois', () => {
  const acte = (entite) => _emailCompose('bail-conge-bailleur-6mois',
    { entite, locataire: { nom: 'Martin' }, bail: {} }).body;
  /** Les lignes du bloc de signature, après « Fait à … ». */
  const signature = (body) => body.slice(body.lastIndexOf('Fait à '))
    .split('\n').slice(1).filter((l) => l.trim());

  it('une SCI signe sur deux lignes : le gérant, puis l’entité', () => {
    expect(signature(acte({ nom: 'SCI Dupont', siege: 'Colmar', gerant: 'Didier Keller' })))
      .toEqual(['Didier Keller', 'SCI Dupont']);
  });

  it('un PARTICULIER (sans gérant) signe une seule fois', () => {
    // Avant : « (inconnu) » puis le nom. Un repli naïf aurait donné le nom deux fois.
    expect(signature(acte({ nom: 'Didier Keller', siege: 'Colmar' })))
      .toEqual(['Didier Keller']);
  });

  it('un gérant qui porte le nom de l’entité n’est pas imprimé en double', () => {
    expect(signature(acte({ nom: 'Didier Keller', siege: 'Colmar', gerant: 'Didier Keller' })))
      .toEqual(['Didier Keller']);
  });

  it('une entité sans nom ni gérant laisse un marqueur, pas un blanc', () => {
    expect(signature(acte({ siege: 'Colmar' }))).toEqual(['\u2039signataire\u203a']);
  });

  it('le protocole amiable signe sur UNE ligne (bloc à deux colonnes)', () => {
    const body = _emailCompose('bail-resiliation-amiable',
      { entite: { nom: 'SCI Dupont', siege: 'Colmar', gerant: 'Didier Keller' },
        locataire: { nom: 'M. Martin' }, bail: {} }).body;
    const ligne = body.split('\n').find((l) => l.includes('Didier Keller'));
    // Un saut de ligne ici décalerait la colonne du locataire.
    expect(ligne).toContain('Didier Keller \u2014 SCI Dupont');
    expect(ligne).toContain('M. Martin');
  });

  it('les modèles NON formels gardent leur pied de page inchangé', () => {
    // La mention calculée n'existe que pour les actes : 22 autres modèles s'en passent très bien.
    const body = _emailCompose('notification-visite',
      { entite: { nom: 'SCI Dupont', gerant: 'Didier Keller' }, locataire: { nom: 'Martin' }, bail: {} }).body;
    expect(body).toContain('Didier Keller\nSCI Dupont');
  });
});
