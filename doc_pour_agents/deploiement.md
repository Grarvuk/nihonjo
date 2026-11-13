---
title: "Lancer en local, mettre en ligne"
domain: "Exploitation"
related_files:
  - "lancer_nihonjo.bat"
  - "construire_version_prod.bat"
  - "creer_application_android.bat"
  - "application_android/capacitor.config.json"
  - "application_android/package.json"
  - "assets/js/plateforme.js"
  - "assets/js/config_application.js"
  - "api/.htaccess"
  - "manifest.webmanifest"
  - "Dockerfile"
  - "docker-compose.yml"
  - "api/config.php"
  - "api/discord.php"
  - "data/.htaccess"
  - ".htaccess"
  - ".env (non versionné)"
version: "3.0 (version de production, application Android) — 25/10/2026"
---

# Lancer et déployer

## En local (Docker, poste de José)

Double-clic sur **`lancer_nihonjo.bat`** : il démarre Docker Desktop s'il ne
répond pas, lance `docker compose up -d --build`, attend que
`api/index.php?action=sante` réponde, puis ouvre http://localhost:8080. À la
main, c'est la même chose :

```
docker compose up -d --build        # puis http://localhost:8080
```

| point | détail |
|---|---|
| image | `php:8.3-apache` (pdo_sqlite, openssl, curl inclus) — la même pile que l'hébergement |
| code | **lu directement dans le dossier** (`index.html`, `assets/`, `api/`, `tests/` montés en lecture seule, 25/10) : une modification se voit au rechargement de la page, sans relancer. Le `.bat` vérifie que le `app.js` servi est celui du dossier. (Avant : copié dans l'image, d'où un ancien code servi le 25/10.) `mod_headers` activé dans le `Dockerfile`, sinon le `no-cache` d'`assets/.htaccess` est ignoré |
| base | **le fichier `data\nihonjo.sqlite` du poste**, dossier `./data` partagé avec le conteneur (25/10) : DB Browser for SQLite ouvre la base vivante. Jusqu'au 25/10 : volume nommé `nihonjo_donnees` ; le `.bat` en recopie la base au premier lancement (si `data\` n'en a pas), le volume reste en secours |
| ⚠️ | ne jamais supprimer ni remplacer `data\nihonjo.sqlite` pendant que le conteneur tourne, ni y **écrire** depuis DB Browser (« Écrire les modifications ») sans avoir fait une sauvegarde complète : c'est la base de tous les comptes. Et ce fichier local ne doit jamais partir par FTP (voir plus bas) |
| connexion | **Google (Firebase)**, comme en ligne : « localhost » est un domaine autorisé d'office ; le conteneur doit joindre `www.googleapis.com` (certificats). Pas de mot de passe : le `.htaccess` racine est exclu de l'image (`.dockerignore`). La première connexion reprend les données existantes (compte initial). Sans réseau : décommenter `NIHONJO_AUTH: aucune` dans `docker-compose.yml`. Le `.bat` affiche « [OK] Connexion : Google » (ou « AUCUNE ») |
| Discord | bouton présent si le **secret** est fourni : fichier `.env` à la racine du projet (hors git, hors image), ligne `NIHONJO_DISCORD_CLIENT_SECRET=…` ; `docker-compose.yml` le passe au conteneur. Adresse de retour à déclarer chez Discord : `http://localhost:8080/api/discord.php` |
| `.htaccess` | ⚠️ **lus** par l'image (`php:apache` règle `AllowOverride All`) — noté à tort « ignorés » jusqu'au 23/10, d'où une demande de mot de passe en local. Le `.htaccess` racine (Basic) est exclu par `.dockerignore` ; ceux de `data/`, `api/`, `assets/` s'appliquent, et le `Dockerfile` ferme en plus `data/`, `api/lib/` et `api/config*.php` |
| essais | `docker compose exec nihonjo-app php tests/api_test.php` |

