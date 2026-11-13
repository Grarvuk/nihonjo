# T-004 · Page des kana (tableaux) et jeu des kana

- **Créé** : 2026-10-23
- **Tags** : #kana #exercice #interface

## Description
Onglet « Kana » : tableaux des hiragana et katakana (base, voisés,
combinaisons ; 104 caractères par alphabet), chacun avec sa lecture et son
état pour le compte (acquis, à revoir, jamais joué). Jeu : un caractère,
on écrit sa lecture en rōmaji ; **erreurs illimitées**, « Je ne sais pas »
montre la lecture ; les ratés reviennent une fois ; bilan et « Rejouer les
ratés ». Réglages : alphabet, lignes, nombre (20, 50, tous, sans fin).
Détail : `doc_pour_agents/exercices.md`, section « Le jeu des kana ».

## Comment tester
1. Onglet « Kana » : trois tableaux ; « Katakana » et « Les deux » changent
   l'affichage ; au téléphone, pas de défilement de la page en largeur.
2. « Jouer » → choisir « a » et « k », 20 caractères → Commencer.
3. Écrire une mauvaise lecture plusieurs fois : le caractère reste. Puis la
   bonne : caractère suivant.
4. « Je ne sais pas » : la lecture s'affiche ; la recopier.
5. Variantes acceptées : « si » pour し, « tu » pour つ, « hu » pour ふ.
6. Finir : bilan ; « Rejouer les ratés ».
7. Retour à « Kana » : les caractères joués sont soulignés (vert : acquis,
   orange : à revoir).
8. Depuis le tableau, le bouton d'une ligne (« sh »…) lance une partie sur
   cette ligne.

## Commentaires
### 2026-10-23 · éprouvé dans Chromium
`tests/parcours_navigateur.py`, sections « Kana » et « Jeu des kana » (bureau,
téléphone, thème sombre). Pas sur Safari / iOS.
