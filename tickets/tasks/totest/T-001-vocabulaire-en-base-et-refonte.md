# T-001 · Vocabulaire en base de données (SQLite + API PHP) et refonte de l'interface

- **Créé** : 2026-10-22
- **Tags** : #base #api #interface #migration
- **Décisions liées** : D-001

## Description

- Le vocabulaire, les chapitres, les catégories, les thèmes et la
  progression vivent dans une base SQLite (`data/nihonjo.sqlite`), servie par
  une API PHP (`api/`). La base est amorcée au premier lancement avec les
  1 034 mots de `data_cours.js` (rangé dans `archives/v1/`).
- Tous les mots sont modifiables (cours compris) ; un mot peut appartenir à
  plusieurs chapitres ; la progression est suivie par mot (plus par texte
  français), avec compteurs et date.
- Les données que la v1 gardait dans le navigateur se reprennent depuis
  l'écran « Données » ; les anciens fichiers d'export (progression, mots)
  s'importent toujours.
- Interface entièrement refaite (écrans Réviser, Exercice + bilan, Liste,
  Écriture, Lexique, Chapitres, Données), thème clair et sombre, téléphone.
- Docker local passé de nginx à `php:8.3-apache`, base dans un volume nommé.
- Récit et justification : `CHANGEMENTS_2026-10.md`.

## Comment tester

1. `docker-compose up -d --build`, ouvrir http://localhost:8080 : « Que
   réviser ? » avec 1 034 mots.
2. « Données » → en bas, la ligne « Serveur : PHP 8.3…, SQLite … ».
3. Si la v1 a servi dans ce navigateur à cette adresse : un bandeau le
   signale sur « Réviser » → Importer → vérifier ses mots ajoutés (Lexique →
   « Ajoutés ») et ses états (puces de chapitres).
4. Lancer chaque exercice avec « Mots par session : 5 » ; une bonne réponse,
   une mauvaise, un « Passer », puis le bilan et « Refaire les erreurs ».
5. Lexique → ajouter un mot avec le clavier de kana, le modifier, le supprimer.
6. Chapitres → créer un chapitre peuplé par un thème, le renommer, le supprimer.
7. Recharger la page, puis `docker-compose up -d --build` à nouveau : tout
   est encore là (le volume garde la base).
8. Téléphone (même réseau, http://<ip-du-poste>:8080) : navigation en bas,
   exercice « Mots à trous (kanji) ».

## Commentaires
<!-- Format : ### YYYY-MM-DD · note -->
### 2026-10-22 · livré par l'agent
Éprouvé sous `php -S` (PHP 8.3.6) : `tests/api_test.php` (18 essais) et
`tests/parcours_navigateur.py` (51 vérifications, console propre). Image
Docker jamais construite (pas de démon Docker côté agent) ; hébergement non
vu. Détail : `carnet_agent/en_suspens.md`.
