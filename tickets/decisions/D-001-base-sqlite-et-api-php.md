# D-001 · La base est un fichier SQLite, servi par une petite API PHP

- **Date** : 2026-10-22
- **Statut** : Accepté (choix laissé à l'agent par José)
- **Tâche liée** : T-001

**Contexte**  
José veut que le vocabulaire soit persisté « en bdd désormais », type de base
au choix. La v1 tenait le cours dans un fichier JavaScript et le reste dans
le navigateur (IndexedDB, localStorage) : rien de partagé entre son poste et
son téléphone. L'application tourne en local dans Docker et en ligne sur un
hébergement **mutualisé OVH** (dossier `www/nihonjo/`, protégé par
`.htaccess`), à côté du front d'Odyvresse. Un seul utilisateur.

**Décision**  
SQLite (un fichier, `data/nihonjo.sqlite`) via PDO, derrière une API PHP à un
seul point d'entrée (`api/index.php?action=…`). Front sans framework, qui
charge tout le vocabulaire en une requête. En local, image `php:8.3-apache`.

**Pourquoi**  
- Un mutualisé OVH exécute PHP nativement ; il n'exécute pas Node (sauf offres
  spécifiques) et n'a pas de PostgreSQL.
- SQLite ne demande ni serveur de base à créer dans le panneau OVH, ni
  identifiant à stocker dans un fichier de configuration, ni réglage réseau ;
  la base se sauvegarde en copiant un fichier (ou par l'écran « Données »).
- Un seul utilisateur : la limite de SQLite (un écrivain à la fois) ne joue pas.
- Même pile en local et en ligne : ce qui marche dans Docker marchera chez OVH.

**Alternatives écartées**  
- *MySQL d'OVH* : base à créer à la main, identifiants dans un fichier du
  dépôt (ou hors dépôt, donc à recopier), et une seconde base à faire tourner
  dans Docker pour le local. Plus de pièces pour aucun gain à un utilisateur.
- *API Node + PostgreSQL, comme Deckolector* : exigerait le VPS d'Odyvresse
  ou un service à part ; hors de ce qu'offre l'hébergement où vit Nihonjo.
- *Rester dans IndexedDB* : ne répond pas à la demande (rien de partagé entre
  appareils, données perdues avec le navigateur).
- *Fichier JSON écrit par PHP* : pas de transactions ; une écriture
  interrompue corromprait tout le lexique.

**Conséquences**  
- `data/` contient la base de production : ne jamais l'écraser par un envoi
  FTP, ne jamais `docker compose down -v` sans sauvegarde
  (`doc_pour_agents/deploiement.md`).
- La sécurité en ligne repose sur le `.htaccess` racine (authentification) et
  sur `data/.htaccess` (pas d'accès direct au fichier).
- Code PHP en syntaxe 7.4, SQL sans UPSERT ni WAL : la version de PHP et de
  SQLite chez OVH n'est pas connue.
- Schéma versionné par migrations (`Base::MIGRATIONS`, `PRAGMA user_version`).
