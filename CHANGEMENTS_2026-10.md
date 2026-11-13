# Changements — octobre 2026

Journal orienté « pourquoi ». Le comment est dans `doc_pour_agents/`.

## 1. Le vocabulaire passe en base de données (22/10)

**Avant.** Les 1 034 mots du cours étaient un tableau JavaScript
(`data_cours.js`), modifiable seulement en éditant le fichier. Les mots
ajoutés, les copies faites en créant un chapitre et la progression vivaient
dans l'IndexedDB du navigateur ; les chapitres perso et leur catégorie dans le
localStorage. Résultat : une progression par navigateur, perdue avec lui.

**Maintenant.** Une base SQLite (`data/nihonjo.sqlite`) derrière une API PHP
(`api/index.php?action=…`) — choix et alternatives : `D-001`. Au premier
lancement la base est amorcée avec le contenu de `data_cours.js` (converti
par `outils/convertir_donnees_v1.mjs`, modification non commitée de « えっ »
comprise). Ancienne version rangée dans `archives/v1/`, plus chargée.

| v1 | v2 | pourquoi |
|---|---|---|
| mots du cours en lecture seule | tous les mots modifiables (Lexique → crayon) | corriger une faute ne demande plus d'éditer un fichier |
| « Créer et peupler » **copiait** les mots | il les **rattache** : un mot dans plusieurs chapitres | pas de doublon, une seule progression par mot |
| supprimer un chapitre supprimait tous ses mots (des copies) | seulement ceux qui n'étaient que dans ce chapitre | les autres vivent ailleurs |
| progression indexée par le texte français | par mot, avec réussites, échecs, date | les mots de même premier sens (117 sens, 247 mots dans le cours) partageaient leur état |
| un thème obligatoire | facultatif (« indéterminé ») | — |
| chapitres « système » cachés de la gestion | tous gérables, sauf « personnel » | ce sont des données comme les autres |

Ce qui **n'a pas changé** : la règle de progression (juste → acquis, faux ou
passé → à revoir), les cases cochées (même clé localStorage), les formats
de fichier v1 (toujours importables).

## 2. Reprise de ce que la v1 a laissé dans le navigateur (22/10)

Écran « Données » → « Ancienne version », et un bandeau sur « Réviser » tant
que ce n'est pas fait. Les copies de mots du cours sont reconnues (même sens,
kana, kanji) et fusionnées avec l'original au lieu d'être dupliquées ; la
progression, indexée par texte en v1, est rattachée aux mots correspondants
et ne fait jamais reculer un mot. Rien n'est effacé du navigateur. Détail :
`doc_pour_agents/donnees_et_migration.md`.

⚠️ À faire **sur chaque navigateur** où la v1 servait, à la même adresse.

## 3. Nouvelle interface (22/10)

Idée directrice : le cahier d'écriture japonais. Les mots japonais des
questions s'écrivent dans des cases à croix de repère (genkō yōshi), en Klee
One, une police de type manuscrit scolaire ; tout le reste se tait (papier
quadrillé, encre indigo, filets céladon). Thème sombre « tableau noir ».
Charte : `CHARTE_GRAPHIQUE.md`.

| écran | nouveau |
|---|---|
| Réviser | chapitres en vignettes avec leur avancement ; total de la sélection et sa répartition acquis / à revoir / nouveaux ; chaque exercice affiche combien de mots il prendra |
| Exercice | question en cases ; correction tracée ○ / × ; bilan de fin avec les erreurs et « Refaire les erreurs » (la v1 rechargeait la page) |
| Liste | recherche ; clic sur l'état pour le changer ; écriture d'un ou plusieurs mots |
| Lexique | tous les mots, recherche, filtres, ajout / modification dans une boîte de dialogue |
| Chapitres | création peuplée avec aperçu du nombre de mots, renommage, changement de catégorie |
| Données | sauvegarde complète, progression, mots ajoutés, reprise v1, état du serveur |
| partout | téléphone (navigation en bas), thème sombre, messages à la place des `alert()` |

