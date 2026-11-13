# 23/10/2026 — Tout en base, page d'import, gestionnaire de chapitres

*Outil : Claude (app), session cloud reliée au poste de José.*

## La demande

« Ne plus stocker les données sur le navigateur, tout sauvegarder dans la
bdd » ; ajouter un mot un par un avec un formulaire (en base) ; une
fonctionnalité d'import « qui s'auto-explique », par fichier JSON, chapitre
par défaut « Mes mots » (que chaque compte possède, coché même si on triche
par F12), d'autres chapitres de l'utilisateur au choix ; un prompt à copier
pour obtenir le JSON d'une IA (exemple : les Pokémon de la 1re génération) ;
une page pour gérer puissamment ses chapitres.

## Ce que j'ai trouvé

Les mots, chapitres et progression étaient déjà en base depuis le 22/10.
Restaient dans le navigateur : la sélection de révision, les filtres, les
réglages, le thème, le bilan de reprise v1. Le formulaire existait déjà ;
l'import était un bouton nu dans « Données » ; l'écran Chapitres savait
créer / renommer / supprimer, pas gérer les mots d'un chapitre.

## Les décisions

- **Préférences en base** (table `preference`, liste blanche). Les anciennes
  clés du navigateur sont reprises puis effacées au premier chargement.
- **« Mes mots »** remplace « personnel » (`mes_mots@id`) et contient TOUS
  les mots du compte, imposé par le serveur. Conséquence voulue : supprimer
  un chapitre du compte ne supprime plus aucun mot.
- **Page d'import en trois étapes** ; le texte pour l'IA se remplit avec 4
  champs ; la lecture du collage tolère tout ce qu'une IA ajoute (```json,
  phrases autour) et signale l'erreur la plus courante (rōmaji dans « kana »).
- **Gestionnaire** : liste + détail, ajout depuis chapitre / thème / lexique,
  retirer / copier / déplacer en lot. Les chapitres du cours y sont visibles
  par tous, en lecture pour un membre, pour y PRENDRE des mots.

## Ce qui m'a coûté

1. **La migration 3 empêchait l'amorce.** Créer « Personnel » pour y mettre
   les « Mes mots » rendait `Amorcage::estVide` faux sur une base neuve.
   J'avais mis `WHERE EXISTS (SELECT 1 FROM mot)`… sur un
   `SELECT 'Personnel', MAX(ordre) + 1 FROM categorie` : un agrégat sans
   GROUP BY renvoie UNE ligne même quand le WHERE est faux. L'essai « base
   neuve » l'a vu (0 mot au lieu de 1 034). Sous-requête pour le MAX.
2. **`isset()` et null** : mon tableau id ⇒ propriétaire valait null pour
   les mots du cours ; `isset` les déclarait absents. `array_key_exists`.
3. **Deux objets vides ne sont jamais `===`** : l'essai de sauvegarde
   comparait `toutesLesDonnees()` dont `preferences` est un `(object)`.
   Comparaison en JSON.
4. **Un essai laisse des préférences** : voir `environnement.md`.
5. **Le réglage perdu au rechargement.** J'avais regroupé les envois (400 ms
   après le dernier changement) et ajouté un envoi `keepalive` à la fermeture.
   Le parcours échouait une fois sur deux. Mesuré (10 clics + rechargement) :
   1 sur 10 juste. Le journal de `php -S` a montré la cause : le POST arrivait,
   mais APRÈS le GET `donnees` de la page rechargée — enregistré, mais relu
   trop tôt. Envoi immédiat à chaque changement, regroupé seulement pendant un
   envoi en cours : 10 sur 10. Leçon : un délai de « confort » côté navigateur
   est une fenêtre de perte ; mesurer avant de corriger.
