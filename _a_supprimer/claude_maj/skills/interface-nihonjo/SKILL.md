---
name: interface-nihonjo
description: Créer ou modifier un écran, un composant, une boîte de dialogue ou le style de Nihonjo — HTML/JS des vues (assets/js/vues), CSS (assets/css/nihonjo.css), couleurs, thème sombre, affichage téléphone, clavier de kana, cases genkō.
---

# L'interface de Nihonjo

Charte : `CHARTE_GRAPHIQUE.md`. Architecture des vues : `doc_pour_agents/architecture.md`.

## Les règles du code d'interface

| règle | pourquoi |
|---|---|
| Une vue = `export function afficher(racine)` dans `assets/js/vues/`, enregistrée dans `VUES` et `ONGLET` (`app.js`) | le routeur ne connaît rien d'autre |
| Les écouteurs se posent sur des éléments **de `racine`** ; ce qui est posé sur `document` ou en minuterie se retire dans la fonction renvoyée par `afficher` | sinon il survit à la vue et agit sur la suivante (`surTouche` de `exercice.js` est le modèle) |
| Tout texte de la base passe par `echapper()` avant `innerHTML` | un « < » dans un contexte casse la page ou injecte du script |
| Aucun `onclick=` dans le HTML | délégation : un écouteur sur le conteneur, `e.target.closest('[data-…]')` |
| Les éléments se repèrent par `data-*`, le style par classe | renommer une classe ne casse pas la logique |
| Pas de `alert` / `confirm` / `prompt` | `toast`, `confirmer`, `dialogue` (`ui.js`) |
| Une action asynchrone déclenchée par un clic : `tenter(() => …, 'message')` | l'erreur arrive à l'écran au lieu de la console |
| Une préférence (filtre, réglage, thème, sélection) : `preference(cle, defaut)` / `ecrirePreference(cle, valeur)` (`etat.js`), clé déclarée dans `Depot::CLES_PREFERENCES` | rangée dans la base, par compte (règle n° 11 de `CLAUDE.md`) ; **plus jamais** `memoire` / `localStorage` |

## ⚠️ Les pièges vécus

