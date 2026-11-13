# 24/10/2026 — Inscription, Discord, « Mon compte », « Gérer les comptes »

*Outil : Claude (app), session cloud reliée au poste de José.*

## La demande

« Je n'ai pas retrouvé la description que tu as créée pour Manus, indique-moi
directement son emplacement. Fais tout ce qui est nécessaire pour la gestion
des utilisateurs, l'inscription, la connexion etc. Inspire-toi
d'odyvresse_all pour cela. »

## Ce que j'ai repris d'Odyvresse

| Odyvresse | Nihonjo |
|---|---|
| `connection.component` : deux groupes « Se connecter » / « Créer un compte », Google et Discord | `afficherConnexion` (`app.js`) |
| `/subscribe/google`, `/auth-me/google` qui répond 404 au compte non inscrit | `compte.creer` ; 404 `compte_inexistant` → `afficherCompteInexistant` |
| Discord par passport (deckolector), `identify email`, session express | OAuth2 à la main (`ConnexionDiscord`), cookie signé (pas de session PHP, voir plus bas) |
| `profil.component` : avatar, nom, id, adresse, pseudo, badge de rôle, compteurs, suppression avec confirmation | `vues/compte.js` |
| rien pour gérer les comptes (SQL à la main) | `vues/comptes.js` (administrateur) |

## Ce qui m'a arrêté

1. **L'adresse de retour de Discord.** Un `api/index.php?action=discord.retour`
   aurait été le plus simple, mais Discord compare l'adresse octet pour octet
   à celles du portail ; un paramètre est une source d'« Invalid OAuth2
   redirect_uri ». D'où `api/discord.php`, un fichier sans paramètre, qui fait
   l'aller ET le retour (le retour se reconnaît à `code` / `error` / `state`).
2. **Les sessions PHP.** Sur un mutualisé, `session.gc_maxlifetime` (24 min
   par défaut, parfois partagé entre sites) efface les sessions : une
   connexion Discord n'aurait pas tenu la journée. Cookie signé HMAC à la
   place, clé dans `data/secret_sessions.key`.
3. **L'id d'un compte supprimé peut revenir.** `utilisateur.id` n'est pas
   AUTOINCREMENT : SQLite redonne le plus grand id libéré. Une vieille
   session « compte 2 » aurait ouvert le nouveau compte 2. La session porte
   donc l'uid, comparé à chaque requête (`Comptes::deSession`, essai dédié).
4. **L'adresse Discord non vérifiée.** Discord laisse déclarer une adresse
   sans la vérifier ; avec la liste `administrateurs`, c'était un rôle
   d'administrateur à portée de n'importe qui. Adresse jetée si `verified`
   est faux.
5. **Un 401 attendu salit la console.** La sonde de démarrage (y a-t-il une
   session Discord ?) passait par `moi` → 401 → « Failed to load resource »
   dans la console, à chaque visite de l'écran de connexion. Action publique
   `session` qui répond 200 dans les deux cas. Pour les refus VOULUS du
   parcours (404 `compte_inexistant`, 403, 409), `oublier_refus` les retire
   du journal de la console — Chrome écrit chaque statut d'erreur.
6. **`confirmer` prend du HTML, `dialogue` échappe le titre.** J'avais
   échappé le nom dans le titre : il serait sorti `&amp;`. Noté dans le skill
   `interface-nihonjo`.
7. **Le SDK Firebase qui ne charge pas** faisait tomber tout l'écran
   (« La connexion ne se charge pas ») : avec Discord, ce n'est plus une
   raison. Le bouton Google dit maintenant ce qui ne va pas.
8. **Logos.** Le bouton Discord porte une bulle de discussion générique
   (`icone('bulle')`), pas le logo ; Google garde l'icône de compte.

## Vérifié

- `php tests/api_test.php` : 50 essais (35 → 50), dont un faux Discord
  (inscription, connexion sans compte puis inscription, état falsifié,
  refus, mauvais code, adresse non vérifiée, id redonné).
- `tests/parcours_navigateur.py` : 121 vérifications (106 → 121), console
  propre ; captures relues (connexion en mode `firebase` avec Discord, au
  bureau et au téléphone en thème sombre ; compte inexistant ; Mon compte ;
  Comptes).
- `curl` sur `api/discord.php?intention=inscription` : 302 vers Discord, cookie
  `nihonjo_discord` HttpOnly SameSite=Lax.

## Pas vérifié

Le vrai Google, le vrai Discord (aucun des deux ne répond d'ici) :
`en_suspens.md`, section du 24/10.

## Addendum 25/10 — « le haut n'est toujours pas actualisé »

Les fichiers du poste étaient à jour, mais l'accueil affiché restait
l'ancien (champ « Mots par session »), même après relance et vidage du cache
supposé. Deux causes possibles, fermées toutes les deux :

1. le code était **copié dans l'image** (`COPY`) : sans reconstruction
   effective, Docker servait l'ancien. Désormais `index.html`, `assets/`,
   `api/`, `tests/` sont **montés** depuis le dossier (`docker-compose.yml`) :
   une modification se voit au rechargement, sans reconstruire ;
2. `mod_headers` n'était pas actif dans `php:apache` : le `no-cache`
   d'`assets/.htaccess` était ignoré en silence (`<IfModule>`), et Firefox
   gardait les anciens modules. `a2enmod headers` dans le `Dockerfile`.

Et le `.bat` vérifie maintenant que le `app.js` servi est celui du dossier
(« [OK] Code servi = code de ce dossier »). Je n'ai pas pu voir son écran :
ni Chrome ni son `localhost` ne sont joignables d'ici.
