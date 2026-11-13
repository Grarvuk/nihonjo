---
name: comptes-et-connexion-nihonjo
description: Toucher à la connexion de Nihonjo (Google/Firebase, Discord, jeton, cookie de session, écran de connexion, inscription « Créer un compte »), aux comptes (Mon compte, pseudo, suppression, Gérer les comptes) ou aux droits (administrateur, cours commun, mots de chaque compte) ; erreur 401 / 403 / 404 compte_inexistant, « Ce site n'est pas autorisé », « Invalid OAuth2 redirect_uri », un compte qui voit les mots d'un autre.
---

# Comptes et connexion

Référence : `doc_pour_agents/comptes_et_connexion.md` (les deux flux, les
actions, les cookies, les trois modes). Décision : `tickets/decisions/D-002-comptes-firebase.md`.
Modèle suivi : Odyvresse (`odyvresse_all/compte-auth.service.ts`, écrans
`connection` et `profil` ; Discord de `deckolector/doc_pour_agents/connexion_utilisateur.md`).

## Ce qui ne se devine pas

| règle | pourquoi |
|---|---|
| On **s'inscrit** (`compte.creer`) avant de se connecter ; une connexion sans compte répond **404 `compte_inexistant`** et ne crée rien | comme Odyvresse ; et un compte ne doit pas naître d'un clic sur « Se connecter » |
| Le jeton Google voyage dans **`X-Nihonjo-Jeton`**, jamais `Authorization` | le `.htaccess` racine (mot de passe Basic d'OVH) occupe `Authorization`, et PHP en CGI ne le reçoit pas : le jeton disparaîtrait sans erreur, tout répondrait 401 |
| Le jeton se vérifie **en PHP, sans bibliothèque** (`VerificateurJetonFirebase`) | pas de Composer sur l'hébergement ; RS256 seul (jamais `alg` lu dans le jeton pour choisir l'algorithme) |
| Discord : l'adresse de retour est **`api/discord.php` sans paramètre** | Discord compare l'adresse octet pour octet à celles du portail : un `?action=` donne « Invalid OAuth2 redirect_uri » |
| La session Discord est un **cookie signé** (`JetonsSignes`), pas une session PHP | le ramasse-miettes des sessions d'un mutualisé (24 min) déconnecterait sans prévenir |
| ⚠️ La session porte l'**uid** et `Comptes::deSession` le compare | SQLite peut redonner l'id d'un compte supprimé : une vieille session ouvrirait le compte d'un autre |
| ⚠️ Une adresse Discord **non vérifiée** est jetée | sinon on déclare l'adresse de José chez Discord et la liste `administrateurs` vous fait administrateur |
| Le `client_secret` Discord n'est **jamais** dans git : `.env` (Docker) ou `api/config.local.php` (en ligne) | c'est le secret de l'application d'Odyvresse |
| Le mode `dev` (adresse crue sur parole) ne s'active **que** par `NIHONJO_AUTH=dev` | réglable par fichier, il suffirait d'un `config.local.php` oublié sur le serveur pour que n'importe qui se dise José |
| Le **compte initial** (id 1, `uid` NULL) est réclamé par la **première** identité (connexion ou inscription), ou par une adresse de `administrateurs` | c'est lui qui porte les données de José d'avant les comptes (migration 2) |
| Il reste **toujours un administrateur** (`Comptes::exigerAutreAdmin`, 409 `dernier_admin`) | sinon plus personne ne modifie le cours ni ne gère les comptes |
| Toutes les requêtes sur `utilisateur` sont dans `Comptes` ; `Depot` reçoit le compte et filtre **tout** | voir la règle n° 9 de `CLAUDE.md` et le piège 0 du skill `api-php-sqlite-nihonjo` |
| Ni `moi` ni `comptes.lister` ne renvoient l'**uid** | il identifie la personne chez Google / Discord |
| Dans l'**application Android** (Capacitor), Google passe par le greffon `SocialLogin` puis `signInWithCredential` (`seConnecterGoogleNatif`), jamais `signInWithPopup` ; identifiant client « **Web** » ; **jamais `scopes`** ; `logout` natif à la déconnexion | la fenêtre ne revient jamais d'une WebView, et Google la refuse ; les trois pièges vécus sur Odyvresse (`connexion_google_mobile.md`) |
| L'origine de l'application (`https://odyvresse.com`) est écrite dans **trois** fichiers : `capacitor.config.json` (`server.hostname`), `api/config.php` (`origines_application`), `api/.htaccess` | une seule qui diffère : CORS refusé ou mot de passe Basic demandé, et l'application affiche « Le serveur ne répond pas » |
| Pas d'`Access-Control-Allow-Credentials` | l'application s'identifie par le jeton ; un cookie (Discord) ouvrirait l'API aux requêtes forgées depuis cette origine |

