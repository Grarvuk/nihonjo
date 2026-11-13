---
name: concepteur-exercices-nihonjo
description: Tenir le rôle de concepteur d'une application d'apprentissage des langues — imaginer, juger et spécifier un NOUVEL exercice pour Nihonjo (paires à glisser, mémory, intrus, dictée, tri, jeu chronométré…), de la pédagogie jusqu'au plan d'intégration. À utiliser quand on demande « un autre type d'exercice », « invente un jeu pour… », « comment faire réviser X », ou avant d'écrire un exercice qui ne rentre pas dans une question par mot.
---

# Concepteur d'exercices de langue — Nihonjo

Ce skill sert à **inventer et cadrer** un exercice avant de l'écrire. Pour
l'écrire ensuite : skill `exercices-nihonjo` (règles du code des exercices),
`interface-nihonjo` (écran, CSS), `ux-ui-nihonjo` (juger le rendu). Le modèle
complet d'un exercice conçu ainsi : **Paires** (`assets/js/vues/paires.js`,
23/10/2026), demandé par José en ces termes : « 3 rangées de 6 mots, écrits
soit en français, soit en japonais en kanji ou en kana ; les mots reviennent
deux fois ; le but est de glisser un des mots de la paire sur le bon
deuxième ».

## Ce qu'on apprend dans Nihonjo — la matière

| matière | dans la base | particularité japonaise à ne pas oublier |
|---|---|---|
| un mot | `fr[]`, `jp_kanji[]`, `jp_kana[]`, `jp_romaji[]`, `context`, `thematiques[]`, `chapitres[]` | **trois écritures** pour un même mot (kanji, kana, rōmaji) + le sens ; certains mots n'ont pas de kanji, d'autres pas de kana |
| un caractère kana | `GROUPES` (`donnees/syllabaires.js`), stats `kana_progression` | hiragana / katakana se correspondent un à un |
| un kanji (caractère) | `donnees/kanjis.js` (626 : sens, on, kun, traits — KANJIDIC2), stats `kanji_progression` | facettes sens et lecture ; beaucoup de kun rares |
| la progression | `progression` : `non acquis` → `a revoir` / `acquis`, compteurs | une seule règle pour tous les exercices de mots (côté serveur) |

**Pas dans la base** (un exercice qui en a besoin demande d'abord des
données, donc une décision de José) : phrases, audio enregistré, images,
radicaux des kanji, ordre des traits (le nombre de traits, lui, est dans `donnees/kanjis.js`), catégories grammaticales fiables
(seulement dans `context`, en texte libre).

## Les principes — pourquoi un exercice fait apprendre

