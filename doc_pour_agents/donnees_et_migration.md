---
title: "Amorce, imports, exports, reprise de la v1"
domain: "Données"
related_files:
  - "outils/convertir_donnees_v1.mjs"
  - "api/amorce/vocabulaire_initial.json"
  - "api/lib/Amorcage.php"
  - "api/lib/Depot.php"
  - "assets/js/echanges.js"
  - "assets/js/vues/importer.js"
  - "assets/js/migration_navigateur.js"
version: "3.1 (écran Données supprimé) — 23/10/2026"
---

# D'où viennent les données, et comment elles circulent

## 1. L'amorce (premier lancement)

```
archives/v1/data_cours.js + archives/v1/config_chapitres.js
        │  node outils/convertir_donnees_v1.mjs   (une fois, le 22/10/2026)
        ▼
api/amorce/vocabulaire_initial.json     1 034 mots, 19 chapitres, 4 catégories
        │  Amorcage::siBaseVide — SEULEMENT si la base n'a ni catégorie ni mot
        ▼
data/nihonjo.sqlite                     mots et chapitres d'origine « cours »
```

- `convertir_donnees_v1.mjs` **évalue** `data_cours.js` dans un bac à sable
  Node (`vm`) au lieu de le nettoyer par expressions régulières : c'est du
  JavaScript (commentaires, virgule finale), pas du JSON.
- La modification non commitée de `data_cours.js` présente le 22/10/2026
  (contexte de « えっ ») est dans l'amorce.
- ⚠️ Modifier l'amorce n'a **aucun effet** sur une base existante. Elle ne
  sert qu'à une installation neuve (nouveau poste, volume Docker supprimé).

## 2. Les fichiers d'échange

L'écran « Données » n'existe plus (23/10) : chaque fichier se fait là où on
en a besoin (`assets/js/echanges.js`).

