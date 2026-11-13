# 26/10/2026 — Kanjis (cours, jeu, progression) et « autre alphabet »

Outil : Claude (application, session dans le nuage reliée au poste de José).

## Ce qui a été fait

- L'autre syllabaire (ミズ pour みず) : `juger` le reconnaît, le serveur le
  compte juste mais remet la série à zéro (`enregistrerResultat`,
  `$autreAlphabet`).
- Page et jeu des kanjis, table `kanji_progression` (v7). Récit :
  `CHANGEMENTS_2026-10.md` § 23 ; mécanique : `doc_pour_agents/exercices.md`.

## Ce que j'en retiens

- **Des données de kanjis fiables existent sur npm** : le paquet
  `kanjidic2-json` (KANJIDIC2 converti, sens français compris) se récupère
  par `npm pack` même quand le reste du réseau est fermé. La liste v1 n'avait
  qu'une lecture on et une kun par kanji : on aurait refusé des lectures
  justes. Licence CC BY-SA : mention sur la page et dans le fichier fabriqué.
  7 kanjis du manuel n'ont pas de sens français dans KANJIDIC2 :
  `SENS_MANQUANTS` dans le script.
- **Le parcours et la même ancre** : après un bilan du jeu, `page.goto` vers
  `#/jeu-kanji` (déjà l'ancre courante) ne déclenche aucun `hashchange` — la
  page ne bouge pas. Cliquer le bouton du bilan (qui passe par `naviguer`).
- Un trou des « Mots à trous (kana) » peut tomber sur « ー », qui n'a pas de
  double dans l'autre syllabaire : l'essai cherche un trou convertible.