| principe | ce que ça veut dire pour un exercice |
|---|---|
| **Rappel actif** | faire *retrouver* plutôt que *relire* ; produire (écrire le mot) ancre plus que reconnaître (le choisir) |
| **Gradation** | reconnaître → associer → rappeler → produire. Un mot nouveau commence par la reconnaissance (Paires, choix) ; un mot « à revoir » mérite la production (Français → japonais) |
| **Difficulté désirable** | assez dur pour faire effort, pas au point de deviner au hasard ; des leurres proches (même thème, kana voisins) valent mieux que des leurres absurdes |
| **Entrelacement** | mélanger les écritures et les chapitres dans une même partie (Paires mélange fr / kanji / kana) |
| **Espacement** | ce qui est « à revoir » revient d'abord (`tirerPrioritaires`) et revient dans la partie (ratés remis 3 à 6 plus loin, jeu des kana) |
| **Retour immédiat et correctif** | dire tout de suite si c'est juste, et **montrer la bonne réponse** quand c'est faux ; jamais seulement « faux » |
| **Erreur sans punition** | on peut se tromper (José : « autant qu'elle le souhaite » pour les kana) ; l'erreur compte pour la progression, elle ne bloque pas la partie |
| **Petites sessions** | une partie tient en 1 à 3 minutes (une grille de 9 paires, 20 mots) ; un bilan, puis « encore une » d'un toucher |
| **Double codage** | associer deux représentations d'une même idée (sens ↔ kanji ↔ kana) — c'est tout l'intérêt de Paires |

## La matrice — inventer en croisant les axes

Un exercice = un choix sur chaque axe. Changer UN axe d'un exercice existant
donne souvent une bonne idée.

| axe | valeurs possibles dans Nihonjo |
|---|---|
| ce qu'on montre | sens fr · kanji · kana · rōmaji · un caractère · une case vide · **voix** (`speechSynthesis` du navigateur, `lang = 'ja-JP'` : gratuit, mais voix absente sur certains appareils → prévoir un repli) |
| ce qu'on attend | taper (clavier, clavier de kana) · choisir parmi N · glisser sur une cible · ordonner · trier dans des colonnes · toucher vite |
| unité | caractère · mot · groupe de mots (thème, chapitre) |
| niveau | reconnaître · associer · rappeler · produire |
| rythme | libre · chronométré · une vie / sans fin · par grille |
| correction | réponse exacte normalisée · appariement par identifiant · ordre |

### Banque d'idées (à reprendre, à juger avec la fiche ci-dessous)

| idée | axes | faisable avec les données actuelles |
|---|---|---|
| ~~Paires~~ (fait, 23/10) | deux écritures d'un mot → glisser l'une sur l'autre, 3 × 6 | oui |
| Mémory | Paires, mais tuiles retournées : on en retourne deux, on mémorise les places | oui |
| L'intrus | 4 mots d'un même thème + 1 d'un autre → toucher l'intrus | oui (`thematiques`), attention aux thèmes en double (`en_suspens.md`) |
| Tri | 12 mots → les glisser dans 3 colonnes (thèmes ou chapitres) | oui |
| Dictée | la voix dit le mot → l'écrire en kana | oui si `speechSynthesis` a une voix japonaise |
| Choix à leurres proches | un kanji → 4 lectures dont 3 de mots voisins (même premier kana, même longueur) | oui |
| Pluie de mots | des mots tombent, toucher ceux qui veulent dire X avant qu'ils touchent le sol | oui ; mouvement continu → `prefers-reduced-motion` = version sans chute |
| Shiritori | enchaîner un mot qui commence par le dernier kana du précédent | oui (kana), ludique ; vérifier que la base a assez de mots par kana |
| Hiragana ↔ katakana | Paires sur les kana (あ ↔ ア) | oui (`syllabaires.js`) |
| Ordre des mots d'une phrase | glisser les morceaux dans l'ordre | **non** : pas de phrases en base |
| Composer un kanji par ses clés | glisser des radicaux | **non** : pas de radicaux en base |
| ~~Jeu des kanjis~~ (fait, 26/10) | kanji → sens, kanji → lecture, sens → kanji parmi 4 | oui (`vues/jeu_kanji.js`) |
| Paires de kanjis | Paires sur kanji ↔ sens ou kanji ↔ lecture on | oui (`donnees/kanjis.js`) |
| Le kanji commun | 3 mots du compte qui partagent un kanji, une case vide → le trouver | oui (`motsAvecKanji`) |

## La fiche de conception — à remplir AVANT le code

Écrire cette fiche (dans la réponse, puis dans `doc_pour_agents/exercices.md`
une fois retenue). Si une ligne reste vide, l'exercice n'est pas prêt.

```
Nom (le libellé de la carte) :
Promesse (une phrase, ce que l'utilisateur fait) :
Objectif pédagogique (niveau : reconnaître / associer / rappeler / produire) :
Ce qui est montré :
Ce qui est attendu, et le geste — bureau / téléphone / clavier seul :
Tirage des mots (combien, lesquels d'abord, quelles formes) :
Règle de correction (et les AMBIGUÏTÉS : homonymes, sens partagés) :
Effet sur la progression (quand, quelle réussite) :
Retour : juste / faux / fin de partie (bilan) :
Accessibilité : sans glisser, sans couleur seule, mouvement réduit :
Données manquantes ou limites :
Intégration : MODES (question par mot) ou vue à part (grille, jeu) :
```

### La fiche de Paires, en exemple

| ligne | Paires |
|---|---|
| promesse | Chaque mot est écrit deux fois : glissez-le sur son autre écriture. |
| objectif | associer (double codage sens ↔ kanji ↔ kana) ; bon pour les mots nouveaux |
| montré | 18 tuiles (3 × 6, 6 × 3 au téléphone) : 9 mots, chacun sous deux formes tirées parmi fr / kanji / kana |
| geste | glisser une tuile sur l'autre (Pointer Events) **ou** toucher l'une puis l'autre (clavier : Entrée) |
| tirage | `tirerPrioritaires` (à revoir d'abord) ; un mot est sauté si l'une de ses formes est **déjà affichée** |
| correction | même identifiant de mot ; aucune comparaison de texte |
| progression | à chaque paire faite : réussite si aucune erreur n'a impliqué ce mot (`progression.resultat`) |
| retour | juste : les deux tuiles passent au vert et se figent ; faux : secousse rouge des deux ; bilan : sans erreur sur 9, durée, mots à revoir |
| limites | `fr[0]` seulement (un mot à plusieurs sens montre le premier) |

## Les pièges de conception déjà vus

1. **L'ambiguïté qui refuse une bonne réponse.** 73 sens français sont
   partagés par plusieurs mots (« ce, cette » ×3, `en_suspens.md`). Tout
   exercice qui montre une forme et attend « son » partenaire doit garantir
   qu'une forme affichée n'appartient qu'à UN mot de la partie (garde
   `vus` de `preparerGrille`), ou accepter toutes les réponses valables.
2. **Le leurre qui donne la réponse.** Un leurre d'une autre écriture (un
   kana parmi des kanji) se repère sans rien savoir : leurres de la même
   forme, de longueur voisine.
