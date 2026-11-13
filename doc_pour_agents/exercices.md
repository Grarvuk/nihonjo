---
title: "Les exercices et la progression"
domain: "Révision"
related_files:
  - "assets/js/vues/exercice.js"
  - "assets/js/vues/ecriture.js"
  - "assets/js/vues/liste.js"
  - "assets/js/utils.js"
  - "assets/js/son.js"
  - "api/lib/Depot.php"
version: "3.1 (acquis en deux réussites de suite, « à rafraîchir ») — 25/10/2026"
---

# Les exercices

## Où sont-ils définis

Un seul objet : `MODES` dans `assets/js/vues/exercice.js`. Chaque entrée dit
ce qu'on montre, ce qu'on accepte et quels mots conviennent ; `GROUPES_MODES`
les range pour l'écran « Réviser » (`vues/reviser.js` construit ses cartes
à partir de ces deux objets, plus une phrase par mode dans `PROMESSES`).

### Depuis l'accueil (25/10/2026)

| geste | ce qui part | mots |
|---|---|---|
| grand bouton | l'**exercice conseillé** (`exerciceConseille`, `reviser.js`), sa raison écrite au-dessus, sa carte marquée « conseillé » | voir le tableau suivant ; N = « Mots à réviser » (20 par défaut) |
| carte d'un exercice | cet exercice, et il devient le « dernier choisi » (`dernier_mode`) | N mots de la sélection par `tirerPrioritaires`, dans cet ordre |
| carte « Écriture » | `lancerEcriture` | N mots, `tirerPrioritaires` |
| cartes Hiragana / Katakana / Les deux | `lancerJeuKana` avec les réglages enregistrés du jeu, alphabet remplacé | — |

L'ordre conseillé (revue du concepteur, 25/10) : on découvre un mot en le
reconnaissant, on retrouve son sens, on l'acquiert en le réussissant deux
fois de suite, on le rafraîchit quand il a été appris il y a longtemps.

| s'il y a dans la sélection… | le grand bouton lance | sur |
|---|---|---|
| des mots « à revoir » | Français → japonais | ces mots d'abord, complétés par la sélection |
| des mots « à rafraîchir » | Français → japonais | idem, les plus anciens d'abord |
| des mots « en cours » seulement reconnus (`serie` = 0) | Japonais → français | idem |
| des mots « en cours » à une réussite de l'acquis | Français → japonais | idem |
| des mots nouveaux | Paires (sinon Japonais → français) | les nouveaux |
| rien de tout cela | le dernier exercice choisi | la sélection |

`lancerSession(mode, mots, 0)` garde cet ordre ; avec une limite > 0 elle
tire au hasard.

| champ d'un mode | rôle |
|---|---|
| `nom`, `consigne`, `exemple` | textes ; `exemple` = deux morceaux `{ texte, lang }` affichés sur le bouton |
| `niveau` | ce que demande l'exercice, envoyé avec le résultat : `production` (écrire le japonais), `rappel` (retrouver un sens, un kana), `reconnaissance` (choisir parmi des propositions). Règle les paliers (plus bas) |
| `japonais` | la réponse s'écrit en japonais : du rōmaji est refusé AVANT correction (message sous le champ, rien d'enregistré) |
| `francais` | la réponse est un sens français : tolérance (`comparerFrancais`) |
| `autresReponses(mot, q)` | d'autres mots dont l'écriture est juste aussi (les homonymes de Français → japonais) |
| `seulementTuiles` | pas de champ ni de « Valider » : on touche une tuile |
| `disponible()`, `indisponible` | l'exercice dépend du navigateur (la voix) ; sinon carte grisée avec ce texte |
| `monter(feuille, mot, q)` | après l'affichage de la question (la dictée y branche ses boutons et parle) |
| `kanjiRequis` | ne garder que les mots qui ont au moins un kanji |
| `filtre(mot)` | filtre supplémentaire (facultatif) |
| `preparer(mot)` | tirage propre à la question (le trou) ; résultat `q` passé aux suivants |
| `question(mot, q)` | HTML de la question (cases `masu()` ou texte `.question-fr`) |
| `aide(mot, q)` | HTML de l'aide sous la question (sens, contexte) |
| `reponses(mot, q)` | liste des réponses acceptées, **avant** `normaliser` |
| `tuiles(mot, q)` | facultatif : caractères proposés en tuiles cliquables |