## Les droits

| qui | lit | modifie |
|---|---|---|
| tout compte | le cours + ses mots, ses chapitres, sa progression, ses kana, ses **préférences**, son profil | ses mots et chapitres ; ranger un mot du cours dans **ses** chapitres ; son pseudo ; supprimer son compte. Son « Mes mots » contient tous ses mots (imposé) |
| administrateur | pareil + la liste des comptes | en plus : les mots et chapitres du cours, « Ajouter au cours », sauvegarde complète, restauration, rôles et suppression des autres comptes |

Le front cache ce qui est réservé (`estAdmin()`, `m.modifiable`), mais **le
serveur décide** : `Depot::exigerAdmin` → 403. Toute nouvelle écriture sur le
cours ou sur les comptes commence par `exigerAdmin`.

Rendre quelqu'un administrateur : « Gérer les comptes » (`#/comptes`) →
« Nommer administrateur ». Ou, avant sa première connexion, son adresse
dans `administrateurs` (`api/config.local.php`).

## Ajouter une action sur les comptes

1. La requête SQL dans `Comptes` (`Authentification.php`), filtrée par l'id
   reçu ; jamais l'uid dans ce qui part au navigateur.
2. La méthode dans `Depot` (qui connaît le compte connecté et `exigerAdmin`).
3. La route dans `Api::routes` — sauf si elle se passe de compte : alors
   dans le `switch` d'`api/index.php`, AVANT `Authentification::utilisateur`.
4. Essai dans `tests/api_test.php` (section « Comptes » ou « Sessions et
   Discord » ; `fauxDiscord` simule Discord), puis le parcours
   (`tests/parcours_navigateur.py`, section « Comptes »).

## Symptômes et causes

| symptôme | cause probable |
|---|---|
| « Ce site n'est pas autorisé à utiliser la connexion Firebase » (`auth/unauthorized-domain`) | le domaine manque dans la console Firebase → Authentication → Domaines autorisés |
| fenêtre Google qui s'ouvre puis rien | fenêtre surgissante bloquée : `auth.js` repasse en redirection, vérifier la console |
| « Pas encore de compte Nihonjo » pour José, alors qu'il en avait un | il s'est connecté avec un AUTRE fournisseur (Discord au lieu de Google : uid différent, compte différent) |
| 401 partout après une connexion Google réussie | en-tête perdu (proxy, `Authorization` réutilisé), horloge du serveur décalée (`iat` dans le futur), `projectId` différent entre `config.php` et le jeton |
| « Invalid OAuth2 redirect_uri » chez Discord | l'adresse `…/api/discord.php` de ce site n'est pas dans le portail Discord (OAuth2 → Redirects) |
| retour de Discord → « Discord n'a pas pu confirmer la connexion » | secret faux, ou le serveur ne joint pas `discord.com/api` : journal PHP `[nihonjo] retour Discord : …` |
| retour de Discord → « … a pris trop de temps » | cookie `nihonjo_discord` absent (plus de 10 min, autre navigateur, cookies bloqués) |
| pas de bouton Discord | `discord.client_secret` vide (`sante` → `auth.fournisseurs.discord: false`) |
| déconnecté de Discord partout d'un coup | `data/secret_sessions.key` recréé (perdu, autre serveur) |
| « Impossible de joindre Google… (certificats) » | PHP ne peut pas sortir vers `www.googleapis.com` (hébergement, conteneur sans réseau) ; en local, repli : mode `aucune` (commenté dans `docker-compose.yml`) |
| un compte voit les mots d'un autre | une requête de `Depot` sans `VISIBLE_MOT` / `utilisateur_id = :u` |
| « La base ne répond pas » au lieu de l'écran de connexion | `sante` échoue : PHP ou SQLite, pas la connexion |

## Vérifier

- `php tests/api_test.php` : jetons (signature, `aud`, `iss`, expiration,
  `alg` refusé), comptes (inscription, `compte_inexistant`, réclamation,
  administrateurs, pseudo, suppression, dernier administrateur), sessions et
  Discord (faux Discord), isolation entre deux comptes, droits.
- `NIHONJO_AUTH=dev … php -S` puis `tests/parcours_navigateur.py` : écran de
  connexion, compte inexistant puis créé, Mon compte, Gérer les comptes,
  suppression, second compte, déconnexion. Le parcours retire de la console
  les refus **voulus** (`oublier_refus`) : Chrome y écrit chaque 403 / 404.
- ⚠️ La vraie connexion Google et le vrai Discord **ne sont pas éprouvés dans
  le bac à sable** (ni Google ni Discord n'y répondent) : `carnet_agent/en_suspens.md`.