⚠️ `lancer_nihonjo.bat` doit garder ses fins de ligne **CRLF** (`.gitattributes` :
`*.bat text eol=crlf`) : en LF, `cmd.exe` lit mal les étiquettes `:xxx` et
saute des lignes sans erreur claire.

## En ligne (OVH mutualisé, `nihonjo.odyvresse.com` → `www/nihonjo/`)

Pas de compilation, mais **un tri** : le dossier du projet ne s'envoie pas
tel quel. Double-clic sur **`construire_version_prod.bat`** :

1. si le Docker local tourne, il passe les essais de l'API
   (`tests/api_test.php`, bases jetables) ; un essai raté arrête tout ;
2. il recopie dans **`version_prod\`** seulement : `index.html`,
   `manifest.webmanifest`, le `.htaccess` racine, `assets\`, `api\`
   **sans** `config.local.php`, `data\.htaccess` (rien d'autre de `data\`) ;
3. il vérifie qu'aucun fichier dangereux n'est dans la copie (`*.sqlite`,
   `*.key`, `*.keystore`, `.env`, `.htpasswd`, `config.local.php`, cache
   des certificats) — sinon il s'arrête sans rien produire ;
4. il fait un zip `nihonjo_prod_AAAA-MM-JJ_HHMM.zip` (par `tar`, qui garde
   les `.htaccess`), pour le gestionnaire de fichiers d'OVH.

⚠️ Le `.bat` répare `ComSpec` pour lui-même (rustine d'Odyvresse) : sur le
poste de José, la variable porte une espace finale, et les `for /f` ne
s'exécutaient pas, sans erreur — premier lancement du 25/10 : zip nommé
`nihonjo_prod_version.zip` (pas de date), test de Docker sans réponse.

On envoie ensuite le **contenu** de `version_prod\` dans `www/nihonjo/`
(FileZilla : glisser-déposer, « Remplacer »). Le `.htaccess` racine part
avec (depuis le 26/10, il est dans ce dépôt) ; le `.htpasswd` et
`api/config.local.php` du serveur ne sont pas dans la copie : ils restent.
`version_prod\` et les zips sont hors git.

### ⚠️ Ne jamais envoyer `data/nihonjo.sqlite`

Le fichier `data/nihonjo.sqlite` du serveur **est** la base de production —
tous les comptes. Envoyer le dossier `data/` depuis le poste l'écrase avec
la base locale, sans avertissement. Envoyer le code, et dans `data/`
**seulement** `.htaccess`.

Pour passer des données d'un côté à l'autre : menu du compte → Sauvegarde
complète (administrateur) → Télécharger d'un côté, Restaurer de l'autre.
Les comptes sont les mêmes des deux côtés (même projet Firebase, même uid).

### À envoyer

```
index.html
manifest.webmanifest
.htaccess          (le racine : ses règles écartent celles du parent)
assets/            (tout, y compris assets/.htaccess)
api/               (tout, y compris api/.htaccess et api/lib/.htaccess)
data/.htaccess     (crée le dossier data/ au premier envoi)
```

Inutiles en ligne : `archives/`, `tests/`, `outils/`, `doc_pour_agents/`,
`carnet_agent/`, `tickets/`, `maquette/`, `application_android/`, `Dockerfile`,
`docker-compose.yml`, les `.bat`, les `.md`. (`construire_version_prod.bat`
fait ce tri ; la liste ci-dessus est sa liste.)

### Les actions de José pour la connexion (une fois)

1. **Console Firebase**, projet « odyvresse » → Authentication → Paramètres
   → Domaines autorisés → **Ajouter `nihonjo.odyvresse.com`**. Sans cela :
   message « Ce site n'est pas autorisé à utiliser la connexion Firebase ».
2. Si la clé d'API web est restreinte par référent HTTP (Google Cloud →
   Identifiants) : y ajouter `https://nihonjo.odyvresse.com/*`. (Non relevé :
   peut-être pas restreinte.)
