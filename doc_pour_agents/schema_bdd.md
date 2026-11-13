---
title: "Schéma de la base SQLite"
domain: "Données"
related_files:
  - "api/lib/Base.php"
  - "api/lib/Depot.php"
  - "api/lib/Amorcage.php"
  - "api/lib/Authentification.php"
version: "schéma v6 (acquis en deux réussites de suite, date d'acquisition) — 25/10/2026"
---

# Schéma de la base

Un fichier SQLite, `data/nihonjo.sqlite` par défaut (`api/config.php`). Créé
au premier appel de l'API, schéma posé par `Base::MIGRATIONS` (v1 le
22/10/2026, v2 « comptes » et v3 « préférences, Mes mots » le 23/10/2026,
v4 « fournisseur, pseudo, photo » le 24/10/2026), rempli par
`Amorcage::siBaseVide`.

```
utilisateur (id, uid UNIQUE, email, nom, role, cree_le, vu_le, fournisseur, pseudo, photo)
    ▲ ON DELETE CASCADE (proprietaire_id, utilisateur_id)
    │
categorie (id, nom UNIQUE, ordre)
    ▲
chapitre (id TEXTE PK = clé, nom, categorie_id, ordre, origine, proprietaire_id, cree_le)
    ▲  ON DELETE CASCADE, ON UPDATE CASCADE
mot_chapitre (mot_id, chapitre_id)  PK (mot_id, chapitre_id)
    ▼  ON DELETE CASCADE
mot (id, fr, jp_romaji, jp_kanji, jp_kana, contexte, origine, proprietaire_id, cree_le, modifie_le)
    ▲                          ▲
mot_thematique (mot_id, thematique)     progression (utilisateur_id, mot_id, statut, nb_reussites, nb_echecs, derniere_revision, serie, production, acquis_le, valide_le, rafraichissements, prochaine_revision)
                                         PK (utilisateur_id, mot_id)
kana_progression (utilisateur_id, kana, nb_reussites, nb_echecs, derniere_revision)  PK (utilisateur_id, kana)
preference (utilisateur_id, cle, valeur JSON, modifie_le)  PK (utilisateur_id, cle)
```

## Les tables

| table | une ligne = | à savoir |
|---|---|---|
| `utilisateur` | un compte | `uid` = uid Firebase (Google), `discord:<id>` (Discord) ou `dev:<adresse>` (tests). La ligne **id 1** est le « compte initial » : sans uid tant qu'aucune identité ne l'a réclamé (`Comptes::pourIdentite`). Rôle `admin` ou `membre`. `fournisseur` : `google`, `discord`, `dev`, NULL = pas encore réclamé. `nom` : celui du fournisseur, rafraîchi à chaque connexion ; `pseudo` : celui que la personne choisit (« Mon compte »), jamais écrasé ; NULL = le nom. `photo` : adresse https de l'avatar, ou vide |
| `categorie` | un groupe de chapitres | commune à tous les comptes ; créée à la volée par `Depot::idCategorie`. Une catégorie sans chapitre visible n'est pas affichée |
| `chapitre` | un chapitre | **`id` = clé** : le nom pour un chapitre du cours (`vocabulaire_p_45`), `nom@idCompte` pour un chapitre de compte (`animaux@3`). `nom` = nom technique affiché par `libelleChapitre` (`utils.js`) |
| `mot` | un mot | `proprietaire_id` NULL = **mot du cours**, partagé ; sinon le mot d'un compte. `fr`, `jp_*` = listes JSON de variantes, la première posée en question |
| `mot_chapitre` | « ce mot est dans ce chapitre » | un mot peut être dans plusieurs chapitres, y compris ceux de comptes différents (un mot du cours rangé par chacun dans ses chapitres) |
| `mot_thematique` | « ce mot a ce thème » | thèmes = texte libre ; un mot du cours ne gagne de thème que par l'administrateur |
| `progression` | l'état d'un mot **pour un compte** | pas de ligne = « non acquis » |
| `kana_progression` | les compteurs d'un caractère du jeu des kana pour un compte | « か » et « カ » sont deux lignes ; maîtrise calculée dans le navigateur (`maitrise`, `syllabaires.js`) |
| `kanji_progression` | l'état d'un kanji (page et jeu « Kanji ») pour un compte | v7 (26/10) ; `statut` comme `progression`, `serie_sens` / `serie_lecture` : acquis quand les deux valent 2 (`Depot::enregistrerKanji`) ; pas de ligne = jamais joué |
| `preference` | un réglage d'un compte (sélection de révision, filtres, thème…) | ce que gardait le navigateur jusqu'au 23/10 ; clés : `Depot::CLES_PREFERENCES`, liste dans `architecture.md` |

