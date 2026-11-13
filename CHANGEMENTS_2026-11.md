# Changements — novembre 2026

Journal orienté « pourquoi ». Le comment est dans `doc_pour_agents/`.
Octobre : `CHANGEMENTS_2026-10.md`.

## 1. Les chapitres « Page 45 »… deviennent « Chapitre 1 »… (12/11)

José : « Renomme les chapitres qui sont nommés d'après une page, en les
renommant chapitre X. Le numéro de page la plus petite a 1 […] mets
l'information quelque part, que ces chapitres sont basés sur le manuel
d'apprentissage de japonais. »

| clé (inchangée) | avant | après |
|---|---|---|
| `vocabulaire_p_45` | Page 45 | Chapitre 1 |
| `vocabulaire_p_65` … `vocabulaire_p_203` | Page 65 … Page 203 | Chapitre 2 … Chapitre 10 |
| `vocabulaire_p_219` | Page 219 | Chapitre 11 |

**Seul l'affichage change** (`libelleChapitre`, `utils.js`) : renommer les
clés aurait demandé de modifier la base en ligne, et cassé les chapitres
cochés de chaque compte (préférence `chapitres_coches`) comme les fichiers
déjà exportés. Le numéro est le rang de la page parmi les chapitres du
manuel présents : une page ajoutée au cours (`vocabulaire_p_237`) devient
« Chapitre 12 » sans rien toucher.

**D'où ils viennent** : une phrase sous la catégorie, là où on choisit les
chapitres (accueil, « Quels mots réviser ») et dans le gestionnaire de
chapitres ; « Manuel de japonais, à partir de la page 81 » au survol d'un
chapitre et en surtitre de son détail.

## 2. Publicités : le greffon AdMob installé, rien d'affiché (12/11)

José veut des publicités sur le site et l'application Android. Installé : le
greffon `@capacitor-community/admob` (8.2.1) et, dans
`creer_application_android.bat`, la pose de l'identifiant d'application
AdMob dans le manifeste (`application_android/regler_admob.mjs`) — sans
elle, l'application se fermerait à l'ouverture. Identifiant d'essai de
Google tant que José n'a pas le sien. Ce qui reste (comptes AdSense et
AdMob, consentement, emplacements) et ce que demande le Play Store :
`doc_pour_agents/deploiement.md`, « Publicités et Play Store ».
