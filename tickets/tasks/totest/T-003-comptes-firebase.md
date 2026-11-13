# T-003 · Comptes : connexion Google (Firebase) et vocabulaire par compte

- **Créé** : 2026-10-23
- **Tags** : #comptes #securite #api
- **Dépend de** : T-001
- **Décisions liées** : D-002

## Description
Connexion Google par le projet Firebase d'Odyvresse ; jeton vérifié en PHP
(`api/lib/Authentification.php`) ; table `utilisateur` et migration 2
(propriétaire des mots et chapitres, progression par compte,
`kana_progression`). Chaque compte ajoute ses mots et chapitres en base, voit
le cours commun et sa propre progression. Un administrateur modifie le cours
(« Ajouter au cours » à l'import, chapitres du cours) et fait les
sauvegardes complètes. Menu du compte (avatar, déconnexion) dans l'en-tête.
Détail : `doc_pour_agents/comptes_et_connexion.md`.

## Comment tester
1. Console Firebase (projet « odyvresse ») → Authentication → Paramètres →
   Domaines autorisés : `nihonjo.odyvresse.com` présent (`localhost` l'est
   d'office).
2. En local : `lancer_nihonjo.bat` → écran « Se connecter avec Google »
   (pas de mot de passe du `.htaccess`) → choisir son compte Google → « Que
   réviser ? » avec ses mots et sa progression d'avant (compte initial,
   réclamé par la première connexion). Pareil en ligne.
3. En ligne, menu du compte : son nom, « administrateur » ; « Sauvegarde
   complète… » → ligne « Serveur » : « 1 compte Google ».
4. Lexique → ajouter un mot → il apparaît dans « Mes mots ».
5. En ligne : se déconnecter, se connecter avec un autre compte Google (ou une fenêtre
   privée) : le mot du point 4 n'y est pas, la progression est vierge, pas
   de crayon sur les mots du cours.
6. En ligne, après l'envoi : les vérifications de
   `doc_pour_agents/deploiement.md` (dont `"auth": {"mode": "firebase"…}`
   dans `sante`).
7. Automatique : `php tests/api_test.php` (29 essais).

## Commentaires
### 2026-10-23 · livré sans la vraie connexion Google
Google et gstatic sont bloqués dans le bac à sable de l'agent : la
vérification de jeton est éprouvée avec une clé d'essai, et l'interface en
mode `dev`. Points 1 à 6 à faire par José (`carnet_agent/en_suspens.md`).
