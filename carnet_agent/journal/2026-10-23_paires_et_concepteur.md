# 23/10/2026 — Exercice Paires et skill concepteur d'exercices

*Outil : Claude (app), session cloud reliée au poste de José.*

## La demande

Un skill « concepteur d'application d'apprentissage de la langue » pour
imaginer d'autres exercices, et tout de suite un premier : 3 rangées de 6
mots, chaque mot deux fois (français, kanji ou kana), glisser l'un sur
l'autre.

## Les décisions

- Une vue à part (`vues/paires.js`), pas une entrée de `MODES` : `MODES` est
  fait pour une question par mot.
- Pointer Events et non le glisser HTML5 (mort au doigt), avec une
  alternative au toucher (et au clavier).
- Une erreur compte pour les deux mots en jeu : on ne sait pas lequel des
  deux on ignorait.
- Garde d'unicité des textes affichés : sans elle, deux mots de même sens
  (« ce, cette ») rendraient une bonne paire refusée.
- Les tuiles portent `data-mot` : le test retrouvait les paires par le
  texte, ce qui pouvait se tromper sur un homonyme (kana partagés).

## Ce qui m'a arrêté

- `overflow-wrap: anywhere` coupait « récemme / nt » : `break-word` +
  `hyphens: auto` (la page est en `lang="fr"`).
- La colonne d'exercice (42 rem) serrait 6 tuiles : `.exercice.paires`
  élargie à 58 rem.
- Penser au drapeau « clic à ignorer » remis à zéro à chaque `pointerdown`
  (voir `doc_pour_agents/exercices.md`).
