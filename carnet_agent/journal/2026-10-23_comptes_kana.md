# 23/10/2026 — Comptes Firebase, page et jeu des kana, lanceur `.bat`

*Outil : Claude (app), session cloud reliée au poste de José ; code écrit et
éprouvé dans le conteneur (`php -S`, Playwright), copié ensuite dans son
dossier.*

## La demande

Un `.bat` qui lance tout ; reprendre la connexion Firebase d'Odyvresse
(Nihonjo est en ligne sur `nihonjo.odyvresse.com`), en faisant dès
maintenant ce qui ne dépend pas de José ; une page de cours hiragana /
katakana « en tableau » ; un mini-jeu où l'on écrit le rōmaji d'un
caractère, erreurs illimitées ; et que chacun puisse ajouter son
vocabulaire en base.

## Les choix

- **Même projet Firebase qu'Odyvresse** (`odyvresse_all/compte-auth.service.ts`
  lu pour la configuration publique) : un compte Google qui joue à Odyvresse
  entre dans Nihonjo sans rien créer. La configuration web n'est pas un
  secret (elle est servie à tout navigateur), elle va dans `api/config.php`.
- **Jeton vérifié en PHP sans bibliothèque** : pas de Composer sur le
  mutualisé. RS256, certificats Google en cache (`max-age`).
- **En-tête `X-Nihonjo-Jeton`** et non `Authorization: Bearer` : le
  `.htaccess` racine fait de l'authentification Basic, donc le navigateur
  envoie déjà `Authorization`, et PHP en CGI ne reçoit pas cet en-tête.
  Décision : `tickets/decisions/D-002-comptes-firebase.md`.
- **Le cours reste commun**, le reste est par compte. Les chapitres d'un
  compte ont la clé `nom@id` pour que chacun ait son « personnel » ; tous
  les fichiers échangés portent le nom, si bien que les exports d'hier
  restent lisibles.
- **Les données d'avant** vont au « compte initial » (n° 1), réclamé par la
  première connexion. Risque assumé et noté (`en_suspens.md`).
- **Kana** : une seule table (hiragana + lectures), le katakana par
  décalage Unicode ; une progression à part (`kana_progression`), parce
  qu'un caractère n'est pas un mot du lexique.

## Ce qui m'a coûté

1. **`pkill -f "php -S"` a tué mon propre shell** (sortie 144, sans
   message) : le motif était dans la commande du `bash -c`. Noté dans
   `environnement.md` et les réflexes.
2. **Un test faux, encore** : l'essai d'import « dans le cours » utilisait
   gare / えき, déjà dans le cours — fusionné, donc « 0 créé ». Même leçon
   que le 22/10 (« chat ») : vérifier dans la base avant de corriger le code.
3. **Sélecteur de test** : `td:first-child` ne trouvait rien (chaque ligne
   commence par un `th`), puis trouvait trois tableaux. `td:nth-of-type(1)`
   dans le premier tableau.
4. **Règle de maîtrise trop sévère** : « acquis » exigeait zéro échec ; un
   kana réussi une fois après une erreur restait « à revoir » pour
   toujours. Passé à « plus de réussites que d'échecs ».
5. **Une minuterie après « Arrêter »** affichait le caractère suivant
   par-dessus le bilan. Les minuteries sont maintenant effacées, et une
   partie finie ne se reprend pas (`partie.terminee`).
6. **La navigation du téléphone disparaissait sur l'écran de réglages du
   jeu** (le CSS visait la vue). Drapeau `body[data-jeu]` posé seulement
   pendant une partie.

## Ce qui reste à voir (détail : `en_suspens.md`)

La vraie connexion Google (bloquée ici), les deux actions de José dans la
console Firebase, la sortie HTTPS de PHP sur OVH, le `.bat` sous Windows.
