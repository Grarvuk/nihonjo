---
name: exercices-nihonjo
description: Ajouter ou modifier un exercice de Nihonjo, la vérification des réponses (normaliser), la progression (nouveau / en cours / à revoir / acquis, date de retour), la correction tolérante (homonymes, fautes de frappe, rōmaji refusé, autre alphabet), la voix (dictée), le bilan de session, l'exercice d'écriture, la page des kana (tableaux hiragana / katakana), le jeu des kana, la page « Kanji » ou le jeu des kanjis.
---

# Les exercices

Référence : `doc_pour_agents/exercices.md` (les six modes, ce qu'ils acceptent,
les différences voulues avec la v1).

## Ajouter un exercice

Un exercice **nouveau dans sa forme** (grille, glisser, jeu) se conçoit
d'abord avec le skill `concepteur-exercices-nihonjo` (fiche de conception,
pièges) ; il ne rentre pas dans `MODES` : modèle `vues/paires.js`. Ci-dessous,
le cas d'une question par mot.

1. Une entrée dans `MODES` (`assets/js/vues/exercice.js`) : `nom`,
   `consigne`, `exemple`, **`niveau`**, `preparer`, `question`, `aide`,
   `reponses`, et au besoin `japonais`, `francais`, `kanjiRequis`, `filtre`,
   `tuiles`, `seulementTuiles`, `autresReponses`, `disponible`, `monter`
   (tableau des champs : `doc_pour_agents/exercices.md`).
2. Son id dans un groupe de `GROUPES_MODES`.
3. Sa phrase dans `PROMESSES` et son surtitre / sa teinte dans `HABILLAGE`
   (`vues/reviser.js`) : `reviser.js` construit la carte de l'accueil
   (exemple en cases tiré de `exemple`), compte les mots (`motsPourMode`) et
   la désactive s'il n'y en a pas. Le grand bouton lance l'exercice conseillé
   (`exerciceConseille`) : y penser si le nouvel exercice doit en faire
   partie.
4. Une ligne au tableau de `doc_pour_agents/exercices.md`.
5. Si l'exercice a besoin d'un nouveau type de question visuelle : la brique
   dans `masu.js` ou `composants.js`, le style dans la section « Exercice »
   du CSS.

## Les règles

- **Les réponses se comparent normalisées, en entier** :
  `mode.reponses(mot, q).map(normaliser).includes(normaliser(saisie))`. Jamais
  de `includes` sur une sous-chaîne : la v1 acceptait ainsi n'importe quel
  morceau du mot, et `NFD` décompose が en か + ゛ (un « か » se trouverait
  dans « が »).
- **Toujours la première variante en question** (`jp_kanji[0]`,
  `jp_kana[0]`, `fr.join(', ')`) ; toutes les variantes en réponse.
- **Un mot peut n'avoir que des kanji ou que des kana** (`jp_kana` ou
  `jp_kanji` vide) : chaque mode doit le supporter ou le filtrer (`filtre`).
- **La progression se calcule au serveur** : le front envoie
  `progression.resultat { mot_id, reussite, niveau }` et reçoit le nouvel
  état (`majProgression`). Ne pas recalculer l'état côté navigateur.
- **Le `niveau` d'un exercice décide de ce qu'il peut faire acquérir**
  (25/10, demandé par José) : `reconnaissance` (choisir parmi des
  propositions) mène au plus à « en cours » et ne compte pas ; « acquis » =
  **deux réussites de suite** en `rappel` / `production` (José, 25/10 au
  soir : plus de « deux jours différents »). Un exercice à tuiles qui se
  déclarerait `rappel` rendrait « acquis » des mots devinés. Ne pas changer
  ces paliers sans José ; les fichiers de progression v1 ne connaissent
  qu'acquis / à revoir (`fusionnerStatuts`).
- **Le bon mot dans l'autre syllabaire** (ミズ pour みず, 26/10, José) :
  juste, mais jamais « acquis » ainsi — `juger` rend `autreAlphabet`, le
  front envoie `autre_alphabet: true`, le serveur met la série à zéro. Un
  nouveau mode japonais en hérite par `juger` ; ne pas comparer à la main.