## Les huit modes

| id | nom | niveau | question | réponses acceptées | mots |
|---|---|---|---|---|---|
| `fr-jp` | Français → japonais | production | les sens français | kana, kanji — **et ceux d'un homonyme** (même sens principal) ; pas de rōmaji | tous |
| `jp-fr` | Japonais → français | rappel | le 1er **kana** en cases (le 1er kanji si pas de kana) | sens français, tolérant | tous |
| `dictee` | Dictée | production | la voix dit le 1er kana ; « Plus lentement » | kana, kanji ; pas de rōmaji | avec kana ; une voix japonaise |
| `trous-kana` | Mots à trous (kana) | rappel | 1er kana, un caractère vide | le caractère manquant, ou le mot entier | avec kana |
| `trous-kanji` | Mots à trous (kanji) | reconnaissance | la 1re écriture qui a un kanji, le trou **sur un kanji**, 10 tuiles **toutes en kanji** | idem | avec un vrai kanji |
| `lecture-kanji` | Kanjis → français | rappel | 1er kanji en cases, sans lecture | sens français, tolérant | avec kanji |
| `transcription` | Kanjis → kana | production | 1er kanji en cases | kana | avec kanji |
| `choix-lecture` | Choix de la lecture | reconnaissance | 1er kanji en cases, 4 tuiles de lectures | le 1er kana | avec kanji et kana |

Jusqu'au 25/10, Japonais → français montrait le kanji avec sa lecture
au-dessus : il doublait Kanjis → français et la lecture dispensait de lire le
kanji. Désormais : « le sens d'après la lecture » d'abord (jp-fr), « le sens
du kanji seul » ensuite (lecture-kanji).

**Les leurres.** Mots à trous (kanji) : neuf kanjis pris d'abord dans les
mots de la session, puis dans `dictionnaireKanjis`, jamais un kanji visible
dans le mot ni un kana (`propositionsKanji`). Choix de la lecture : trois
lectures d'autres mots, de longueur proche, même premier kana, un kanji en
commun de préférence ; le kana visible dans l'écriture (« ゴム » de 消しゴム,
« べます » de 食べます) est gardé dans chaque leurre, sinon la bonne réponse
se reconnaîtrait à sa fin (`lecturesProches`).

**La voix** (`assets/js/son.js`) : `speechSynthesis` en `ja-JP`. Les voix
arrivent en retard (`voiceschanged`) : `quandVoixPretes()` attend 1,5 s au
plus, puis l'accueil réveille la carte Dictée. Sans voix : Dictée grisée
(« pas de voix japonaise »), bouton « Écouter » de la correction grisé avec
son explication. On fait lire le **kana** (un kanji peut être mal lu).

### Différences voulues avec la v1

| v1 | v2 | pourquoi |
|---|---|---|
| trous : `motCompletAttendu.includes(saisie)` — n'importe quel morceau du mot était accepté | le caractère manquant ou le mot entier | « あ » était juste pour « あか_き » |
| transcription : kana **ou kanji** acceptés | kana seulement | il suffisait de recopier le kanji affiché |
| le trou pouvait tomber sur « 〜 » ou une espace | jamais (`NON_DEVINABLES`) | rien à apprendre |
| mélange `sort(() => Math.random() - 0.5)` | Fisher-Yates (`melanger`) | le premier était biaisé |
| fin de session → `location.reload()` | écran de bilan, « Refaire les erreurs » | on perdait tout |

## Comparer une réponse : `juger` (`exercice.js`), `normaliser` (`utils.js`)

`juger(mode, mot, q, saisie)` rend `{ reussite, note, autreAlphabet }` :
d'abord l'égalité normalisée avec `reponses` ; puis, pour un mode
`francais`, `comparerFrancais` ; puis, pour `autresReponses`, un homonyme ;
enfin, pour un mode `japonais`, **le bon mot dans l'autre syllabaire**
(ミズ pour みず, comparés par `versHiragana`). `note` s'affiche dans la
correction (« Accepté, à une faute près : on écrit « manger » », « Juste
aussi : … a le même sens »).

