---
name: api-php-sqlite-nihonjo
description: Écrire ou corriger l'API PHP de Nihonjo et ses requêtes SQLite — nouvelle action, nouvelle colonne ou table, migration du schéma, erreur 4xx/5xx, réponse « illisible du serveur ». À lire avant de toucher à api/ ou à data/.
---

# L'API PHP et la base SQLite

Doc de référence : `doc_pour_agents/api.md` et `doc_pour_agents/schema_bdd.md`.
Ce skill dit comment travailler dessus sans reproduire un piège connu. Pour la
connexion et les droits : skill `comptes-et-connexion-nihonjo`.

## Où écrire quoi

| quoi | où | jamais |
|---|---|---|
| une requête SQL sur le vocabulaire | une méthode de `Depot` (`api/lib/Depot.php`), filtrée par compte | dans `Api.php`, `index.php` ou un nouveau fichier |
| une requête SQL sur les comptes | `Comptes` (`api/lib/Authentification.php`) | dans `Depot` (il reçoit le compte tout fait) |
| une action | une ligne de `Api::routes` (`api/lib/Api.php`) qui appelle `Depot` | un second point d'entrée PHP |
| un changement de schéma | une NOUVELLE entrée en fin de `Base::MIGRATIONS` | modifier l'entrée 1, ou un `CREATE TABLE` hors migration |
| une erreur pour l'utilisateur | `throw new ErreurApi('message affichable', code)` | `die()`, `echo`, un tableau `['erreur' => …]` renvoyé |
| un réglage par machine | `api/config.local.php` (ignoré par git) ou `NIHONJO_BASE` | modifier `api/config.php` pour une seule machine |

## Les pièges, du plus coûteux au moins coûteux

0. **Chaque requête porte le filtre du compte** (`Depot` est construit pour
   UN compte, `$this->u`). Lire : `WHERE ` . `self::VISIBLE_MOT` (ou
   `VISIBLE_CHAPITRE`) avec `:u` ; progression et kana :
   `utilisateur_id = :u`. Écrire un mot ou un chapitre du cours
   (`proprietaire_id IS NULL`) : `exigerAdmin` d'abord. Supprimer : borner
   par `proprietaire_id` (voir `supprimerChapitre`). L'oubli ne lève aucune
   erreur — il fuit ou abîme les données d'un autre compte. L'essai
   « isolation » de `tests/api_test.php` est là pour ça : y ajouter la
   nouvelle action.
0 bis. **« Mes mots » est imposé ici** : toute écriture qui crée ou range un
   mot DU COMPTE appelle `lierMesMots` (après `assurerMesMots`) ; toute
   action qui retire un mot d'un chapitre garde les mots du compte dans
   « Mes mots » (`estMesMots`). Ne jamais laisser le navigateur décider.
0 ter. **`isset()` est faux pour une valeur `null`** : dans un tableau
   id ⇒ `proprietaire_id`, un mot du cours vaut `null` — tester
   `array_key_exists` (vécu dans `ajouterMotsAuChapitre`, 23/10).
1. **`PRAGMA foreign_keys` est OFF par défaut, par connexion.** Ne jamais
   ouvrir `new PDO('sqlite:…')` soi-même : `Base::ouvrir` le pose, et sans
   lui les cascades ne font rien **sans erreur** (le renommage d'un chapitre
   lui ferait perdre ses mots).
2. **Une migration livrée ne se modifie pas.** La base de José l'a déjà
   jouée (`PRAGMA user_version`) et ne la rejouera pas. Ajouter
   `2 => <<<'SQL' … SQL`. SQLite n'a pas de `ALTER TABLE … DROP CONSTRAINT` :
   pour changer une contrainte, recréer la table (CREATE nouvelle, INSERT
   SELECT, DROP, RENAME) dans la migration.
