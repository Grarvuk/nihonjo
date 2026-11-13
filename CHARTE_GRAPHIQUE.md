# Charte graphique — Nihonjo

Posée le 22/10/2026. Tout est dans `assets/css/nihonjo.css` ; ce fichier dit
les intentions et les règles, pour qu'un ajout ressemble au reste.

> ⚠️ **25/10/2026 : nouvelle direction, transposée de la maquette de Manus**
> (`maquette/` à la racine, demande de José). Palette crème / bleu nuit /
> indigo `#5864D8`, menthe, ambre, corail ; polices **Manrope** (titres),
> **DM Sans** (texte), **Noto Sans JP** (japonais, y compris dans les
> cases) ; surtitres en petites capitales espacées (`.surtitre`) ; feuilles
> à grands rayons (`--rayon-carte` 16 px, `--rayon-grand` 22 px) et ombre
> douce (`--ombre-douce`) ; accueil avec la carte bleu nuit « Votre
> priorité » (`--nuit`), la bande des trois anneaux et des cartes
> d'exercice teintées (`.teinte-*`). Les valeurs à jour sont dans `:root`
> d'`assets/css/nihonjo.css` ; le tableau ci-dessous garde l'ancienne
> palette pour mémoire. Les cases (masu) restent l'élément japonais fort.

## L'idée

**Le cahier d'écriture japonais.** Le seul élément fort est la **case**
(genkō yōshi, 原稿用紙) : les mots japonais posés en question s'écrivent
dans des carrés à croix de repère en pointillés, en écriture de type
manuscrit scolaire. Tout le reste est discret : un papier légèrement
quadrillé, des feuilles blanches à filet fin, une encre indigo pour agir.

## Couleurs (jetons)

| jeton | cahier (clair) | tableau noir (sombre) | rôle |
|---|---|---|---|
| `--papier` | `#F2F5F1` | `#17221E` | fond de page, quadrillé par `--grille-page` |
| `--feuille` | `#FFFFFF` | `#1F2D28` | blocs, champs, cases |
| `--encre` | `#1C2433` | `#EAEFE8` | texte |
| `--encre-2` / `--encre-3` | `#4F5B6B` / `#7A8493` | `#B4C1B9` / `#8A998F` | texte secondaire / discret |
| `--trait` / `--trait-fort` | `#DCE3DD` / `#C3CEC6` | `#2D3F38` / `#3D544A` | filets, bords de champ |
| `--quadrillage` / `--guide` | `#9FC4B0` / `#CFE3D7` | `#4E7062` / `#33493F` | bord des cases / croix de repère |
| `--ai` (藍, indigo) | `#2A4B8D` | `#9DB8F2` | actions, sélection, focus |
| `--acquis` | `#2E8B66` | `#5FCB9D` | état acquis, bonne réponse, ○ |
| `--revoir` | `#C98A12` | `#E8B44C` | état à revoir |
| `--encours` | `#6FB3D9` | `#7FC3E6` | état en cours (réussi, pas encore acquis ; 25/10) |
| `--rafraichir` | `#9B7FD4` | `#B39DE8` | état à rafraîchir (acquis il y a longtemps ; 25/10) |
| `--nouveau` | `#A3ACB7` | `#66766E` | état nouveau (fond des barres) |
| `--erreur` | `#B8402E` | `#EE806C` | mauvaise réponse, ×, suppression |

Chaque couleur d'état a sa variante `-pale` (fonds) et, pour acquis, en
cours, à rafraîchir et à revoir, `-texte` (texte lisible sur fond pâle).

⚠️ Les jetons sombres sont écrits **deux fois** : sous `@media
(prefers-color-scheme: dark)` (thème du système) et sous
`:root[data-theme="sombre"]` (choix forcé par le bouton). Les deux blocs
doivent rester identiques.

## Typographie

| rôle | police | où |
|---|---|---|
| japonais (cases, listes, tuiles, clavier, chiffres du score) | **Klee One** 400/600 — dessin de manuel scolaire | `--police-main`, appliquée à tout `[lang="ja"]` |
| interface, français | **Zen Kaku Gothic New** 400/500/700 — gothique japonaise aux latines sobres | `--police-ui` |

Échelle : 0,75 · 0,85 · 0,95 · 1,05 · 1,35 · 2 · 3 rem. Titres en 700, sans
capitales ni petites capitales. Tout le texte de l'interface en minuscules
de phrase.

## Formes : le rayon dit la hiérarchie

| élément | rayon |
|---|---|
| case (`.masu`), tuile | 0 — c'est du papier réglé |
| feuille, champ, bouton, vignette de chapitre | 6 px (`--rayon`) |
| puce, étiquette, badge d'état | pilule (999 px) |