**L'autre alphabet** (26/10, José : « on considère que c'est réussi, mais
sans jamais la possibilité de le passer en acquis ») : la correction titre
« Juste, dans l'autre alphabet » et montre l'écriture attendue ; le front
envoie `autre_alphabet: true` et le serveur compte une réussite, met
l'état « en cours » et la **série à zéro** (deux réponses de suite dans le
bon alphabet restent nécessaires) ; un mot acquis reste acquis, sans être
revalidé.

`comparerFrancais` (25/10) : chaque sens se décline en formes (tel quel,
sans article ni pronom de tête — le, la, l', un, se, à… —, sans la
précision entre parenthèses, chaque morceau d'un « grand / gros ») ; une
forme identique est juste ; sinon une **distance d'édition** (inversion de
deux lettres comprise) de 1 dès 5 lettres, 2 dès 10, est acceptée avec la
note. Sous 5 lettres, exact : « mère » n'est pas « père ».

### `normaliser`

Minuscules, `NFD` puis accents retirés, ponctuation et espaces retirés —
comme la v1 — plus apostrophes, guillemets et « ? ». Les deux côtés passent
par la même fonction : « l’eau », « l'eau » et « leau » se valent.

⚠️ `NFD` décompose aussi les kana voisés (が → か + U+3099). Sans effet sur la
comparaison (même traitement des deux côtés), mais **un `includes` sur un
texte normalisé** peut trouver « か » dans « が » : ne comparer que des
chaînes entières normalisées.

## Progression : les paliers (25/10/2026, schéma v6)

Jusqu'au 25/10, une bonne réponse rendait un mot « acquis » (règle de la v1),
même trouvé parmi des tuiles. Le 25/10, José a demandé d'appliquer la revue
du concepteur (v5 : deux jours différents dont une production), puis le soir
même : « acquis » = **réussi deux fois de suite**, et un état pour **revoir
les mots appris il y a longtemps** (v6). Tout se calcule **au serveur**
(`Depot::enregistrerResultat(mot, reussite, niveau)`) d'après le `niveau`
envoyé par l'exercice.

| réponse | niveau | état | paliers |
|---|---|---|---|
| fausse, « Passer », corbeille des paires | tous | `a revoir` | série à 0, dates d'acquisition effacées |
| juste | reconnaissance (paires, tuiles ; défaut si `niveau` absent) | `en cours` au plus ; un acquis le reste (un « à rafraîchir » aussi) | ne compte pas dans la série, ne la casse pas |
| juste | rappel, production | `acquis` à **2 réussites de suite** (`SERIE_POUR_ACQUIS`), le même jour possible ; sinon `en cours` | série + 1 ; à l'acquisition : `acquis_le` = `valide_le` = aujourd'hui (Paris) |
| juste, mot déjà acquis | rappel, production | `acquis` | `valide_le` = aujourd'hui ; s'il était « à rafraîchir », un rafraîchissement de plus |
| juste dans l'autre syllabaire (`autre_alphabet`) | tous | `en cours` ; un acquis reste acquis | série à 0 ; rien de revalidé |

**« À rafraîchir »** (`a rafraichir`) : un état **calculé**, jamais écrit en
base — un acquis dont `prochaine_revision` est arrivée. `Depot::lireMots` le
renvoie dans `progression.statut` ; `definirStatut` le refuse. Les curseurs
(`DELAIS_RAFRAICHIR`) : 7 jours après la dernière validation, puis 15, 30,
60 et 120 jours à mesure que les rafraîchissements réussissent. Un mot
réussi avant l'heure est revalidé, sans changer de palier. Raté, il retombe
« à revoir » et tout recommence.

