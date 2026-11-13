# Nihonjo — description pour Manus

*Mise à jour le 24/10/2026. La même description, à jour, est en ligne :
https://claude.ai/artifact/HWraqXxoJtgoe4Jcas1E5A*

Nihonjo est une application web de révision du vocabulaire japonais. **Les
comptes utilisateurs sont implémentés** (23-24/10/2026) sur le modèle
d'Odyvresse : on **crée un compte** puis on **se connecte**, avec **Google**
(Firebase, le même projet qu'Odyvresse) ou **Discord** ; une page « Mon
compte » et, pour l'administrateur, « Gérer les comptes ». Ce document décrit
l'existant, pour le compléter et le vérifier, pas pour le refaire.

## Ce qu'est Nihonjo

Une application de révision faite pour José, qui apprend le japonais avec un
manuel, et ouverte à d'autres personnes depuis l'ajout des comptes. En ligne
sur `nihonjo.odyvresse.com` (sous-domaine d'Odyvresse, hébergement mutualisé
OVH) ; en local sous Docker, port 8080.

- **Le cours** : 1 034 mots, communs à tous les comptes — le manuel page par
  page (pages 45 à 219), les jours, mois et nombres, deux niveaux de kanjis.
- **Les mots de chacun** : ajoutés un par un (formulaire) ou importés en lot
  (fichier JSON, ou la réponse d'une IA collée telle quelle, avec un texte
  tout prêt à lui donner). Chaque compte a un chapitre « Mes mots » qui
  contient tous ses mots.
- **Des chapitres à soi** : un gestionnaire pour composer ses chapitres à
  partir du cours, d'un thème ou de ses mots.
- **Les exercices**, tous lancés d'un toucher depuis l'accueil : français →
  japonais, japonais → français, mots à trous (kana, kanji), sens et lecture
  des kanjis, écriture répétée, **Paires** (glisser un mot sur son autre
  écriture, grille 3 × 6).
- **Les kana** : tableaux des hiragana et katakana, et un jeu où l'on écrit
  la lecture en rōmaji.
- **La progression** par mot et par caractère (nouveau, à revoir, acquis), et
  les réglages, sont **dans la base, rattachés au compte** : rien de
  l'utilisateur ne reste dans le navigateur.

## La pile et le code

HTML, CSS et JavaScript **sans framework ni étape de compilation** (modules
ES servis tels quels), une API PHP à un seul point d'entrée, une base SQLite.
Tout le code, les noms et les textes sont en français.

| couche | technologie | fichiers |
|---|---|---|
| interface | modules ES natifs, une vue par écran | `index.html`, `assets/js/app.js` (routage par ancre `#/vue`, écrans de connexion), `assets/js/vues/*.js`, `assets/css/nihonjo.css` |
| appels réseau | un seul appelant de `fetch` | `assets/js/api.js` → `appeler(action, corps)`, joint le jeton de connexion |
| connexion (navigateur) | Firebase Authentication 10.12.2 (Google), SDK chargé à la demande depuis gstatic ; départ vers Discord | `assets/js/auth.js`, `assets/js/session.js` (déconnexion) |
| API | PHP, syntaxe compatible 7.4, actions JSON | `api/index.php`, `api/lib/Api.php` (table des actions), `api/lib/Depot.php` (tout le SQL du vocabulaire, filtré par compte) |
| comptes, jetons, Discord | PHP sans bibliothèque (pas de Composer sur le mutualisé) | `api/lib/Authentification.php`, `api/discord.php` (les redirections OAuth2) |
| base | SQLite via PDO, schéma v4, migrations numérotées | `api/lib/Base.php`, `data/nihonjo.sqlite` |
| local | Docker `php:8.3-apache` | `Dockerfile`, `docker-compose.yml`, `lancer_nihonjo.bat` |
| en ligne | OVH mutualisé, dossier `www/nihonjo/`, envoi FTP | `doc_pour_agents/deploiement.md` |

## Comptes et connexion : ce qui existe

Le modèle est Odyvresse (`odyvresse_all/compte-auth.service.ts`, écrans
`connection` et `profil` ; Discord de deckolector).

**L'écran de connexion** a deux groupes : « Se connecter » et « Créer un
compte », chacun avec Google et (s'il est configuré) Discord.

| | Google | Discord |
|---|---|---|
| qui mène la danse | le navigateur : Firebase, projet « odyvresse », `signInWithPopup` (repli en redirection) | le serveur : OAuth2 « authorization code », `api/discord.php`, droits `identify email` |
| preuve d'identité à chaque appel | le jeton Firebase (1 h, renouvelé seul) dans l'en-tête **`X-Nihonjo-Jeton`** | un cookie de session signé HMAC (`nihonjo_session`, HttpOnly, 30 jours) |
| vérification | en PHP (`VerificateurJetonFirebase`) : RS256 seul, certificats publics de Google en cache, `iss`, `aud`, `exp`, `iat`, `sub` | `state` anti-rejeu dans un cookie signé ; code → jeton d'accès → profil `/users/@me` ; adresse non vérifiée jetée |
| uid en base | uid Firebase | `discord:<id>` |

1. Au démarrage, `app.js` appelle l'action publique `sante` (mode de
   connexion, configuration web Firebase, fournisseurs disponibles), puis
   `session` (y a-t-il une session Discord ?).
2. **Se connecter** avec une identité qui n'a pas de compte Nihonjo :
   l'API répond **404 `compte_inexistant`** sans rien créer ; l'écran « Pas
   encore de compte Nihonjo » propose **« Créer mon compte »**
   (`compte.creer`). C'est le comportement d'Odyvresse.
3. **Créer un compte** : `compte.creer` fait de l'identité un compte
   « membre » (ou retrouve le sien s'il existe déjà).
4. Toutes les requêtes ensuite sont filtrées par ce compte
   (`new Depot($pdo, $compte)`). Un 401 en cours d'usage ramène à l'écran de
   connexion, sans recharger.

**Pourquoi `X-Nihonjo-Jeton` et pas `Authorization: Bearer`** : le
`.htaccess` racine d'OVH fait une authentification Basic (le navigateur
envoie déjà `Authorization`), et PHP en CGI ne reçoit pas cet en-tête. Un
`Bearer` serait perdu sans erreur.

**Pourquoi un cookie signé et pas une session PHP pour Discord** : le
ramasse-miettes des sessions d'un mutualisé (24 min par défaut) déconnecterait
sans prévenir. La session porte l'uid, comparé à chaque requête (un id de
compte supprimé peut être redonné par SQLite).

