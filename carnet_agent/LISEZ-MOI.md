# Carnet de l'agent

## Le mandat — à lire en premier

**Si tu lis ceci, ce carnet est à toi.** « L'agent », c'est n'importe quel
agent qui travaille sur Nihonjo, quel que soit l'outil (Claude dans l'app,
Claude Code, Cowork, Antigravity, un sous-agent…) et quelle que soit la
session. Ici, « je » désigne celui qui écrit ; le prochain à lire, ce sera
toi, puis un autre.

José l'a confié aux agents avec carte blanche, sans avoir à lui demander :
**le lire** en arrivant, **le nourrir** (ajouter, compléter, corriger),
**le réorganiser** (renommer, fusionner, découper, créer, élaguer le
périmé) et **changer ses conventions**, y compris celles ci-dessous.

**Le but : capitaliser.** Chaque session repart de zéro ; ce qui n'est pas
écrit ici est perdu — la fausse piste qui a coûté une heure, la limite d'un
outil découverte à tâtons, le défaut signalé que personne n'a corrigé.

Ce n'est pas la doc du projet : ses règles vivent dans `CLAUDE.md`,
`contexte.md`, `doc_pour_agents/` et les skills (`.claude/skills/`). Quand une
note devient une vraie règle, la proposer à José pour le skill concerné
(`idees.md` en tient la liste).

Ce carnet reprend la forme de celui d'odyvresse_all
(`../odyvresse_all/carnet_agent/`, dont `modele_pour_un_autre_projet.md` est
la version exportable). À la différence de celui-là, **il est sous git**.

## Les fichiers

