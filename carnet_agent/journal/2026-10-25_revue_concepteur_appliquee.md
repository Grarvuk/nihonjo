# 25/10/2026 — La revue du concepteur appliquée (sauf Paires)

*Outil : Claude (app), session cloud reliée au poste de José.*

## La demande

Après la revue des exercices par le skill `concepteur-exercices-nihonjo` :
« Mets en application toutes tes recommandations, sauf pour les paires. »
`paires.js` n'est pas touché ; le jeu des paires change quand même de
conséquence, parce que le serveur décide : sans `niveau`, une paire réussie
mène au plus à « en cours ».

## Ce qui a demandé réflexion

1. **Où vit la règle.** Les paliers (en cours, acquis, date de retour) sont
   calculés au serveur, comme l'ancienne règle : le front envoie seulement
   `niveau`. Défaut `reconnaissance`, pour que l'appel de Paires (sans
   niveau) reste juste sans toucher à son code.
2. **« Deux jours différents » à quelle heure ?** En UTC, une révision à
   0 h 30 à Paris compterait pour la veille. `Depot::aujourdhui` prend
   Europe/Paris ; `fixerJour` sert aux essais (jours simulés).
3. **Les acquis d'avant.** Les faire redescendre aurait effacé le travail de
   José ; la migration 5 les garde acquis (comme deux jours dont une
   production) et les fait revenir 3 jours après leur dernière révision.
4. **Le CHECK du statut** interdisait « en cours » : table reconstruite,
   comme à la migration 2 (SQLite ne modifie pas une contrainte).
5. **Le rōmaji refusé, pas compté faux.** Une réponse en rōmaji n'est pas
   une erreur de mémoire : on le dit sous le champ, rien n'est enregistré.
   Conséquence pour les essais : une mauvaise réponse s'écrit en kana
   (« ぬぬぬ »), « zzz » ne va plus jusqu'à la correction.
6. **L'ordre de la session.** `lancerSession` mélangeait toujours : les mots
   à reprendre, tirés en premier, se retrouvaient n'importe où. Avec une
   limite ≤ 0 elle garde maintenant l'ordre de `tirerPrioritaires`.
7. **Les leurres du choix de lecture** se trahissaient par leur fin
   (けしゴム parmi ドライブ…) : le kana visible du mot est gardé dans chaque
   leurre, et les lectures retenues ont une longueur proche.
8. **Pas de voix dans Chromium de test** : la dictée y est grisée, ce que le
   parcours vérifie ; une voix simulée (`add_init_script`) éprouve le reste.

## Vérifié

- `php tests/api_test.php` : 52 essais (paliers jour par jour, reconnaissance
  plafonnée, migration v4 → v5, sauvegarde sans paliers).
- `tests/parcours_navigateur.py` : 146 vérifications, console propre —
  conseil du grand bouton (Paires puis Français → japonais), mots à
  reprendre en tête de session, rōmaji refusé, homonyme, faute de frappe,
  trous sur kanji, choix de lecture, dictée (voix simulée), écriture de
  mémoire, jeu des kana « écrire ».
- La migration 5 sur une copie de la base de José (23 acquis gardés, 5 à
  revoir, intégrité propre).
- Captures relues : accueil (bureau), dictée et sa correction, choix de
  lecture (téléphone, sombre), jeu des kana « écrire », ses réglages.

## Pas vérifié

`en_suspens.md`, section du 25/10 : une vraie voix, le fuseau sur OVH. (La
migration a ensuite tourné sur le poste : `sante` y répond schéma 5.)

## Addendum, le soir — deux réussites de suite, « à rafraîchir »

José : acquis = « réussi 2 fois de suite », pas sur deux jours ; et un état
pour revoir les mots appris il y a longtemps, curseurs à mon choix, avec la
date d'acquisition en base.

- Lu « simplement 2 fois de suite » comme : plus d'exigence de production
  non plus (la colonne `production` reste, pour information). Les tuiles et
  les paires ne comptent toujours pas dans la série : sinon deviner deux
  fois suffirait. À redemander à José si ça le gêne.
- « À rafraîchir » est **calculé** (acquis + `prochaine_revision` arrivée),
  pas écrit : un état stocké aurait demandé une tâche quotidienne pour
  basculer les mots, et le mot redeviendrait faux entre deux passages.
- Curseurs : 7, 15, 30, 60, 120 jours (`DELAIS_RAFRAICHIR`) ; réussi avant
  l'heure, un acquis est revalidé sans changer de palier.
- Schéma v6 (table reconstruite) : `serie`, `acquis_le`, `valide_le`,
  `rafraichissements` ; `jours_reussis` / `dernier_jour_reussi` retirés.
- Le filtre « État » de l'accueil a six choix : trois par ligne dans le
  panneau (il débordait au téléphone).
- Vérifié : 54 essais de l'API (série, échec qui casse la série, à
  rafraîchir le 7e jour, 15 jours après un rafraîchissement, migrations v4 et
  v5 → v6), parcours 147 vérifications, captures de l'accueil avec des mots
  à rafraîchir (bureau, téléphone sombre).
