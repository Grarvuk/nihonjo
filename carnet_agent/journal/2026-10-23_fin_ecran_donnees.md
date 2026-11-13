# 23/10/2026 (soir) — Fin de l'écran « Données »

*Outil : Claude (app), session cloud reliée au poste de José.*

## La demande

« Tout est en base et plus rien n'est stocké dans le localStorage ou
similis ? Afin de virer la page Données. »

## La réponse vérifiée

Audit du code (`localStorage`, `sessionStorage`, `indexedDB`, cookies,
caches) : plus aucune donnée de l'utilisateur. Restent la session Firebase
(IndexedDB de Firebase, la connexion), `nihonjo_dev_email` (mode d'essai) et
la *lecture* des données de la v1. Le parcours le vérifie désormais à la fin
(`Object.keys(localStorage)` == `['nihonjo_dev_email']`) et en mode `aucune`
(liste vide).

## Ce qui m'a arrêté

1. **Le menu du compte n'existait pas en mode `aucune`** — or c'est le mode
   du poste de José, et la sauvegarde complète allait y vivre : il aurait
   perdu le seul moyen de passer du local à l'hébergement. Menu affiché dans
   tous les modes, sans « Se déconnecter » en local.
2. **Un lien caché du menu a capté le clic du test** (`a[href="#/importer"]`
   trouvait d'abord celui du menu fermé). Sélecteur borné à `#vue`.
3. **La vérification différée de la page d'import écrivait dans l'écran
   suivant** (minuterie de 250 ms non effacée en quittant) : erreur de
   console vue par le parcours. `afficher` renvoie maintenant le nettoyage.
4. **`e.currentTarget` vaut null après un `await`** : piège évité dans le
   bandeau v1 (référence au bouton gardée avant).
5. **Une grille `display: grid` sans `minmax(0, 1fr)`** : un bouton
   `white-space: nowrap` élargissait la colonne, le menu sortait de l'écran
   du téléphone.

## Plus tard (18 h 40) — « j'ai la sensation que tu ne l'as pas fait »

José ne voyait pas la connexion Google : je l'avais coupée en local
(`NIHONJO_AUTH: aucune`) après « localement je ne veux pas avoir à utiliser
un mdp ». Sa capture suivante montrait la fenêtre du **mot de passe Basic**
du `.htaccess` : c'était de lui qu'il parlait, pas de Google. J'avais corrigé
les deux, alors qu'un seul était demandé. Docker repasse en mode `firebase`.
**Leçon** : quand une demande peut viser deux choses, corriger celle que la
preuve montre (la capture), et dire en une ligne ce qu'on ne touche pas.

## Le lendemain (24/10, 14 h) — « je ne vois toujours pas de bouton Google »

Vérifié dans le Chrome de José (Claude in Chrome) : `http://localhost:8080`
servait encore la version d'avant-hier midi (onglet « Données » présent,
`echanges.js` en 404, `sante` → `"mode":"aucune"`). Le code livré était bon ;
le conteneur n'avait pas été reconstruit. **Leçon** : avant de chercher dans
le code, demander à `sante` (ou à un fichier récent) ce qui tourne vraiment.
`lancer_nihonjo.bat` passe à `up -d --build --force-recreate` et affiche le
mode de connexion du serveur lancé.
