---
name: vocabulaire-nihonjo
description: Ajouter du vocabulaire à Nihonjo (une page du manuel, une liste de mots, des kanjis), corriger des mots en lot, importer, exporter, sauvegarder, restaurer, ou reprendre les données de l'ancienne version. Remplace l'ancienne habitude de modifier data_cours.js.
---

# Ajouter du vocabulaire, faire circuler les données

Référence : `doc_pour_agents/donnees_et_migration.md`.

## ⚠️ data_cours.js n'est plus lu

Jusqu'au 22/10/2026, ajouter une page du livre voulait dire écrire dans
`data_cours.js`. Ce fichier est dans `archives/v1/` et **plus rien ne le
charge** ; l'amorce (`api/amorce/vocabulaire_initial.json`) n'est lue que par
une base vide. Les deux modifiés : **aucun effet**, sans erreur.

## La page « Importer des mots » (23/10/2026) — pour tout le monde

Lexique → « Importer une liste » (`#/importer`). Elle explique tout : un
texte à donner à une IA (sujet, nombre, thème, précisions), le format, un
modèle ; on colle la réponse (même avec du texte autour) ou on choisit un
fichier ; elle vérifie avant d'importer ; on range dans « Mes mots »
(toujours), ses chapitres, ou un nouveau. Détail :
`doc_pour_agents/donnees_et_migration.md`, section 2 bis. **C'est le chemin
à indiquer à un utilisateur** qui veut ajouter une liste ; le format le plus
simple à lui donner :

```json
{ "mots": [ { "fr": ["chat"], "kanji": ["猫"], "kana": ["ねこ"], "romaji": ["neko"], "contexte": "", "thematiques": ["animal"] } ] }
```

## Ajouter une page du manuel — la façon de faire

1. Écrire un fichier d'import (format « mots ajoutés ») :

   ```json
   {
     "type": "nihonjo_mots",
     "categories_chapitres": { "vocabulaire_p_237": "Vocabulaire" },
     "mots": [
       {
         "fr": ["gare"],
         "jp_romaji": ["eki"],
         "jp_kanji": ["駅"],
         "jp_kana": ["えき"],
         "context": "",
         "thematiques": ["lieu", "transport"],
         "chapitres": ["vocabulaire_p_237"]
       }
     ]
   }
   ```

   - Le nom de chapitre suit la convention : `vocabulaire_p_<page>` — la
     page où commence ce vocabulaire dans le manuel —, `kanji_niveau_<n>`.
     ⚠️ Il s'affiche « Chapitre N », N = rang de la page parmi les chapitres
     du manuel (12/11) : `vocabulaire_p_237` après la page 219 = « Chapitre
     12 ». La clé, elle, garde la page : ne pas nommer un chapitre
     `chapitre_12`.
   - Plusieurs sens / lectures : plusieurs éléments de liste, **le premier
     est celui posé en question**.
   - Pas de kanji : liste vide `[]` (la v1 écrivait `[""]`, accepté aussi).
   - Thèmes : réutiliser ceux qui existent (liste : écran Lexique, ou
     `api/index.php?action=donnees`). Des doublons existent déjà
     (« nombre » / « nombres »…, voir `carnet_agent/en_suspens.md`) : ne pas
     en créer de nouveaux.
2. Le donner à José, qui l'importe : Lexique → « Importer une liste » →
   étape 3, **« Dans le cours (tous les comptes) »** (administrateur) et le
   chapitre de la page (ou « nouveau chapitre » : `vocabulaire p 237`) ; ou
   « Dans mon compte » (lui seul). Un
   mot déjà présent (mêmes sens, kana, kanji) n'est pas dupliqué : il gagne
   le chapitre.
3. L'API seule ne suffit plus depuis le 23/10 : tout appel exige un compte
   connecté (jeton Firebase). Hors du mode `dev` des essais, passer par
   l'écran.

⚠️ Une page du **manuel** va au **cours** (« Ajouter au cours ») : importée
dans « mes mots », elle n'est vue que par ce compte, et un « Remplacer mes
mots » l'efface.

## Corriger des mots

Un à un : écran Lexique → crayon. Un compte modifie ses mots ; les mots du
cours, seul un administrateur (les autres voient « mot du cours », sans
crayon). En lot : pas d'outil ; passer par une sauvegarde complète
modifiée puis restaurée est possible mais **remplace toute la base, tous les
comptes** — à ne faire qu'avec José, sauvegarde de l'actuelle en main.

## Faire circuler

| besoin | moyen |
|---|---|
| poste local → hébergement (ou l'inverse) | menu du compte → Sauvegarde complète… (administrateur) : Télécharger d'un côté, Restaurer de l'autre |
| donner ses mots à un autre compte | page d'import → « Exporter mes mots » (ou gestionnaire → « Exporter ce chapitre »), puis l'autre compte colle ou choisit le fichier dans sa page d'import (chapitres par nom) |
| reprendre la progression d'un fichier v1 | page d'import : coller ou choisir le fichier, il est reconnu → « Appliquer à mes mots » (jamais de recul) |
| reprendre ce que la v1 a laissé dans un navigateur | ouvrir l'accueil **dans ce navigateur, à la même adresse**, connecté au bon compte → bandeau « Importer dans la base » |

## Ne jamais

- Envoyer `data/nihonjo.sqlite` par FTP, ni `docker compose down -v` sans
  sauvegarde (règle n° 2 de `CLAUDE.md`).
- Effacer l'IndexedDB `NihonjoDB` d'un navigateur : c'est le seul exemplaire
  des données v1 de cet appareil tant que José n'a pas vérifié la reprise.
