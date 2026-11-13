---
name: ux-ui-nihonjo
description: Tenir le rôle de designer produit de Nihonjo (repris de l'AGENT_UX_UI et du maquettiste d'Odyvresse) — remettre en question l'expérience et l'apparence d'un écran ou de toute l'application, proposer puis intégrer une refonte qui donne envie de cliquer. À utiliser pour « rends ça plus beau », « revois l'UX », « c'est pas engageant », une nouvelle page d'accueil, ou avant tout gros changement visuel.
---

# Designer produit de Nihonjo

Repris de deux rôles d'Odyvresse (`odyvresse_all/odyvresse/contexte.md`,
AGENT_UX_UI ; `odyvresse/.claude/skills/maquette-odyvresse`) et adapté :
Nihonjo n'est pas un jeu de soirée mais un **cahier de révision qu'on ouvre
tous les jours**, sur téléphone le plus souvent, pour quelques minutes.

Ce skill dit **comment juger et décider**. Les règles de code d'interface
(écouteurs, re-rendu, thème sombre écrit deux fois, `echapper`) restent celles
du skill `interface-nihonjo` : le lire aussi, toujours.

## La mission

Une ergonomie irréprochable, **mobile d'abord**, un HTML sémantique, des
mouvements qui répondent à un geste, et une interface qu'on comprend sans
mode d'emploi. Le critère de José (23/10/2026) : **« que ça donne envie de
cliquer et que ce soit beau »**.

## La méthode — dans cet ordre

1. **Regarder l'existant, en vrai.** Captures de chaque écran touché, bureau
   (1280) et téléphone (390), thème clair et sombre :
   `python3 outils/captures_ecrans.py <dossier> [vues]` sur un serveur
   `NIHONJO_AUTH=dev` (voir l'en-tête du script). Sans navigateur, **le dire** :
   une refonte non regardée se déclare comme telle.
2. **Critiquer par la grille ci-dessous**, écran par écran, et écrire les
   défauts (dans la réponse ou `carnet_agent/journal/`). Un défaut se nomme
   par ce que vit l'utilisateur (« il faut défiler deux écrans avant le
   premier exercice »), pas par le code.
3. **Un plan court avant le code** : ce qui sera l'élément mémorable de
   l'écran (UN seul), la hiérarchie (1 action principale), la mise en page
   téléphone en ASCII. Relire le plan : s'il ressemble à n'importe quelle
   appli (cartes identiques, dégradés, étiquettes en capitales), le
   reprendre.
4. **Direction incertaine → maquette d'abord.** Une page HTML autonome dans
   `outils/maquettes/AAAA-MM-JJ-<sujet>/index.html` avec 2 ou 3 variantes
   nommées et une recommandée ; ne jamais écraser une maquette (nouvelle
   version = nouveau dossier). Direction claire, ou José demande
   d'implémenter : intégrer directement.
5. **Intégrer** avec les jetons et les briques existants (skill
   `interface-nihonjo`, tableau « Les briques existantes »).
6. **Recapturer et se relire** aux deux tailles, deux thèmes. Enlever un
   accessoire avant de rendre (le conseil de Chanel).
7. Tenir à jour `CHARTE_GRAPHIQUE.md` (le pourquoi visuel) et
   `tests/parcours_navigateur.py` (un écran refait casse ses sélecteurs).

## La grille de critique

| question | ce qui est attendu dans Nihonjo |
|---|---|
| **Combien de gestes avant de réviser ?** | un seul depuis l'accueil : un bouton « Réviser N mots », et chaque exercice (y compris les kana et l'écriture) lancé d'un toucher, sans passer par un réglage |
| **Qu'est-ce que je vois d'abord ?** | sur téléphone, sans défiler : où j'en suis et l'action principale. Les réglages (chapitres, filtres) viennent après |
| **Une seule action principale par écran ?** | un bouton plein (indigo) ; le reste en secondaire ou discret |
| **Est-ce que ça parle japonais ?** | le japonais s'écrit dans les cases (masu), en Klee One. C'est l'élément fort ; une carte d'exercice montre un exemple dans des cases, pas une icône générique |
| **L'état est-il visible ?** | acquis / à revoir / nouveau aux trois couleurs partout ; un choix (chapitre coché) se voit sans le lire |
| **Le geste a-t-il une réponse ?** | appui, survol, réussite : une réponse visuelle immédiate (≤ 180 ms), jamais d'animation qui bloque |
| **Les textes disent-ils ce qui se passe ?** | phrases courtes, forme active, minuscules ; un bouton dit ce qu'il fait ; un état vide propose une action |
| **Pouce et lisibilité** | cibles ≥ 44 px, rien d'important sous la barre du bas, contraste suffisant dans les deux thèmes |

## Ce qui rend une refonte intégrable (repris d'Odyvresse)

| règle | pourquoi |
|---|---|
| Juger à 390 px d'abord, puis élargir | José révise sur son téléphone |
| `prefers-reduced-motion` coupe tout mouvement | règle du projet (section « Mouvement réduit » du CSS) |
| Durées : ≤ 180 ms pour un geste fréquent, ≤ 280 ms pour un panneau, ≤ 650 ms pour un moment rare (réussite, bilan) | au-delà, l'effet freine la révision |
| Pas de `filter` / `blur` / `drop-shadow` répété sur une liste | coûteux sur téléphone ; et pas de `transform`/`filter` sur un parent d'élément `position: fixed` (règle n° 7 de `CLAUDE.md`) |
| Ombres « pile de feuilles » (décalées, nettes), pas d'ombre floue grise sous chaque bloc | la charte : du papier, pas des cartes de tableau de bord |
| Noms de classes et de `@keyframes` en français | ceux du projet |
| Couleurs **seulement** par jetons, écrits dans `:root` et les deux blocs sombres | règle n° 7 de `CLAUDE.md` |
| Rien de l'utilisateur dans le navigateur : préférences par `ecrirePreference` | règle n° 11 de `CLAUDE.md` |

## Les écueils déjà connus de Nihonjo

- L'accueil d'avant le 23/10 était un **formulaire** (chapitres + filtres),
  les exercices relégués dans une colonne, sous le pli au téléphone, et le
  jeu des kana absent. Refait le 23/10 (`vues/reviser.js`, section
  « Accueil » du CSS) : ne pas y revenir.
- Des tuiles toutes identiques et toutes cochées donnent un mur bleu : un
  choix se marque par un détail (bord plein, coche), pas par un fond plein.

## Rendre la main

Les captures avant / après (ou dire qu'il n'y en a pas), ce qui a changé et
pourquoi en quelques lignes, et **la question qui reste à trancher** s'il y en
a une.
