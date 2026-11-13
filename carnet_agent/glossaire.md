# Glossaire — le vocabulaire du projet

Les mots du code et des conversations qui ne se devinent pas. Relevé le
22/10/2026 ; à compléter dès qu'un mot m'arrête.

## Les données

| mot | sens |
|---|---|
| **mot** | une entrée du lexique (`mot` en base) : ses sens français, lectures, écritures, contexte, thèmes, chapitres |
| **variantes** | les éléments d'une liste `fr` / `jp_kana` / `jp_kanji` / `jp_romaji` ; saisies séparées par `&&` dans le formulaire. **La première est celle posée en question** |
| **contexte** | précision libre (« [groupe 1] », « Adjectif en -i ») ; `context` dans l'API et les fichiers |
| **chapitre** | un regroupement de mots ; un **nom technique** (`vocabulaire_p_45`), affiché par `libelleChapitre` : « Chapitre 1 » pour la page 45 du manuel — le rang de la page parmi les chapitres du manuel (12/11 ; « Page 45 » avant) |
| **clé de chapitre** | l'`id` en base : le nom pour un chapitre du cours, **`nom@id`** pour celui d'un compte (`mes_mots@3`), pour que deux comptes aient chacun leur « personnel ». Les fichiers échangés portent le nom seul |
| **catégorie** | groupe de chapitres sur l'écran Réviser (Vocabulaire, Temps & Nombres, Kanjis, Personnel, et celles que José crée) |
| **thème** / **thématique** | étiquette libre d'un mot (« lieu », « verbe ») ; filtre de l'écran Réviser |
| **origine** | `cours` (amorce, ou « Ajouter au cours ») ou `perso` (ajouté par un compte). Depuis le 23/10 c'est `proprietaire_id` qui décide (NULL = cours) ; `origine` le redit |
| **cours** (données) | les mots et chapitres sans propriétaire : vus par tous, modifiés par un administrateur |
| **mes mots** | les mots d'un compte, plus les mots du cours rangés dans ses chapitres (ce qu'exporte « Mes mots ») |
| **Mes mots** (`mes_mots@id`) | le chapitre que chaque compte possède et qui contient TOUS ses mots (imposé par le serveur) ; ni renommable ni supprimable. S'appelait **personnel** jusqu'au schéma v3 (23/10) |
| **préférence** | un réglage du compte gardé dans la base (table `preference`) : sélection de révision, filtres, thème… Plus rien dans le navigateur depuis le 23/10 |
| **gestionnaire** (de chapitres) | l'écran Chapitres refait le 23/10 : liste + détail, ajouter / retirer / copier / déplacer |
| **texte pour l'IA** / **prompt** | le texte à copier dans une IA, complété par les champs de la page d'import (`textePrompt`) |
| **état** / **statut** | `non acquis` (affiché « Nouveau »), `en cours` (depuis le 25/10), `a revoir`, `a rafraichir` (calculé : acquis depuis longtemps) (« À revoir », sans accent en base), `acquis` |
| **niveau** d'un exercice | ce qu'il demande : `reconnaissance` (choisir), `rappel` (retrouver), `production` (écrire le japonais) ; envoyé avec le résultat, il règle les paliers |
| **paliers** | les colonnes de `progression` qui mènent à « acquis » et au-delà : `serie`, `acquis_le`, `valide_le`, `rafraichissements`, `prochaine_revision` |
| **à rafraîchir** | un acquis dont `prochaine_revision` est arrivée (7, 15, 30, 60, 120 jours après sa validation) |
| **exercice conseillé** | ce que lance le grand bouton de l'accueil, d'après l'état de la sélection (`exerciceConseille`) |
| **progression** | la ligne d'état d'un mot **pour un compte** (statut, compteurs, date) ; pas de ligne = nouveau |
| **amorce** | `api/amorce/vocabulaire_initial.json`, le premier remplissage d'une base vide |
| **signature** | sens + kana + kanji triés : deux mots de même signature sont « le même » à l'import (`Depot::signature`) |
| **fusion** | (import) ajouter les chapitres/thèmes d'un mot importé à son jumeau existant ; (progression) appliquer un état sans jamais faire reculer |

## Les comptes (23/10/2026)