## Les colonnes qui ne se devinent pas

| colonne | valeurs | piège |
|---|---|---|
| `mot.fr`, `mot.jp_*` | texte JSON `["eau","flotte"]`, jamais `[""]` | écrire par `Depot::encoderListe`, lire par `Depot::decoderListe` |
| `mot.contexte` | texte | exposé à l'API sous le nom **`context`** (nom des exports v1) ; « N/A » ramené à « » |
| `*.proprietaire_id` | NULL / id de compte | **la** colonne de la visibilité : toute requête filtre `proprietaire_id IS NULL OR proprietaire_id = :u` (`VISIBLE_MOT`, `VISIBLE_CHAPITRE`) |
| `mot.origine`, `chapitre.origine` | `cours` / `perso` | redondant avec `proprietaire_id` (cours ⇔ NULL), gardé pour les fichiers v1 |
| `chapitre.id` | clé | ⚠️ ce que portent les liaisons et la préférence `chapitres_coches` ; les **fichiers** échangés portent le `nom` (`nomDeChapitre` côté navigateur, `nomTechniqueChapitre` côté serveur retire le suffixe `@n`) |
| `progression.statut` | `non acquis` / `en cours` / `a revoir` / `acquis` (CHECK) | « a revoir » sans accent : valeur de la v1. Affiché « À revoir ». « en cours » depuis la v5 |
| `progression.serie`, `production`, `rafraichissements` | entiers | réussites de suite (rappel ou production) depuis le dernier échec ; 1 si une production réussie depuis (information) ; rafraîchissements réussis. Règle : `doc_pour_agents/exercices.md`, « Progression » |
| `progression.acquis_le`, `valide_le`, `prochaine_revision` | `AAAA-MM-JJ`, **jour de Paris** (pas UTC) | date d'acquisition, de dernière validation, et du passage à « à rafraîchir » ; NULL hors acquis. « à rafraîchir » n'est **jamais** écrit dans `statut` : `Depot::lireMots` le calcule |
| dates | `AAAA-MM-JJ HH:MM:SS` UTC (`datetime('now')`) | non datée quand l'état vient d'un import ou d'un clic sur le badge |

## Les règles qui tiennent par le code, pas par le schéma

- Visibilité et droits : `doc_pour_agents/comptes_et_connexion.md`, tableau
  « Ce qu'un compte voit et modifie ».
