# Recettes — les fichiers à toucher pour les tâches qui reviennent

Les skills disent les RÈGLES ; ici, la liste concrète des fichiers, dans
l'ordre où les toucher. Relevé le 22/10/2026. Une recette fausse se corrige
ici, datée.

## Ajouter une page du manuel (le plus fréquent dans l'historique git)

1. Skill `vocabulaire-nihonjo` : **pas** `data_cours.js` (archivé, plus lu).
2. Écrire un fichier `nihonjo_mots` (format dans le skill), chapitre
   `vocabulaire_p_<page>`, catégorie « Vocabulaire ».
3. José l'importe : Lexique → « Importer une liste » → étape 3, « Dans le cours »
   (administrateur ; sinon la page n'irait qu'à son compte).
4. Vérifier : Réviser → une puce « Chapitre <rang de la page> » (depuis le
   12/11 ; la page est au survol) avec le bon nombre de mots.

## Une action d'API

1. `api/lib/Depot.php` : la méthode (validation → `ErreurApi`, **filtre du
   compte** `VISIBLE_MOT` / `VISIBLE_CHAPITRE` / `utilisateur_id = :u`,
   `exigerAdmin` si elle écrit dans le cours, transaction).
2. `api/lib/Api.php` : une ligne dans `routes()`.
3. `tests/api_test.php` : un `essai(...)` **à deux comptes** (helper
   `compte($pdo, 'a@exemple.com')`) : l'autre compte ne voit ni ne modifie
   rien ; `php tests/api_test.php`.
4. Front : `appeler('nom.action', {…})` dans la vue.
5. `doc_pour_agents/api.md` : une ligne au tableau.

## Une colonne ou une table

1. `api/lib/Base.php` : `MIGRATIONS[n+1]` (jamais toucher aux anciennes).
2. `api/lib/Depot.php` : lecture (`lireMots` / `toutesLesDonnees`), écriture,
   **`sauvegarde` et `restaurer`** (format v2 : ne pas casser la lecture d'une
   sauvegarde v1, voir `restaurer`). Une table par compte : colonne
   `utilisateur_id REFERENCES utilisateur(id) ON DELETE CASCADE`.
3. Si l'amorce doit la remplir : `api/lib/Amorcage.php` `remplir` (et
   `outils/convertir_donnees_v1.mjs` si elle vient de la v1).
4. `tests/api_test.php` : l'essai « sauvegarde → restauration » compare tout,
   il attrapera l'oubli de l'étape 2.
5. `doc_pour_agents/schema_bdd.md`.

## Un exercice

1. `assets/js/vues/exercice.js` : entrée dans `MODES`, id dans `GROUPES_MODES` ;
   sa phrase dans `PROMESSES` de `vues/reviser.js` (carte de l'accueil).
2. Si nouvelle présentation : brique dans `masu.js` / `composants.js`, style
   section « Exercice » de `assets/css/nihonjo.css`.
3. `tests/parcours_navigateur.py` : son passage.
4. `doc_pour_agents/exercices.md` : une ligne au tableau.

## Un écran

1. `assets/js/vues/<nom>.js` : `export function afficher(racine)`, nettoyage
   renvoyé si quelque chose est posé hors de `racine`.
2. `assets/js/app.js` : import, `VUES`, `ONGLET`.
3. S'il a un onglet : lien `data-onglet` / `data-icone` dans `index.html`
   (et passer la grille du téléphone de 4 à 5 colonnes : `.navigation`, section
   « Téléphone » du CSS).
4. CSS : une section à son nom dans `assets/css/nihonjo.css`.
5. `doc_pour_agents/architecture.md` : ligne au tableau des vues.

## Rendre quelqu'un administrateur (23/10)

- Avant sa première connexion : son adresse dans `administrateurs` de
  `api/config.local.php` **sur le serveur** (jamais dans `config.php` versionné).
- Compte déjà créé : menu du compte → « Gérer les comptes » → « Nommer
  administrateur » (écran depuis le 24/10 ; il reste toujours au moins un
  administrateur).

## Discord (24/10)

- Le bouton n'apparaît que si `discord.client_secret` est renseigné :
  `.env` (`NIHONJO_DISCORD_CLIENT_SECRET=…`, Docker) ou `api/config.local.php`
  (`'discord' => ['client_secret' => '…']`, en ligne). Jamais dans git, jamais
  lu par un agent (il est aussi dans le `.env` de deckolector).
- Chaque adresse du site doit avoir son `…/api/discord.php` dans le portail
  Discord (OAuth2 → Redirects) — sinon « Invalid OAuth2 redirect_uri ».
- Tester sans Discord : `fauxDiscord` dans `tests/api_test.php`.

## Une lecture de kana acceptée de plus

`assets/js/donnees/syllabaires.js`, `GROUPES` : ajouter la variante **après**
la première (la première est celle affichée). Le katakana suit seul.
Vérifier : `tests/parcours_navigateur.py`, section « Jeu des kana ».

## Une couleur, un jeton de style

`assets/css/nihonjo.css` : `:root` **et** les deux blocs sombres (`@media
(prefers-color-scheme: dark)` et `:root[data-theme="sombre"]`) — puis
`CHARTE_GRAPHIQUE.md`.

## Une préférence (réglage, filtre, choix gardé) — dans la base

1. `api/lib/Depot.php` : la clé dans `CLES_PREFERENCES` (sinon 400
   « Préférence inconnue »).
2. Le front : `preference('ma_cle', defaut)` / `ecrirePreference('ma_cle', valeur)`
   (`etat.js`), valeurs par défaut fusionnées à la lecture (modèle :
   `reglagesEcriture` de `vues/liste.js`). **Jamais** `memoire` ni
   `localStorage` (règle n° 11 de `CLAUDE.md`).
3. Ligne au tableau « Les préférences » de `doc_pour_agents/architecture.md`.

## Un chapitre ou un mot « du compte » : penser à « Mes mots »

Une écriture qui crée ou range un mot du compte appelle `lierMesMots` ; une
qui retire garde les mots du compte dans « Mes mots ». Essai à deux comptes
dans `tests/api_test.php` (section « Mes mots, gestion des chapitres »).

## Avant de rendre la main

1. `php -l` des fichiers PHP touchés ; `php tests/api_test.php`.
2. `node --check` des fichiers JS touchés.
3. Si l'interface a changé et qu'un navigateur est disponible :
   `tests/parcours_navigateur.py` sur une base jetable, serveur lancé avec
   `NIHONJO_AUTH=dev` (voir son en-tête).
4. `CHANGEMENTS_AAAA-MM.md` (le pourquoi) et la page de `doc_pour_agents/`.
5. Réponse à José : ce qui marche, ce qu'il doit relancer
   (`lancer_nihonjo.bat` après tout changement de code), ce qui n'a
   PAS été vérifié. Puis les quatre questions de `LISEZ-MOI.md`.