Ce que voit le navigateur : `statut`, `nb_reussites`, `nb_echecs`,
`derniere_revision`, `serie`, `production` (information : plus aucune règle
ne l'exige), `acquis_le`, `valide_le`, `rafraichissements`,
`prochaine_revision`. Dans la liste, le titre du badge les dit en clair
(« Acquis le 1 octobre 2026, à rafraîchir à partir du 8 octobre 2026 »,
`titreProgression`). Sur l'accueil, « N acquis sur M » compte acquis et à
rafraîchir (`compterStatuts(…).appris`).

`tirerPrioritaires` (`etat.js`) : à revoir (mélangés), à rafraîchir **les
plus anciens d'abord** (`valide_le`), en cours, nouveaux, acquis (les plus
anciens d'abord).

À la migration 6, les acquis gardent leur état, acquis et validés à leur
dernière réussite, « à rafraîchir » 7 jours après ; un « en cours » garde
une réussite d'avance.

À la main : dans la liste (`vues/liste.js`), un clic sur le badge fait
tourner Nouveau → En cours → Acquis → À revoir → Nouveau ; « À rafraîchir »
→ Acquis (revu aujourd'hui). `progression.definir`, sans toucher aux
compteurs ; les paliers suivent (`Depot::champsPourStatut`).

Couleurs : `--rafraichir` (lavande) et `--encours` (bleu ciel) à côté de
`--acquis`, `--revoir`, `--nouveau` ; barres, badges, pastilles, anneau de
l'accueil (`--part-rafraichir`, `--part-encours`).

## La session (`lancerSession` → `afficher` → `afficherMot` → `afficherBilan`)

- `lancerSession(mode, mots, limite)` : `limite` > 0 → tirage au hasard de
  `limite` mots ; ≤ 0 → les mots dans l'ordre donné (`tirerPrioritaires`).
  Garde la session en mémoire du module et ouvre `#/exercice`.
- `afficherMot` crée une **feuille neuve** par mot (`article[data-feuille]`)
  et la substitue à l'ancienne : réutiliser la feuille empilait les
  écouteurs (un « Suivant » sautait plusieurs mots). Conséquence : tout ce
  qui vit plus longtemps qu'un mot (l'écouteur clavier `surTouche`) relit la
  feuille dans le DOM au lieu d'en garder une référence (règle n° 6 de
  `CLAUDE.md`).
- **Entrée** : dans le champ → Valider ; correction affichée → Suivant.
- « Arrêter » après au moins une réponse → bilan partiel ; sinon retour.
- Sur téléphone, le champ ne prend pas le focus tout seul : le clavier du
  système masquerait la question (`matchMedia('(pointer: fine)')`).

## L'écriture (`vues/ecriture.js`)

Lancée depuis la liste (un mot, ou les mots cochés) ou la carte de l'accueil.
Écrire le mot `repetitions` fois de suite ; une erreur remet à zéro.
Réponses acceptées : kana, kanji, rōmaji. **« De mémoire »** (réglage
`difficile`, **vrai par défaut depuis le 25/10**) : le modèle se montre, puis
disparaît à la première lettre ou après 4 s (`MODELE_VISIBLE`), après chaque
réussite aussi ; il revient après une erreur, ou d'un toucher sur sa place.
Réglages : préférence `ecriture` du compte. **Ne touche pas à la
progression** (comme en v1).

## Le jeu des kana (`assets/js/vues/jeu_kana.js`)

Deux sens (réglage `sens`, 25/10) : **lire** — un caractère s'affiche en
grande case, on écrit sa lecture en rōmaji ; **écrire** — la lecture
s'affiche en grand, on écrit le caractère, clavier de kana ouvert sur le bon
alphabet (un hiragana pour un katakana demandé est faux). Les deux sens
écrivent dans les mêmes compteurs du caractère (`kana.resultat`).
**Erreurs illimitées** : le caractère reste tant qu'il n'est pas trouvé ;
« Je ne sais pas » montre la lecture, qu'il faut alors recopier.

| point | règle | où |
|---|---|---|
| données | hiragana + lectures dans `GROUPES` ; katakana déduit par décalage Unicode (`versKatakana`) | `assets/js/donnees/syllabaires.js` |
| lectures acceptées | Hepburn d'abord (affichée), puis variantes : si, ti, tu, hu, zi, di, du, wo/o, nn, sya, tya, zya, jya… | `GROUPES` |
| comparaison | `normaliserRomaji` : NFKC, minuscules, sans espace / apostrophe / tiret / point | `jeu_kana.js` |
| ordre | les caractères pas encore acquis d'abord, puis les acquis, chaque paquet mélangé (`tirer`) | `jeu_kana.js` |
| ratés | reviennent **une fois**, 3 à 6 caractères plus loin (`RETOUR_MIN`, `RETOUR_MAX`) | `terminer` |
| résultat enregistré | `kana.resultat { kana, reussite }` : réussite = du premier coup, sans « Je ne sais pas » | `Depot::enregistrerKana` |
| maîtrise (tableau) | acquis : plus de réussites que d'échecs ; à revoir : autant ou moins ; non acquis : jamais joué | `maitrise` |
| nombre | 20, 50, chacun une fois, sans fin (la file se remplit) | `reglagesJeu` |