| fichier | j'y trouve | je l'ouvre |
|---|---|---|
| `LISEZ-MOI.md` | le mandat, les questions, les réflexes | toujours — injecté au démarrage dans Claude Code, à lire à la main ailleurs |
| `carte_du_code.md` | les flux (démarrage et connexion, exercice, écriture, lexique, chapitres, données, reprise v1, kana) et leurs points d'entrée | avant de chercher où se passe quelque chose |
| `recettes.md` | les fichiers à toucher pour les tâches qui reviennent (action API, migration, exercice, écran, page du manuel…) | avant d'écrire une tâche de ce type |
| `glossaire.md` | le vocabulaire du projet (amorce, origine, masu, reprise v1…) | quand un mot m'arrête |
| `en_suspens.md` | ce qui a été signalé sans être corrigé, livré sans être vérifié | au début d'une tâche du même domaine ; quand José dit « ça ne marche pas » |
| `environnement.md` | ce que chaque outil permet ou non, les commandes qui marchent | avant de lancer des tests, un navigateur, Docker |
| `travailler_avec_jose.md` | sa façon de demander, de tester, ce qui l'aide | quand une demande est ambiguë |
| `idees.md` | ce qui rendrait les agents (et l'application) plus efficaces, leçons à promouvoir | quand j'ai un moment, ou si José demande quoi améliorer |
| `journal/AAAA-MM-JJ_sujet.md` | récits datés : ce qui s'est passé, ce que j'en retiens | pour retrouver le pourquoi d'une note |

## Pendant la tâche — le consulter, pas seulement en arrivant

Seul ce fichier est chargé d'office, et une note lue au début d'une longue
session n'est pas toujours rappelée au moment où elle servirait.

- **Avant de modifier un fichier, chercher son nom dans le carnet**
  (`grep -rn "exercice.js" carnet_agent/`) : les notes nomment exprès
  fichiers et fonctions, pour faire remonter au bon moment le piège connu.
- Ouvrir un fichier du tableau au moment que décrit sa colonne « je l'ouvre ».
- **Après un résumé de contexte**, relire ce fichier.

## Au fil de l'eau — pas seulement en repartant

⚠️ Une session finit rarement proprement (commande coupée, contexte résumé) :
une note remise « à la fin » ne s'écrit souvent jamais. **Écrire dès que la
leçon est connue.** En fin de tâche, ces questions servent de filet ; si la
réponse est « non » partout, ne rien écrire.

1. **Quelque chose m'a coûté ?** → une entrée dans `journal/` ; si la leçon
   est générale, un réflexe ci-dessous ou une ligne du fichier concerné.
2. **J'ai signalé un défaut sans le corriger (PÉRIMÈTRE), ou livré sans
   pouvoir vérifier ?** → `en_suspens.md`. **Réglé un point qui y était ?**
   → le barrer, daté.
3. **Appris quelque chose de l'outil ?** → `environnement.md`, section de
   MON outil.
4. **Cherché longtemps où se passait quelque chose, ou quels fichiers
   toucher ?** → `carte_du_code.md` ou `recettes.md`.

## Les conventions en vigueur

Posées le 22/10/2026 (reprises d'odyvresse_all) ; tout agent peut les
changer, en le notant ici.

- **Dater tout**, et dire **de quel outil** on parle (en tête d'une entrée
  de journal).
- **Écrire pour un agent qui ne sait rien** : symptôme, vraie cause, leçon —
  et le nom exact des fichiers et fonctions, pour qu'une recherche retrouve
  la note. Jamais de numéros de ligne.
- **Une note n'est pas une preuve** : elle dit ce qui était vrai à sa date.
  Relire le code avant d'agir dessus, et corriger la note si elle a vieilli.
- **Ne pas effacer l'expérience d'un autre** : une note fausse se corrige ou
  se barre avec la raison. Élaguer le périmé, oui ; perdre une leçon, non.
- **Garder ce fichier court** (il est relu à chaque démarrage) : le détail
  va dans les autres fichiers.
- **Jamais de secret** : ni mot de passe, ni contenu du `.htpasswd`, ni
  identifiant de l'hébergement (écrire `/home/<compte>/`).

## Les réflexes qui ont le plus manqué

1. **Un bouton reconstruit pendant qu'on clique dessus avale le clic**
   (22/10) : saisir une limite puis cliquer un exercice ne faisait rien,
   sans erreur. Chercher un `innerHTML` relancé par `change`/`blur`.
2. **Une correction de défaut en crée un voisin** (22/10) : en donnant une
   feuille neuve à chaque mot (`afficherMot`), l'écouteur Entrée gardait
   l'ancienne et ne validait plus rien. Après avoir remplacé un nœud,
   chercher toutes les références qu'on en gardait.
3. **Le test peut être faux, pas le code** (22/10) : « chat » existait déjà
   dans le cours, et un toast d'une étape précédente encore à l'écran a fait
   croire à un échec de la reprise. Vérifier dans la base avant de corriger.
4. **Dire franchement ce qui n'a pas été vérifié** (image Docker jamais
   construite, hébergement OVH jamais vu, vraie connexion Google jamais
   faite) plutôt qu'un « ça marche » supposé.
5. **Depuis les comptes (23/10), toute requête a un propriétaire** : une
   requête sans filtre de compte ne casse rien de visible pour celui qui
   teste seul. Tester à **deux comptes** (`tests/api_test.php`, essai
   « isolation » ; parcours, « Second compte »).
8. **Une règle de confiance se met au SERVEUR** (23/10) : « Mes mots
   forcément coché, même par F12 » = `Depot::lierMesMots`, pas un
   `disabled` dans la page. L'interface informe ; le serveur décide.
7. **Avant de juger une interface, la regarder** (23/10) :
   `outils/captures_ecrans.py`, deux tailles, deux thèmes. L'audit sur
   capture a trouvé ce que la lecture du code ne montrait pas (exercices
   sous le pli au téléphone, coche sur le nombre).
8. **Une demande à deux lectures : corriger celle que la preuve montre**
   (23/10). « Pas de mdp en local » visait le mot de passe du `.htaccess`
   (la capture le montrait) ; j'avais aussi coupé la connexion Google, et
   José a cru qu'elle n'existait pas.
6. **`pkill -f "php -S"` tue le shell qui le lance** (23/10, sortie 144) :
   `pgrep -f "^php -S" | xargs -r kill`, dans un appel à part.
9. **Une identité qu'on ne contrôle pas ne donne pas de droits** (24/10) :
   l'adresse d'un compte Discord peut être non vérifiée, l'id d'un compte
   supprimé peut revenir. Comparer ce qui identifie vraiment (uid,
   `verified`) avant d'accorder quoi que ce soit.
