# CDC — Socle IA + état des lieux à la voix (EDL-VOIX-IA)

> Statut : **VALIDÉ par Didier le 13/10/2026 (GO transmis par le Pilotage), réponses recommandées retenues (§7).** Code : branche `feat/edl-voix-ia`. Maquette : `mockups/EDL-VOIX-IA/maquette.html`
> (12 écrans, 3 formats, thèmes sobre et dark, entrée et sortie, au volume réel de la cuisine de Ferrette 101).
> Lien direct possible vers un écran : `maquette.html#fmt=phone&thm=dark&scr=props&mod=S`.

## 1. Le principe

« **L'IA lit, la loi décide.** » Dicter une pièce produit un **brouillon** ; rien n'entre dans l'EDL sans
validation humaine, élément par élément ; l'EDL reste contradictoire et signé comme aujourd'hui. Si l'IA
échoue, l'EDL manuel reste intact et utilisable. Vidéo, analyse d'image et comparaison IA hors périmètre.

## 2. Le parcours (cf. maquette)

| # | Écran | Ce qui se passe |
|---|---|---|
| 1 | Pièce | Bouton **secondaire** « Dicter la pièce » (libellé + icône micro) en tête de la pièce, sous les pilules Renommer / Supprimer. PC : dans l'en-tête de la pièce, à côté de « + Élément ». Absent si EDL signé ou lecture seule. |
| 2 | Première fois | Notice RGPD + AI Act, une fois par compte (mémorisée), relisible ensuite. |
| 3 | Enregistrement | Page plein écran (M-16) : minuteur, niveau, Pause/Reprendre, rappel « nommer · état · détail », liste des éléments de la pièce. **5 min max par dictée** ; plusieurs dictées par pièce possibles. |
| 4 | Analyse | 3 étapes visibles, non bloquant : « Revenir à la pièce » laisse l'analyse tourner. |
| 5 | Propositions | Une carte par élément cité : état proposé (ou « État non dicté »), observation, **extrait entendu** + correction, mention « Proposé par l'IA, à vérifier », **Accepter / Modifier / Ignorer**. Éléments non cités listés « laissés tels quels ». Élément hors liste → carte « À ajouter ? » (ajout sur confirmation). |
| 6 | Modifier | Proposition en référence ; état + observation éditables (16 px) ; « Inscrire ». |
| 7 | Tout accepter | Jamais présélectionné ; page de confirmation qui compte, nomme les saisies remplacées et les « à vérifier ». N'inclut pas les éléments à ajouter. |
| 8 | Transcription | Texte horodaté, passages corrigés surlignés. |
| 9 | Compteurs | « Dicter les relevés » sur l'étape Compteurs ; index proposés dans les champs existants ; **validation une par une, pas de tout accepter**. |
| 10 | Hors ligne | Dictée gardée sur l'appareil, envoyée seule au retour du réseau, bandeau dans la pièce ; « Propositions prêtes » quand c'est fini. |
| 11 | Erreurs | Micro refusé · navigateur sans enregistrement (→ import d'un fichier audio) · limite du jour · service indisponible · rien entendu. Chacune : visuel + texte + ≤ 1 action, « la saisie à la main reste disponible ». |
| 12 | EDL signé | Aucune dictée, aucune inscription (garde au niveau de la fonction). |

Formats : téléphone = pages plein écran ; tablette (768–1023, même parcours à étapes que le téléphone) =
feuille + scrim + Échap ; PC (≥ 1024, tableau dense inchangé) = dialogue + scrim + Échap, propositions en lignes.

## 3. Règles de comportement (décisions prises)

1. **Accepter inscrit tout de suite** dans `_edlP` (champs existants `etatE/obsE` à l'entrée, `etatS/obsS` à la
   sortie), puis rendu + autosave (`_edlAutosaveTrigger('voix')`). Chaque inscription reste **annulable** depuis la
   carte (retour à la valeur d'avant). Pas de lot en attente qui pourrait se perdre.
2. **L'IA ne devine pas un état** : elle n'en propose un que s'il est dit (« bon état ») ou clairement décrit
   (« rayures » → état d'usage, avec la justification affichée). Sinon « État non dicté » et seule l'observation
   s'inscrit (voir question 3).
3. **Remplacement visible** : si l'élément a déjà une saisie, la carte l'annonce (« Remplace la saisie actuelle »).
4. **Éléments non cités : intouchés.** Aucune écriture sans carte acceptée.
5. **Sortie** : seuls `etatS/obsS` ; la bande d'entrée signée reste figée (`_edlEntreeVerrouillee`). Le verdict
   reste déduit (`verdictDe`), jamais proposé par l'IA.
6. **« Autres observations »** (ligne note) : l'IA peut y proposer une observation, jamais un état (`estNote`).
7. **Compteurs** : nombres seulement (validés côté relais), un index unique d'électricité va en HP (affiché),
   un N° dicté chiffre par chiffre est marqué « à vérifier ».
8. **Transcription** : sur l'appareil le temps de la relecture, effacée ensuite ; jamais dans l'EDL ni dans le
   cloud. **Audio** : jamais conservé (supprimé de l'appareil après transcription réussie, jamais stocké par le relais).
9. **Traçabilité (art. 50, lisible par machine)** : chaque élément inscrit depuis une proposition porte
   `iaE` / `iaS` = `{etat:bool, obs:bool, at, modele}` dans l'EDL ; petite étiquette « Dictée validée » à l'écran.
10. **Jamais bloquer** : toute erreur IA laisse l'EDL modifiable ; une dictée en échec reste en file, jamais perdue
    en silence, supprimable par l'utilisateur.

## 4. Socle IA réutilisable (Lot A)

### Relais (`relay/`, même garde `requireSupabaseUser` que `POST /sessions`)

- `POST /ai/transcribe` — corps = audio brut ; `Content-Type` ∈ `audio/webm`, `audio/ogg`, `audio/mp4`,
  `audio/x-m4a`, `audio/mpeg`, `audio/wav` (+ `;codecs=`) ; `?lang=fr&task=edl-piece` (le `task` choisit un
  vocabulaire d'aide, `context_bias`). Réponse `{text, segments:[{start,end,text}], audioSec, model}`.
- `POST /ai/structure` — JSON `{task, input}` ; **une tâche = un module** du registre
  (`relay/src/ai/tasks/edl-piece.js`, plus tard `dossier-piece`, `travaux-photo`) qui fournit
  `buildMessages(input)`, `jsonSchema`, `validate(output, input)`. Réponse `{data, usage, model}`.
- **Adaptateur** `relay/src/ai/provider.js` : `makeAiProvider(env, fetchImpl)` → `{transcrire({audio, mime,
  langue, vocabulaire}), structurer({messages, jsonSchema})}`. Implémentations `mistral` (Voxtral
  `voxtral-mini-latest` sur `/v1/audio/transcriptions` ; Mistral Small sur `/v1/chat/completions` en
  `response_format: json_schema` strict) et `fake` (réponses déterministes pour tests et dev). Choix par
  `AI_PROVIDER` ; clé `MISTRAL_API_KEY` en **secret wrangler**, jamais dans le navigateur.
- **Garde-fous** : taille lue sur `Content-Length` **avant** lecture (défaut 10 Mo, `AI_AUDIO_MAX_BYTES`), MIME
  en liste fermée, texte ≤ 20 000 caractères ; **quota par utilisateur et par jour** en KV
  (`aiq:{uid}:{AAAA-MM-JJ}` = `{appels, audioSec, jetonsE, jetonsS}`, TTL 48 h ; défauts `AI_QUOTA_AUDIO_SEC=3600`,
  `AI_QUOTA_CALLS=200`) → 429 `{error:'quota', reprise}` ; suivi mensuel `aiu:{uid}:{AAAA-MM}` (mêmes
  compteurs, **aucun contenu**) ; erreurs fournisseur → 502 `{error:'ai_unavailable'}`, délai 25 s.
- **Validation de sortie (`edl-piece`)** : `elementId` ∈ liste fournie, `etat` ∈ `EDL_ETATS` ou `null`, textes
  bornés, `source` doit **figurer dans la transcription** (normalisée) sinon la proposition est rejetée ;
  « à ajouter » marqués comme tels ; compteurs = clé connue + valeur numérique. JSON invalide → 422 propre,
  rien n'atteint l'app.
- **Journaux** : jamais d'audio, de texte, d'extrait ni d'identifiant de bail ; seulement route, statut,
  durée, octets, jetons. Un test le vérifie (espion sur `console.*`).
- Tests `relay/test/ai-*.test.js` (fournisseur `fake`, `fetchMock` pour Mistral, `appAuth()` existant) :
  401 sans jeton, 413, 415, 429, 422, 502, absence de contenu dans les journaux.

### Front (modules purs testés, monolithe gelé)

- `js/core/ia-client.js` — `creerClientIA({base, getToken, fetchImpl})` → `transcrire(blob)`,
  `structurer(task, input)` ; erreurs normalisées `{code:'offline'|'quota'|'auth'|'unavailable'|'invalid'}`.
  Réutilisé par Dossiers et Travaux.
- `js/core/ia-file-attente.js` — file IndexedDB `propryo_ia` (store `dictees`) : ajout, reprise au retour du
  réseau (`online`), une tâche à la fois, la tâche reste en tête en cas d'échec, suppression après succès.
- `js/core/edl-dictee.js` — `construireEntree(piece, mode)`, `appliquerProposition(element, prop, mode)` →
  nouvelles valeurs + valeur d'avant (annulation), garde « signé » / « entrée verrouillée » / « note ».
- Monolithe : seulement l'appel (fonctions nommées `_edlVoix…`, jamais `edl[A-Z]…` qui déclencherait
  l'autosave au clic) + une icône `mic` dans `_uiIcon`.
- Capture : `MediaRecorder` en `audio/webm;codecs=opus` (Chrome, Android, Safari ≥ 18.4), repli `audio/mp4`
  (Safari 14.1–18.3), repli final `<input type=file accept="audio/*">`. ~0,5 Mo par minute.

## 5. Transparence, RGPD, coûts

- Mention « Proposé par l'IA, à vérifier » sur chaque carte (AI Act art. 50, en vigueur depuis le 2/08/2026).
- Notice de première utilisation (écran 2) ; `docs/legal/RGPD-REGISTRE.md` : sous-traitant **Mistral AI** +
  traitement n° 7 « Dictée de l'état des lieux » (finalité, voix du bailleur et des présents, aucune
  conservation de l'audio, base légale : exécution du service). **AIPD recommandée, à faire avec l'avocat.**
- Coût estimé (prix publiés) : Voxtral 0,003 $/min, Mistral Small 4 à 0,15 $ / 0,60 $ par million de jetons
  → ~0,005 $ par pièce, ~0,04 $ par EDL de 7 pièces. Plafond par compte : 60 min/jour ≈ 0,20 $.
- Étape console Mistral avant lancement : refuser l'usage des données pour l'entraînement (sinon retirer la phrase de la notice).
- Faits Mistral à vérifier avec la clé : formats audio acceptés (webm/opus), taille maximale de fichier,
  résidence UE garantie de `api.mistral.ai`.

## 6. Vérification prévue (phase 3)

Jeu de référence : `PROPRYO-COM/tests vidéos/transcription-cuisine.txt` → brouillon attendu (13 éléments,
2 états, 4 corrections, 1 élément à ajouter, 12 non cités). Mesures : éléments bien identifiés, états
corrects, corrections justes, **zéro écriture sur un élément non cité** ; chronométrage pièce dictée +
validation contre saisie manuelle ; geste réel téléphone + PC ; charte M-1 à M-17 ; audit indépendant
(secret, auth, quotas, validation JSON, journaux, EDL signé).

## 7. Décisions de Didier (13/10)

1. **Rétention zéro chez Mistral : OUI.** La notice dit « le fournisseur ne conserve rien ». Constante unique `RETENTION_ZERO` (`js/core/ia-transparence.js`) : la passer à `false` tant que l'activation n'est pas confirmée sur le compte → la notice dit « 30 jours au plus ». → **Activée le 16/10/2026** (points d'accès sans état `/v1/audio/transcriptions`, `/v1/chat/completions`, `/v1/ocr`) : `RETENTION_ZERO = true` depuis v15.761.
2. **Mention dans le PDF signé : OUI**, seulement si au moins une proposition a été acceptée, après les cadres de signature : « Observations préparées avec une aide à la dictée (IA), relues et validées par les parties. »
3. **État déduit d'une description : OUI**, toujours avec la justification affichée et l'extrait entendu ; un état sans justification est retiré par le relais.
