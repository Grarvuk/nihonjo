# T-010 · Inscription, connexion Google ou Discord, « Mon compte », « Gérer les comptes »

- **Créé** : 2026-10-24
- **Tags** : #comptes #connexion #discord #interface
- **Dépend de** : T-003
- **Décisions liées** : D-002

## Description
La gestion des comptes sur le modèle d'Odyvresse :
- écran de connexion à deux groupes, « Se connecter » et « Créer un compte »,
  avec Google et Discord ; une identité sans compte → « Pas encore de compte
  Nihonjo » → « Créer mon compte » ;
- Discord par OAuth2 côté serveur (`api/discord.php`), session par cookie
  signé ;
- « Mon compte » (`#/compte`) : profil, compteurs, pseudo, export, se
  déconnecter, supprimer le compte ;
- « Gérer les comptes » (`#/comptes`, administrateur) : rôles, suppression ;
- schéma v4 (`fournisseur`, `pseudo`, `photo`).

Détail : `doc_pour_agents/comptes_et_connexion.md`, `CHANGEMENTS_2026-10.md` § 14.

## Comment tester
1. Relancer `lancer_nihonjo.bat` (le code est copié dans l'image).
2. http://localhost:8080 : l'écran montre « Se connecter » et « Créer un
   compte ». « Se connecter avec Google » avec le compte de José → l'accueil
   (son compte existe déjà, rien à créer).
3. Menu du compte → « Mon compte » : photo Google, nom, adresse,
   « Administrateur », « Compte Google », les cinq chiffres. Choisir un
   pseudo → il apparaît en haut à droite.
4. Menu du compte → « Gérer les comptes » : la liste des comptes.
5. Discord (facultatif) : dans le portail Discord, application d'Odyvresse →
   OAuth2 → Redirects → ajouter `http://localhost:8080/api/discord.php` ;
   créer `.env` à la racine du projet avec
   `NIHONJO_DISCORD_CLIENT_SECRET=<le secret>` ; relancer le `.bat` ; « Créer
   un compte avec Discord » → retour sur l'accueil, message de bienvenue.
6. Un autre compte Google : « Se connecter avec Google » → « Pas encore de
   compte Nihonjo » → « Créer mon compte » → l'accueil, compte membre.
7. En ligne : mêmes étapes après T-002, avec
   `https://nihonjo.odyvresse.com/api/discord.php` côté Discord et le secret
   dans `api/config.local.php`.

## Commentaires
### 2026-10-24 · livré
Essais automatiques : 50 (API, dont un faux Discord), 121 (parcours). Pas
éprouvés d'ici : le vrai Google, le vrai Discord (`carnet_agent/en_suspens.md`).