3. **Se connecter le premier** après la mise en ligne : le premier compte
   connecté devient administrateur. Ou, avant, créer sur le serveur
   `api/config.local.php` :
   ```php
   <?php return ['administrateurs' => ['adresse-de-jose@exemple.com']];
   ```
4. **Le mot de passe Basic** (`.htaccess` racine, section 6) est
   **désactivé** depuis le 26/10 (José avait supprimé `.htaccess` et
   `.htpasswd` du serveur). Pour le remettre : retirer les « # » des quatre
   lignes `AuthType … Require valid-user` et envoyer un `.htpasswd` dans
   `www/nihonjo/` ; seuls ceux qui le connaissent atteignent alors la page
   de connexion — les deux fonctionnent ensemble. L'API se protège seule : sans jeton Firebase valide
   ni session Discord, tout répond 401 (sauf `sante`, `session`,
   `compte.creer` — qui exige une identité —, `deconnexion`,
   `discord.attente`). ⚠️ Le mot de passe Basic gêne aussi le retour de
   Discord : le navigateur le renvoie de lui-même (même site), donc ça
   marche, mais seulement pour qui l'a déjà saisi.
5. **Discord** (facultatif) : portail développeur → l'application
   d'Odyvresse → OAuth2 → **Redirects** → ajouter
   `https://nihonjo.odyvresse.com/api/discord.php` ; puis, dans
   `api/config.local.php` du serveur, le secret :
   ```php
   <?php return [
       'administrateurs' => ['adresse-de-jose@exemple.com'],
       'discord' => ['client_secret' => 'le secret de l’application Discord'],
   ];
   ```
   (`client_id` est déjà dans `api/config.php` ; un `config.local.php` qui ne
   donne que le secret le garde.)

### ⚠️ Le `.htaccess` du dossier parent (`/home/odyvret/www/.htaccess`)

