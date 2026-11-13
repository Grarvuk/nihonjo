# T-006 · Accueil refait : tous les exercices à un toucher

- **Créé** : 2026-10-23
- **Tags** : #interface #ux

## Description
Skill `ux-ui-nihonjo` (repris d'Odyvresse) et refonte de l'accueil : bonjour
en cases, grand bouton « Réviser 20 mots », progression d'ensemble, fiches de
tous les exercices (vocabulaire, écriture, hiragana, katakana, les deux,
tableau), mot du jour, choix des mots en bas.

## Comment tester
1. Relancer `lancer_nihonjo.bat`, ouvrir http://localhost:8080.
2. Sans défiler (téléphone comme ordinateur) : le bonjour, le grand bouton.
3. Grand bouton → une session de 20 mots ; les mots à revoir passent.
4. Chaque fiche lance son exercice d'un toucher ; Hiragana / Katakana lancent
   le jeu directement.
5. Choisir une autre fiche, revenir : elle est marquée « dernier choisi » et
   le grand bouton la reprend.
6. Mot du jour : « Voir la lecture et le sens ».
7. En bas, retirer un chapitre : coche et bord disparaissent, les nombres
   changent en haut.
8. Thème sombre (lune en haut à droite) : tout reste lisible.

## Commentaires
### 2026-10-23 · éprouvé dans Chromium
`tests/parcours_navigateur.py`, section « Accueil » ; captures bureau et
téléphone, deux thèmes. Pas sur Safari / iOS.