- **Les kanjis ont leur progression** (`kanji_progression`, action
  `kanji.resultat`, schéma v7) : un caractère n'est pas un mot, jamais dans
  `progression`. Acquis = sens ET lecture réussis deux fois de suite ;
  `choix` (reconnaître) mène au plus à « en cours ». `donnees/kanjis.js`
  est fabriqué par `outils/generer_kanjis.py` : corriger le script ou la
  liste v1, puis relancer.
- **« à rafraîchir » est calculé, pas stocké** : un acquis dont
  `prochaine_revision` est arrivée (`Depot::lireMots`). Ne jamais l'écrire
  dans `progression.statut` (le CHECK le refuserait) ; côté navigateur,
  `statut(mot)` le rend tel quel, `estAppris` le compte comme su.
- **Une réponse japonaise refuse le rōmaji** (`japonais: true`) : on le dit
  sous le champ et on n'enregistre rien. Les essais du parcours répondent
  donc en kana (« ぬぬぬ » pour une mauvaise réponse, pas « zzz »).
- **Comparer passe par `juger`** (homonymes, `comparerFrancais` pour le
  français) — pas de comparaison à la main dans un nouveau mode.
- Un trou ne tombe jamais sur `NON_DEVINABLES` (« 〜 », espace, ponctuation).

## Les pièges de l'écran d'exercice

1. `afficherMot` remplace la feuille à chaque mot : tout écouteur posé sur la
   feuille meurt avec elle (voulu) ; tout ce qui vit plus longtemps relit le
   DOM (`surTouche`).
2. L'Entrée est gérée par `surTouche` sur `document` : ne pas ajouter un
   second écouteur Entrée sur le champ (double validation).
3. `feuille.dataset.repondu` empêche une deuxième réponse (double clic, tuile
   puis Entrée) : le garder si on change `repondre`.
4. Sur téléphone, pas de focus automatique (clavier du système).

## La page et le jeu des kana

Référence : `doc_pour_agents/exercices.md`, section « Le jeu des kana ».

- **Une seule table de données** : `GROUPES` dans
  `assets/js/donnees/syllabaires.js` (hiragana + lectures, Hepburn en
  premier). Le katakana s'en **déduit** (`versKatakana`, +0x60) : ne pas
  écrire de seconde table. Exception si un jour on ajoute les katakana
  étendus (ファ, ティ…) : ils n'ont pas de hiragana, il faudra une liste à part.
- Ajouter une lecture acceptée = l'ajouter à la liste du caractère (après la
  première). La comparaison passe par `normaliserRomaji`, pas `normaliser`.
- **La progression des kana est à part** (`kana_progression`, action
  `kana.resultat`) : un caractère n'est pas un mot, ne pas l'écrire dans
  `progression`. Sa maîtrise se calcule au front (`maitrise`) à partir des
  compteurs ; changer la règle = `maitrise` + la doc.
- Le jeu pose `body.dataset.jeu = 'en-cours'` pendant une partie (le CSS
  cache la navigation du téléphone) ; `rendre` (`app.js`) l'enlève à chaque
  changement de vue, et le bilan aussi.
- « Arrêter » **efface les minuteries** (`minuteries`, posées par
  `plusTard` dans `afficherPartie`) et le bilan pose `partie.terminee` : sans
  cela, le caractère suivant programmé écrasait le bilan, et revenir sur
  `#/jeu-kana` reprenait une partie finie.

## La voix (`assets/js/son.js`)

- La liste des voix arrive **en retard** : ne jamais conclure « pas de voix »
  sur un premier `getVoices()` vide ; `quandVoixPretes()`.
- Faire lire le **kana**, pas le kanji (lecture parfois fausse).
- Chromium de test n'a **aucune voix** : la carte Dictée y est grisée. Le
  parcours simule une voix (`add_init_script` qui remplace
  `speechSynthesis` et `SpeechSynthesisUtterance`) dans un contexte à part.

## Vérifier

`tests/parcours_navigateur.py` joue chaque mode (bonne réponse, mauvaise,
passer, bilan, refaire les erreurs) en retrouvant la réponse juste dans la
base. Un nouveau mode : y ajouter son passage. Le jeu des kana y est aussi
(bonne lecture, variante, erreurs répétées, « Je ne sais pas », retour du
raté, bilan, tableau mis à jour).
