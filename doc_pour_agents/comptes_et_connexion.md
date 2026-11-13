---
title: "Comptes et connexion (Google et Discord, comme Odyvresse)"
domain: "Sécurité"
related_files:
  - "assets/js/auth.js"
  - "assets/js/api.js"
  - "assets/js/app.js"
  - "assets/js/session.js"
  - "assets/js/vues/compte.js"
  - "assets/js/vues/comptes.js"
  - "api/lib/Authentification.php"
  - "api/lib/Depot.php"
  - "api/index.php"
  - "api/discord.php"
  - "api/config.php"
version: "2.0 — 24/10/2026"
---

> 🧪 **Spécification exécutable** : `tests/api_test.php` (sections « Comptes »,
> « Jetons Firebase », « Sessions et Discord », « Routeur ») et
> `tests/parcours_navigateur.py` (« Connexion », « Second compte », « Comptes »).

# Comptes et connexion

## Le principe

Sur le modèle d'Odyvresse (`odyvresse_all/compte-auth.service.ts`, écrans
`connection` et `profil`) : on **crée un compte** (s'inscrit), puis on **se
connecte** — avec **Google** ou avec **Discord**. Pas de mot de passe propre
à Nihonjo.

| | Google | Discord |
|---|---|---|
| qui mène la danse | le navigateur : Firebase Authentication, projet « odyvresse » (le même qu'Odyvresse), `signInWithPopup` | le **serveur** : OAuth2 « authorization code » (`api/discord.php`), droits `identify email` comme deckolector |
| ce qui prouve l'identité à chaque appel | le jeton Firebase (JWT, 1 h, renouvelé par le SDK) dans l'en-tête **`X-Nihonjo-Jeton`** | un **cookie de session signé** `nihonjo_session` (HttpOnly, 30 jours) |
| uid en base | l'uid Firebase | `discord:<id Discord>` |
| actif | toujours (mode `firebase`) | si `discord.client_id` ET `discord.client_secret` sont renseignés |

Un compte Google qui joue à Odyvresse est donc reconnu par Nihonjo — mais il
doit **créer son compte Nihonjo** une fois (un clic), comme sur Odyvresse
(`/subscribe/google`), où une connexion sans inscription répond « compte non
trouvé ».

```
navigateur                                    serveur (PHP)
──────────                                    ─────────────
« Se connecter avec Google »
  seConnecterGoogle() → signInWithPopup
  appeler('donnees') ── X-Nihonjo-Jeton ──▶ Authentification::utilisateur
                                             └ VerificateurJetonFirebase::verifier
                                             └ Comptes::pourIdentite(creer = false)
                                                 connu   → son compte
                                                 inconnu → 404 compte_inexistant {email, nom}
  ◀── 404 → écran « Pas encore de compte Nihonjo » → « Créer mon compte »
  appeler('compte.creer') ───────────────▶ Authentification::inscrire → Comptes::pourIdentite(creer = true)

« Se connecter avec Discord »
  location → api/discord.php?intention=connexion
                                          ─▶ cookie nihonjo_discord (state signé, 10 min)
                                          ─▶ 302 discord.com/oauth2/authorize
  (Discord)  ──────────────────────────────▶ api/discord.php?code=…&state=…
                                             state = cookie ? → code → jeton d'accès → /users/@me
                                             Comptes::pourIdentite(discord:<id>)
                                               connu (ou inscription) → cookie nihonjo_session → 302 #/reviser
                                               inconnu → cookie nihonjo_attente (15 min) → 302 #/connexion?discord=inexistant
  demarrer() : `discord.attente` → écran « Pas encore de compte » → `compte.creer` (lit nihonjo_attente)
```

## Les actions

| action | compte requis | ce qu'elle fait |
|---|---|---|
| `sante` | non | `auth: {mode, firebase, fournisseurs: {google, discord}}` : ce que l'écran de connexion propose |
| `session` | non | `{connecte, utilisateur?}` — la sonde du démarrage (une session Discord est un cookie HttpOnly, invisible au code). Répond 200 dans les deux cas : un 401 attendu salirait la console |
| `compte.creer` (POST) | non | l'inscription : l'identité de la requête (jeton Google, identité Discord en attente, adresse du mode dev) devient un compte → `{utilisateur, nouveau}`. Déjà inscrit : simple connexion, `nouveau: false` |
| `deconnexion` (POST) | non | efface les cookies de session ; toujours un succès. (Google se déconnecte dans le navigateur.) |
| `discord.attente` | non | l'identité Discord en attente d'inscription (nom, adresse, photo) ou `null` |
| `api/discord.php` | non | les deux étapes de Discord, des **redirections** (pas du JSON) |
| `moi`, `donnees` | oui | le compte : `id, nom` (affiché : pseudo sinon nom du fournisseur), `nom_fournisseur, pseudo, email, photo, fournisseur, role, cree_le` — jamais l'uid |
| `compte.profil` | oui | « Mon compte » : le compte + `contenu` (mots, chapitres, acquis, à revoir, kana acquis) |
| `compte.modifier` (POST `{pseudo}`) | oui | pseudo choisi ; vide = revenir au nom du fournisseur |
| `compte.supprimer` (POST `{confirmation: 'supprimer'}`) | oui | supprime le compte et tout ce qui est à lui, puis la session. Refusé sur un poste `aucune`, et au dernier administrateur (409) |
| `comptes.lister`, `comptes.role` (`{id, role}`), `comptes.supprimer` (`{id}`) | administrateur (403 sinon) | « Gérer les comptes ». Pas soi-même par `comptes.supprimer` (« passez par Mon compte ») |

## Les règles des comptes (`Comptes::pourIdentite`)

| situation | connexion | inscription (`compte.creer`, Discord `intention=inscription`) |
|---|---|---|
| identité connue (uid) | son compte ; e-mail, nom du fournisseur, photo rafraîchis — **pas le pseudo** | pareil (`nouveau: false`) |
| inconnue, **compte initial** (id 1, `uid` NULL) pas encore réclamé | elle **réclame le compte initial** : administratrice, retrouve les données d'avant les comptes | pareil |
| inconnue sinon | **404 `compte_inexistant`** (`details`: email, nom, fournisseur) — rien n'est créé | nouveau compte **membre** |
| adresse dans `administrateurs` (`api/config.local.php`) | administrateur ; et SEULE une de ces adresses peut réclamer le compte initial | pareil |

⚠️ Sans liste `administrateurs`, **la première identité venue réclame le
compte initial** (et ses données). Sur une base neuve en ligne, José doit se
connecter le premier — ou renseigner `administrateurs` avant la mise en ligne.

⚠️ **Une adresse Discord non vérifiée n'est pas gardée** (`verified` faux →
e-mail vide) : sinon n'importe qui pourrait déclarer l'adresse de José chez
Discord et devenir administrateur par la liste `administrateurs`.

Il reste **toujours au moins un administrateur** : ni retirer le rôle du
dernier, ni le supprimer (409 `dernier_admin`).

Supprimer un compte efface ses mots, chapitres, progression, kana et
préférences par `ON DELETE CASCADE` sur `utilisateur` (actif grâce à
`Base::ouvrir`, règle n° 3 de `CLAUDE.md`). Le cours et les autres comptes
ne bougent pas ; le compte Google ou Discord non plus.

## ⚠️ Pourquoi un en-tête maison et pas `Authorization: Bearer`

| raison | conséquence évitée |
|---|---|
| le `.htaccess` racine fait une authentification **Basic** : le navigateur envoie déjà `Authorization: Basic …` | un `Bearer` la remplacerait, Apache refuserait la requête (401 d'Apache, pas de PHP) |
| en PHP-CGI / FPM (courant sur mutualisé), Apache **retire** `Authorization` avant PHP | `$_SERVER['HTTP_AUTHORIZATION']` vide, sans erreur |

`X-Nihonjo-Jeton` arrive dans `$_SERVER['HTTP_X_NIHONJO_JETON']` partout, et
un en-tête maison force la vérification CORS préalable (aucune requête
forgée d'un autre site ne peut le porter).

## Vérifier un jeton Google sans bibliothèque (`VerificateurJetonFirebase`)

Pas de Composer sur l'hébergement : la vérification est écrite à la main,
comme `verifyIdToken` de firebase-admin :

| contrôle | refus |
|---|---|
| trois morceaux base64url, JSON lisibles | 401 « illisible » |
| `alg` = **RS256** exactement (jamais l'algorithme que le jeton annonce) | 401 « algorithme » — ferme le jeton `alg: none` |
| `kid` présent parmi les certificats publics de Google | 401 « certificat inconnu » |
| `openssl_verify` de la signature | 401 « signature » |
| `iss` = `https://securetoken.google.com/<projectId>`, `aud` = `<projectId>` | 401 « iss » / « aud » |
| `exp` dans le futur ; `iat`, `auth_time` pas dans le futur (5 min de tolérance) | 401 « expirée » / « date » |
| `sub` non vide | 401 « sujet » |

Certificats : `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`,
gardés dans `data/certificats_firebase.json` le temps que dit leur
`Cache-Control` (quelques heures). Si Google ne répond pas, un cache périmé
sert encore. ⚠️ L'hébergement doit autoriser les requêtes sortantes en
HTTPS (curl ou `allow_url_fopen`) : sinon personne ne se connecte, avec le
message « Impossible de joindre Google… ». Même chose pour Discord
(`discord.com/api`).

## Discord, le détail (`ConnexionDiscord`, `Authentification::debutDiscord` / `retourDiscord`)

- **Adresse de retour** : `<origine>/api/discord.php`, un FICHIER sans
  paramètre. ⚠️ Discord compare l'adresse de retour octet pour octet à celles
  déclarées dans son portail : une adresse à `?action=` est une source
  d'« Invalid OAuth2 redirect_uri ». Déduite de la requête
  (`ConnexionDiscord::retourParDefaut`), forçable par `discord.retour`.
- **`state`** : 16 octets aléatoires, gardés dans le cookie signé
  `nihonjo_discord` (10 min) et comparés au retour (`hash_equals`). Un retour
  sans aller, ou avec un autre `state` → `#/connexion?discord=expire`.
- **Raisons du retour** (`#/connexion?discord=<raison>`, lues par
  `retourDiscord()` dans `app.js` puis effacées de l'adresse) : `refuse`
  (l'utilisateur a dit non chez Discord), `expire`, `erreur` (Discord n'a pas
  répondu, code refusé : détail dans le journal PHP), `absent` (pas
  configuré), `inexistant` (pas de compte : inscription proposée). Jamais de
  donnée personnelle dans l'adresse.
- **`prompt=none`** : un compte qui a déjà autorisé l'application n'est pas
  redemandé.
- La couche HTTP est **injectable** (`ConnexionDiscord(…, $http)`) : les essais
  jouent un faux Discord (`fauxDiscord` dans `tests/api_test.php`).

## Les cookies signés (`JetonsSignes`, `Cookies`)

| cookie | contenu | durée |
|---|---|---|
| `nihonjo_session` | `{t: session, c: id du compte, u: uid}` | 30 jours |
| `nihonjo_discord` | `{t: discord, etat, intention}` | 10 minutes |
| `nihonjo_attente` | `{t: attente, identite}` (Discord, compte à créer) | 15 minutes |

HMAC-SHA256 avec la clé `data/secret_sessions.key` (64 caractères, créée au
premier besoin, à côté de la base ; `chemin_secret`). HttpOnly, SameSite=Lax,
Secure en HTTPS.

- **Pourquoi pas les sessions PHP** : sur un mutualisé, leur ramasse-miettes
  (`session.gc_maxlifetime`, 24 min par défaut) efface une connexion qu'on
  veut garder des semaines. Un jeton signé ne dépend d'aucun stockage.
- ⚠️ **La session porte l'uid, pas seulement l'id** (`Comptes::deSession`) :
  SQLite peut redonner l'id d'un compte supprimé au compte suivant ; une
  vieille session ouvrirait alors celui d'un autre (essai « session Discord :
  un compte supprimé dont l'id est redonné… »).
- Perdre la clé déconnecte les comptes Discord, rien de plus. Elle n'est ni
  dans git ni dans l'image Docker (`.gitignore`, `.dockerignore`).
- Ces cookies ne contredisent pas la règle n° 11 de `CLAUDE.md` (« rien de
  l'utilisateur dans le navigateur ») : ce sont des preuves de connexion,
  comme la session Firebase, pas des données du compte.

## Ce qu'un compte voit et modifie

| | voit | modifie |
|---|---|---|
| mots du cours (`proprietaire_id` NULL) | tous | administrateur |
| ses mots | lui seul | lui |
| chapitres du cours | tous | administrateur |
| ses chapitres (clé `nom@id`) | lui seul | lui |
| progression, jeu des kana | la sienne | la sienne |
| son pseudo, son compte (suppression) | lui | lui |
| les autres comptes (liste, rôle, suppression) | administrateur | administrateur |
| sauvegarde / restauration complète | — | administrateur |
| import « dans le cours » (`cible: cours`) | — | administrateur |

Un membre peut ranger un mot du cours dans SES chapitres (sans toucher au
cours) ; il ne peut ni le corriger, ni lui ajouter un thème, ni le rattacher
à un chapitre du cours (`Depot::lierChapitres`).

## Les trois modes (`Authentification::mode`)

| mode | réglage | usage |
|---|---|---|
| `firebase` | défaut (`api/config.php`) — Google, et Discord s'il est configuré | en ligne, et en local (Docker) |
| `aucune` | `NIHONJO_AUTH=aucune` (commenté dans `docker-compose.yml`), ou `'authentification' => 'aucune'` dans `api/config.local.php` | poste sans réseau : un seul compte, le compte initial, sans écran de connexion ; « Mon compte » marche (pseudo), la suppression non |
| `dev` | **uniquement** `NIHONJO_AUTH=dev` (variable d'environnement) | tests automatiques : l'adresse envoyée dans `X-Nihonjo-Dev-Email` suffit ; « Se connecter » et « Créer un compte » comme en vrai |

⚠️ `dev` croit le client sur parole : c'est pourquoi aucun fichier ne peut
l'activer, seulement l'environnement du processus PHP (essai
« mode dev seulement par la variable d'environnement »).

## Côté interface

| écran | où | quoi |
|---|---|---|
| connexion | `afficherConnexion` (`app.js`) | deux groupes, « Se connecter » et « Créer un compte », Google + Discord (s'il est configuré) ; un message en tête (déconnexion, retour de Discord) |
| pas encore de compte | `afficherCompteInexistant` | photo, nom, adresse de l'identité ; « Créer mon compte » (`compte.creer`), « Utiliser un autre compte » |
| Mon compte | `#/compte`, `vues/compte.js` | photo, nom, adresse, rôle, fournisseur, cinq chiffres, pseudo, export / import, se déconnecter, supprimer (avec confirmation) |
| Gérer les comptes | `#/comptes`, `vues/comptes.js` | administrateur : chaque compte, son contenu, ses dates ; nommer / retirer administrateur, supprimer |
| menu du compte | `majMenuCompte` | Mon compte, Importer ou exporter, Gérer les comptes et Sauvegarde complète (administrateur), Se déconnecter |

- `demarrer` : `sante` → `initialiserConnexion` (SDK Firebase ; une panne du
  SDK n'empêche pas Discord) → retour de Discord ? → sinon, sans session
  Google, la sonde `session` (Discord) → `entrer` ou l'écran de connexion.
- `api.js` émet `EVENEMENT_DECONNEXION` sur un **401** (session expirée,
  compte supprimé) et `EVENEMENT_COMPTE_INEXISTANT` sur un 404
  `compte_inexistant` (compte supprimé par un administrateur pendant qu'on
  s'en servait) ; `{ silencieux: true }` les retient (sonde, inscription).
  L'erreur levée porte `code`, `details`, `statut`.
- Se déconnecter = `terminerSession` (`session.js`) : Firebase `signOut`,
  `deconnexion` au serveur, `oublierCompte()` (rien du compte précédent ne
  reste en mémoire), puis l'écran de connexion.
- Fenêtre Google bloquée → `signInWithRedirect`, puis `getRedirectResult` au
  retour. `auth/unauthorized-domain` : message qui dit quoi ajouter dans la
  console Firebase (`messageFirebase`).
- Le bouton Discord porte une **bulle générique** (`icone('bulle')`), pas le
  logo de Discord.

### Dans l'application Android (Capacitor, 25/10)

Comme Odyvresse (`deckolector/doc_pour_agents/connexion_google_mobile.md`) :
la fenêtre Google ne marche pas dans une WebView (Google la refuse, et la
fenêtre ne revient jamais). `estApplication()` (`plateforme.js`) → 
`seConnecterGoogleNatif` (`auth.js`) : greffon `SocialLogin` (`initialize`
avec l'identifiant client **« Web »** du projet, `login` **sans `scopes`**)
→ jeton d'identité Google → `signInWithCredential` → la session Firebase,
puis tout continue comme sur le site (`X-Nihonjo-Jeton`). Se déconnecter
appelle aussi `SocialLogin.logout` (sinon Android rouvre le même compte).
Pas de Discord dans l'application (retour par le site et cookie). Le
serveur : CORS et mot de passe Basic, `deploiement.md`.

## À faire une fois (José)

1. **Firebase** — projet « odyvresse » → Authentication → Paramètres →
   **Domaines autorisés** → ajouter `nihonjo.odyvresse.com` (`localhost` y est
   d'office). Si la clé d'API web est restreinte par référent HTTP dans
   Google Cloud (Identifiants), y ajouter aussi `https://nihonjo.odyvresse.com/*`.
2. **Discord** — <https://discord.com/developers/applications>, l'application
   d'Odyvresse (`client_id` 1509628157962227893, déjà dans `api/config.php`) →
   OAuth2 → **Redirects** → ajouter les deux adresses :
   `http://localhost:8080/api/discord.php` et
   `https://nihonjo.odyvresse.com/api/discord.php`.
3. **Le secret Discord** (OAuth2 → Client Secret ; le même que celui
   d'Odyvresse) — jamais dans git :
   - en local : un fichier `.env` à la racine du projet, une ligne
     `NIHONJO_DISCORD_CLIENT_SECRET=…`, puis relancer `lancer_nihonjo.bat` ;
   - en ligne : `api/config.local.php`,
     `'discord' => ['client_secret' => '…']`.

   Sans secret, le bouton Discord n'apparaît pas ; Google suffit.

Détail du déploiement : `doc_pour_agents/deploiement.md`.