| bouton | fichier | format | à l'import |
|---|---|---|---|
| menu du compte → Sauvegarde complète… → Télécharger (**administrateur**) | `nihonjo_sauvegarde_AAAA-MM-JJ.json` | v2+ : `{ format: "nihonjo_sauvegarde", version_schema, utilisateurs, categories, chapitres, mots (avec proprietaire_id), progression, kana, preferences }` (`preferences` depuis le schéma v3 ; absente d'une sauvegarde plus ancienne, sans dommage) | `restauration` **remplace toute la base, tous les comptes** ; ids conservés. Une sauvegarde v1 (22/10, sans comptes) s'accepte : le cours reste le cours, le reste va au compte qui restaure |
| (plus d'export depuis le 23/10 ; les anciens fichiers restent lisibles) | `ma_progression_nihonjo_AAAA-MM-JJ.json` | **format v1** : `{ type: "nihonjo_progression", donnees: [{ etat, fr, jp_romaji, jp_kanji, jp_kana }], count }` | collé ou choisi dans la page d'import : **reconnu**, « Appliquer à mes mots » → rapprochement puis `progression.fusionner` (jamais de recul) |
| page d'import → « Exporter mes mots » ; gestionnaire → « Exporter ce chapitre » (`nihonjo_<nom>.json`) | `nihonjo_mots_AAAA-MM-JJ.json` | `{ type: "nihonjo_mots", categories_chapitres, mots: [...] }` ; chapitres par leur **nom** (jamais `nom@id`) ; la v1 exportait un **tableau** de mots, accepté aussi | la page « Importer des mots » (`#/importer`, section 2 bis) ; elle lit aussi ce format, chapitres compris |

« Mes mots » = les mots du compte **et** les mots du cours rangés dans ses
chapitres (sinon ces rangements seraient perdus au transfert).

### 2 bis. La page « Importer des mots » (`vues/importer.js`, 23/10/2026)

Demandée par José : « une fonctionnalité d'import qui s'auto-explique »,
un fichier JSON, « Mes mots » toujours coché, d'autres chapitres du compte au
choix, et un texte à donner à une IA (exemple : les Pokémon de la 1re
génération). Trois étapes à l'écran :

| étape | ce qui se passe | où |
|---|---|---|
| 1. Préparer | 4 champs (sujet, nombre, thème, précisions) complètent en direct le texte pour l'IA (`textePrompt`) ; parties remplies surlignées, parties à remplir en ocre ; « Copier » (presse-papiers, sinon sélection du texte). Le format à la main et un modèle téléchargeable sont dans un `<details>` | `morceauxPrompt` |
| 2. Donner | collage (ou fichier `.json`, `choisirFichierTexte`) lu 250 ms après la frappe : `lireListe` | `lireListe` |
| 3. Ranger | « Mes mots » verrouillé ; puces des autres chapitres du compte ; un nouveau chapitre par son nom ; un administrateur peut viser le cours | `import.mots` avec `chapitres`, `nouveau_chapitre`, `cible` |

`lireListe` est tolérant sur la forme : « ```json » autour, du texte avant et
après (on prend du premier `{`/`[` au dernier `}`/`]`), un tableau seul ou
`{ "mots": [...] }` (ou n'importe quelle propriété qui contient une liste
d'objets), des textes simples au lieu de listes, les noms « humains »
(`kanji`, `kana`, `romaji`, `contexte`, `themes`) comme ceux des exports.
Et précis sur le fond : élément ignoré (sans français, sans kana ni kanji)
avec son numéro ; avertissement (importé quand même) quand le champ kana
contient autre chose que des kana — l'erreur la plus courante d'une IA
(« Zenigame » au lieu de « ゼニガメ ») ; doublons du fichier retirés ; mots déjà
présents comptés (ils seront seulement rangés). Le thème de l'étape 1 est
donné aux mots qui n'en ont pas.

Côté serveur, rien ne repose sur le navigateur : cibles vérifiées (les
siennes, ou celles du cours pour un import dans le cours), « Mes mots »
imposé à chaque mot d'un import dans le compte (`lierMesMots`), 5 000 mots au
plus, noms « humains » repris (`Depot::champsImport`).

« Remplacer mes mots » (mode `ecraser`) n'a plus de bouton depuis le 23/10 :
la page d'import ne fait qu'ajouter. Le mode reste dans l'API.

### Rapprocher une progression v1 (`rapprocherProgression`, `echanges.js`)

La v1 prenait le premier mot qui partageait UN sens, UN kanji ou UN kana. On
garde ce critère, mais on choisit le mot qui en partage le plus (3 = sûr).
Les entrées sans correspondant sont comptées « introuvables » dans le message.

### Fusion à l'import de mots (`Depot::importerMots`)

Signature d'un mot = sens français (minuscules, triés) + kana triés + kanji
triés. Un mot importé dont la signature existe déjà **n'est pas recréé** : il
gagne seulement les chapitres et thèmes du fichier. C'est ce qui absorbe les
**copies** que la v1 fabriquait en peuplant un chapitre (« Créer et
peupler » clonait les mots du cours dans le lexique perso).

### « Remplacer mes mots » (mode `ecraser`)

Supprime les mots **du compte connecté** (avec leur progression) et les
rattachements des mots du cours aux chapitres **du compte**, puis importe.
Les chapitres eux-mêmes restent (vides s'il le faut). Les mots des autres
comptes et le cours ne sont pas touchés ; `ecraser` est refusé avec
`cible: cours`.

## 3. La reprise de la v1 restée dans le navigateur

Elle va **au compte connecté** : José la fait connecté à son compte, sur
chaque navigateur où il utilisait la v1.

La v1 gardait dans **chaque navigateur** :

| où | quoi |
|---|---|
| IndexedDB `NihonjoDB` (Dexie), table `motsPerso` | mots ajoutés + copies de mots du cours ; clé `id` auto |
| IndexedDB `NihonjoDB`, table `progression` | `{ fr, statut }`, **indexée par le texte français** (`fr[0]` du mot) |
| localStorage `nihonjo_custom_chapters` | chapitres créés, même vides |
| localStorage `nihonjo_chap_categories` | `{ chapitre: catégorie }` |

`migration_navigateur.js` :

1. `detecterAnciennesDonnees` ouvre `NihonjoDB` **sans version** (lit la
   version existante, quelle qu'elle soit — Dexie multiplie la sienne par 10).
   ⚠️ `indexedDB.open` CRÉE une base absente : `ouvrirBaseV1` annule la
   création (`oldVersion === 0` → `transaction.abort()`), sinon chaque
   visite laisserait une `NihonjoDB` vide.
2. `migrer` : `import.mots` (mode « ajouter », avec les catégories) →
   `chapitre.creer` pour les chapitres restés vides → `recharger` →
   `progressionVersMots` (mots dont `fr[0]` est la clé, sinon ceux qui l'ont
   parmi leurs sens — la v1 partageait l'état entre homonymes) →
   `progression.fusionner`.
3. Bilan écrit dans la préférence du compte `migration_v1` (dans la base) ; le bandeau de « Réviser »
   disparaît. **Rien n'est effacé** dans le navigateur : la reprise peut être
   rejouée sans dégât (fusion + jamais de recul).

⚠️ Ces données n'existent que **dans le navigateur et à l'adresse** où la v1
a servi (même origine : `http://localhost:8080` en local, l'URL OVH en
ligne). Ouvrir la v2 sur un autre navigateur ne les voit pas — c'est normal.
José doit ouvrir l'accueil sur chaque appareil où il utilisait la v1 : le
bandeau « Importer dans la base » n'apparaît que là.

Éprouvé le 22/10/2026 avec une `NihonjoDB` fabriquée à la main de même
structure (`tests/parcours_navigateur.py`, section « Reprise de la v1 ») ;
pas encore avec les vraies données de José (`carnet_agent/en_suspens.md`).