## 4. Défauts de la v1 corrigés en passant

La réécriture du front les touchait de toute façon ; listés pour que rien ne
paraisse changer sans raison.

| défaut | effet en v1 |
|---|---|
| `creerToucheClavier` définie deux fois | le clavier du formulaire d'ajout écrivait dans le champ (caché) de l'exercice |
| mots à trous : `motCompletAttendu.includes(saisie)` | n'importe quel morceau du mot était compté juste |
| « Kanjis → kana » acceptait le kanji | recopier la question suffisait |
| trou possible sur « 〜 » | question sans intérêt |
| mélange `sort(() => Math.random() - 0.5)` | ordre biaisé |
| HTML construit sans échappement | un « < » dans un mot cassait l'affichage |
| `location.reload()` pour revenir au menu | perte de l'état, rechargement complet |
| Dexie chargé depuis unpkg **sans version** | une nouvelle version majeure pouvait casser l'application du jour au lendemain |

## 5. Docker local (22/10)

nginx (fichiers statiques) → `php:8.3-apache`, base dans le volume nommé
`nihonjo_donnees`. Toujours `docker-compose up -d --build` après un
changement de code. ⚠️ `docker compose down -v` supprime la base.

## 6. Documentation pour les agents (22/10)

Même architecture qu'odyvresse_all : `CLAUDE.md` (règles qui ne se devinent
pas, aiguillage), `contexte.md`, `doc_pour_agents/`, `.claude/skills/` (cinq
skills), `.claude/settings.json` (injection au démarrage), `carnet_agent/`
(cette fois sous git), `tickets/`.

## 7. Des comptes : connexion Google, vocabulaire de chacun en base (23/10)

**Pourquoi.** Nihonjo est en ligne (`nihonjo.odyvresse.com`) et José veut
que d'autres s'en servent et ajoutent leur propre vocabulaire. Il a demandé
la connexion d'Odyvresse.

- Même projet Firebase qu'Odyvresse, connexion Google ; le jeton est vérifié
  par PHP (`api/lib/Authentification.php`) et voyage dans `X-Nihonjo-Jeton`,
  pas dans `Authorization`, que le mot de passe Basic du `.htaccess` occupe
  (`tickets/decisions/D-002-comptes-firebase.md`).
- Le cours (1 034 mots, ses chapitres) est **commun** ; les mots ajoutés,
  les chapitres créés, la progression et les kana sont **à chaque compte**.
  Un administrateur modifie le cours : « Ajouter au cours » à l'import,
  chapitres du cours, sauvegarde complète et restauration.
- Migration 2 du schéma : table `utilisateur`, `proprietaire_id` sur les
  mots et chapitres, progression par compte. Ce qui existait va au
  **compte initial**, que prend la première connexion : José retrouve ses
  mots et sa progression sans rien faire.
- Clé des chapitres d'un compte : `nom@id` (chacun a son « personnel ») ;
  les fichiers d'export gardent le nom seul et restent compatibles.
- Sauvegarde complète au format v2 (avec les comptes) ; une sauvegarde du
  22/10 se restaure encore.
- Il reste deux gestes à José dans la console Firebase :
  `doc_pour_agents/deploiement.md`.

## 8. Les kana : tableaux et jeu (23/10)

**Pourquoi.** José voulait une page de cours sur les deux syllabaires, en
tableau, et un jeu où l'on écrit le rōmaji d'un caractère, « autant
d'erreurs qu'on veut ».

- Onglet « Kana » : hiragana, katakana ou les deux côte à côte ; caractères
  de base, voisés, combinaisons (104 par alphabet), avec la lecture et l'état
  de chacun pour le compte.
- Jeu : le caractère reste tant qu'il n'est pas trouvé ; « Je ne sais pas »
  montre la lecture à recopier ; un raté revient une fois quelques
  caractères plus loin. Les variantes de lecture courantes sont acceptées
  (si, tu, hu, zi…). Ce qu'on ne connaît pas encore passe en premier.
