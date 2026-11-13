# En suspens

Ce que j'ai signalé à José sans le corriger (PÉRIMÈTRE), et ce que j'ai livré
sans pouvoir le vérifier. Le plus récent en haut de chaque section. Quand un
point est réglé : le barrer (`~~…~~`), dater, dire où.

Si José veut en faire du travail planifié, ces points ont leur place dans
`tickets/INBOX.md` — c'est lui qui décide.

## Livré sans vérification complète (25/10/2026, version de production, application Android)

| depuis | quoi | ce qui manque |
|---|---|---|
| 25/10 | **`creer_application_android.bat`** (Capacitor, comme Odyvresse) | jamais lancé sous Windows. Répété dans le bac à sable : `npm ci`, `capacitor add android`, icônes recopiées sans doublon, `capacitor sync` (greffon `SocialLogin` trouvé). **Pas la compilation Gradle** (Maven de Google injoignable d'ici) ni un vrai téléphone |
| 25/10 | **Connexion Google dans l'application** | simulée seulement (`tests/application_simulee.py` : faux greffon, faux Firebase). Il faut que José déclare `com.odyvresse.nihonjo` + le SHA-1 de debug dans Firebase. Si la clé d'API Firebase est restreinte par référent, l'origine `https://odyvresse.com` est déjà celle d'Odyvresse (choisie pour cela) |
| 25/10 | **`api/.htaccess` chez OVH** (`<If>` sur l'en-tête Origin, `Require all granted`) | éprouvé sous Apache 2.4 du bac à sable avec un `.htaccess` racine Basic comme celui d'OVH ; pas sur OVH lui-même. Si OVH refusait `<If>` dans un `.htaccess` : erreur 500 sur toute l'API — retirer le bloc remet l'état d'avant |
| 25/10 | **Front embarqué dans l'APK** | une modification du front n'atteint l'application qu'en refaisant l'APK ; une API qui changerait de forme casserait une ancienne APK installée |
| 25/10 | **`construire_version_prod.bat`** | jamais lancé sous Windows (`robocopy`, `tar`, `dir /s` des garde-fous). La liste des fichiers copiés est celle de `deploiement.md` |



| depuis | quoi | ce qui manque |
|---|---|---|
| 25/10 | **Migration 5 sur la base de José** (`data\nihonjo.sqlite` du poste) | jouée au premier appel après la mise à jour. Éprouvée sur une **copie** de sa base (25/10, poste → bac à sable, copie effacée ensuite) : v4 → v5, ses 23 acquis le restent (de retour du 26 au 28/10), ses 5 « à revoir » aussi, `integrity_check` et `foreign_key_check` propres. Jouée ensuite sur le fichier lui-même (le Docker du poste répond `version_schema: 5`, 25/10) |
| 25/10 | **Voix japonaise** (`son.js`, Dictée, « Écouter ») | Chromium de test n'en a aucune : éprouvé avec une voix simulée. Jamais entendu une vraie voix : Windows en a une si la langue japonaise est installée (Paramètres → Heure et langue) ; Firefox sous Windows utilise les voix du système |
| 25/10 | **Fuseau du serveur** | `Depot::aujourdhui` prend Europe/Paris explicitement (pas le fuseau de PHP). Si l'extension de fuseaux manquait sur OVH, ce serait une exception à chaque réponse : non vérifié |
| 25/10 | **Curseurs des paliers** (2 réussites de suite ; « à rafraîchir » après 7, 15, 30, 60, 120 jours) | placés par moi à la demande de José (« je te laisse placer les curseurs »), pas d'après l'usage. Un réglage = `SERIE_POUR_ACQUIS` et `DELAIS_RAFRAICHIR` (`Depot.php`) + `doc_pour_agents/exercices.md` |

## Livré sans vérification complète (24/10/2026, inscription, Discord, Mon compte)

| depuis | quoi | ce qui manque |
|---|---|---|
| 25/10 | **Base dans `data\` du poste** (partage `./data`, pour DB Browser) | jamais lancé sous Windows. Points fragiles : la recopie depuis l'ancien volume (`docker cp nihonjo_web:…` dans le `.bat`, AVANT `--force-recreate`) ; SQLite sur un dossier partagé Windows (mode de journal par défaut DELETE, pas WAL : sans risque connu ici) ; DB Browser qui garde un verrou d'écriture ouvert ferait patienter l'API (`busy_timeout` 5 s) |
| 24/10 | **Vrai Discord** (`api/discord.php`, `ConnexionDiscord`) | discord.com n'est pas joignable d'ici. Éprouvé : l'aller (302 vers `discord.com/oauth2/authorize` avec `client_id`, `scope=identify email`, `redirect_uri`, `state` ; cookie posé, vu au `curl`), et tout le retour contre un faux Discord (`fauxDiscord`, `tests/api_test.php`). Jamais vu : la page de Discord, un vrai code, le format réel de `/users/@me` (repris de la doc Discord : `id`, `username`, `global_name`, `email`, `verified`, `avatar`) |
| 24/10 | **Actions de José chez Discord** | ajouter les adresses de retour `http://localhost:8080/api/discord.php` et `https://nihonjo.odyvresse.com/api/discord.php` dans l'application d'Odyvresse (OAuth2 → Redirects) ; fournir le secret (`.env` en local, `api/config.local.php` en ligne). Je n'ai pas lu le secret (il est dans le `.env` de deckolector) |
| 24/10 | **`client_id` Discord** 1509628157962227893 | relevé dans la doc de deckolector, supposé être l'application d'Odyvresse. Si José préfère une application Discord à part pour Nihonjo : changer `discord.client_id` (config) ou `NIHONJO_DISCORD_CLIENT_ID` (`.env`) |
| 24/10 | **Cookies sur OVH** | `Secure` posé si `HTTPS` ou `X-Forwarded-Proto: https` ; non vérifié derrière le proxy d'OVH. Si le cookie part sans `Secure`, la connexion marche quand même (SameSite=Lax) |
| 24/10 | **Comptes existants de la base de José** | la migration 4 leur donne `fournisseur = google` (uid Firebase). Pas de pseudo ni de photo tant qu'ils ne se reconnectent pas (la photo arrive avec le jeton suivant) |
| 24/10 | **Inscription explicite** pour les comptes Google déjà connus | rien à faire : un uid déjà en base se connecte directement. Seules les identités NOUVELLES passent par « Créer un compte » |

## Livré sans vérification complète (23/10/2026, préférences en base, import, gestionnaire)

| depuis | quoi | ce qui manque |
|---|---|---|
| 23/10 | **Préférence changée juste avant de fermer la page** | envoi immédiat en `keepalive` : 10 rechargements sur 10 justes juste après un clic, en mode `dev`. En mode `firebase`, l'envoi attend d'abord le jeton (une promesse, en principe déjà prête) : non mesuré. Sur Apache (plusieurs processus), l'envoi et la relecture d'une page rechargée À LA MÊME milliseconde peuvent se croiser ; le réglage est quand même enregistré |
| 23/10 | **Thème avant la connexion** | il n'est plus gardé dans le navigateur : l'écran de chargement suit le système, puis le thème du compte s'applique. Un léger changement de couleur au démarrage est possible pour qui a choisi l'inverse du système |
| 23/10 | **« Copier le texte pour l'IA »** | `navigator.clipboard` exige une page sûre (https ou localhost) : OK en ligne et en local. Sinon le texte est sélectionné, à copier à la main |
| 23/10 | **Gestionnaire de chapitres au téléphone** | ruban de chapitres qui défile en largeur : vu en capture (Chromium, 390 px), pas essayé au doigt sur un vrai téléphone |

## Livré sans vérification complète (23/10/2026, comptes, kana, `.bat`)

| depuis | quoi | ce qui manque |
|---|---|---|
| 23/10 | **Vraie connexion Google** (`auth.js`, `VerificateurJetonFirebase`) | Google et gstatic sont bloqués dans mon bac à sable : ni le SDK, ni la fenêtre Google, ni un vrai jeton n'ont été vus. Éprouvé : la vérification sur des jetons signés par une clé d'essai (signature, `aud`, `iss`, `exp`, `alg`), le mode `dev`, l'écran de panne quand le SDK ne charge pas. À faire par José : se connecter en ligne (en local, pas de connexion depuis le 23/10) |
| 23/10 | **Actions de José dans la console Firebase** | ajouter `nihonjo.odyvresse.com` aux domaines autorisés ; clé d'API peut-être restreinte par référent (non relevé dans odyvresse_all). Liste dans `doc_pour_agents/deploiement.md` |
| 23/10 | **SDK Firebase 10.12.2** (gstatic) | version reprise d'Odyvresse ; elle existe sur npm (`npm view firebase@10.12.2`, vérifié le 23/10), mais l'URL `https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js` n'a pas pu être ouverte d'ici |
| 23/10 | **Requêtes sortantes de PHP sur OVH** vers `www.googleapis.com` (certificats) | non relevé ; sans elles, aucune connexion en ligne (message « Impossible de joindre Google… ») |
| 23/10 | **Le premier compte connecté devient administrateur** et reprend les données d'avant | voulu (c'est José), mais si un autre se connecte avant lui en ligne, il récupère tout. Parade : `administrateurs` dans `api/config.local.php` avant la mise en ligne, ou garder le mot de passe Basic jusqu'à sa première connexion |
| 23/10 | **`lancer_nihonjo.bat`** | jamais lancé sous Windows (écrit et relu ici, fins de ligne CRLF contrôlées). Points fragiles : chemin de Docker Desktop (`%ProgramFiles%\Docker\Docker`), `curl` (présent depuis Windows 10 1803) |
| 23/10 | **Image Docker et Firebase** | le conteneur doit joindre `www.googleapis.com` (certificats) ; non vérifié (pas de démon ici). Revenu d'actualité le 23/10 au soir : Docker repasse en connexion Google (le mode `aucune` venait d'un malentendu). Repli : décommenter `NIHONJO_AUTH: aucune` |