- **« Mes mots »** (`mes_mots@id`, l'ancien `personnel`) : chaque compte a le
  sien, qui contient **tous** ses mots — imposé par `Depot::lierMesMots` à
  chaque enregistrement et import, et rattrapé par `Depot::assurerMesMots` à
  chaque chargement. Il ne se renomme ni ne se supprime ; un mot du compte
  n'en sort pas (`retirerMotsDuChapitre` le garde). Un mot du cours peut y
  être rangé, et en ressortir.
- Supprimer un chapitre supprime les mots **du même propriétaire** qui
  n'avaient que ce rattachement ; les autres sont détachés (`supprimerChapitre`).
  Pour un chapitre de compte, plus aucun mot ne disparaît : ils sont tous
  aussi dans « Mes mots ».
- `preference.cle` : seulement celles de `Depot::CLES_PREFERENCES` ; valeur
  JSON de 64 Ko au plus.
- Renommer un chapitre change sa clé ; les liaisons suivent par
  `ON UPDATE CASCADE` — **à condition que `PRAGMA foreign_keys = ON`** ait été
  posé sur la connexion (`Base::ouvrir`, règle n° 3 de `CLAUDE.md`).
- Remplacer les rattachements d'un mot (`enregistrerMot`) ne retire que ceux
  **visibles** par le compte qui enregistre : l'administrateur qui corrige un
  mot du cours ne le sort pas des chapitres des autres.

## Migrations

`Base::MIGRATIONS` : tableau `version => SQL`, suivi par `PRAGMA user_version`.
`Base::migrer` joue, dans une transaction chacune, les versions supérieures à
celle de la base. Pour changer le schéma : **ajouter** une entrée, ne jamais
modifier une entrée livrée. Penser ensuite à `Depot::sauvegarde` /
`Depot::restaurer` et à `tests/api_test.php`.

| version | date | quoi |
|---|---|---|
| 1 | 22/10/2026 | vocabulaire en base (un seul utilisateur) |
| 2 | 23/10/2026 | comptes : `utilisateur` (+ compte initial id 1), `proprietaire_id` sur `mot` et `chapitre`, `chapitre.nom`, clés `nom@1` pour les chapitres perso existants, `progression` reconstruite avec `utilisateur_id` (SQLite ne change pas une clé primaire), `kana_progression` |
| 3 | 23/10/2026 | `preference` (ce que gardait le navigateur) ; `personnel@id` → `mes_mots@id` ; un « Mes mots » pour chaque compte et tous ses mots dedans — **seulement sur une base déjà remplie** (voir ci-dessous) |
| 7 | 26/10/2026 | `kanji_progression` (le jeu des kanjis) : `statut`, `serie_sens`, `serie_lecture`, compteurs, `acquis_le`. Sauvegarde / restauration la portent (`kanji`), une sauvegarde plus ancienne se restaure sans |
| 6 | 25/10/2026 (soir) | acquis = deux réussites de suite : `progression` reconstruite sans `jours_reussis` / `dernier_jour_reussi`, avec `serie`, `acquis_le`, `valide_le`, `rafraichissements`. Un acquis le reste (acquis et validé à sa dernière réussite, « à rafraîchir » 7 jours après) ; un « en cours » garde une réussite. `Depot::paliersRestaures` lit aussi les sauvegardes v5 et plus anciennes |
| 5 | 25/10/2026 | paliers de progression : `progression` reconstruite (CHECK avec `en cours`) avec `jours_reussis`, `dernier_jour_reussi`, `production`, `prochaine_revision`. Un acquis le reste (2 jours, production, de retour 3 jours après sa dernière révision), un « a revoir » revient le jour de sa dernière révision. Une sauvegarde plus ancienne se restaure avec la même règle (`Depot::paliersRestaures`) |
| 4 | 24/10/2026 | `utilisateur.fournisseur` (déduit de l'uid : `dev:` → dev, `discord:` → discord, sinon google ; NULL pour le compte initial non réclamé), `pseudo`, `photo` — l'inscription explicite et Discord (`comptes_et_connexion.md`). Sauvegarde / restauration les portent ; une sauvegarde plus ancienne se restaure (fournisseur déduit de l'uid) |

La v2 sur une base v1 : tout ce qui était perso (mots, chapitres,
progression) va au compte initial ; la première connexion le réclame — José
retrouve ses données (essai « migration v1 → v2 »).

⚠️ La v3 ne crée ni catégorie ni chapitre sur une base **neuve** : les
migrations passent avant l'amorce, et `Amorcage::estVide` compte les
catégories — une catégorie créée là empêchait le remplissage du cours
(attrapé par l'essai « base neuve », 23/10). Piège SQL au passage :
`SELECT …, MAX(x) FROM t WHERE <faux>` renvoie quand même UNE ligne (agrégat
sans GROUP BY) ; d'où la sous-requête dans l'`INSERT … SELECT`.

## Choix écartés, et pourquoi

| écarté | raison |
|---|---|
| journal WAL | exige une mémoire partagée que le stockage d'un mutualisé ne garantit pas |
| UPSERT (`ON CONFLICT … DO UPDATE`) | exige SQLite 3.24 ; version de l'hébergement inconnue → lire puis écrire |
| identifiant numérique de chapitre | les exports v1 et la sélection de révision désignent les chapitres par leur nom : la clé `nom@id` les garde lisibles et uniques |
| une base par compte | une seule sauvegarde, un seul cours à corriger, et la jointure « cours + mes mots » reste une requête |
