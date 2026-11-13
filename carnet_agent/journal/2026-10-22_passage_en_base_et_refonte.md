# 22/10/2026 — Passage du vocabulaire en base, refonte de l'interface, mise en place du carnet

*Outil : Claude (app), session cloud reliée au poste de José ; code écrit et
éprouvé dans le conteneur, copié ensuite dans son dossier.*

## La demande

Trois choses en un message : la persistance du vocabulaire « en bdd
désormais » (type de base laissé à mon choix), une architecture de `.md`
comme celle d'odyvresse_all (doc pour agents, carnet…), et « au passage »
une interface plus belle.

## Ce que j'ai trouvé

- `data_cours.js` : 1 034 mots en JavaScript (commentaires, virgule finale),
  plus une modification non commitée de José (contexte de « えっ »).
- Mots ajoutés et progression dans l'IndexedDB du navigateur (Dexie), chapitres
  perso dans le localStorage : rien de partagé entre appareils.
- `script.js` de 1 600 lignes : `creerToucheClavier` définie deux fois (le
  clavier du formulaire d'ajout écrivait dans le champ caché de l'exercice),
  retour au menu par `location.reload()`, `alert` partout, HTML construit sans
  échappement.
- L'hébergement est un mutualisé OVH (chemin `/home/<compte>/www/nihonjo/` dans
  le `.htaccess`, et le front d'Odyvresse y est envoyé à la main).

## Le choix de la base

SQLite derrière une petite API PHP (`tickets/decisions/D-001-base-sqlite-et-api-php.md`) :
c'est la seule pile qui tourne telle quelle sur un mutualisé OVH, sans
serveur de base à créer ni identifiant à stocker, et à l'identique en local
dans `php:8.3-apache`.

## Ce qui m'a coûté

1. **Le clic avalé.** Le parcours Playwright a calé dès le premier exercice :
   saisir « Mots par session » puis cliquer un exercice ne faisait rien. Le
   `change` du champ (au `blur`, donc au `mousedown` sur le bouton)
   reconstruisait les boutons ; le `click` tombait sur un nœud disparu. Je
   l'aurais livré : rien ne le montre à la relecture.
2. **Ma correction a cassé l'Entrée.** Pour éviter l'empilement d'écouteurs,
   j'ai donné une feuille neuve à chaque mot ; l'écouteur clavier gardait
   l'ancienne : Entrée ne validait plus. Trouvé par le même parcours.
3. **La navigation du téléphone collée en haut** : `backdrop-filter` sur
   l'en-tête en faisait le repère de la barre `position: fixed`. Vu sur la
   première capture.
4. **Deux faux échecs du test** : « chat » existait déjà dans le cours, et un
   toast d'une étape précédente encore affiché a fait croire que la reprise
   n'avait pas repris la progression. La base disait vrai ; le test lisait trop tôt.
5. `find` sur `odyvresse_all` monté : plus de 120 s, interrompu.

## Ce que je retiens

- Un parcours navigateur qui joue vraiment chaque geste vaut plus qu'une
  relecture : deux défauts sur deux venaient d'enchaînements d'événements.
- Avant de corriger le code sur un test rouge, regarder la base.

## Ce qui reste

`en_suspens.md`, section « Livré sans vérification complète » : image
Docker jamais construite, hébergement jamais vu, reprise v1 jamais faite
sur les vraies données.
