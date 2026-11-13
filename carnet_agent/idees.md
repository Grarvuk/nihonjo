# Idées — ce qui rendrait les agents (et Nihonjo) plus efficaces

À proposer à José quand l'occasion se présente ; rien de ceci n'est décidé.
Le plus utile en haut. Barrer et dater ce qui est fait ou écarté.

## Pour l'application

1. ~~**Répétition espacée.**~~ — fait le 25/10 : paliers « en cours » /
   « acquis » et date de retour (`prochaine_revision`, schéma v5),
   `tirerPrioritaires` met les mots dus devant (`doc_pour_agents/exercices.md`).
   Le soir même : « à rafraîchir » (`DELAIS_RAFRAICHIR`, schéma v6).
   Reste possible : régler les délais d’après les échecs (un mot souvent
   raté revient plus vite).
2. ~~**Accepter les homonymes en « Français → japonais »**~~ — fait le 25/10
   (`homonymes`, `exercice.js`).
3. **Fusionner des thèmes** depuis le Lexique (« nombre » + « nombres »).
4. ~~**Une action « ajouter au cours »**~~ — fait le 23/10 : `import.mots`
   avec `cible: cours` (administrateur), bouton « Ajouter au cours ».
5. **Envoi sur OVH par script** (`lftp mirror -R --exclude data/…`) : la règle
   « ne pas envoyer `data/` » ne dépendrait plus de la mémoire de José.
6. **Sauvegarde automatique** : une copie datée de la base à chaque
   restauration ou import en mode « écraser » (`Depot::restaurer`,
   `importerMots`), dans `data/sauvegardes/`. Plus utile depuis les
   comptes : une restauration remplace la base de tout le monde.
7. ~~**Un écran « Comptes » pour l'administrateur** : voir qui s'est connecté,
   donner ou retirer le rôle administrateur~~ — fait le 24/10 : « Gérer les
   comptes » (`vues/comptes.js`, T-010).
8. **Les katakana étendus** (ファ, ティ, ヴ…) dans la page et le jeu des kana :
   ils n'ont pas de hiragana, donc une liste à part dans `syllabaires.js`.
9. **Le jeu des kana à l'envers** : la lecture s'affiche, on choisit le
   caractère parmi quelques tuiles (réutiliser les tuiles de
   « Mots à trous (kanji) »).

## Pour les agents

1. **Un démon Docker dans le bac à sable** (ou un agent dans le terminal de
   José) pour construire l'image : c'est le premier « non vérifié » de
   `en_suspens.md`.
2. **Garder `tests/parcours_navigateur.py` à jour** à chaque écran ou exercice
   nouveau : il a trouvé deux défauts réels le 22/10 (clic avalé, Entrée
   morte) que la relecture n'avait pas vus.

## Leçons à promouvoir dans un skill

| leçon | skill visé |
|---|---|
| Un re-rendu sur `change`/`blur` avale le clic en cours : mettre à jour en place | `interface-nihonjo` (déjà dit) — à proposer aussi pour `composant-angular-odyvresse` d'odyvresse_all |
| `backdrop-filter` sur un parent rend `position: fixed` relatif à lui | `interface-nihonjo` (déjà dit) ; vaut pour `styles-et-charte-odyvresse` |
| `indexedDB.open` crée la base absente : annuler à `oldVersion === 0` | aucun — propre à la reprise v1 |
| Jeton dans un en-tête maison quand une auth Basic occupe `Authorization` | `comptes-et-connexion-nihonjo` (déjà dit) ; vaut pour tout sous-domaine d'odyvresse.com protégé par `.htpasswd` |
