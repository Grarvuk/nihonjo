# Nihonjo — contexte du projet

Application de révision du vocabulaire japonais, faite pour José : le
vocabulaire de son manuel (pages 45 à 219, affichées « Chapitre 1 » à
« Chapitre 11 » depuis le 12/11), les jours, mois, nombres, deux
niveaux de kanjis, le cours et le jeu des kana, le cours et le jeu des kanjis
(26/10), et les mots que chacun ajoute.
Depuis le 23/10/2026, **plusieurs comptes** (comme Odyvresse : on crée son
compte puis on se connecte, avec Google — Firebase — ou Discord ; « Mon
compte » et, pour l'administrateur, « Gérer les comptes », depuis le 24/10) : le cours est commun, les mots ajoutés, les chapitres et la
progression sont propres à chaque compte — et ses réglages aussi, dans la
base : **rien de l'utilisateur dans le navigateur** (schéma v3). Chaque compte
a son chapitre « Mes mots », qui contient tous ses mots. En ligne :
`nihonjo.odyvresse.com`.

## La pile

| couche | technologie | où |
|---|---|---|
| interface | HTML + CSS + JavaScript **sans framework ni compilation** (modules ES natifs) | `index.html`, `assets/` |
| API | PHP (syntaxe 7.4+), un seul point d'entrée, actions JSON | `api/index.php`, `api/lib/` |
| connexion | Google : Firebase Authentication (projet « odyvresse »), jeton vérifié en PHP ; Discord : OAuth2 côté serveur, cookie de session signé | `assets/js/auth.js`, `api/lib/Authentification.php`, `api/discord.php` |
| base | **SQLite**, un fichier, via PDO | `data/nihonjo.sqlite` (créé au premier appel) |
| local | Docker : `php:8.3-apache`, port 8080, base : `data\nihonjo.sqlite` du poste (dossier partagé) | `Dockerfile`, `docker-compose.yml` |
| en ligne | hébergement mutualisé OVH, dossier `www/nihonjo/` ; son `.htaccess` racine écarte les règles du dossier parent (Odyvresse) ; mot de passe Basic en option, désactivé (26/10) | voir `doc_pour_agents/deploiement.md` |

Pourquoi SQLite + PHP et pas MySQL, Node ou l'IndexedDB de la v1 :
`tickets/decisions/D-001-base-sqlite-et-api-php.md`.

## Ce qui a changé le 22/10/2026 (v2)

Jusque-là (v1), le vocabulaire du cours était un fichier JavaScript
(`data_cours.js`) et les mots ajoutés comme la progression vivaient dans le
navigateur (IndexedDB « NihonjoDB » via Dexie, localStorage). Tout est
désormais dans la base du serveur : mêmes données sur tous les appareils.
L'ancienne version est rangée dans `archives/v1/` — **à exclure des
recherches** : rien n'y est chargé. Le récit complet :
`CHANGEMENTS_2026-10.md` (puis `CHANGEMENTS_2026-11.md`).

## Lancer, tester

| quoi | commande (depuis la racine du projet) |
|---|---|
| lancer en local | double-clic sur `lancer_nihonjo.bat` (ou `docker compose up -d --build`) puis http://localhost:8080 |
| essais de l'API | `php tests/api_test.php` (ou `docker compose exec nihonjo-app php tests/api_test.php`) |
| parcours navigateur | `NIHONJO_AUTH=dev NIHONJO_BASE=/tmp/essai.sqlite php -S 127.0.0.1:8765 -t .` puis `python3 tests/parcours_navigateur.py` (Playwright ; connexion « dev » par simple adresse) |
| syntaxe JS | `node --check assets/js/<fichier>.js` |
| régénérer l'amorce depuis la v1 | `node outils/convertir_donnees_v1.mjs` (sans effet sur une base existante) |
| préparer la mise en ligne | double-clic sur `construire_version_prod.bat` → `version_prod\` (le tri : jamais `data/nihonjo.sqlite` ni les secrets) |
| application Android | double-clic sur `creer_application_android.bat` → `sortie_android\*.apk` (Capacitor, comme Odyvresse : le front dans l'APK, l'API en ligne ; `doc_pour_agents/deploiement.md`) |
| application simulée | `python3 tests/application_simulee.py` (front sur une autre origine, faux `window.Capacitor` : CORS, connexion Google native simulée) |

⚠️ Ouvrir `index.html` en double-cliquant ne marche pas : les modules ES et
l'API exigent un serveur. L'écran affiche alors « La base ne répond pas ».

## Arborescence

```
index.html                 coquille : en-tête, navigation, <main id="vue">
assets/css/nihonjo.css     toute la mise en forme (charte : CHARTE_GRAPHIQUE.md)
assets/js/app.js           démarrage, routage par ancre (#/reviser…), thème
assets/js/api.js           appeler(action, corps) — SEUL appelant de fetch ; joint le jeton
assets/js/auth.js          connexion Google (SDK Firebase à la demande) et départ vers Discord ; modes firebase / aucune / dev
assets/js/session.js       se déconnecter (terminerSession), libellés des comptes
assets/js/etat.js          copie en mémoire de la base + sélection de révision
assets/js/vues/*.js        un fichier par écran ; afficher(racine) → nettoyage
assets/js/…                utils, ui (toasts, dialogues), masu (cases), clavier, kana, icones, composants
assets/js/donnees/         syllabaires.js (hiragana/katakana et lectures), liste_kanjis.js (leurres), kanjis.js (626 kanjis, FABRIQUÉ par outils/generer_kanjis.py)
assets/js/kanjis.js        les kanjis comme matière : groupes, réponses acceptées, lectures (page et jeu « Kanji »)
assets/js/migration_navigateur.js   reprise des données v1 restées dans le navigateur
assets/js/echanges.js      fichiers : exporter des mots, progression v1, sauvegarde complète (menu du compte)
api/index.php              point d'entrée ; garde JSON ; erreurs → JSON
api/lib/Base.php           connexion, PRAGMA, migrations du schéma
api/lib/Depot.php          les requêtes SQL du vocabulaire, POUR UN COMPTE ; ErreurApi
api/lib/Authentification.php   jeton Firebase, comptes (Comptes : inscription, pseudo, suppression), cookies signés, Discord, modes
api/discord.php            Discord : l'aller et le retour OAuth2 (des redirections)
api/lib/Amorcage.php       premier remplissage depuis api/amorce/
api/lib/Api.php            table des actions
api/config.php             chemin de la base (surcharge : api/config.local.php, NIHONJO_BASE)
data/                      la base ; .htaccess interdit l'accès web
tests/                     api_test.php, parcours_navigateur.py
lancer_nihonjo.bat         lancement local complet (Docker, attente de l'API, navigateur)
construire_version_prod.bat   la copie à mettre en ligne (version_prod\), essais et garde-fous
creer_application_android.bat l'application Android (Capacitor, comme odyvresse_app)
application_android/       son projet : package.json, capacitor.config.json, res/ (icônes : outils/icones_android.py)
assets/js/plateforme.js    site ou application ? adresse du serveur, greffons natifs (config_application.js : le serveur)
manifest.webmanifest       le site installable (nom, icônes : assets/icones/)
outils/                    convertir_donnees_v1.mjs, captures_ecrans.py (captures pour juger l'interface), generer_kanjis.py (KANJIDIC2 → donnees/kanjis.js)
archives/v1/               l'ancienne version, pour mémoire (non chargée)
doc_pour_agents/           une mécanique par fichier
tickets/                   INBOX, BACKLOG, tâches, décisions
carnet_agent/              mémoire d'expérience des agents
```

## Contraintes de la pile

- **Pas d'étape de compilation** : ce qui est dans `assets/` est servi tel
  quel. Pas de npm côté front, pas de bibliothèque externe chargée (la v1
  chargeait Dexie et Font Awesome ; plus maintenant). Seuls viennent de
  dehors : les polices (Google Fonts, repli système si hors ligne) et le SDK
  Firebase (gstatic, version épinglée, chargé seulement en mode `firebase`).
- **Modules ES** : chaque fichier importe ce dont il a besoin ; les
  dépendances circulaires (`liste.js` ↔ `ecriture.js`) ne marchent que parce
  que les imports ne servent qu'à l'exécution, jamais au chargement.
- **Tout en français** : fichiers, fonctions, variables, commentaires, textes.
- **Langue des textes affichés** : phrases courtes, à la forme active, en
  minuscules (pas de capitales de titre) ; un bouton dit ce qu'il fait
  (« Ajouter le mot », pas « Valider »).

Le détail des mécaniques est dans `doc_pour_agents/`.