- Progression propre aux kana (`kana_progression`) : un caractère n'est pas
  un mot du lexique. Acquis = plus de réussites (du premier coup) que
  d'échecs.

## 9. Un lanceur pour le poste (23/10)

`lancer_nihonjo.bat` : démarre Docker Desktop s'il le faut, construit et
lance le conteneur, attend l'API, ouvre le navigateur. Il remplace la
commande à taper. Fins de ligne CRLF imposées par `.gitattributes` (en LF,
`cmd.exe` lit mal les étiquettes).

## 10. Un accueil qui donne envie de réviser (23/10)

**Pourquoi.** José : « que ça donne envie de cliquer et que ce soit beau »,
et tous les exercices — le jeu des kana compris — accessibles depuis la page
principale. L'ancien accueil était un formulaire : chapitres et filtres
d'abord, exercices dans une colonne, sous le pli au téléphone ; le jeu des
kana n'y figurait pas.

- Nouveau skill `ux-ui-nihonjo`, repris de l'agent UX/UI et du maquettiste
  d'Odyvresse : méthode (captures, grille de critique, plan, intégration,
  recapture) et règles. Outil `outils/captures_ecrans.py`.
- En haut : bonjour en japonais selon l'heure, dans les cases ; où en est la
  sélection ; un grand bouton « Réviser 20 mots » qui relance le dernier
  exercice choisi, les mots à revoir d'abord ; la progression d'ensemble
  (vocabulaire, hiragana, katakana).
- Tous les exercices en fiches, chacun lancé d'un toucher : les six de
  vocabulaire, l'écriture (10 mots), hiragana, katakana, les deux, et le
  tableau des kana.
- Le mot du jour, à découvrir d'un toucher.
- Le choix des mots passe en bas ; un chapitre choisi se marque d'une coche
  au lieu d'un fond bleu.

## 11. Paires, et un skill pour concevoir les exercices (23/10)

**Pourquoi.** José veut d'autres types d'exercices, et un skill capable
d'en imaginer. Son exemple : 3 rangées de 6 mots, chacun écrit deux fois
(français, kanji ou kana), à apparier en glissant.

- Skill `concepteur-exercices-nihonjo` : la matière disponible (et ce qui
  manque), les principes qui font apprendre, une matrice pour inventer, une
  banque d'idées jugées faisables ou non, une fiche de conception à remplir
  avant le code, les pièges, et comment intégrer (question par mot ou vue à
  part).
- Exercice **Paires** (`vues/paires.js`), sur l'accueil : glisser au doigt ou
  à la souris, ou toucher les deux tuiles ; une forme n'est jamais affichée
  deux fois (homonymes) ; la progression des mots est enregistrée comme
  pour les autres exercices ; bilan avec les mots à revoir.

## 12. Tout dans la base, une page d'import, un gestionnaire de chapitres (23/10)

**Pourquoi.** José : ne plus rien garder dans le navigateur, « tout
sauvegarder dans la bdd » ; importer des listes facilement, même préparées
par une IA ; gérer ses chapitres « avec un outil puissant ».

- **Schéma v3.** Les réglages (sélection de révision, filtres, thème, jeu des
  kana…) passent dans la base, par compte : on les retrouve sur tous ses
  appareils. Ceux qu'un navigateur gardait encore sont repris, puis effacés.
- **« Mes mots »** remplace « personnel » : chaque compte a le sien, qui
  contient tous ses mots — décidé par le serveur, même si l'on décoche la
  case à la main. Il ne se renomme ni ne se supprime ; supprimer un autre
  chapitre ne fait plus disparaître de mots.
- **Ajouter un mot** : toujours le formulaire du Lexique, « Mes mots »
  verrouillé, et seulement ses chapitres à soi.
