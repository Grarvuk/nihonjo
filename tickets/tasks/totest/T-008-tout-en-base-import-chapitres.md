# T-008 · Tout en base, page d'import, gestionnaire de chapitres

- **Créé** : 2026-10-23
- **Tags** : #donnees #import #chapitres #interface

## Description
Schéma v3 : préférences du compte en base (plus rien dans le navigateur) ;
« Mes mots » (ancien « personnel ») dans chaque compte, avec tous ses mots,
imposé par le serveur. Page « Importer des mots » (texte pour une IA,
collage ou fichier, vérification, chapitres). Écran Chapitres refait en
gestionnaire. Détail : `doc_pour_agents/architecture.md` (préférences),
`donnees_et_migration.md` § 2 bis (import), `schema_bdd.md` (v3).

## Comment tester
1. Relancer `lancer_nihonjo.bat`. Tes mots et ta progression sont là ; ton
   ancien chapitre « personnel » s'appelle « Mes mots ».
2. Accueil : décocher un chapitre ; ouvrir Nihonjo dans un autre navigateur
   (ou en ligne) : le même chapitre est décoché.
3. Lexique → « Ajouter un mot » : « Mes mots » est coché, avec un cadenas.
4. Lexique → « Importer une liste » : remplir le sujet (« les 151 Pokémon de
   la première génération »), copier le texte, le coller dans une IA, coller
   sa réponse à l'étape 2 : les mots prêts, les erreurs, un aperçu. Étape 3 :
   un nouveau chapitre « Pokémon 1G » → Importer.
5. « Gérer le chapitre » : ajouter des mots (d'un chapitre du cours, d'un
   thème), en cocher, les copier / déplacer vers un autre chapitre, en
   retirer ; « Réviser ce chapitre ».
6. Dans « Mes mots », tes mots ont un cadenas : ils n'en sortent pas.

## Commentaires
### 2026-10-23 · éprouvé dans Chromium
35 essais d'API, 99 vérifications du parcours (dont une triche « F12 » sur
l'import et le formulaire). Pas sur un vrai téléphone.