L'hébergement porte plusieurs sites (Multisite OVH, onglet « Mes sites ») :
`odyvresse.com` a pour racine `www/`, `nihonjo.odyvresse.com` →
`www/nihonjo`, `cv.odyvresse.com` → `www/cv`. Le `.htaccess` de `www/`
(posé le 22/08 pour Odyvresse) **réécrit tout vers `/odyvresse_front/`** —
et les sous-dossiers en héritent tant qu'ils n'ont pas de règle à eux. Vécu
le 26/10 : Nihonjo répondait 404 partout (même `/index.html`), sauf `data/`
et `api/config.php` en 403 (l'interdiction passe avant la réécriture).
Corrigé en limitant la règle au domaine d'Odyvresse :

```
RewriteCond %{HTTP_HOST} ^(www\.)?odyvresse\.com$ [NC]
RewriteCond %{REQUEST_URI} !^/odyvresse_front
RewriteRule ^(.*)$ /odyvresse_front/$1 [L]
```

(Reproduit et vérifié sous Apache avec deux hôtes, racines `www/` et
`www/nihonjo`.) Ce fichier n'est pas dans ce dépôt : il appartient au
serveur (la copie corrigée du 26/10 : `a_envoyer_dans_www\`, hors git).

Ceinture et bretelles : le `.htaccess` **racine de Nihonjo** a ses propres
règles de réécriture (`RewriteEngine On` + une règle), ce qui suffit à
écarter celles du parent pour tout `www/nihonjo` — vérifié avec le parent
NON corrigé : `/` et `sante` en 200. Il renvoie `www.nihonjo.odyvresse.com`
vers `https://nihonjo.odyvresse.com/` (302 : Firebase et Discord ne
connaissent que cette adresse), interdit les fichiers cachés, `.md`,
`.bat`, bases et sauvegardes, et déclare le type du manifeste. Le passage
http → https y est écrit mais **désactivé** : non éprouvé chez OVH, il
bouclerait si le serveur ne voit pas le port 443 derrière les équipements
d'OVH (essayer, et remettre les « # » en cas de « trop de redirections »).

### Vérifications après l'envoi

1. `…/api/index.php?action=sante` → du JSON avec `"php"`, `"sqlite"` et
   `"auth": {"mode": "firebase"…}`. Une page blanche ou le code PHP en clair :
   PHP inactif. Une erreur `pdo_sqlite` : extension absente.
2. `…/data/nihonjo.sqlite` → **403 interdit**. S'il se télécharge, la base
   entière (tous les comptes) est publique : `data/.htaccess` manque.
3. `…/api/config.php` → 403.
4. La page : écran « Se connecter » / « Créer un compte » → connexion →
   « Que réviser ? ». Une erreur « Impossible de joindre Google…
   (certificats) » : l'hébergement bloque les requêtes sortantes de PHP vers
   `www.googleapis.com`. Discord : « Discord n'a pas pu confirmer la
   connexion » → journal d'erreurs PHP (`[nihonjo] retour Discord : …`) ;
   « Invalid OAuth2 redirect_uri » chez Discord → l'adresse de retour n'est
   pas déclarée dans le portail.
5. Menu du compte → « Sauvegarde complète… » → la ligne « Serveur : PHP …,
   SQLite …, … comptes Google ».

### Déplacer la base hors du web

Possible et plus sûr : dans `api/config.local.php` sur le serveur :

```php
<?php return ['chemin_base' => '/home/<compte>/nihonjo_donnees/nihonjo.sqlite'];
```

Le dossier doit être inscriptible par PHP (SQLite y écrit son journal ; le
cache des certificats Google et la clé des sessions `secret_sessions.key`
y vont aussi). `config.local.php` n'est pas dans git.

## Application Android (`creer_application_android.bat`, 25/10/2026)

**La méthode d'Odyvresse** (`odyvresse_all/odyvresse/build_mobile_production.bat`,
`odyvresse_app/`) : **Capacitor**. Le front (`index.html`, `manifest.webmanifest`,
`assets/`) est **copié dans l'APK** et tourne dans une WebView ; il appelle
l'**API du site en ligne** (`assets/js/config_application.js` :
`https://nihonjo.odyvresse.com/`). La connexion Google passe par le
**sélecteur de compte d'Android** (greffon `@capgo/capacitor-social-login`,
le même qu'Odyvresse). ⚠️ Une modification du front demande de **refaire
l'APK** ; une modification de l'API, non.

(Un premier essai, le même soir, faisait une *Trusted Web Activity* avec
Bubblewrap ; remplacé à la demande de José par la méthode d'Odyvresse, dont
les outils sont déjà installés sur son poste.)

### Ce qu'il faut sur le poste (déjà là pour Odyvresse)

- **Node.js 22 ou plus** (Capacitor 8) ;
- **Android Studio** : son Java (`C:\Program Files\Android\Android Studio\jbr`)
  et le SDK (`%LOCALAPPDATA%\Android\Sdk`). Le `.bat` les trouve seul (ou
  `JAVA_HOME` / `ANDROID_HOME`).

### Ce que fait le `.bat`

