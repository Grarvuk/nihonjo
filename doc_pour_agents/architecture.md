---
title: "Architecture de Nihonjo v2"
domain: "Vue d'ensemble"
related_files:
  - "index.html"
  - "assets/js/app.js"
  - "assets/js/etat.js"
  - "assets/js/api.js"
  - "api/index.php"
version: "2.1 (inscription, Discord, Mon compte) — 24/10/2026"
---

# Architecture

## En une phrase

Une page unique (`index.html`) connecte le compte (Firebase, comme Odyvresse),
charge **tout** le vocabulaire visible par ce compte en une requête
(`api/index.php?action=donnees`), le garde en mémoire (`assets/js/etat.js`),
filtre et fait réviser dans le navigateur, et n'écrit au serveur que ce qui
change (une réponse, un mot, un chapitre, un kana joué).

## Pourquoi tout charger d'un coup

~1 000 mots pèsent ~300 Ko de JSON (bien moins une fois compressés par
Apache). La v1 avait tout en mémoire aussi, et tous ses filtres (chapitres
cochés, thème, état, limite) tournaient dans le navigateur. Garder ce modèle
évite une API de recherche, et rend chaque écran instantané. À revoir
au-delà de ~20 000 mots, pas avant.

## Le cycle d'une page

| étape | où | quoi |
|---|---|---|
| 1 | `index.html` | script en ligne : applique le thème enregistré avant la première peinture |
| 2 | `assets/js/app.js` → `demarrer` | icônes, `initTheme`, puis `appeler('sante')` (public : mode de connexion, configuration web Firebase, fournisseurs Google / Discord) |
| 3 | `assets/js/auth.js` → `initialiserConnexion` | charge le SDK Firebase (mode `firebase`) et attend l'état de connexion ; retour de Discord (`#/connexion?discord=…`) ; sans session Google, la sonde `session` (cookie Discord) ; pas connecté → `afficherConnexion` |
| 4 | `app.js` → `entrer` → `etat.js` `recharger` | `appeler('donnees')` avec l'en-tête du jeton ; remplit `utilisateur`, `categories`, `chapitres`, `mots`, `kana`, `parId` ; menu du compte |
| 5 | `api/index.php` | `Base::ouvrir` (migrations), `Amorcage::siBaseVide`, `Authentification::utilisateur`, `Api::traiter` → `Depot::toutesLesDonnees` (filtré par compte) |
| 6 | `app.js` → `rendre` | lit l'ancre (`routeur.js` → `vueDemandee`), vide `<main id="vue">`, appelle `afficher(racine)` de la vue |
| 7 | à chaque `hashchange` | la fonction de nettoyage renvoyée par la vue précédente est appelée, puis 6 |
| — | tout 401 de l'API | `EVENEMENT_DECONNEXION` (`api.js`) → écran de connexion |
| — | 404 `compte_inexistant` | `EVENEMENT_COMPTE_INEXISTANT` → écran « Pas encore de compte Nihonjo » (`afficherCompteInexistant`) |
| — | se déconnecter, compte supprimé | `terminerSession` (`session.js`) → `EVENEMENT_SORTIE` → écran de connexion |