Depuis la page Kana, l'en-tête d'une ligne (« k », « sh »…) lance une partie
sur cette ligne seule, dans l'alphabet affiché.

⚠️ Comme dans `exercice.js`, une feuille neuve par caractère ; et
« Arrêter » efface les minuteries en attente, sinon le « caractère suivant »
programmé écrasait le bilan.

## Les kanjis : la page et le jeu (`vues/kanji.js`, `vues/jeu_kanji.js`, 26/10/2026)

José, 26/10 : « des cours et des exos concernant l'aspect kanji de
l'apprentissage […] comme les kanas il doit avoir sa propre barre de
progression ». Les exercices de mots à kanjis (Kanjis → français, Kanjis →
kana, trous, choix de la lecture) font travailler des MOTS ; ici, l'unité est
le caractère.

**Les données** : `assets/js/donnees/kanjis.js`, **fabriqué** par
`outils/generer_kanjis.py` (ne pas le corriger à la main). 626 kanjis : les
440 des trois premières années de l'école japonaise (80 / 160 / 200) et
186 « plus loin » — les autres kanjis du vocabulaire du cours, dans l'ordre
des chapitres. Sens : celui de la liste v1 (`liste_kanjis.js`) s'il existe,
sinon KANJIDIC2 ; lectures on / kun et traits : KANJIDIC2 (© EDRDG, CC BY-SA
4.0, mention en bas de la page). Les helpers : `assets/js/kanjis.js`
(groupes, `lecturesAcceptees`, `kunEnHtml`, `leurresKanji`…).