## Livré sans vérification complète (22/10/2026, passage en base)

| depuis | quoi | ce qui manque |
|---|---|---|
| ~~22/10~~ | ~~**`.claude/`** refusé à l'écriture directe~~ | ~~—~~ Réglé le 22/10 : livré dans `claude_a_installer/` puis renommé `.claude` par `mv` dans le shell du poste (voir `environnement.md`). Reste `_a_supprimer/` (la note d'installation devenue inutile) : à supprimer par José |
| 22/10 | **Image Docker** `php:8.3-apache` (`Dockerfile`, `docker-compose.yml`, volume `nihonjo_donnees`) | jamais construite (toujours vrai le 23/10) : pas de démon Docker là où j'ai travaillé. L'API et l'interface ont tourné sous `php -S` (PHP 8.3.6, SQLite 3.45.1). À vérifier par José : `docker-compose up -d --build`, http://localhost:8080, puis menu du compte → « Sauvegarde complète… » → ligne « Serveur ». Point fragile : le volume nommé doit hériter du propriétaire `www-data` du dossier `data/` de l'image (sinon « Le dossier de la base n'est pas inscriptible par PHP ») |
| 22/10 | **Hébergement OVH** | rien vu. Version de PHP inconnue (code écrit en syntaxe 7.4), `pdo_sqlite` supposé présent, `data/.htaccess` jamais servi par un vrai Apache (`php -S` ignore les `.htaccess`). Les cinq vérifications de `doc_pour_agents/deploiement.md` sont à faire au premier envoi — surtout « `data/nihonjo.sqlite` → 403 » |
| 22/10 | **Reprise des données v1 du navigateur** (`migration_navigateur.js`) | éprouvée avec une IndexedDB `NihonjoDB` fabriquée à la main, de même structure que celle de Dexie (`tests/parcours_navigateur.py`). Pas avec les vraies données de José, ni sur son téléphone. Rien n'est effacé côté navigateur : un échec se rejoue |
| 22/10 | **Navigateurs** | éprouvé dans Chromium (Playwright) seulement. Safari/iOS : `<dialog>` (15.4+), `color-mix()` (16.2+, avec repli), modules ES — non essayés |
| 22/10 | **Polices** Klee One / Zen Kaku Gothic New (Google Fonts) | bloquées dans mon bac à sable : vues via les paquets `@fontsource` servis à la main pendant les captures. Sur le poste de José elles viennent de Google ; hors ligne, repli système |

## Défauts signalés, non corrigés

| depuis | où | quoi |
|---|---|---|
| 12/11 | `tests/parcours_navigateur.py`, « choix de lecture réussi : en cours » | **échec au hasard** (1 fois sur 2 le 12/11, sans lien avec le changement du jour) : le test retrouve le mot par son kanji (`next(… jp_kanji[0] == kanji)`) ; si deux mots du cours ont le même kanji (les 7 doublons), il lit la progression de l'autre. Relancer ; remède : retrouver le mot par son id (exposé par la feuille) |
| 26/10 | jeu des kanjis | **pas d'état « à rafraîchir »** pour les kanjis (les mots l'ont) : un kanji acquis le reste. Et les sens de la liste v1 (« Sujet / Titre / Problème »…) n'ont pas été relus ; ceux de KANJIDIC2 (186 kanjis « plus loin ») non plus. À reprendre si José signale un sens étrange : la liste v1 ou `SENS_MANQUANTS`, puis `outils/generer_kanjis.py` |
| 26/10 | jeu des kanjis, sur appareil | joué au navigateur de test seulement (bureau, téléphone simulé) ; pas encore sur le téléphone de José ni dans l'application Android |
| 23/10 | `tests/parcours_navigateur.py`, « Exercice Français → japonais » | **échec au hasard** (vu 1 fois sur 3 le 23/10 au soir) : `mot_affiche` prend le premier mot dont le sens affiché correspond ; si le mot tiré partage son sens avec un autre (les 73 sens en double, ci-dessous), la réponse envoyée est celle de l'autre et l'exercice la refuse. Défaut du test, révélateur du défaut des données. Relancer ; remède durable : celui des homonymes ci-dessous. **Réglé le 25/10** : l'homonyme est accepté (`homonymes`, `exercice.js`) |
| 23/10 | chapitres | deux chapitres d'un compte peuvent ne différer que par la casse (« Animaux » / « animaux ») : `cleParNom` compare à l'exact. Seul « Mes mots » est protégé quelle que soit la casse (`Depot::estNomReserve`) |
| 23/10 | données | « Remplacer mes mots » (mode `ecraser`) n'a plus de bouton : la nouvelle page d'import ne fait qu'ajouter. Le mode reste dans l'API (`import.mots`) si José le redemande |
| 22/10 | données du cours (amorce) | **73 sens français en double** (« eau » ×2, « ce, cette » ×3, « poisson », « maintenant »…). En « Français → japonais », seule l'écriture du mot tiré est acceptée : « ce, cette » attend この, その ou あの selon le tirage, et seul le contexte les distingue. Hérité de la v1. **Réglé le 25/10 pour l'exercice** : les écritures des mots de même sens principal sont acceptées (`MODES['fr-jp'].autresReponses`), avec une note. Les données, elles, ont toujours leurs doublons |
| 22/10 | données du cours | **7 mots strictement identiques** (mêmes sens, kana, kanji) dans deux chapitres : gardés séparés à l'amorce, par fidélité à la v1. Leur progression est donc séparée. Fusionner = les rattacher aux deux chapitres et supprimer le doublon |
| 22/10 | données du cours | **Thèmes en double** : « nombre » / « nombres », « saison » / « saisons » ; et des thèmes à 1 ou 2 mots. Le filtre « Thème » en souffre. Pas d'outil de fusion de thèmes |
| 22/10 | racine du dépôt | `ameliorations` : fichier vide, rôle inconnu. Laissé tel quel. `tickets/INBOX.md` peut le remplacer |
| 22/10 | racine | ~~`.htaccess` non versionné~~ **réglé le 26/10** : le `.htaccess` racine est dans le dépôt et part avec la version de production (`deploiement.md`). Avant : `.htaccess` (et `.htpasswd`) **non versionnés** : ils portent toute la sécurité en ligne, API comprise (`doc_pour_agents/api.md`). J'ai ajouté `.htpasswd` à `.gitignore` ; `.htaccess` reste hors git comme avant — à José de décider s'il le versionne (il contient le chemin absolu du compte) |
| 22/10 | git | Le passage en v2 **déplace** `data_cours.js`, `config.js`, `config_chapitres.js`, `script.js`, `style.css`, `liste_kanjis.js` dans `archives/v1/` (et y copie l'ancien `index.html`). La modification non commitée de `data_cours.js` (contexte de « えっ ») est dans l'archive ET dans l'amorce. Rien n'est commité : à José de le faire |
