# Nihonjo

Révisions de vocabulaire japonais : le manuel page par page, les jours, mois
et nombres, deux niveaux de kanjis, et les mots qu'on ajoute soi-même. Six
exercices (traduction dans les deux sens, mots à trous en kana et en kanji,
sens et lecture des kanjis), un exercice d'écriture, une progression par mot
gardée sur le serveur. Une page des hiragana et katakana en tableaux, et un
jeu pour apprendre à les lire.

Chacun crée son compte puis se connecte avec Google (la connexion
d'Odyvresse) ou Discord : le cours est commun, les mots ajoutés et la
progression sont à chacun. Tout est dans la base, réglages compris : rien
n'est gardé dans le navigateur. « Mon compte » (menu en haut à droite) :
pseudo, ce que contient le compte, export, déconnexion, suppression ;
l'administrateur y trouve aussi « Gérer les comptes ».

Ajouter ses mots : un par un (Lexique → « Ajouter un mot »), ou toute une
liste (Lexique → « Importer une liste » : la page explique comment la faire
préparer par une IA). Les ranger : l'écran Chapitres prend des mots partout
(cours, thèmes, ses chapitres) et les copie, déplace ou retire en lot.

## Lancer en local

Double-clic sur **`lancer_nihonjo.bat`** : il démarre Docker Desktop si
besoin, construit et lance le conteneur, puis ouvre http://localhost:8080.
(À la main : `docker compose up -d --build`.) Au premier chargement, la base
est créée et remplie avec les 1 034 mots du cours. On se connecte avec son
compte Google, comme en ligne (pas de mot de passe du `.htaccess` en local) ;
la première connexion reprend les mots et la progression déjà là. Pour
Discord : le secret de l'application dans un fichier `.env` à la racine
(`NIHONJO_DISCORD_CLIENT_SECRET=…`) — `doc_pour_agents/deploiement.md`. Après toute modification
du code : relancer le `.bat` (la base, dans un volume Docker, est conservée).

Arrêter : `docker compose stop`.

La base est le fichier `data\nihonjo.sqlite` du dossier (DB Browser for
SQLite l'ouvre directement, à jour). ⚠️ Ne pas le supprimer ni le remplacer :
c'est la base de tous les comptes. Avant toute manipulation : menu du compte (en haut à droite) →
« Sauvegarde complète… » → Télécharger (administrateur).

## Mettre en ligne (OVH)

Double-clic sur **`construire_version_prod.bat`** : il passe les essais (si
Docker tourne), recopie dans `version_prod\` seulement ce qui doit partir et
vérifie qu'aucune base ni secret n'y est. Envoyer le **contenu** de
`version_prod\` dans `www/nihonjo/`. **Ne jamais envoyer le dossier du
projet tel quel** : `data/nihonjo.sqlite` écraserait la base en service.
Une fois : ajouter `nihonjo.odyvresse.com` aux domaines autorisés de la
console Firebase (projet « odyvresse »), et se connecter le premier — le
premier compte devient administrateur et reprend les données existantes.
Vérifications après envoi : `doc_pour_agents/deploiement.md`.

## Application Android

Double-clic sur **`creer_application_android.bat`** — la méthode d'Odyvresse
(Capacitor) : Node.js 22+ et Android Studio, déjà là pour Odyvresse. Il
produit `sortie_android\Nihonjo-<date>.apk`, à installer sur le téléphone :
le front est dans l'application, l'API reste celle du site en ligne. Une
fois : déclarer l'application `com.odyvresse.nihonjo` (et le SHA-1 de debug)
dans la console Firebase. Le détail : `doc_pour_agents/deploiement.md`,
« Application Android ».

## Venir de l'ancienne version

Les mots ajoutés et la progression de l'ancienne version restaient dans le
navigateur. Ouvrir la nouvelle version **dans ce même navigateur, à la même
adresse** : un bandeau sur l'accueil propose « Importer dans la base ». Les
anciens fichiers d'export (progression, mots) se collent ou se choisissent
dans la page « Importer des mots » (Lexique, ou menu du compte), qui les
reconnaît.

Rien de l'utilisateur ne reste dans le navigateur : mots, chapitres,
progression et réglages sont dans la base, rattachés au compte.

## Pour aller plus loin

| quoi | où |
|---|---|
| la pile, l'arborescence, les commandes | `contexte.md` |
| les mécaniques (schéma, API, comptes et connexion, exercices, données, déploiement) | `doc_pour_agents/` |
| ce qui a changé et pourquoi | `CHANGEMENTS_2026-10.md` |
| couleurs, polices, règles visuelles | `CHARTE_GRAPHIQUE.md` |
| décisions, tâches | `tickets/` |
| consignes pour les agents IA | `CLAUDE.md`, `.claude/skills/`, `carnet_agent/` |
| essais | `php tests/api_test.php`, `tests/parcours_navigateur.py` (serveur lancé avec `NIHONJO_AUTH=dev`) |