Une seule « épaisseur » dans toute l'application : la feuille d'exercice
(`.feuille-exercice`), dessinée comme une pile de feuilles. Pas d'ombre
floue sous les blocs ; les ombres sont réservées à ce qui flotte (boîtes de
dialogue, messages).

## Règles

- **Pointillés = repère, ou exclu.** Les croix des cases, la case vide d'un
  mot à trous (bord indigo en tirets) et la vignette d'un chapitre **non
  sélectionné** (bord en tirets) parlent la même langue.
- **Les trois états ont toujours les mêmes couleurs** : barre segmentée,
  pastille de légende, badge, se lisent ensemble.
- **Les cases ne servent qu'au japonais des questions** (et aux essais de
  l'écriture). Dans les listes, le japonais est en ligne (`japonaisEnLigne`).
- **Mouvement** : seulement en réponse à un geste — tracé du ○ / × de la
  correction, secousse d'une saisie fausse, ouverture d'une boîte. Une seule
  animation continue : la case vide qui respire. Tout est coupé par
  `prefers-reduced-motion`.
- **Téléphone (≤ 760 px)** : navigation en bas, masquée pendant un exercice ;
  les grandes cases rétrécissent selon le nombre de caractères (`--n`, posé
  par `masu()`) au lieu de passer à la ligne.
- **Icônes** : jeu maison (`assets/js/icones.js`), traits de 1,75 sur une
  grille de 24, couleur du texte. Pas de bibliothèque d'icônes.
- **Tableaux de kana** (23/10) : un vrai tableau à filets fins (`--trait`),
  pas de cases genkō — les cases restent réservées aux questions. L'état
  d'un caractère est un **soulignement** aux couleurs des trois états, jamais
  un fond : le glyphe reste lisible dans les deux thèmes. Le tableau tient
  dans la largeur du téléphone (glyphes plus petits), sans défilement.
- **Jeu des kana** : le caractère dans une seule grande case (la même que les
  questions, `--t` plus grand) ; trouvé, la case prend le fond et le bord
  « acquis » (`.masu-trouve`).
- **Accueil** (23/10, skill `ux-ui-nihonjo`) : l'élément fort est le bonjour
  du moment (おはよう / こんにちは / こんばんは) **en cases**, sur une feuille
  de la pile ; une seule action pleine, le grand bouton « Réviser N mots »,
  qui a une tranche et s'enfonce à l'appui. Les exercices sont des **fiches**
  dont l'exemple s'écrit dans de petites cases (pas d'icône) ; au survol, la
  fiche se soulève avec une ombre nette décalée, jamais floue. Le « dernier
  choisi » se repère au bord indigo.
- **Tuiles de Paires** (23/10) : du papier avec une tranche (ombre nette en
  bas), qui se soulève quand on la prend (ombre décalée indigo) ; la cible
  survolée passe en tirets indigo, comme la case vide d'un mot à trous ;
  trouvée : vert « acquis », un ○ dans le coin, puis estompée. Le japonais en
  Klee One, plus petit au-delà de 4 caractères.
- **Étapes numérotées** (page d'import, 23/10) : le numéro est une petite
  case genkō (bord `--quadrillage`, chiffre en Klee One indigo) — un vrai
  numérotage, parce que le contenu EST une suite d'étapes. Ne pas l'employer
  pour décorer une liste qui n'en est pas une.
- **Texte pour l'IA** : un bloc monospace sur le papier ; ce qui vient des
  champs est surligné indigo pâle, ce qui reste à remplir en ocre
  (`--revoir-pale`).
- **Gestionnaire de chapitres** : le chapitre choisi se marque comme une
  page cornée — bord indigo et filet épais à gauche ; au téléphone, la liste
  devient un ruban qui défile en largeur. La barre d'actions des mots cochés
  est indigo pâle et reste collée en haut pendant le défilement.
- **Cadenas** (`icone('cadenas')`) : un élément imposé (« Mes mots », un mot
  qui n'en sort pas). Jamais pour une simple désactivation.
- **Sceau vermillon** (`--shu`, hanko 今日) : réservé au mot du jour. Ne pas
  l'étendre à d'autres éléments, sinon il ne signale plus rien.
- **Chapitres choisis** : bord indigo plein et pastille cochée sur le coin ;
  le fond reste du papier (le fond bleu plein faisait un mur bleu, tout étant
  coché par défaut).
- **Connexion** (23/10) : une feuille centrée sur le papier, le nom 日本語
  en cases comme signature, un seul bouton principal. Le compte est une
  pastille ronde dans l'en-tête (photo Google, sinon l'initiale, indigo sur
  indigo pâle)
  qui ouvre un petit menu (nom, rôle, « Se déconnecter »).