**Le compte initial** : la ligne `utilisateur` n° 1 porte les données d'avant
les comptes. La **première** identité la réclame et devient administratrice,
sauf si `administrateurs` (liste d'adresses dans `api/config.local.php`, hors
git) dit qui peut la réclamer.

**« Mon compte »** (`#/compte`) : photo, nom, adresse, rôle, d'où vient le
compte, ce qu'il contient (mots ajoutés, chapitres, acquis, à revoir, kana
acquis), un **pseudo** au choix, exporter / importer ses mots, se
déconnecter, **supprimer le compte** (avec confirmation ; tout ce qui est à
lui part, le cours reste).

**« Gérer les comptes »** (`#/comptes`, administrateur) : tous les comptes,
leur contenu et leurs dates ; nommer ou retirer un administrateur ; supprimer
un compte. Il reste toujours au moins un administrateur.

**Trois modes** (`Authentification::mode`) :

| mode | activé par | usage |
|---|---|---|
| `firebase` | défaut | en ligne et en local (Docker) : Google, et Discord si son secret est fourni |
| `aucune` | `NIHONJO_AUTH=aucune` ou `api/config.local.php` | poste sans réseau : un seul compte, pas d'écran de connexion |
| `dev` | **uniquement** la variable d'environnement `NIHONJO_AUTH=dev` | tests automatiques : l'adresse envoyée dans `X-Nihonjo-Dev-Email` suffit. Jamais réglable par fichier |

## Les droits

Le cours est commun et seul un administrateur le modifie ; tout le reste
appartient à chaque compte. L'interface cache ce qui est réservé, mais
**c'est le serveur qui décide** (`Depot::exigerAdmin` → 403).