3. **Glisser au doigt.** Le glisser-déposer HTML5 ne marche pas sur
   téléphone : Pointer Events + `setPointerCapture`, `touch-action: none`
   sur les tuiles, seuil de quelques pixels avant de glisser, et **toujours**
   une alternative au toucher / clavier. Remettre à zéro le drapeau « clic à
   ignorer » à chaque `pointerdown` (sinon un clic jamais émis avale le
   suivant).
4. **La progression comptée deux fois.** Un mot = un `progression.resultat`
   par partie, au moment où il est résolu ; « réussite » = du premier coup.
5. **Une partie qui survit à l'écran.** Minuteries effacées à l'arrêt et au
   nettoyage, `partie.terminee` après le bilan, `body.dataset.jeu` posé
   pendant la partie (navigation du téléphone cachée) et retiré au bilan.
6. **La partie trop longue.** Au-delà de 3 minutes sans bilan, l'envie de
   cliquer retombe : couper en grilles / séries.

## Intégrer — deux familles

| famille | quand | comment |
|---|---|---|
| **question par mot** | une question, une réponse, mot après mot (les six modes) | une entrée dans `MODES` + `GROUPES_MODES` (`vues/exercice.js`) et sa phrase dans `PROMESSES` (`vues/reviser.js`) — le skill `exercices-nihonjo` dit le reste |
| **grille ou jeu** | plusieurs mots à la fois, glisser, chrono, mémoire | une vue à part sur le modèle de `vues/paires.js` : `lancerX(mots)` + état de partie dans le module, `afficher(racine)` qui renvoie le nettoyage, bilan ; route dans `VUES` et `ONGLET` (`app.js`) ; carte sur l'accueil (`reviser.js` : bouton `data-x`, compte mis à jour **en place** dans `rendreSelection`) ; section CSS à son nom |

Puis, dans les deux cas :

1. `tests/parcours_navigateur.py` : jouer une partie (juste, faux, bilan,
   progression). Pour un glisser : `page.mouse.down/move/up` avec des
   `steps`, la vue doit exposer de quoi retrouver la bonne réponse
   (`data-mot` sur les tuiles de Paires).
2. Captures aux deux tailles et deux thèmes (`outils/captures_ecrans.py`,
   skill `ux-ui-nihonjo`) ; jouer soi-même au téléphone en mode
   `has_touch`.
3. `doc_pour_agents/exercices.md` (la fiche), `CHANGEMENTS_AAAA-MM.md` (le
   pourquoi), `carnet_agent/carte_du_code.md` (le flux), et la banque
   d'idées ci-dessus (barrer ce qui est fait).

## Rendre la main

La fiche remplie, ce qui a été construit (ou la maquette), ce qui n'a pas pu
être vérifié (voix, appareil réel), et **2 ou 3 idées voisines** tirées de
la banque pour la suite.