| étape | quoi |
|---|---|
| 0 | `ComSpec` réparé pour ce script (rustine d'Odyvresse : sur le poste de José, la variable porte une espace finale, et Node ne peut plus ouvrir de shell — « spawn cmd.exe ENOENT ») |
| 1 | vérifie Node, Java, le SDK |
| 2 | recopie le front dans `application_android\www\` (sans `data\`, `api\`, ni `.htaccess`) ; `NIHONJO_SERVEUR=https://…/` y réécrit le serveur (application d'essai) |
| 3 | `npm ci` dans `application_android\` (la première fois) : versions **alignées sur `odyvresse_app`** (Capacitor 8.4.0, greffon 8.5.0), figées par `package-lock.json` |
| 4 | `capacitor add android` (la première fois : crée `application_android\android\`) ; puis recopie `application_android\res\` (icônes, écran de démarrage : `outils/icones_android.py`) et retire d'éventuels `ic_launcher*.webp` qui feraient doublon |
| 5 | `capacitor sync android` (front et greffons) |
| 6 | `gradlew assembleDebug`, comme Odyvresse ; l'APK va dans `sortie_android\Nihonjo-AAAA-MM-JJ_HHMM.apk` |

`application_android\` est **sous git** (à la différence d'`odyvresse_app`,
le point fragile noté chez Odyvresse) : `package.json`, `package-lock.json`,
`capacitor.config.json`, `res\`. `www\`, `android\` et `node_modules\` se
refont (hors git).

### `capacitor.config.json`

| clé | valeur | pourquoi |
|---|---|---|
| `appId` | `com.odyvresse.nihonjo` | ⚠️ ne change plus une fois déclaré dans Firebase |
| `server.androidScheme` | `https` | l'origine de la WebView est en https (comme Odyvresse) |
| `server.hostname` | `odyvresse.com` | **comme Odyvresse** : la même origine que son application, donc les mêmes réglages Firebase (domaines autorisés, restrictions de la clé d'API) qui marchent déjà sur téléphone. ⚠️ Pas `nihonjo.odyvresse.com` : Capacitor sert LUI-MÊME tout ce qui est demandé à ce nom — les appels à l'API ne partiraient jamais |

Cette origine (`https://odyvresse.com`) est écrite à **trois** endroits à
garder d'accord : `capacitor.config.json`, `api/config.php`
(`origines_application`, le CORS) et `api/.htaccess` (le mot de passe Basic).

### Le serveur

- **CORS** (`api/index.php`, `nihonjo_cors`) : pour les seules origines de
  `origines_application`, `Access-Control-Allow-Origin` ; réponse 204 à la
  vérification préalable (`OPTIONS`) avec `Content-Type, X-Nihonjo-Jeton`.
  **Jamais** `Access-Control-Allow-Credentials` : pas de cookie, donc pas de
  session Discord depuis l'application — elle s'identifie par le jeton.
- **Mot de passe Basic** : l'application ne le connaît pas, et la
  vérification préalable ne le porterait pas. `api/.htaccess` le lève pour
  `api/index.php` quand l'en-tête `Origin` est celui de l'application
  (`<If>` + `Require all granted`). Éprouvé sous Apache avec un `.htaccess`
  racine comme celui d'OVH : sans mot de passe, `sante` répond 401 ; avec
  l'origine de l'application, 200 ; `config.php` et `api/lib/` restent en
  403 ; la page `index.html` garde son mot de passe. ⚠️ L'en-tête `Origin` se
  fabrique (curl) : pour l'API, cette règle vaut une API sans mot de passe —
  ce qui la protège, c'est le jeton Google vérifié à chaque appel.
- Discord : non proposé dans l'application (`auth.js`).

### Les actions de José (une fois)

1. **Console Firebase**, projet « odyvresse » → Paramètres du projet →
   Ajouter une application → Android : paquet **`com.odyvresse.nihonjo`**,
   empreinte **SHA-1 de la clé de debug du poste** (la même que pour
   Odyvresse, relevée dans `deckolector/doc_pour_agents/connexion_google_mobile.md` :
   `71:DD:50:B6:A8:7A:2E:96:94:9D:C6:A5:9B:BE:DD:69:F9:A3:7B:8F`). Sans cela, le
   sélecteur de compte s'ouvre puis la connexion échoue (« aucun jeton
   d'identité » ou une erreur du Credential Manager). Le
   `google-services.json` n'est pas nécessaire (posé dans
   `application_android\`, le `.bat` le recopie quand même).
2. **Mettre en ligne** la nouvelle API (`construire_version_prod.bat`) : le
   CORS et `api/.htaccess` doivent être sur le serveur avant que
   l'application puisse s'y connecter.

### Sur le téléphone

Copier l'APK, l'ouvrir, autoriser l'installation depuis cette source. Une
nouvelle version s'installe par-dessus (même clé de debug). Sans réseau :
« Le serveur ne répond pas » (Nihonjo vit de son serveur).

### Vérifié / pas vérifié

- `tests/application_simulee.py` : le front servi depuis une autre origine
  avec un faux `window.Capacitor` — appels vers le serveur, CORS en lecture
  et en écriture, Discord absent, origine inconnue refusée, et la connexion
  Google native avec greffon et Firebase simulés (initialize, login sans
  `scopes`, signInWithCredential, logout).
- Dans le bac à sable : `npm ci`, `capacitor add android`, les icônes,
  `capacitor sync` (le greffon est trouvé). **Pas la compilation Gradle** ni
  un vrai téléphone (`carnet_agent/en_suspens.md`).

### Publicités et Play Store (12/11/2026 : préparé, rien d'affiché)

José veut des publicités sur le site et l'application, et publier
l'application sur le Play Store. Fait le 12/11 :

- **Greffon AdMob** `@capacitor-community/admob` **8.2.1** (épinglé ; la
  8.3.0, sortie fin octobre, tire un module Maven `webview-native-ui` créé
  deux semaines plus tôt) dans `application_android/package.json`. Le
  `.bat` réinstalle (`npm ci`) quand il manque.
- ⚠️ **L'identifiant d'application AdMob dans le manifeste** :
  `application_android/regler_admob.mjs`, appelé par le `.bat` (variable
  `NIHONJO_ADMOB_APP`, par défaut l'identifiant d'ESSAI de Google
  `ca-app-pub-3940256099942544~3347511713`). Sans cette `<meta-data>`, le
  SDK Google Mobile Ads ferme l'application à l'ouverture. Le dossier
  `android\` n'étant créé qu'une fois, le script corrige le manifeste en
  place, à chaque construction.
- Aucune publicité n'est encore demandée ni affichée (ni bannière, ni
  consentement) : il faut les identifiants de José (AdSense, AdMob) et
  décider des emplacements. Contrainte de la pile : le script AdSense sera
  la troisième chose chargée de dehors (après les polices et Firebase).

À faire, dans l'ordre :

| quoi | où | note |
|---|---|---|
| compte AdSense, site `odyvresse.com` | AdSense | le site doit être approuvé ; Nihonjo est presque tout derrière la connexion : prévoir une page publique de contenu |
| `ads.txt` (site) et `app-ads.txt` (application) à la racine de `odyvresse.com` | serveur | la racine sert `www/odyvresse_front/` (réécriture du `.htaccess` parent) : y déposer les fichiers |
| message de consentement (RGPD) | AdSense et AdMob, « Confidentialité et messages » | obligatoire en Europe (plateforme certifiée par Google) ; côté application : `requestConsentInfo` / `showConsentForm` du greffon |
| compte AdMob, application Android, bloc bannière | AdMob | puis `NIHONJO_ADMOB_APP` et l'identifiant du bloc dans le front |
| politique de confidentialité publique | site | exigée par le Play Store (comptes, connexion Google, publicités) |
| page publique « supprimer son compte » | site | exigée par le Play Store pour une application qui crée des comptes ; la suppression dans « Mon compte » existe déjà |
| construction **release** : `.aab` signé (clé d'envoi), `versionCode` qui augmente | `.bat` | aujourd'hui : APK de debug |
| SHA-1 de la clé d'envoi ET de la clé de signature Play dans Firebase | console Firebase | sinon « [16] Account reauth failed », comme le 26/10 |
| compte Google de test pour les vérificateurs | Play Console, « Accès à l'application » | la connexion est obligatoire |
| 12 testeurs, 14 jours de test fermé | Play Console | pour un compte développeur personnel récent |

`targetSdk` 36 (Android 16, exigé depuis le 31/08/2026) : déjà réglé par
Capacitor 8 (`android/variables.gradle`).

## Cache du navigateur

`assets/.htaccess` envoie `Cache-Control: no-cache` : après une mise en ligne,
le navigateur revalide chaque module au lieu de mélanger des fichiers de
deux versions.
