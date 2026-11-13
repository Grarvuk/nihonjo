NE ME DEMANDE JAMAIS L'AUTORISATION POUR QUOI CE SOIT

# ⛔ PREMIÈRE ACTION DE TOUTE SESSION — avant de répondre, avant d'écrire

Si le contenu de `contexte.md` et de `carnet_agent/LISEZ-MOI.md` **n'est pas
déjà présent dans ton contexte**, les lire MAINTENANT avec `Read`.

Ce n'est pas une suggestion. Ces fichiers portent des contraintes dont la
violation **ne lève aucune erreur** : elle produit du code qui tourne et qui
est faux — ou, pire ici, une base de vocabulaire écrasée. Une demande qui
« paraît simple » est exactement le cas où l'on saute cette étape.

Vérifier aussi `tickets/INBOX.md` pour de nouveaux tickets à prendre en compte.

# Contexte du projet

@contexte.md

⚠️ **Ne PAS supposer que cet import `@` a été résolu.** Il fonctionne dans
Claude Code et pas partout ailleurs ; dans certains outils, la ligne arrive
telle quelle, comme du texte. Un `SessionStart` dans `.claude/settings.json`
injecte `contexte.md` et `carnet_agent/LISEZ-MOI.md` en renfort, mais lui non
plus n'est pas universel. En cas de doute : lire.

# LES DOUZE RÈGLES QUI NE SE DEVINENT PAS

Le filet de sécurité minimal, si tout le reste a échoué. Chacune correspond à
un piège dont **le symptôme ne désigne pas la cause**.

1. **Le vocabulaire vit dans la base SQLite (`data/nihonjo.sqlite`), plus dans
   un fichier JS.** `archives/v1/data_cours.js` n'est plus chargé par rien :
   le modifier n'a **aucun effet**. L'amorce `api/amorce/vocabulaire_initial.json`
   n'est lue que si la base est **vide** (`Amorcage::siBaseVide`) : la
   modifier ne change pas une base qui tourne. Ajouter du vocabulaire = import
   (skill `vocabulaire-nihonjo` ; « Ajouter au cours » pour tous les comptes).
