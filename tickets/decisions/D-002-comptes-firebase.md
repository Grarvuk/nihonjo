# D-002 · Comptes : la connexion Firebase d'Odyvresse

- **Date** : 2026-10-23
- **Statut** : Accepté
- **Tâche liée** : T-003

**Contexte**  
Nihonjo est en ligne sur `nihonjo.odyvresse.com`, protégé jusque-là par le
seul mot de passe Basic du `.htaccess` racine : un seul utilisateur, José.
Il demande que d'autres personnes puissent s'en servir et ajouter leur
vocabulaire, avec la connexion d'Odyvresse (Firebase Authentication, Google).

**Décision**  
- Même projet Firebase (« odyvresse »), connexion Google par fenêtre
  surgissante (redirection si elle est bloquée), SDK chargé depuis gstatic.
- Le jeton d'identité part dans l'en-tête **`X-Nihonjo-Jeton`** ; PHP le
  vérifie lui-même (RS256, certificats Google en cache, `iss`, `aud`, `exp`,
  `iat`, `auth_time`, `sub`).
- Table `utilisateur` (rôle `admin` / `membre`). Le cours est commun et
  modifié par un administrateur ; mots, chapitres, progression et kana sont
  par compte.
- Les données d'avant vont au **compte initial** (n° 1), réclamé par la
  première connexion — ou par une adresse de `administrateurs`
  (`api/config.local.php`).
- Trois modes : `firebase` (défaut), `aucune` (local sans réseau), `dev`
  (tests, variable d'environnement seulement).

**Pourquoi**  
- Un compte Google d'Odyvresse sert tel quel ; rien à créer, aucun mot de
  passe à stocker chez nous.
- Pas de Composer ni de bibliothèque JWT sur le mutualisé : la vérification
  RS256 tient en une centaine de lignes avec `openssl_verify`.
- `Authorization` est déjà pris par l'authentification Basic (le
  navigateur le renvoie à chaque requête) et PHP en CGI ne le reçoit pas.
- Le compte initial évite toute manipulation de José pour retrouver ses
  mots et sa progression.

**Conséquences**  
- José a deux actions dans la console Firebase (domaine autorisé, peut-être
  référent de la clé) : `doc_pour_agents/deploiement.md`.
- PHP doit pouvoir joindre `www.googleapis.com` (non vérifié sur OVH).
- Toute requête de `Depot` porte le filtre du compte (règle n° 9 de
  `CLAUDE.md`).
- Le mot de passe Basic peut rester (les deux s'additionnent) ; le retirer
  ouvre la page de connexion à tous.
- Format de sauvegarde v2 (avec comptes) ; les sauvegardes v1 restent
  lisibles.

**Complément du 24/10/2026 (T-010)**  
- Inscription explicite (« Créer un compte »), comme Odyvresse : une
  identité inconnue ne crée plus de compte en se connectant
  (`compte_inexistant`). Écarté : garder la création silencieuse — José
  voulait voir l'inscription, et un compte né d'un clic sur « Se connecter »
  surprend.
- Discord en plus de Google, par OAuth2 **côté serveur** et un cookie signé.
  Écartés : Discord via Firebase (Firebase n'a pas de fournisseur Discord :
  il faudrait des « custom tokens », donc firebase-admin et Composer, absents
  de l'hébergement) ; les sessions PHP (ramasse-miettes du mutualisé, 24 min).