1. **Reconstruire un bouton pendant qu'on clique dessus avale le clic.**
   Un `innerHTML` relancé par `change` (qui part au `blur` d'un champ) remplace
   le bouton entre `mousedown` et `click`. Vécu le 22/10 : saisir « Mots par
   session » puis cliquer un exercice ne faisait rien. Construire une fois,
   **mettre à jour en place** (`rendreSelection` de `reviser.js`, qui ne
   touche qu'aux textes et à `disabled` des cartes et du grand bouton).
2. **Une référence à un nœud remplacé est morte.** `afficherMot` remplace la
   feuille d'exercice à chaque mot ; un écouteur qui gardait l'ancienne ne
   validait plus rien à l'Entrée. Relire le DOM (`racine.querySelector`).
3. **Réutiliser un conteneur empile ses écouteurs.** D'où une feuille neuve
   par mot dans `exercice.js`.
4. **`backdrop-filter`, `transform`, `filter` sur un parent font de lui le
   repère d'un enfant `position: fixed`.** La navigation du téléphone,
   enfant de `.entete`, s'est collée en haut. L'en-tête n'a pas de
   `backdrop-filter` sous 760 px.
5. **Thème sombre : jetons écrits deux fois** (`@media (prefers-color-scheme:
   dark)` et `:root[data-theme="sombre"]`). Toute couleur ajoutée ou changée
   l'est dans `:root` ET dans les deux blocs sombres.
6. **Aucune couleur en dur** hors des jetons : elle ne suivrait pas le thème.
   Seule exception admise : le blanc du texte sur `--erreur` et le pouce de
   l'interrupteur.
7. **`color-mix()` exige Safari 16.2** : toujours une déclaration de repli
   juste avant (voir `.entete`, `.bandeau`).
8. **Le focus automatique ouvre le clavier du téléphone** par-dessus la
   question : ne focaliser que si `matchMedia('(pointer: fine)')`.
9. **Masquer la navigation du téléphone pendant un jeu : un drapeau, pas la
   vue.** `body[data-vue="jeu-kana"]` la cachait aussi sur l'écran de
   réglages, d'où l'on ne pouvait plus partir (23/10). Le jeu pose
   `body.dataset.jeu = 'en-cours'` le temps d'une partie ; `rendre` l'efface.
10. **Un bouton réservé à l'administrateur se cache au rendu** (`estAdmin()`
   d'`etat.js`), mais **le serveur refuse quand même** (403) : ne jamais
   compter sur le masquage seul.

## « Mes mots » verrouillé

Partout où l'on choisit des chapitres pour SES mots (formulaire de mot,
page d'import) : la puce « Mes mots » est `.puce-verrouillee`, pressée, avec
le cadenas, sans `data-chapitre` (un clic n'y fait rien), et la clé est
ajoutée à l'envoi quoi qu'il arrive. Le serveur l'impose aussi : l'interface
ne fait qu'en informer. Brique : `chapitreMesMots()`, `chapitresDuCompte()`
(`etat.js`).

## L'écran de connexion et le menu du compte

- Avant toute vue, `demarrer` (`app.js`) appelle `sante` puis
  `initialiserConnexion` (`auth.js`). Pas de compte → `afficherConnexion` :
  `body[data-vue="connexion"]`, navigation cachée, deux groupes « Se
  connecter » / « Créer un compte » (Google, et Discord si
  `sante.auth.fournisseurs.discord`) — ou, en mode `dev`, une adresse et les
  deux mêmes boutons (`[data-intention]`). Une identité sans compte →
  `afficherCompteInexistant` (« Créer mon compte »). Les deux écrans
  partagent `.connexion` / `.feuille-connexion` : `entrer` s'en sert pour
  savoir qu'une erreur est déjà traitée.
- Le bouton Discord porte `icone('bulle')`, une bulle générique : **jamais le
  logo** de Discord ni le « G » de Google dessinés à la main.
- Le menu du compte (`.zone-compte`, `majMenuCompte`) est un `<details>` :
  avatar (`avatar(utilisateur)` de `composants.js` : photo du fournisseur, ou
  initiale), nom, adresse · compte Google / Discord, rôle, « Mon compte »,
  « Importer ou exporter des mots », « Gérer les comptes » et « Sauvegarde
  complète… » (administrateur, `echanges.js`), « Se déconnecter ». Il existe
  aussi en mode `aucune` (poste local : « Poste local », sans déconnexion).
  Un seul écouteur `click` sur `document` le referme. Sa grille a
  `minmax(0, 1fr)` : sans lui, un bouton `nowrap` le fait déborder de
  l'écran du téléphone.
- « Mon compte » (`vues/compte.js`) et « Gérer les comptes »
  (`vues/comptes.js`) n'ont pas d'onglet (absents d'`ONGLET`). Un pseudo
  changé → `majUtilisateur` (`etat.js`) puis l'événement
  `nihonjo:compte-modifie`, qui refait le menu.
- Une vue qui déconnecte n'importe pas `app.js` (dépendance circulaire avec
  le point d'entrée) : elle appelle `terminerSession` (`session.js`), qui
  émet `EVENEMENT_SORTIE` ; `app.js` réaffiche la connexion.
- Un 401 de l'API émet `nihonjo:deconnexion`, un 404 `compte_inexistant`
  `nihonjo:compte-inexistant` (`api.js`) → l'écran qui convient, sans
  recharger. `{ silencieux: true }` les retient (sonde `session`, inscription).

## Les tableaux de kana (`vues/kana.js`)

- Trois `<table class="tableau-kana">` (base, voisés, combinaisons) : un
  vrai tableau (lecteurs d'écran : `th scope`), `table-layout: fixed` et
  largeur 100 % : il tient en 390 px sans défilement, les glyphes
  rapetissent sous 560 px (« Les deux » : `.tableau-kana-deux`, plus petits
  encore). Ajouter une colonne = revérifier le téléphone.
- Chaque caractère porte `etat-acquis` / `etat-a-revoir` / `etat-non-acquis`
  (`classeStatut`) : un **soulignement** coloré (`border-bottom`), pas un
  fond, pour que le glyphe reste lisible dans les deux thèmes. L'en-tête de
  ligne (`.ligne-kana`, `data-ligne`) est un bouton qui lance le jeu.

## Les briques existantes — les réutiliser

| besoin | brique | fichier |
|---|---|---|
| japonais en cases (question) | `masu(texte, { trou, taille, lecture })` | `masu.js` |
| cases d'essais cochées | `casesEssais(faites, total)` | `masu.js` |
| japonais en ligne (listes) | `japonaisEnLigne(mot)` | `composants.js` |
| barre acquis / en cours / à revoir | `barreStatuts(mots, { grande })` | `composants.js` |
| badge d'état | `badgeStatut(statut, { bouton })` | `composants.js` |
| choix exclusif | `segments(nom, options, valeur, libelle)` | `composants.js` |
| hiragana / katakana, lignes, lectures | `GROUPES`, `caracteres(lignes, alphabet)`, `maitrise(stats)` | `donnees/syllabaires.js` |
| liste de chapitres | `optionsChapitres(selectionne)` | `composants.js` |
| clavier de kana pour un champ | `creerClavier(champ, conteneur)` | `clavier.js` |
| icône | `icone('nom')` — jeu dessiné maison, ajouter un tracé dans `TRACES` | `icones.js` |
| boîte de dialogue / confirmation | `dialogue({…})`, `confirmer(titre, message, {danger})` — ⚠️ `message` est du HTML (échapper ce qui vient de la base), `titre` est échappé par `dialogue` | `ui.js` |
| avatar d'un compte | `avatar({ nom, email, photo }, { grand })` | `composants.js` |
| date d'une colonne SQLite en français | `dateLisible(valeur, { heure })` | `session.js` |

## Vérifier

- `node --check` sur chaque fichier JS touché.
- À l'œil, **aux deux tailles** (bureau ≥ 960 px, téléphone 390 px) et **dans
  les deux thèmes**. Sans navigateur : `tests/parcours_navigateur.py`
  (Playwright) refait le tour complet et prend des captures si
  `NIHONJO_CAPTURES` désigne un dossier.
- Console du navigateur propre (le parcours échoue sur toute erreur).