- **Importer des mots** (Lexique → « Importer une liste ») : trois étapes
  expliquées à l'écran ; un texte à donner à une IA qui se complète avec le
  sujet, le nombre, le thème ; on colle la réponse telle quelle (ou on choisit
  un fichier) ; la liste est vérifiée et montrée avant ; on la range dans
  « Mes mots », ses chapitres, ou un nouveau. Le bouton « Remplacer mes mots »
  de « Données » disparaît (l'API garde ce mode).
- **Chapitres** devient un gestionnaire : la liste à gauche (les siens, puis
  ceux du cours, où l'on peut prendre des mots), le chapitre à droite ;
  ajouter des mots d'un autre chapitre, d'un thème ou du lexique, un par un
  ou tous d'un coup ; retirer, copier, déplacer en lot ; réviser le chapitre.

## 13. L'écran « Données » disparaît (23/10)

**Pourquoi.** Tout ce qui appartient à l'utilisateur est dans la base
(§ 12) : il n'y avait plus de données « du navigateur » à gérer, et José
voulait « virer la page Données ». Rien n'est perdu, tout est rangé là où on
en a besoin (`assets/js/echanges.js`) :

- **Sauvegarde complète** et restauration, avec l'état du serveur : menu du
  compte → « Sauvegarde complète… » (administrateur). Le menu existe
  désormais aussi sur le poste local sans connexion.
- **Exporter mes mots** : en bas de la page d'import ; et « Exporter ce
  chapitre » dans le gestionnaire.
- **Un fichier de progression de l'ancienne version** : collé dans la page
  d'import, il est reconnu et s'applique aux mots (jamais de recul).
- **La reprise de la v1 restée dans un navigateur** : le bandeau de
  l'accueil importe sur place.
- **Exporter la progression** : abandonné, elle vit dans le compte.

Ce qui reste dans le navigateur, et ce n'est pas une donnée de
l'utilisateur : la session de connexion Google (Firebase), et, en mode
d'essai seulement, l'adresse de connexion. Le parcours de test le vérifie
désormais (`Object.keys(localStorage)` à la fin).

## 14. Créer un compte, se connecter avec Google ou Discord, « Mon compte » (24/10)

**Pourquoi.** José : « Fait tous ce qui est nécessaire pour la gestion des
utilisateurs, l'inscription, la connexion etc. Inspire-toi d'odyvresse_all. »
Jusque-là, un seul bouton « Se connecter avec Google » créait le compte en
silence ; ni inscription visible, ni Discord, ni page de profil, ni moyen de
gérer les comptes autrement qu'en SQL.

Ce qui change, sur le modèle d'Odyvresse (écrans `connection` et `profil`,
`compte-auth.service.ts`, la connexion Discord de deckolector) :

- **L'écran de connexion** a deux groupes : « Se connecter » et « Créer un
  compte », chacun avec Google et Discord. Se connecter avec une identité
  qui n'a pas de compte ouvre « Pas encore de compte Nihonjo » → « Créer mon
  compte » (un clic) ; rien n'est créé sans ce clic (`compte_inexistant`,
  404).
- **Discord** (OAuth2 mené par le serveur, `api/discord.php`, droits
  `identify email`), puis un cookie de session signé de 30 jours. Le bouton
  n'apparaît que si le secret de l'application Discord est fourni (`.env` en
  local, `api/config.local.php` en ligne). Une adresse Discord non vérifiée
  n'est pas gardée (sinon un rôle d'administrateur s'usurpait).
- **Mon compte** (`#/compte`, menu du compte) : photo, nom, adresse, rôle,
  d'où vient le compte, ce qu'il contient (mots, chapitres, acquis, à revoir,
  kana), un **pseudo** au choix, exporter / importer, se déconnecter,
  **supprimer le compte** (tout ce qui est à lui part ; le cours reste).
- **Gérer les comptes** (`#/comptes`, administrateur) : tous les comptes,
  leur contenu, leurs dates ; nommer ou retirer un administrateur ; supprimer
  un compte. Il reste toujours au moins un administrateur.
