---
title: "API PHP"
domain: "Serveur"
related_files:
  - "api/index.php"
  - "api/lib/Api.php"
  - "api/lib/Depot.php"
  - "api/lib/Authentification.php"
  - "api/discord.php"
  - "assets/js/api.js"
version: "2.1 (inscription, Discord, gestion des comptes) — 24/10/2026"
---

> 🧪 **Spécification exécutable** : `tests/api_test.php` éprouve chaque
> action ci-dessous sur une base jetable. En cas de doute entre cette page et
> le code, le test fait foi : `php tests/api_test.php`.

# L'API

Un seul point d'entrée : `api/index.php?action=<nom>`. Lecture en **GET**,
écriture en **POST avec un corps JSON**. Réponse toujours JSON :

```json
{ "ok": true,  "donnees": … }
{ "ok": false, "erreur": "Il faut au moins une écriture japonaise : kana ou kanji." }
{ "ok": false, "erreur": "Aucun compte Nihonjo pour marie@x.fr. Créez-le : un clic suffit.",
  "code": "compte_inexistant", "details": { "email": "marie@x.fr", "nom": "Marie", "fournisseur": "google" } }
```

`code` et `details` (depuis le 24/10) : quand l'interface doit réagir à une
erreur précise plutôt qu'afficher le message (`ErreurApi($message, $statut,
$code, $details)`). `appeler` les recopie sur l'`Error` levée (`e.code`,
`e.details`, `e.statut`).

Côté navigateur, une seule fonction l'appelle : `appeler(action, corps)`
(`assets/js/api.js`) — GET sans `corps`, POST JSON avec ; elle joint l'en-tête
de connexion (`enteteConnexion`, `auth.js`) et lève une `Error` dont le
message est **affichable tel quel**.

## Connexion

Toutes les actions exigent un compte, sauf `sante`, `session`,
`compte.creer`, `deconnexion` et `discord.attente` (traitées dans
`api/index.php` avant l'authentification) : en-tête
`X-Nihonjo-Jeton: <jeton Firebase>` (Google), cookie `nihonjo_session`
(Discord), ou `X-Nihonjo-Dev-Email: <adresse>` (mode `dev`, tests
seulement). Sans compte : **401** ; identité sans compte Nihonjo : **404
`compte_inexistant`**. Les deux étapes de Discord sont des redirections, dans
un fichier à part : `api/discord.php`. Détail :
`doc_pour_agents/comptes_et_connexion.md`.

Chaque action agit **pour le compte connecté** : `api/index.php` construit
`new Depot($pdo, $compte)`, et toutes les requêtes de `Depot` filtrent par ce
compte.

## Les actions

| action | verbe | corps | renvoie | `Depot::` | droits |
|---|---|---|---|---|---|
| `sante` | GET | — | versions, `nb_mots_du_cours`, `nb_comptes`, `auth: { mode, firebase, fournisseurs: { google, discord } }` | `sante` (+ `Authentification::pourInterface`) | **public** |
| `session` | GET | — | `{ connecte, utilisateur? }` — 200 dans les deux cas | `Authentification::utilisateur` | **public** |
| `compte.creer` | POST | `{}` | `{ utilisateur, nouveau }` ; déjà inscrit : `nouveau: false` | `Authentification::inscrire` | **public** (une identité Google, Discord en attente ou dev est requise, sinon 401) |
| `deconnexion` | POST | `{}` | `null` (efface les cookies de session) | `Authentification::deconnecter` | **public** |
| `discord.attente` | GET | — | `{ nom, email, photo, fournisseur }` ou `null` | `Authentification::attenteDiscord` | **public** |
| `donnees` | GET | — | `{ utilisateur, categories, chapitres, mots, kana, kanji, preferences }` (assure d'abord « Mes mots ») | `toutesLesDonnees` | compte |
| `moi` | GET | — | `{ id, nom (affiché), nom_fournisseur, pseudo, email, photo, fournisseur, role, cree_le }` — jamais l'uid | `moi` | compte |
| `compte.profil` | GET | — | `{ compte, contenu: { mots, chapitres, acquis, a_revoir, en_cours, kana_acquis, kanji_acquis } }` | `profil` | compte |
| `compte.modifier` | POST | `{ pseudo }` (40 caractères, vide = nom du fournisseur) | comme `moi` | `modifierPseudo` | compte |
| `compte.supprimer` | POST | `{ confirmation: "supprimer" }` | `{ id, supprime: { mots, chapitres, … } }` ; efface la session | `supprimerMonCompte` | compte ; refusé en mode `aucune` ; 409 au dernier administrateur |
| `comptes.lister` | GET | — | `{ comptes: [{ …moi, reclame, contenu }], moi }` | `listerComptes` | admin |
| `comptes.role` | POST | `{ id, role: "membre"\|"admin" }` | le compte | `changerRoleCompte` | admin ; 409 au dernier administrateur |
| `comptes.supprimer` | POST | `{ id }` | comme `compte.supprimer` | `supprimerUnCompte` | admin ; pas soi-même (400), pas le dernier administrateur (409) |
| `sauvegarde` | GET | — | `{ format: "nihonjo_sauvegarde", version_schema, utilisateurs, categories, chapitres, mots, progression, kana, kanji, preferences }` | `sauvegarde` | admin |
| `mot.enregistrer` | POST | un mot (sans `id` = création) | le mot — un mot du compte est **toujours** dans « Mes mots », quoi qu'envoie le navigateur | `enregistrerMot` | ses mots ; cours : admin |
| `mot.supprimer` | POST | `{ id }` | `null` | `supprimerMot` | idem |
| `progression.resultat` | POST | `{ mot_id, reussite, niveau?, autre_alphabet? }` — `niveau` : `reconnaissance` (défaut), `rappel`, `production` ; inconnu → 400. `autre_alphabet: true` : le bon mot dans l'autre syllabaire (en cours, série à 0, jamais acquis ainsi) | la progression (`statut` — dont `a rafraichir`, calculé —, compteurs, `serie`, `production`, `acquis_le`, `valide_le`, `rafraichissements`, `prochaine_revision`) | `enregistrerResultat` | compte |
| `progression.definir` | POST | `{ mot_id, statut }` (`non acquis`, `en cours`, `a revoir`, `acquis` ; pas `a rafraichir`) | la progression | `definirStatut` | compte |
| `progression.fusionner` | POST | `{ elements: [{ mot_id, statut }] }` | `{ acquis, en_cours, a_revoir, inchanges }` | `fusionnerStatuts` | compte |
| `kanji.resultat` | POST | `{ kanji, exercice: "sens"\|"lecture"\|"choix", reussite }` — un seul kanji (CJK), sinon 400 | `{ kanji, statut, serie_sens, serie_lecture, nb_reussites, nb_echecs, acquis_le, derniere_revision }` | `enregistrerKanji` | compte |
| `kana.resultat` | POST | `{ kana, reussite }` | `{ kana, nb_reussites, nb_echecs, derniere_revision }` | `enregistrerKana` | compte |
| `chapitre.creer` | POST | `{ nom, categorie, peupler: ["theme:x", "chap:<clé>"], cours? }` | `{ id, nb_mots }` | `creerChapitre` | compte ; `cours: true` : admin |
| `chapitre.modifier` | POST | `{ id, nom?, categorie? }` | `{ id }` (nouvelle clé) | `modifierChapitre` | ses chapitres ; cours : admin |
| `chapitre.supprimer` | POST | `{ id }` | `{ mots_supprimes, mots_detaches }` ; « Mes mots » refusé | `supprimerChapitre` | idem |
| `chapitre.ajouterMots` | POST | `{ id, mots: [ids] }` (5 000 au plus) | `{ ajoutes, deja, refuses }` — refusés : invisibles, ou mot du compte vers le cours | `ajouterMotsAuChapitre` | chapitre modifiable |
| `chapitre.retirerMots` | POST | `{ id, mots: [ids] }` | `{ retires, gardes }` — gardés : les mots du compte dans « Mes mots » | `retirerMotsDuChapitre` | chapitre modifiable |
| `preference.ecrire` | POST | `{ cle, valeur }` (`null` efface) | `{ cle }` | `ecrirePreference` | compte ; clé de `CLES_PREFERENCES`, 64 Ko |
| `import.mots` | POST | `{ mots, mode: "ajouter"\|"ecraser", categories_chapitres?, cible?: "perso"\|"cours", chapitres?: [clés], nouveau_chapitre?: nom }` (5 000 mots au plus) | `{ crees, fusionnes, ignores, chapitre }` (`chapitre` : clé du nouveau) | `importerMots` | compte ; `cours` : admin ; `chapitres` : les siens (cours : ceux du cours), sinon 403 |
| `restauration` | POST | une sauvegarde complète (v1 ou v2) | `{ mots, comptes }` | `restaurer` | admin |

### Forme d'un mot (réponse)

```json
{
  "id": 12, "fr": ["eau"], "jp_romaji": ["mizu"], "jp_kanji": ["水"], "jp_kana": ["みず"],
  "context": "", "thematiques": ["boisson"], "chapitres": ["vocabulaire_p_81", "boissons@3"],
  "origine": "cours", "modifiable": false,
  "progression": { "statut": "acquis", "nb_reussites": 3, "nb_echecs": 1, "derniere_revision": "2026-10-22 20:14:03" }
}
```

`chapitres` = **clés** des chapitres visibles par le compte. `modifiable` dit
si le compte peut corriger le mot (l'interface cache les boutons sinon ; le
serveur refuse de toute façon : 403).

En **entrée** (`mot.enregistrer`, `import.mots`), chaque liste accepte aussi
une chaîne « `a && b` ». Un chapitre se désigne par sa clé **ou son nom** :
un nom inconnu crée un chapitre du compte (`Depot::resoudreChapitre`) ; un
suffixe `@n` venu d'un autre compte est retiré. Règles de `validerMot` :
français obligatoire ; kana **ou** kanji obligatoire ; sans thème →
`indéterminé` ; sans chapitre → « Mes mots » du compte. Un nom « Mes mots », « mes_mots » ou
« personnel » (fichiers d'avant le schéma v3) désigne le « Mes mots » du compte.

À l'import seulement (`Depot::champsImport`), les noms « humains » sont
compris : `kanji`, `kana`, `romaji`, `contexte`, `themes` (ceux de l'API
l'emportent s'ils sont là aussi).

## Statuts HTTP

| code | quand |
|---|---|
| 400 | paramètre manquant ou invalide, règle de validation (`ErreurApi`) |
| 401 | pas de compte, jeton illisible, refusé ou expiré, session Discord périmée → l'interface réaffiche l'écran de connexion |
| 403 | mot ou chapitre du cours modifié par un membre ; action réservée aux administrateurs |
| 404 | action inconnue ; mot ou chapitre absent **ou d'un autre compte** (on ne dit pas qu'il existe) ; `code: compte_inexistant` : l'identité n'a pas de compte (l'interface propose de le créer) ; `code: discord_absent` |
| 405 | mauvais verbe |
| 409 | chapitre déjà existant (création, renommage) ; `code: dernier_admin` (retirer le rôle du dernier administrateur, le supprimer) |
| 415 | écriture sans `Content-Type: application/json` |
| 500 | toute autre exception ; message réel renvoyé et écrit dans le journal d'erreurs PHP |

## ⚠️ Les gardes, et pourquoi elles restent

- **JSON obligatoire en écriture** : un formulaire d'un autre site ne peut
  pas envoyer `application/json` sans vérification CORS préalable, que cette
  API ne satisfait que pour l'origine de l'application Android
  (`origines_application`, `api/config.php` ; `nihonjo_cors`, 25/10), et
  jamais avec cookie (pas d'`Access-Control-Allow-Credentials`). Ne pas
  accepter `application/x-www-form-urlencoded`. Le détail :
  `deploiement.md`, « Application Android ».
- **En-tête de connexion maison** : voir `comptes_et_connexion.md` (conflit
  avec l'authentification Basic, en-tête `Authorization` retiré en CGI).
- **Filtre par compte dans CHAQUE requête** : un oubli ne lève rien et montre
  les mots d'un autre. L'essai « isolement » de `tests/api_test.php` le garde.

## Ajouter une action

Recette pas à pas : `carnet_agent/recettes.md` ; règles et pièges : skill
`api-php-sqlite-nihonjo`.
