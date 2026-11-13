# T-009 · Écran « Données » supprimé, ses fonctions réparties

- **Créé** : 2026-10-23
- **Tags** : #donnees #interface

## Description
Tout est en base (T-008) : l'onglet « Données » disparaît. Sauvegarde
complète et état du serveur → menu du compte (administrateur, aussi sur le
poste local) ; exporter mes mots → page d'import et « Exporter ce
chapitre » ; fichier de progression de la v1 → reconnu par la page
d'import ; reprise v1 d'un navigateur → bandeau de l'accueil. Détail :
`doc_pour_agents/architecture.md`, « Où sont passés les fichiers ».

## Comment tester
1. Relancer `lancer_nihonjo.bat` : 4 onglets (Réviser, Kana, Lexique, Chapitres).
2. Icône du compte en haut à droite → « Poste local », « Sauvegarde
   complète… » → Télécharger : un fichier `nihonjo_sauvegarde_….json`.
3. Lexique → « Importer une liste » → en bas, « Exporter mes mots ».
4. Chapitres → un chapitre → icône de téléchargement : « Exporter ce chapitre ».
5. Coller un ancien fichier `ma_progression_nihonjo_….json` dans la page
   d'import : « Ce fichier est une progression… » → « Appliquer à mes mots ».

## Commentaires
### 2026-10-23 · éprouvé dans Chromium
106 vérifications du parcours (dont « rien de l'utilisateur dans le
navigateur ») ; menu du compte vérifié aussi en mode `aucune`.
