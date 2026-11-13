# T-007 · Exercice « Paires » et skill concepteur d'exercices

- **Créé** : 2026-10-23
- **Tags** : #exercice #pedagogie

## Description
Skill `concepteur-exercices-nihonjo` ; exercice Paires : 18 tuiles (3 × 6),
9 mots écrits deux fois (français, kanji ou kana), glisser l'une sur
l'autre ou toucher les deux. Détail : `doc_pour_agents/exercices.md`.

## Comment tester
1. Relancer `lancer_nihonjo.bat` ; sur l'accueil, carte « Paires » (9 paires).
2. Ordinateur : glisser une tuile sur la bonne → les deux passent au vert.
   Sur une mauvaise → secousse, une erreur.
3. Toucher une tuile puis une autre : même effet.
4. Téléphone : la grille passe en 3 colonnes ; glisser au doigt ne fait pas
   défiler la page.
5. Fin de grille : bilan ; « Nouvelle grille » ; « Rejouer les mots à revoir ».
6. Dans le Lexique ou la liste : les mots ratés sont « à revoir ».

## Commentaires
### 2026-10-23 · éprouvé dans Chromium (souris et écran tactile simulé)
`tests/parcours_navigateur.py`, section « Accueil ». Pas sur un vrai
téléphone.