**La page** (`#/kanji`, onglet « Kanji ») : un groupe à la fois — Mes
chapitres (les kanjis des mots des chapitres cochés sur l'accueil), 1re,
2e, 3e année, plus loin (préférence `kanji_niveau`). Une case = le kanji, son
premier sens, l'état au trait du bas (et en clair dans le titre). Un toucher
ouvre la fiche (`ouvrirFiche`) : sens, traits, état, séries, lectures on et
kun (radical · terminaison), les mots du compte qui l'emploient, et
« S'entraîner sur ce kanji » (son sens puis sa lecture).

**Le jeu** (`#/jeu-kanji`, réglages en préférence `jeu_kanji`) :

| exercice | montré | attendu | facette (`kanji.resultat`) |
|---|---|---|---|
| Le sens | le kanji seul | son sens en français (`comparerFrancais` sur `sens` + `aussi`) | `sens` (rappel) |
| La lecture | le kanji seul | une lecture en kana, on ou kun, hiragana ou katakana au choix ; kun seul (い) ou avec sa terminaison (いきる) ; rōmaji refusé sans compter | `lecture` (production) |
| Reconnaître | le sens | le kanji parmi 4 (leurres de traits voisins, jamais de même sens) | `choix` (reconnaissance) |
| Mélangé | — | pour chaque kanji, la facette dont la série est la plus courte | `sens` ou `lecture` |

Tirage : à revoir, en cours, nouveaux, acquis (mélangés dans chaque
paquet), 10, 20 ou tous. Une réponse par question, puis la correction (sens,
on, kun, deux mots du compte) ; un raté revient une fois 3 à 6 questions
plus loin ; bilan avec « Rejouer les ratés ».

**La progression** (`kanji_progression`, schéma v7, `Depot::enregistrerKanji`) :

| réponse | effet |
|---|---|
| fausse ou « Je ne sais pas » | `a revoir` ; la série de la facette repart à 0 (raté en `choix` : celle du sens) |
| juste en `choix` | `en cours` au plus ; séries inchangées ; un acquis le reste |
| juste en `sens` / `lecture` | série de la facette + 1 ; **acquis quand les deux séries atteignent 2** (`SERIE_POUR_ACQUIS`) ; `acquis_le` = aujourd'hui |

Pas d'état « à rafraîchir » pour les kanjis (pas encore). Un 4e anneau sur
l'accueil, « Kanjis des chapitres choisis » (la 1re année si aucun), et
trois cartes « Kanji » qui lancent le jeu sur ce même groupe.

Limites : KANJIDIC2 donne beaucoup de lectures kun rares (生 en a 18) ;
toutes sont acceptées, la fiche n'en montre que 4 à 6. Un kanji d'un mot
ajouté par le compte qui n'est pas dans les 626 n'apparaît nulle part.

## Paires (`assets/js/vues/paires.js`, 23/10/2026)

Conçu avec le skill `concepteur-exercices-nihonjo` (sa fiche y sert
d'exemple). 18 tuiles : 3 rangées de 6 au bureau, 6 rangées de 3 au
téléphone. 9 mots, chacun écrit deux fois sous deux formes. On glisse
une tuile sur son autre écriture, ou on touche les deux.

**Composition d'une grille** (José, 25/10 ; `preparerGrille`, `pairesDuMot`) :

| genre | combien | quels mots |
|---|---|---|
| kanji ↔ kana | le reste (6 ou 7 sur 9) | une écriture avec **1 ou 2 kanjis** au plus (`MAX_KANJIS` : 時計, 食べる ; pas 日本語学校), kana de 8 caractères au plus |
| hiragana ↔ katakana (le même mot) | 1 ou 2 (`MAX_ALPHABETS`) | un mot japonais en hiragana, 6 caractères au plus, sans « ー » ; de préférence un mot sans paire à kanjis |
| français ↔ japonais | 1 ou 2 (`MAX_FRANCAIS`) | français de 16 lettres au plus |

Les plafonds ne sont dépassés que si la sélection n'a pas assez de mots à
kanjis (une grille de « Mes mots » d'un débutant) : alors les alphabets,
puis le français, remplissent.

| point | règle | où |
|---|---|---|
| tirage | `tirerPrioritaires` sur la sélection de l'accueil (à revoir d'abord), 9 mots au plus | `preparerGrille` |
| unicité | un mot est sauté si l'une de ses deux formes est déjà affichée (normalisée) : une bonne paire n'est jamais refusée à cause d'un homonyme | `preparerGrille` (`vus`) |
| juste | même `motId` ; les deux tuiles se figent en vert | `essayer` |
| faux | une erreur pour **chacun** des deux mots en jeu ; secousse | `essayer` |
| progression | à la paire faite : `progression.resultat` sans `niveau` (donc reconnaissance : au plus « en cours », 25/10), réussite = aucune erreur avec ce mot | `essayer` |
| corbeille (25/10) | glisser une tuile sur la corbeille (ou la toucher, puis la corbeille) : le mot ET son autre écriture quittent la grille, le mot passe « à revoir » ; la grille finit quand tout est trouvé ou écarté | `ecarter` |
| geste | Pointer Events (pas de glisser HTML5, mort au doigt), seuil 8 px ; sinon toucher l'une puis l'autre (clavier : Entrée) | `afficher` |
| bilan | sans erreur sur 9, durée, mots à revoir ; « Nouvelle grille », « Rejouer les mots à revoir » | `afficherBilan` |
| carte de l'accueil | « N paires », désactivée sous 2 (`pairesPossibles`) | `reviser.js` |

⚠️ Le drapeau `ignorerClic` (le clic qui suit un glisser) est remis à zéro à
chaque `pointerdown` : un glisser lâché hors de toute tuile n'émet pas
toujours de clic, et le drapeau aurait avalé le toucher suivant.

## Le clavier de kana (`assets/js/clavier.js`)

`creerClavier(champ, conteneur)` : un clavier **par champ** (la v1 en avait un
seul, rattaché par une variable globale, et sa fonction `creerToucheClavier`
définie deux fois écrivait toujours dans le champ de l'exercice). Il insère
au curseur, garde le focus (`mousedown` empêché), et coupe le clavier du
système pendant qu'il est ouvert (`inputMode = 'none'`).