- Schéma **v4** : `utilisateur.fournisseur`, `pseudo`, `photo`.
- Le SDK Firebase qui ne se charge pas ne bloque plus l'écran de connexion.

Détail : `doc_pour_agents/comptes_et_connexion.md` (v2.0). Essais : 50 dans
`tests/api_test.php` (15 de plus, dont un faux Discord), 121 vérifications
dans `tests/parcours_navigateur.py` (section « Comptes »). ⚠️ Pas éprouvé ici :
la vraie connexion Google et le vrai Discord (le bac à sable n'atteint ni
l'un ni l'autre) — `carnet_agent/en_suspens.md`.

## 15. Le nombre de mots à réviser, et une progression qui suit les chapitres (25/10)

- **« Mots à réviser »**, à côté du grand bouton de l'accueil, **20 par
  défaut** (`nombreAReviser`, `etat.js`). Il vaut pour la révision rapide,
  chaque carte d'exercice et l'écriture (avant : champ « Mots par session »
  en bas de page, vide = tous ; l'écriture prenait 10). Gardé dans la
  préférence `filtres.limite`. Paires garde sa grille de 9 paires.
- **La barre « Vocabulaire »** de l'en-tête compte les mots des **chapitres
  cochés** (`motsDesChapitresCoches` : ni thème ni état, sinon filtrer
  « Acquis » afficherait 100 %), et se redessine à chaque changement.
  Hiragana et katakana restent des totaux (ils n'ont pas de chapitres).

## 16. L'allure de la maquette de Manus (25/10)

José a fait faire une maquette par Manus (`maquette/`, Vite + JS, données de
démonstration) et demandé de s'en inspirer. Transposé sans changer la
mécanique :

- **Partout** : nouvelle palette (jetons de `:root`, sombre écrit deux fois),
  Manrope / DM Sans / Noto Sans JP, surtitres, grands rayons, ombres
  douces, navigation en pastilles.
- **Accueil** : grand titre (date, bonjour), carte bleu nuit « Votre
  priorité » (le premier mot à revoir en grand, le bouton « Réviser N mots »
  et le champ « Mots à réviser »), mot du jour à côté, bande « Votre
  progression » à trois anneaux (mots des chapitres choisis, hiragana,
  katakana ; « N acquis sur M » sur une ligne), cartes d'exercice avec
  surtitre, exemple dans une pastille teintée et flèche.
- **Pas repris**, faute de données réelles : la série de jours, l'activité
  de la semaine, les points d'expérience, « dernière activité ». Ils
  demanderaient de garder l'historique des sessions (nouvelle table).

## 17. L'écran d'exercice de la maquette, et des Paires plus japonaises (25/10)

- **La session d'exercice** suit le nouvel écran de la maquette de Manus :
  au bureau, trois colonnes — la session à gauche (quitter, titre, progression,
  pastilles ○ / × des mots faits), la question au centre, « Dans cette
  session » à droite (bonnes réponses, mots à revoir, mots restants). La
  carte : consigne en surtitre, grande question, champ coloré selon le
  résultat, bandeau de correction, récapitulatif en cases, grand
  « Suivant ». ⚠️ Le clavier reste **en dernier** (demande du 25/10), alors
  que la maquette le place au-dessus de la correction.
- **Paires** : surtout kana ↔ mot à un ou deux kanjis, une ou deux paires
  hiragana ↔ katakana, une ou deux avec le français
  (`doc_pour_agents/exercices.md`, « Composition d'une grille »).
- Pas repris de la maquette, faute de données : le chronomètre, la série de
  jours, le « conseil mémoire » sur le kanji (il faudrait une explication
  par kanji dans la base), la prononciation.

## 18. Une corbeille dans Paires, et le clavier en deux colonnes (25/10)

- **Paires** : une corbeille sous la grille. Un mot qu'on ne connaît pas s'y
  glisse (ou se touche, puis la corbeille) : il part avec son autre
  écriture et passe « à revoir ». Le bilan les compte.
- **Clavier de kana** : quand il est large, la première moitié des familles
  à gauche (あ, か, さ, た, な, は les unes sous les autres), la seconde à
  droite (ま, や, ら, わ, ん) — et non plus deux familles voisines sur la
  même ligne.

## 19. La revue du concepteur appliquée : paliers, corrections, trois exercices (25/10)

José : « Mets en application toutes tes recommandations, sauf pour les
paires. » Le détail : `doc_pour_agents/exercices.md`.

- **Un mot n'est plus « acquis » d'une seule bonne réponse.** Nouvel état
  **en cours** (bleu ciel) ; « acquis » demande des réussites sur **deux
  jours différents**, dont une où l'on a **écrit le japonais**
  (Français → japonais, Kanjis → kana, Dictée). Choisir parmi des
  propositions (Paires, tuiles) mène au plus à « en cours ». Chaque mot a une
  **date de retour** (demain, puis 3, 7, 14, 30, 60 jours) : un mot acquis
  revient quand elle arrive. Les mots déjà acquis le restent (schéma v5).
- **Le grand bouton conseille** l'exercice d'après la sélection et dit
  pourquoi : mots nouveaux → Paires ; reconnus → Japonais → français ; à
  reprendre ou en cours → Français → japonais. Les cartes tirent aussi les
  mots à reprendre et ceux dont la date est arrivée en premier.
- **Français → japonais** n'accepte plus le rōmaji (on le dit sans compter la
  réponse) et accepte un autre mot du même sens.
- **Japonais → français** montre le mot en kana, sans le kanji ni sa lecture
  au-dessus ; le kanji seul reste à Kanjis → français. Les deux tolèrent une
  faute de frappe (« mange » pour « manger ») et l'article.
- **Mots à trous (kanji)** : le trou tombe toujours sur un kanji, et les dix
  tuiles sont des kanjis, pris d'abord dans les mots de la session.
- **Écriture** : « De mémoire » par défaut ; le modèle disparaît après 4 s.
- **Jeu des kana** : le sens inverse, « Écrire : rōmaji → kana ».
- **Le son** : un bouton « Écouter » dans chaque correction (voix japonaise
  du navigateur ; grisé s'il n'y en a pas).
- **Deux exercices** : **Dictée** (la voix dit le mot, on l'écrit) et
  **Choix de la lecture** (un kanji, quatre lectures qui se ressemblent).

## 20. Acquis en deux réussites de suite, et « à rafraîchir » (25/10, le soir)

José : « Je veux un état d'apprentissage […] qui permet de réviser les mots
les plus anciennement appris, je te laisse placer les curseurs […]. Je ne
veux pas que l'état acquis doive se faire à travers 2 jours différents, mais
simplement qu'on le réussisse 2 fois de suite. »

- **Acquis** = deux bonnes réponses **de suite** (même jour possible), en
  retrouvant le sens ou en écrivant le japonais. Une erreur remet la série à
  zéro ; choisir parmi des tuiles ou les paires ne compte pas (au plus
  « en cours »).
- **À rafraîchir** (lavande) : un mot acquis il y a un moment. Il le devient
  7 jours après sa dernière validation ; réussi, il revient ensuite après
  15, 30, 60 puis 120 jours ; raté, il retombe « à revoir ».
- La base garde la **date d'acquisition**, celle de la dernière validation et
  le nombre de rafraîchissements (schéma v6). Dans la liste, le badge les
  dit en survol.
- L'accueil compte et filtre « À rafraîchir » ; le grand bouton les propose
  juste après les mots à revoir, les plus anciens d'abord.

## 21. La version de production et l'application Android (25/10, le soir)

José : « Crée un .bat qui permet de convertir l'ensemble de la solution en
application Android. Si on ne peut pas glisser-déposer l'ensemble du projet
[en ligne] mais qu'il doit passer par un traitement, crée aussi un .bat pour
faire la version prod du projet. »

- **`construire_version_prod.bat`** : on ne peut pas envoyer le dossier tel
  quel (la base du poste écraserait celle du serveur, des secrets
  partiraient). Il passe les essais de l'API si Docker tourne, recopie dans
  `version_prod\` seulement ce qui doit partir, vérifie qu'aucune base, clé
  ni secret n'y est, et en fait un zip. On envoie le contenu de
  `version_prod\` dans `www/nihonjo/`.
- **`creer_application_android.bat`** : l'application Android, faite
  **comme celle d'Odyvresse** (José : « Tu ne peux pas t'inspirer de la
  façon de faire d'odyvresse_all ? ») — Capacitor, Android Studio, APK de
  debug. Le front est copié dans l'APK ; il appelle l'API du site en ligne
  (CORS pour l'origine de l'application, mot de passe Basic levé pour elle
  sur `api/index.php`). Google se connecte par le sélecteur de compte
  d'Android, avec les pièges déjà résolus chez Odyvresse. Pas de Discord
  dans l'application. Résultat : `sortie_android\Nihonjo-<date>.apk`. Une
  fois : déclarer `com.odyvresse.nihonjo` dans la console Firebase.
  (Une première version, une *Trusted Web Activity* par Bubblewrap, a été
  remplacée le soir même.)
- Pour le site : `manifest.webmanifest` et des icônes (`assets/icones/`),
  pour l'installer sur l'écran d'accueil.

## 22. Nihonjo introuvable en ligne : le `.htaccess` du dossier parent (26/10)

Après la mise en ligne, nihonjo.odyvresse.com répondait « Not Found »
partout. La cause n'était pas Nihonjo : le `.htaccess` du dossier parent
(`www/`, celui d'Odyvresse) envoyait toute requête vers Odyvresse, et
Nihonjo en héritait. Deux corrections, chacune suffisante :

- le `.htaccess` de `www/` ne vise plus que le domaine d'Odyvresse (copie
  corrigée dans `a_envoyer_dans_www\`, à envoyer dans `www/` du serveur) ;
- Nihonjo a désormais **son** `.htaccess` racine, qui part avec la version
  de production : il écarte les règles du parent, renvoie
  `www.nihonjo.odyvresse.com` vers `nihonjo.odyvresse.com`, et refuse de
  servir les fichiers qui n'ont rien à faire en ligne. Le mot de passe Basic
  y est en option, désactivé.

## 23. Les kanjis ont leur cours, leur jeu et leur progression ; l'autre alphabet ne fait plus acquérir (26/10)

José : « Quand on écrit un mot en katakana alors que c'est de l'hiragana, et
vice versa, s'il est bien écrit, on considère que c'est réussi, mais sans
jamais la possibilité de le passer en acquis. » Et : « des cours et des exos
concernant l'aspect kanji […] j'imagine comme les kanas il doit avoir sa
propre barre de progression. »

- **L'autre alphabet** : ミズ pour みず est accepté (« Juste, dans l'autre
  alphabet », avec l'écriture attendue), compté comme une réussite, mais la
  série vers « acquis » repart de zéro. Avant, c'était une erreur.
- **Onglet « Kanji »** : 626 kanjis — les trois premières années de l'école
  japonaise, puis ceux du manuel —, groupe « Mes chapitres » pour ne voir
  que ceux de ses mots. La fiche d'un kanji donne son sens, ses lectures on
  et kun, son nombre de traits et les mots qui l'emploient.
- **Jeu des kanjis** : le sens, la lecture (en kana), reconnaître parmi
  quatre, ou mélangé. Un kanji est acquis quand son sens ET une lecture ont
  été trouvés deux fois de suite (schéma v7, table `kanji_progression`).
- **Accueil** : un quatrième anneau « Kanjis » et trois cartes « Kanji ».
- Lectures et traits viennent de KANJIDIC2 (EDRDG, CC BY-SA 4.0) :
  `outils/generer_kanjis.py` fabrique `assets/js/donnees/kanjis.js`.