Si l'étape 2 échoue (pas de PHP, Docker arrêté, page ouverte en `file://`),
`demarrer` affiche « La base ne répond pas ». Si le SDK Firebase ne se
charge pas (hors ligne, gstatic bloqué), l'écran de connexion s'affiche
quand même — Discord peut marcher — et le bouton Google dit ce qui ne va
pas (24/10 ; avant, tout l'écran tombait en panne).

## Les vues

Un fichier par écran dans `assets/js/vues/`, même contrat partout :

```js
export function afficher(racine) {
  racine.innerHTML = `…`;          // construire
  // brancher les écouteurs SUR des éléments de `racine`
  return () => { /* retirer ce qui est posé hors de racine (document, minuteries) */ };
}
```

| ancre | fichier | écran |
|---|---|---|
| `#/paires` | `vues/paires.js` | l'exercice Paires (grille 3 × 6 à glisser) ; sans partie lancée, renvoie à l'accueil |
| `#/reviser` (défaut) | `vues/reviser.js` | l'accueil : bonjour, progression, grand bouton de révision, toutes les cartes d'exercice (vocabulaire, écriture, kana), mot du jour, puis choix des chapitres et filtres |
| `#/exercice` | `vues/exercice.js` | une session d'exercice, puis le bilan |
| `#/liste` | `vues/liste.js` | les mots de la sélection ; état à la main ; lancer l'écriture |
| `#/ecriture` | `vues/ecriture.js` | écrire un mot N fois de suite |
| `#/kana` | `vues/kana.js` | le cours des hiragana / katakana, en tableaux, avec la maîtrise du compte |
| `#/jeu-kana` | `vues/jeu_kana.js` | réglages puis partie du jeu des kana (rōmaji), bilan |
| `#/kanji` | `vues/kanji.js` | le cours des kanjis : grille par groupe, fiche d'un kanji (26/10) |
| `#/jeu-kanji` | `vues/jeu_kanji.js` | réglages puis partie du jeu des kanjis (sens, lecture, reconnaître), bilan |
| `#/lexique` | `vues/lexique.js` (+ `formulaire_mot.js`) | tous les mots : chercher, ajouter (un par un, « Mes mots » verrouillé), modifier, supprimer |
| `#/importer` | `vues/importer.js` | importer une liste : texte pour une IA, collage ou fichier, vérification, chapitres où ranger |
| `#/chapitres` (`?chapitre=<clé>`) | `vues/chapitres.js` | le gestionnaire : ajouter des mots (d'un chapitre, d'un thème, du lexique), retirer, copier, déplacer, réviser, renommer, supprimer |
| `#/compte` | `vues/compte.js` | « Mon compte » : photo, nom, rôle, ce que contient le compte, pseudo, export / import, se déconnecter, supprimer le compte (menu du compte ; pas d'onglet) |
| `#/comptes` | `vues/comptes.js` | « Gérer les comptes » (administrateur) : rôles, suppression |
| ~~`#/donnees`~~ | supprimé le 23/10 | plus rien à gérer côté navigateur ; ce qu'il faisait est réparti (voir « Où sont passés les fichiers ») — un ancien lien retombe sur l'accueil |

`#/exercice` et `#/ecriture` n'ont de sens qu'avec une session préparée en
mémoire (`lancerSession`, `lancerEcriture`) : ouverts directement (F5), ils
renvoient vers `#/reviser` / `#/liste`. `#/jeu-kana` sans partie en cours
affiche ses réglages. Pendant une partie, `body[data-jeu="en-cours"]` masque
la navigation du téléphone (retiré par `rendre` et par le bilan).

## Qui écrit quoi au serveur

| geste | action API | ensuite |
|---|---|---|
| réponse à un exercice | `progression.resultat` | `majProgression` (local, pas de rechargement) |
| caractère terminé au jeu des kana | `kana.resultat` | `donnees().kana[glyphe]` remplacé (local) |
| clic sur un badge d'état (liste) | `progression.definir` | `majProgression` |
| ajouter / modifier un mot | `mot.enregistrer` | `remplacerMot` puis `recharger` (un chapitre a pu naître) |
| supprimer un mot | `mot.supprimer` | `retirerMot` |
| chapitres, imports, restauration, reprise v1 | `chapitre.*` (dont `ajouterMots`, `retirerMots`), `import.mots`, `progression.fusionner`, `restauration` | `recharger` |
| une préférence | `preference.ecrire` | la copie en mémoire, d'abord (`ecrirePreference`) |

L'écriture (`vues/ecriture.js`) ne touche pas à la progression — comme en v1.

## Les préférences : dans la base, plus dans le navigateur (23/10/2026)

José : « ne plus stocker les données sur le navigateur de la personne, mais
tout sauvegarder dans la bdd ». Les mots, chapitres et progression y étaient
déjà ; depuis le schéma v3, les **préférences** aussi : table `preference`
(`utilisateur_id`, `cle`, `valeur` JSON), clés en liste blanche
(`Depot::CLES_PREFERENCES`). Elles suivent le compte sur tous ses appareils.

| préférence | contenu | lue par |
|---|---|---|
| `chapitres_coches` | `{ cléChapitre: false }` — un chapitre absent est coché (forme de la v1) | `etat.js` → `chapitreCoche`, `cocherChapitres`, `cocherSeulement` |
| `filtres` | thème, état, limite de l'accueil | `etat.js` → `filtres` |
| `filtres_lexique` | recherche, chapitre, origine du Lexique | `vues/lexique.js` |
| `ecriture` | répétitions, mode difficile | `vues/liste.js` → `reglagesEcriture` |
| `theme` | `clair` / `sombre` (absente : système) | `app.js` → `appliquerThemeDuCompte` |
| `kana_alphabet` | alphabet affiché sur la page Kana | `vues/kana.js` |
| `jeu_kana` | réglages du jeu (alphabet, lignes, nombre) | `vues/jeu_kana.js` → `reglagesJeu` |
| `kanji_niveau` | groupe affiché sur la page Kanji | `vues/kanji.js` |
| `jeu_kanji` | réglages du jeu des kanjis (exercice, groupe, nombre) | `vues/jeu_kanji.js` → `reglagesJeuKanji` |
| `dernier_mode` | dernier exercice lancé d'une carte : celui du grand bouton | `vues/reviser.js` |
| `migration_v1` | bilan de la reprise des données v1 | `migration_navigateur.js` |

Accès : `preference(cle, defaut)` (lecture de la copie arrivée avec
`donnees`) et `ecrirePreference(cle, valeur)` (copie tout de suite, et envoi
au serveur **immédiat**, en `keepalive` ; pendant qu'un envoi est en route
pour une clé, les changements suivants partent ensemble à son retour — jamais
deux envois d'une même clé à la fois). ⚠️ Pas de délai de regroupement : avec
400 ms, une page rechargée juste après un clic relisait l'ancien réglage
(l'envoi arrivait au serveur APRÈS la lecture ; vécu le 23/10). **Jamais** `memoire` ni `localStorage` pour une
préférence nouvelle (règle n° 11 de `CLAUDE.md`).

Reprise : au premier chargement, `reprendrePreferencesLocales` (etat.js)
recopie dans le compte les anciennes clés `nihonjo_*` du navigateur (si le
compte n'a pas déjà la sienne), puis les **efface** du navigateur.

Restent dans le navigateur, et c'est voulu : la session Firebase (IndexedDB
de Firebase), `nihonjo_dev_email` (mode d'essai `dev`), et la **lecture** des
données de l'ancienne version (`NihonjoDB`, `nihonjo_custom_chapters`,
`nihonjo_chap_categories` : `doc_pour_agents/donnees_et_migration.md`).

## Où sont passés les fichiers (écran « Données » supprimé, 23/10/2026)

José : « tout est en base… afin de virer la page Données ». Ce qu'elle
faisait, et où c'est maintenant (`assets/js/echanges.js` porte le code commun) :

| fonction | maintenant | code |
|---|---|---|
| sauvegarde complète, restauration, état du serveur (administrateur) | menu du compte → « Sauvegarde complète… » (boîte de dialogue). Le menu existe aussi en mode `aucune` (poste local), sans « Se déconnecter » | `ouvrirSauvegarde` |
| exporter mes mots | page d'import, « Exporter mes mots » ; gestionnaire de chapitres, « Exporter ce chapitre » | `exporterMots`, `mesMots` |
| importer un fichier de progression de la v1 | page d'import : le fichier est **reconnu** (`type: nihonjo_progression`) et « Appliquer à mes mots » | `lireListe` → `appliquerProgression` |
| reprendre la v1 restée dans un navigateur | le bandeau de l'accueil importe sur place | `importerAncienneVersion` |
| exporter la progression | **abandonné** : la progression vit dans le compte (et dans la sauvegarde complète) | — |

La navigation n'a plus que 4 onglets (grille du téléphone : `repeat(4, 1fr)`).

⚠️ Conséquence : avant la connexion, le thème est celui du système (plus de
script de thème dans `index.html`) ; le thème du compte s'applique quand les
données arrivent.