| mot | sens |
|---|---|
| **compte** | une ligne `utilisateur` ; un compte Google (uid Firebase) ou Discord (uid `discord:<id>`) — deux comptes distincts pour une même personne qui utilise les deux |
| **s'inscrire** / **créer un compte** | `compte.creer` : l'identité Google / Discord devient un compte Nihonjo. Sans cela, « Se connecter » répond `compte_inexistant` (24/10, comme Odyvresse) |
| **fournisseur** | d'où vient le compte : `google`, `discord`, `dev` (colonne `utilisateur.fournisseur`, schéma v4) |
| **pseudo** | le nom que la personne choisit dans « Mon compte » ; vide = le nom du fournisseur (`nom`, rafraîchi à chaque connexion). `nom` dans l'API = le nom **affiché** |
| **session** (Discord) | le cookie signé `nihonjo_session` (30 jours) ; Google n'en a pas besoin (jeton Firebase) |
| **identité en attente** | une identité Discord revenue sans compte : gardée 15 min dans le cookie `nihonjo_attente`, le temps de cliquer « Créer mon compte » |
| **compte initial** | `utilisateur` n° 1, créé par la migration 2 avec `uid` NULL : il porte les données d'avant les comptes et revient à la **première** connexion (ou à une adresse de `administrateurs`) |
| **administrateur** / **membre** | `role` : l'administrateur modifie le cours et fait les sauvegardes complètes |
| **jeton** | le jeton d'identité Firebase (JWT, ~1 h), en-tête `X-Nihonjo-Jeton` |
| **mode de connexion** | `firebase` (Google, défaut), `aucune` (un seul compte, sans écran ; poste sans réseau, commenté dans `docker-compose.yml`), `dev` (adresse crue sur parole ; tests, variable `NIHONJO_AUTH` seulement) |

## Les kana (23/10/2026)

| mot | sens |
|---|---|
| **ligne** | une rangée du tableau (`a`, `k`, `s`… ; `ky`, `sh`… pour les combinaisons), id dans `GROUPES` |
| **voisés** | les caractères à dakuten / handakuten (が, ぱ…) |
| **combinaisons** | yōon : きゃ, しゅ, ちょ… |
| **maîtrise** d'un kana | acquis (plus de réussites que d'échecs), à revoir, non acquis (jamais joué) ; `maitrise()` |
| **raté** | un caractère pas trouvé du premier coup ; revient une fois dans la partie |

## La révision

| mot | sens |
|---|---|
| **sélection** | les chapitres cochés + thème + état de l'écran Réviser (`motsSelectionnes`) ; préférence du compte (dans la base), la même sur tous ses appareils |
| **mode** | un exercice (`MODES` : `fr-jp`, `jp-fr`, `trous-kana`, `trous-kanji`, `lecture-kanji`, `transcription`) |
| **session** | une suite de questions d'un mode, de `lancerSession` au bilan |
| **trou** | la case vide des mots à trous ; jamais sur « 〜 » ou une espace |
| **tuiles** | les 10 caractères proposés de « Mots à trous (kanji) » |
| **accueil** | l'écran `#/reviser` depuis le 23/10 : bonjour, grand bouton, cartes, mot du jour, puis choix des mots |
| **révision rapide** / **grand bouton** | « Réviser N mots » : le dernier exercice choisi, les mots à revoir d'abord |
| **carte d'exercice** | une fiche de l'accueil, l'exemple écrit dans des cases ; un toucher lance l'exercice |
| **mot du jour** | un mot à kanji, le même toute la journée ; lecture et sens se découvrent d'un toucher. Marqué du sceau 今日 |
| **sceau** | le cercle vermillon (`--shu`, hanko) du mot du jour : le seul rouge décoratif |
| **Paires** | l'exercice à glisser (3 × 6 tuiles, chaque mot écrit deux fois) ; **tuile** : une case de la grille ; **grille** : une partie de 9 paires |
| **forme** (d'un mot) | une de ses écritures : `fr`, `kanji`, `kana` (Paires en montre deux) |
| **bilan** | l'écran de fin de session : score, erreurs, « Refaire les erreurs » |
| **écriture** | l'exercice de la liste : écrire N fois de suite (le « drill » de la v1) |
| **mode difficile** | dans l'écriture, le modèle japonais se cache dès la première lettre |
| **cours** (« Consulter le cours ») | nom v1 de l'écran « Liste des mots » |

## L'interface

| mot | sens |
|---|---|
| **masu** / **genkō yōshi** | les cases à croix de repère des cahiers japonais (原稿用紙) ; `masu()` dans `masu.js`. L'élément visuel fort |
| **feuille** | un bloc blanc sur le papier quadrillé (`.feuille`) ; la feuille d'exercice a une « épaisseur » (pile) |
| **cahier** / **tableau noir** | thème clair / thème sombre |
| **puce** | bouton à cocher arrondi (thème, chapitre dans un formulaire) ; **puce de chapitre** : la vignette de l'écran Réviser, bord en pointillés quand exclue |
| **bandeau** | l'avertissement de l'écran Réviser qui signale des données v1 dans le navigateur |

## L'histoire

| mot | sens |
|---|---|
| **v1** | l'application jusqu'au 22/10/2026 : `data_cours.js` + IndexedDB du navigateur (Dexie). Rangée dans `archives/v1/` |
| **v2** | la version base de données (SQLite + PHP) |
| **reprise v1** / **migration navigateur** | import, depuis le bandeau de l'accueil, de ce que la v1 a laissé dans un navigateur (`migration_navigateur.js`) |
| **NihonjoDB** | le nom de l'IndexedDB de la v1 |
| **copies** | les mots du cours que la v1 clonait dans le lexique perso en peuplant un chapitre ; fusionnés à la reprise |