3. **Les listes `fr` / `jp_*` sont du JSON.** Écrire par
   `Depot::encoderListe` (qui nettoie), lire par `Depot::decoderListe`. Une
   chaîne écrite telle quelle (`"eau"`) se relit en liste vide.
4. **`context` côté API, `contexte` en base.** Le nom d'API est celui des
   exports v1 ; ne pas le « corriger ».
5. **Syntaxe PHP 7.4** : pas de `match`, types union, `readonly`, `mixed`,
   `str_contains` / `str_starts_with` (`strpos(…) === 0`), arguments nommés,
   `?->`. La version OVH n'est pas connue.
6. **SQLite de l'hébergement : version inconnue.** Pas d'UPSERT (3.24),
   pas de `RETURNING` (3.35), pas de fonctions fenêtrées sans vérifier
   `action=sante`. Lire puis écrire, dans une transaction.
7. **Pas de journal WAL** (mutualisé). Ne pas ajouter `PRAGMA journal_mode=WAL`.
7 bis. **Une migration passe AVANT l'amorce** (`api/index.php`) : sur une
   base neuve, elle ne doit créer ni catégorie ni mot, sinon
   `Amorcage::estVide` est faux et le cours n'est jamais rempli. Et
   `INSERT … SELECT …, MAX(x) FROM t WHERE <faux>` insère quand même une ligne
   (agrégat sans GROUP BY) : mettre l'agrégat en sous-requête (migration 3).
8. **Une écriture multiple = une transaction** (`beginTransaction` /
   `commit`, `rollBack` dans le `catch`, puis relancer). Voir
   `importerMots` comme modèle.
9. **La garde JSON** (`api/index.php`) : toute action POST reçoit un corps
   JSON. Ne pas ajouter de lecture de `$_POST` : il est vide.
9 bis. **Une préférence** : ajouter la clé à `Depot::CLES_PREFERENCES`
   (liste blanche) ; rien d'autre côté serveur (table `preference`, JSON).
10. **Une nouvelle colonne doit survivre à un transfert** : la reprendre dans
    `Depot::sauvegarde`, `Depot::restaurer` et l'essai « sauvegarde →
    restauration » de `tests/api_test.php` (il compare tout `toutesLesDonnees`).

## Ajouter une action — dans cet ordre

1. Méthode publique dans `Depot` (validation → `ErreurApi`, filtre du
   compte, `exigerAdmin` si elle touche au cours ou à toute la base,
   transaction si plusieurs écritures).
2. Ligne dans `Api::routes` : verbe (`GET` lecture, `POST` écriture) et
   lecture des paramètres par `entier()` / `liste()`.
3. Essai dans `tests/api_test.php` (fonction `essai`), puis
   `php tests/api_test.php`.
4. Appel côté front : `appeler('mon.action', { … })` — jamais `fetch`.
5. Ligne dans le tableau de `doc_pour_agents/api.md`.

## Vérifier

- `php -l` sur chaque fichier touché, puis `php tests/api_test.php`.
- Bout en bout sans Docker : `NIHONJO_AUTH=dev NIHONJO_BASE=/tmp/essai.sqlite php -S 127.0.0.1:8765 -t .`
  puis `curl -s 'http://127.0.0.1:8765/api/index.php?action=sante'`.
- Un appel à la main (mode dev) : `curl -s -H 'X-Nihonjo-Dev-Email: essai@exemple.com'
  -H 'Content-Type: application/json' -d '{…}' '…?action=…'`. Sans
  l'en-tête : 401. Le premier compte vu devient administrateur.
- ⚠️ Arrêter ce serveur par `pgrep -f "^php -S" | xargs -r kill`, pas
  `pkill -f "php -S"`, qui tue aussi le shell qui le lance
  (`carnet_agent/environnement.md`).
- ⚠️ `php -S` **ignore les `.htaccess`** : ce qu'ils interdisent n'est pas
  éprouvé ainsi (voir `doc_pour_agents/deploiement.md`, vérifications).