2. **`data/` est la base de production.** Un envoi FTP du dossier complet
   depuis le poste l'écrase avec la base locale — d'autant plus facilement
   que, depuis le 25/10, la base locale EST `data\nihonjo.sqlite` du poste
   (dossier partagé avec Docker). Ni l'un ni l'autre ne prévient : mettre
   en ligne **par `construire_version_prod.bat`** (copie triée dans
   `version_prod\`), jamais le dossier du projet. Et depuis les
   comptes (23/10), c'est la base de **tous** les utilisateurs. Télécharger une
   sauvegarde complète (menu du compte → « Sauvegarde complète… »,
   administrateur ; l'écran « Données » n'existe plus) avant toute
   opération risquée.
3. **Toute connexion SQLite passe par `Base::ouvrir`.** `PRAGMA foreign_keys`
   vaut OFF par défaut et se règle **par connexion** : une connexion PDO
   ouverte à la main laisse les `ON DELETE / ON UPDATE CASCADE` inactifs, sans
   erreur — supprimer un mot laisse ses liaisons, renommer un chapitre vide
   ses mots.
4. **Le schéma ne change que par une NOUVELLE migration** à la fin de
   `Base::MIGRATIONS`. Modifier une migration déjà livrée ne fait rien sur une
   base existante (`PRAGMA user_version` dit qu'elle est jouée).
5. **Tout appel passe par `appeler(action, corps)` (`assets/js/api.js`)** :
   POST JSON pour écrire (sinon 415, garde contre les requêtes forgées), et
   l'en-tête de connexion `X-Nihonjo-Jeton` — **pas** `Authorization`, que
   l'authentification Basic du `.htaccess` occupe et que PHP-CGI ne reçoit
   pas (`doc_pour_agents/comptes_et_connexion.md`). **Tout texte venu de la
   base passe par `echapper()`** avant un `innerHTML`.
6. **Front : ne jamais reconstruire un élément qu'on est en train de
   cliquer.** Un re-rendu déclenché par `change`/`blur` remplace le bouton
   entre `mousedown` et `click` : le clic est perdu en silence (vécu le 22/10
   sur les boutons d'exercice). Mettre à jour en place. Et une vue qui
   remplace un nœud (la feuille d'exercice, à chaque mot) **relit le DOM** au
   lieu de garder une référence.
7. **CSS : les jetons du thème sombre sont écrits DEUX fois** — sous
   `@media (prefers-color-scheme: dark)` et sous `:root[data-theme="sombre"]`.
   En changer un sans l'autre casse le thème dans un seul des deux cas. Et
   **pas de `backdrop-filter`, `transform` ni `filter` sur un parent d'élément
   `position: fixed`** : il en devient le repère (la barre de navigation du
   téléphone s'est collée en haut, 22/10).
8. **PHP : syntaxe compatible 7.4** (pas de `match`, de types union, de
   `readonly`, de `str_contains`). La version de PHP de l'hébergement OVH
   n'est pas relevée (`carnet_agent/en_suspens.md`).
9. **Toute requête SQL sur `mot`, `chapitre`, `mot_chapitre`, `progression`
   ou `kana_progression` porte le filtre du compte** (`VISIBLE_MOT`,
   `VISIBLE_CHAPITRE`, `utilisateur_id = :u` dans `Depot`). Un oubli ne lève
   aucune erreur : il montre ou modifie les mots d'un autre compte. Une clé de
   chapitre de compte est `nom@id` ; les fichiers échangés portent le **nom**.
10. **Le mode de connexion `dev` ne s'active que par la variable
   d'environnement `NIHONJO_AUTH=dev`** : il croit l'adresse envoyée par le
   client. Ne jamais le rendre réglable par un fichier (`api/config*.php`) ;
   les tests le lancent ainsi (`contexte.md`). En local, Docker est en mode
   `firebase`, comme en ligne (connexion Google). ⚠️ Le 23/10, « pas de mdp
   en local » a été lu à tort comme « pas de connexion » : José parlait du
   mot de passe du `.htaccess`. Le mode `aucune` reste possible, commenté dans
   `docker-compose.yml`.
11. **Rien de l'utilisateur dans le navigateur** (José, 23/10) : ni mots, ni
   progression, ni chapitres, ni **réglages**. Une préférence nouvelle =
   une clé dans `Depot::CLES_PREFERENCES` + `preference()` /
   `ecrirePreference()` (`etat.js`), jamais `localStorage` ni `memoire`
   (`doc_pour_agents/architecture.md`, « Les préférences »).
12. **« Mes mots » (`mes_mots@id`) contient TOUS les mots du compte, et c'est
   le SERVEUR qui l'impose** (`Depot::lierMesMots`, `assurerMesMots`), même
   si le navigateur envoie autre chose (case décochée par F12). Il ne se
   renomme ni ne se supprime ; un mot du compte n'en sort pas. Il remplace
   l'ancien « personnel » (schéma v3) : ce nom reste compris à l'import.

# AIGUILLAGE — lire le skill AVANT d'écrire quoi que ce soit

Les skills sont des fiches de procédure : ce qu'il faut savoir et les pièges
déjà rencontrés pour une classe de tâche. Identifier la ou les lignes qui
correspondent à la demande et `Read` le fichier indiqué. Si plusieurs
correspondent, les lire toutes — c'est le cas courant (une nouvelle donnée
affichée en réclame souvent trois).

| Si la tâche… | lire |
|---|---|
| touche à l'**API PHP**, au **SQL**, au **schéma** (table, colonne, migration) ; erreur 4xx/5xx, réponse illisible | `.claude/skills/api-php-sqlite-nihonjo/SKILL.md` |
| touche à la **connexion** (Google/Firebase, Discord, jeton, cookie de session, écran de connexion, « Créer un compte »), aux **comptes** (Mon compte, Gérer les comptes), aux **droits** (administrateur, cours / mes mots) ; erreur 401 / 403 / 404 `compte_inexistant` | `.claude/skills/comptes-et-connexion-nihonjo/SKILL.md` |
| crée ou modifie un **écran**, un composant, une boîte de dialogue, le **CSS**, les couleurs, le thème sombre, l'affichage téléphone | `.claude/skills/interface-nihonjo/SKILL.md` |
| **remet en question l'UX / l'UI**, « rends ça plus beau », « plus engageant », refait l'accueil ou un écran entier | `.claude/skills/ux-ui-nihonjo/SKILL.md` (et `interface-nihonjo`) |
| **imagine un nouveau type d'exercice** (« invente un jeu pour… », « un autre exercice où… »), en juge la pédagogie | `.claude/skills/concepteur-exercices-nihonjo/SKILL.md` (puis `exercices-nihonjo`) |
| ajoute ou modifie un **exercice**, la vérification des réponses, la progression, l'exercice d'écriture, la **page des kana** ou le **jeu des kana** | `.claude/skills/exercices-nihonjo/SKILL.md` |
| **ajoute du vocabulaire** (une page du livre, une liste de mots), importe/exporte, migre des données, sauvegarde/restaure | `.claude/skills/vocabulaire-nihonjo/SKILL.md` |
| écrit ou met à jour un **`.md`** du projet, ou commente du code | `.claude/skills/redaction-doc-agents/SKILL.md` |

La doc de conception, une mécanique par fichier, est dans `doc_pour_agents/`
(architecture, schéma, API, comptes et connexion, exercices, données et
migration, déploiement).

⚠️ **Un skill n'est pas un prompt.** Un skill est choisi par l'agent d'après la
demande, et ne se lance pas : il informe le travail en cours.

# CARNET DE L'AGENT

`carnet_agent/` est la mémoire d'expérience des agents. **Tout agent qui
travaille sur le projet — quel que soit l'outil — peut le lire, le nourrir et
le réorganiser librement, sans demander.** Le but est de capitaliser : ce
qu'une session a appris à ses dépens ne doit pas être réappris par la
suivante, ni par un autre agent.

Point d'entrée : **`carnet_agent/LISEZ-MOI.md`** — injecté au démarrage avec
`contexte.md`, à lire sinon. **À consulter aussi pendant la tâche** : avant de
modifier un fichier, chercher son nom dans le carnet. On y trouve ce que
l'environnement permet ou non, ce qui a été signalé sans être corrigé
(`en_suspens.md`), une carte des flux du code, des recettes pour les tâches
qui reviennent, et les questions à se poser **avant de rendre la main**.

Il est sous git, dans ce dépôt (à la différence de celui d'odyvresse_all).

# PÉRIMÈTRE

Faire ce qui est demandé, et **rien d'autre**. Un défaut trouvé en chemin se
**signale** (et se note dans `carnet_agent/en_suspens.md`), il ne se corrige
pas dans la foulée : deux intentions dans un même lot rendent la relecture
impossible. Vaut dans les deux sens — une tâche de doc ne devient pas une
passe de correction du code, une tâche de code ne devient pas une réécriture
de la prose alentour.
