# 23/10/2026 — Refonte de l'accueil (skill ux-ui-nihonjo)

*Outil : Claude (app), session cloud reliée au poste de José ; captures
Playwright avec les vraies polices (@fontsource routées).*

## La demande

Reprendre « le skill UX UI » d'Odyvresse, l'installer ici, s'en servir pour
remettre en question l'UI/UX ; que ça donne envie de cliquer ; tous les
exercices accessibles depuis la page principale, kana compris.

## Ce que « le skill UX UI » d'Odyvresse voulait dire

Pas de dossier de ce nom dans `odyvresse_all`. Deux sources : le rôle
**AGENT_UX_UI** décrit dans `odyvresse/contexte.md` (designer produit, mobile
d'abord, ergonomie, HTML sémantique) et le skill
`odyvresse/.claude/skills/maquette-odyvresse` (proposer avant d'intégrer,
règles d'intégrabilité). Fusionnés et adaptés dans `ux-ui-nihonjo`.

## L'audit (captures `avant`)

- Accueil = formulaire : 19 tuiles de chapitre toutes bleues (tout est coché
  par défaut), les exercices dans la colonne de droite, **sous trois écrans
  de chapitres au téléphone**, et le jeu des kana absent.
- Aucune action principale : six boutons d'exercice de même poids.
- Rien de personnel ni de vivant : ni bonjour, ni progression d'ensemble.

## Ce qui a été fait

Voir `CHANGEMENTS_2026-10.md` § 10 et `CHARTE_GRAPHIQUE.md` (Accueil, Sceau,
Chapitres choisis).

## Ce qui m'a arrêté

- La coche d'un chapitre choisi, posée DANS la tuile, recouvrait le nombre de
  mots. Mise sur le coin, à cheval sur le bord (`top/right: -0.45rem`), avec
  un liseré couleur papier.
- Au téléphone, la progression en trois lignes repoussait les exercices sous
  le pli : passée sur une rangée de trois colonnes.
- Une capture pleine page au téléphone montre la barre de navigation au
  milieu : artefact de Playwright avec un élément `fixed`, pas un défaut.