| | membre | administrateur |
|---|---|---|
| mots et chapitres du cours | lire ; ranger un mot du cours dans ses propres chapitres | modifier, créer, supprimer ; importer « dans le cours » |
| ses mots, ses chapitres | tout | tout |
| « Mes mots » | contient tous ses mots, imposé par le serveur ; ni renommable ni supprimable | pareil |
| progression, jeu des kana, réglages | les siens seulement | les siens seulement |
| son compte (pseudo, suppression) | oui | oui (sauf s'il est le dernier administrateur) |
| les autres comptes (liste, rôle, suppression) | non | oui (« Gérer les comptes ») |
| sauvegarde complète, restauration (toute la base) | non | oui (menu du compte) |

## Les données

Un seul fichier SQLite, schéma v4. La colonne qui décide de tout est
`proprietaire_id` : NULL = le cours, partagé ; un id = ce compte.

| table | une ligne = | propre au compte |
|---|---|---|
| `utilisateur` | un compte : `uid` (Firebase, `discord:<id>`), e-mail, `nom` (du fournisseur), `pseudo` (choisi), `photo`, `fournisseur` (google / discord / dev), rôle `admin` / `membre`. La ligne 1 = le compte initial | — |
| `mot` | un mot : listes JSON `fr`, `jp_kanji`, `jp_kana`, `jp_romaji`, contexte | si `proprietaire_id` non NULL |
| `chapitre` | un chapitre ; clé = le nom pour le cours (`vocabulaire_p_45`), `nom@idCompte` pour un compte (`mes_mots@3`) | si `proprietaire_id` non NULL |
| `categorie` | un groupe de chapitres | commune |
| `mot_chapitre`, `mot_thematique` | les liaisons | via le chapitre |
| `progression` | l'état d'un mot pour un compte | oui, clé (`utilisateur_id`, `mot_id`) |
| `kana_progression` | les compteurs d'un caractère | oui |
| `preference` | un réglage (sélection, filtres, thème…), clés en liste blanche | oui |

Supprimer un compte supprime tout ce qui est à lui (`ON DELETE CASCADE`). Le
schéma ne change que par une **nouvelle** migration ajoutée en fin de
`Base::MIGRATIONS` (numérotées par `PRAGMA user_version`) ; une migration
déjà livrée ne se modifie jamais.

## L'API

Un seul point d'entrée : `api/index.php?action=<nom>`, réponse
`{ "ok": true, "donnees": … }` ou `{ "ok": false, "erreur": "message
affichable", "code"?: "…", "details"?: {…} }` avec le bon code HTTP. Toute
écriture est un POST JSON (sinon 415).

| action | ce qu'elle fait | droits |
|---|---|---|
| `sante` | versions, mode de connexion, configuration Firebase, fournisseurs (Google, Discord) | public |
| `session` | y a-t-il une session ? (200 dans les deux cas) | public |
| `compte.creer` | l'inscription : l'identité de la requête devient un compte | public (identité requise) |
| `deconnexion` | efface la session Discord | public |
| `discord.attente` | l'identité Discord revenue sans compte, le temps de l'inscrire | public |
| `api/discord.php` | l'aller et le retour de Discord (des redirections) | public |
| `donnees`, `moi` | tout ce que le compte voit ; le compte lui-même (jamais l'uid) | compte |
| `compte.profil`, `compte.modifier`, `compte.supprimer` | « Mon compte » : profil et compteurs, pseudo, suppression confirmée | compte |
| `comptes.lister`, `comptes.role`, `comptes.supprimer` | « Gérer les comptes » | admin |
| `mot.enregistrer`, `mot.supprimer` | créer, corriger, supprimer un mot | ses mots ; cours : admin |
| `progression.resultat`, `.definir`, `.fusionner` | résultat d'un exercice, état à la main, fusion d'un fichier | compte |
| `kana.resultat` | résultat du jeu des kana | compte |
| `chapitre.creer`, `.modifier`, `.supprimer`, `.ajouterMots`, `.retirerMots` | le gestionnaire de chapitres | ses chapitres ; cours : admin |
| `preference.ecrire` | un réglage du compte | compte |
| `import.mots` | import en lot (5 000 mots au plus), « Mes mots » imposé | compte ; « dans le cours » : admin |
| `sauvegarde`, `restauration` | toute la base, tous les comptes | admin |

Le détail des corps et réponses : `doc_pour_agents/api.md`.

## Ce qui reste à faire ou à vérifier côté comptes

Le code est écrit et testé (50 essais d'API, dont un faux Discord ; 121
vérifications dans un vrai navigateur), mais **la vraie connexion Google et
le vrai Discord n'ont jamais été joués** : l'agent qui les a écrits
travaillait dans un bac à sable où Google et Discord sont bloqués.

- [ ] **Se connecter avec Google en local** : `lancer_nihonjo.bat`, puis
      http://localhost:8080 → « Se connecter avec Google ». `localhost` est
      autorisé d'office dans Firebase. Le compte de José existe déjà : il
      entre directement.
- [ ] Vérifier que **le conteneur Docker joint `www.googleapis.com`**
      (certificats). Sinon : message « Impossible de joindre Google… ».
- [ ] **Discord** : dans le portail développeur, application d'Odyvresse
      (`client_id` 1509628157962227893) → OAuth2 → Redirects → ajouter
      `http://localhost:8080/api/discord.php` et
      `https://nihonjo.odyvresse.com/api/discord.php`.
- [ ] **Le secret Discord**, jamais dans git : en local, un fichier `.env` à
      la racine (`NIHONJO_DISCORD_CLIENT_SECRET=…`) puis relancer le `.bat` ;
      en ligne, `api/config.local.php` → `'discord' => ['client_secret' => '…']`.
      Sans secret, le bouton Discord n'apparaît pas.
- [ ] **Console Firebase**, projet « odyvresse » → Authentication →
      Paramètres → Domaines autorisés → ajouter `nihonjo.odyvresse.com`. Sans
      cela, en ligne : `auth/unauthorized-domain`.
- [ ] Si la clé d'API web est restreinte par référent (Google Cloud →
      Identifiants) : y ajouter `https://nihonjo.odyvresse.com/*`.
- [ ] **Mettre en ligne** (envoi FTP de `index.html`, `assets/`, `api/`,
      `data/.htaccess` — jamais `data/nihonjo.sqlite`), puis vérifier que PHP
      sur OVH peut sortir en HTTPS vers `www.googleapis.com` et `discord.com`.
- [ ] Avant la mise en ligne : mettre l'adresse de José dans
      `administrateurs` (`api/config.local.php` sur le serveur), pour que
      personne d'autre ne réclame le compte initial.
- [ ] Décider du mot de passe Basic du `.htaccess` racine : tant qu'il est
      là, seuls ceux qui le connaissent atteignent la page de connexion.
- [ ] Essayer sur un vrai téléphone et sur Safari (iOS) : seul Chromium a
      servi aux tests.

Pistes, pas encore demandées : d'autres fournisseurs via Firebase (e-mail,
Apple) passeraient par le même jeton ; relier un compte Google et un compte
Discord de la même personne (aujourd'hui, deux comptes distincts).

## Les règles à respecter dans ce code

Chacune correspond à un piège qui ne lève aucune erreur. La liste complète
est en tête de `CLAUDE.md`.

1. **Toute requête SQL porte le filtre du compte** (`VISIBLE_MOT`,
   `VISIBLE_CHAPITRE`, `utilisateur_id = :u` dans `Depot`). Un oubli montre
   ou modifie les mots d'un autre compte, sans erreur. Tester toute nouvelle
   action à deux comptes.
2. **Le jeton Google voyage dans `X-Nihonjo-Jeton`**, jamais dans
   `Authorization`.
3. **Le mode `dev` ne s'active que par la variable d'environnement**
   `NIHONJO_AUTH=dev` : il croit sur parole l'adresse envoyée.
4. **Le serveur décide des droits** : masquer un bouton ne suffit jamais ;
   toute écriture sur le cours ou sur les comptes commence par `exigerAdmin`.
5. **Le secret Discord n'est jamais dans git** (`.env`, `api/config.local.php`).
6. **« Mes mots » est imposé par le serveur** à chaque mot du compte, même si
   le navigateur envoie autre chose.
7. **Rien de l'utilisateur dans le navigateur** : un réglage nouveau = une
   clé dans `Depot::CLES_PREFERENCES`, jamais `localStorage`.
8. **PHP compatible 7.4** (pas de `match`, de types union, de
   `str_contains`), **pas de Composer**, pas d'UPSERT ni de `RETURNING` en
   SQLite : la version d'OVH n'est pas connue.
9. **Toute connexion SQLite passe par `Base::ouvrir`** (sinon les cascades
   `ON DELETE` sont inactives).
10. **Ne jamais envoyer `data/nihonjo.sqlite` sur OVH** : c'est la base de
    production, de tous les comptes.
11. **Front sans compilation** : pas de npm côté interface ; tout texte venu
    de la base passe par `echapper()` avant `innerHTML`.

## Lancer, tester, et où lire la suite

| quoi | comment |
|---|---|
| lancer en local | double-clic sur `lancer_nihonjo.bat` (Docker Desktop, construction, ouverture de http://localhost:8080) |
| essais de l'API | `php tests/api_test.php` (jetons, comptes, inscription, Discord simulé, isolation entre deux comptes, droits) |
| parcours complet dans un navigateur | `NIHONJO_AUTH=dev NIHONJO_BASE=/tmp/essai.sqlite php -S 127.0.0.1:8765 -t .` puis `python3 tests/parcours_navigateur.py` (Playwright) |
| captures pour juger l'interface | `python3 outils/captures_ecrans.py <dossier>` |

La documentation du projet, à lire avant de toucher aux comptes :

- `CLAUDE.md` et `contexte.md` : les règles et la carte du projet.
- `doc_pour_agents/comptes_et_connexion.md` : la connexion et les comptes en
  détail (les deux flux, les cookies, les actions).
- `doc_pour_agents/api.md`, `doc_pour_agents/schema_bdd.md` : l'API et le
  schéma.
- `doc_pour_agents/deploiement.md` : local, mise en ligne, actions dans les
  consoles Firebase et Discord.
- `.claude/skills/comptes-et-connexion-nihonjo/SKILL.md` : la fiche de
  travail, avec le tableau « symptôme → cause ».
- `tickets/decisions/D-002-comptes-firebase.md` : pourquoi ces choix.
- `carnet_agent/en_suspens.md` : ce qui est livré sans avoir pu être vérifié.
