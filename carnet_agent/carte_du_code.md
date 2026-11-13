# Carte du code — où se passe quoi

Relevée le 22/10/2026 en écrivant la v2, complétée le 23/10 (comptes, kana)
(Claude, session cloud reliée au poste). Chaque flux va du geste de José jusqu'à la base. Si un flux a changé,
corriger ici, daté.

## À exclure des recherches

| chemin | pourquoi |
|---|---|
| `archives/v1/` | l'ancienne version (script.js, style.css, data_cours.js, config*.js, liste_kanjis.js, index.html) : **rien n'y est chargé**. Utile seulement pour comparer avec la v1 |
| `api/amorce/vocabulaire_initial.json` | 295 Ko de mots ; ne sert qu'à une base vide. Chercher un mot dans la base, pas ici |
| `data/` | la base (binaire) |

## 1. Démarrage et connexion (revu le 24/10 : inscription, Discord)

`index.html` (thème avant peinture) → `assets/js/app.js` `demarrer` →
`appeler('sante')` (public : PHP, SQLite, `auth: {mode, firebase,
fournisseurs}`) → `auth.js` `initialiserConnexion` (mode `firebase` : SDK
chargé depuis gstatic, `onAuthStateChanged`, `getRedirectResult` ; un SDK
absent ne bloque plus) → `retourDiscord()` (`#/connexion?discord=…`) → sans
session Google : `appeler('session')` (cookie Discord) →
pas de compte : `afficherConnexion` → « Se connecter » (`seConnecterGoogle`
puis `entrer`, ou `allerVersDiscord('connexion')`) / « Créer un compte »
(`seConnecterGoogle` puis `creerCompte` → `compte.creer`, ou
`allerVersDiscord('inscription')`) ; compte : `entrer` →
`etat.js` `recharger` → `api.js` `appeler('donnees')` (+ `enteteConnexion` :
`X-Nihonjo-Jeton`) → `api/index.php` → `Base::ouvrir` (PRAGMA, `migrer`) →
`Amorcage::siBaseVide` → `Authentification::utilisateur` →
`VerificateurJetonFirebase::verifier` (certificats en cache) →
`Comptes::pourIdentite` → `new Depot($pdo, $compte)` → `Api::traiter` →
`Depot::toutesLesDonnees` (utilisateur, cours + mots du compte, kana) →
`majMenuCompte` → `rendre` choisit la vue d'après l'ancre
(`routeur.js` `vueDemandee`).

Dans l'application Android (25/10) : même chemin, avec `plateforme.js`
`estApplication()` vrai → `api.js` vise `urlServeur('api/index.php')`
(`config_application.js`) → `api/index.php` `nihonjo_cors` (OPTIONS : 204) ;
`seConnecterGoogle` → `seConnecterGoogleNatif` → `greffon('SocialLogin',
'initialize' puis 'login')` (`Capacitor.nativePromise`) →
`signInWithCredential` ; Discord retiré de `fournisseursDisponibles`.

Un 401 en cours de route : `api.js` émet `nihonjo:deconnexion` → `app.js`
→ `afficherConnexion(message)`. Un 404 `compte_inexistant` (l'identité n'a
pas de compte) : `nihonjo:compte-inexistant` → `afficherCompteInexistant` →
« Créer mon compte » → `creerCompte`. Menu du compte ou « Mon compte » →
« Se déconnecter » → `session.js` `terminerSession` (Firebase `signOut`,
`deconnexion`, `oublierCompte`) → `nihonjo:sortie` → écran de connexion.

Discord, côté serveur : `api/discord.php` → `Authentification::debutDiscord`
(cookie `nihonjo_discord`, 302 vers Discord) ; retour → `retourDiscord` →
`ConnexionDiscord::identite` (code → jeton → `/users/@me`) →
`Comptes::pourIdentite` → `ouvrirSession` (cookie `nihonjo_session`) ou
cookie `nihonjo_attente` → 302 vers l'application. Requêtes suivantes :
`Authentification::utilisateur` → `Comptes::deSession` (id + uid).

### 1 bis. Mon compte, Gérer les comptes (24/10)

`#/compte` → `vues/compte.js` → `compte.profil` (`Depot::profil` →
`Comptes::profil`, compteurs filtrés par le compte) ; pseudo →
`compte.modifier` → `majUtilisateur` + `nihonjo:compte-modifie` (menu) ;
supprimer → `confirmer` → `compte.supprimer` (`Comptes::supprimer`, ON
DELETE CASCADE ; 409 au dernier administrateur) → `terminerSession`.
`#/comptes` → `vues/comptes.js` → `comptes.lister` / `comptes.role` /
`comptes.supprimer` (`Depot::exigerAdmin` d'abord).

## 2. Réviser → exercice → progression

`vues/reviser.js` `afficher` (l'accueil, refait le 23/10) : `salutation`,
`progression`, `motDuJour`, cartes construites une fois ; puces de chapitres
(`chapitreCoche`, `cocherChapitres` → localStorage `nihonjo_chapitres`),
filtres (`filtres`, `ecrireFiltres`) → `rendreSelection` (met à jour en
place : état, grand bouton, comptes des cartes) →
grand bouton `[data-rapide]` → `exerciceConseille` (Paires ou un mode) →
`tirerPrioritaires` ; carte `[data-mode]` → préférence `dernier_mode` +
`tirerPrioritaires` ; carte `[data-ecriture]` → `lancerEcriture` ;
carte `[data-alphabet]` → `lancerJeuKana` →
`vues/exercice.js` `motsPourMode` + `lancerSession` →
`naviguer('exercice')` → `afficher` (barre, jauge, `surTouche`) →
`afficherMot` (feuille neuve, `MODES[mode].preparer/question/aide`,
`creerClavier`, `monter`) → Valider (rōmaji refusé si `japonais`) →
`repondre` (`juger` : `normaliser`, `comparerFrancais`, `homonymes` ;
marque les tuiles, `afficherCorrection` + « Écouter » `son.js`) →
`appeler('progression.resultat', { niveau })` →
`Depot::enregistrerResultat` (paliers, `aujourdhui` à Paris) →
`ecrireProgression` → `majProgression` →
« Suivant » → `afficherMot` ou `afficherBilan` (« Refaire les erreurs » →
`lancerSession` sur les erreurs).

### 2 bis. Paires (23/10)

carte `[data-paires]` (`reviser.js`, compte par `pairesPossibles`) →
`vues/paires.js` `lancerPaires(motsSelectionnes())` → `preparerGrille`
(`tirerPrioritaires`, garde d'unicité `vus`) → `naviguer('paires')` →
`afficher` (`body.dataset.jeu`, écouteurs `pointerdown/move/up` + `click`
sur la grille) → `essayer` → `appeler('progression.resultat')` →
`majProgression` → dernière paire → `afficherBilan` (« Nouvelle grille » →
`lancerPaires`).

## 3. Liste → écriture

`vues/reviser.js` bouton « Voir la liste » → `vues/liste.js` `afficher`
(mêmes `motsSelectionnes`) → badge d'état : `CYCLE` →
`appeler('progression.definir')` → `Depot::definirStatut` ; cases cochées →
`lancerEcriture(ids)` (`vues/ecriture.js`, réglages `reglagesEcriture` de
`liste.js`) → `afficherMot` → Entrée compare à kana/kanji/rōmaji normalisés →
`casesEssais` → mot suivant ou retour à la liste. **Aucune écriture en base.**

## 4. Lexique : ajouter, modifier, supprimer

`vues/lexique.js` `afficher` (`filtrer` : recherche, chapitre, origine ; 100
par page) → « Ajouter » / crayon → `vues/formulaire_mot.js` `formulaireMot`
(claviers par champ, étiquettes de thèmes, puces de chapitres, nouveau
chapitre) → `dialogue` (`ui.js`) → `valider` → `appeler('mot.enregistrer')` →
`Depot::enregistrerMot` (`validerMot`, `insererMot` ou UPDATE, `lier` →
`assurerChapitre` → `idCategorie`) → `remplacerMot` puis `recharger`.
Corbeille → `confirmer` → `appeler('mot.supprimer')` → `Depot::supprimerMot`
(cascades) → `retirerMot`.

## 5. Chapitres : le gestionnaire (refait le 23/10)

`vues/chapitres.js` `afficher` : `chapitreDemande` (ancre `?chapitre=`) →
`choisir` (`history.replaceState`, sans nouveau rendu) → `rendreListe`
(mes chapitres, puis ceux du cours) + `rendreDetail` → `rendreLignes`
(recherche, 100 par page) → cases `[data-coche]` → `majLot` (barre d'actions,
mise à jour EN PLACE) :
- « Ajouter des mots » → `dialogueAjout` (source chapitre / thème / lexique,
  « Tout cocher » prend toute la source filtrée) → `chapitre.ajouterMots` →
  `Depot::ajouterMotsAuChapitre` ;
- retirer (ligne ou lot) → `chapitre.retirerMots` → `Depot::retirerMotsDuChapitre`
  (garde les mots du compte dans « Mes mots ») ;
- copier / déplacer → `[data-vers]` (ou « un nouveau chapitre… » →
  `dialogueCreation({ vide: true })`) → `ajouterMots` (+ `retirerMots`) ;
- « Réviser ce chapitre » → `cocherSeulement` → `#/reviser` ;
- crayon → `dialogueModification` → `Depot::modifierChapitre` →
  `renommerChapitreCoche` ; corbeille → `Depot::supprimerChapitre`.

### 5 bis. Importer des mots (23/10)

Lexique « Importer une liste » / menu du compte → `#/importer` → `vues/importer.js`
`afficher` : champs → `htmlPrompt` / `textePrompt` → « Copier »
(`navigator.clipboard`) ; collage / `choisirFichierTexte` → `lireListe`
(tolérant : texte autour, noms « humains ») → `rendreVerdict` ; puces
(`chapitresDuCompte`, « Mes mots » verrouillé) → `majBouton` → `import.mots`
(`chapitres`, `nouveau_chapitre`, `cible`) → `Depot::importerMots`
(`champsImport`, `lierMesMots`) → `recharger` → `rendreResultat` (« Réviser »,
« Gérer le chapitre » → `#/chapitres?chapitre=`).

## 6. Fichiers (l'écran « Données » a disparu le 23/10)

`assets/js/echanges.js` : menu du compte (`app.js` `majMenuCompte`, aussi en
mode `aucune`) → `ouvrirSauvegarde` (`appeler('sauvegarde')` →
`telechargerJson` ; restauration `choisirFichierJson` → `confirmer` →
`Depot::restaurer` ; ligne « Serveur » `Depot::sante`). Page d'import →
`exporterMots(mesMots())` ; gestionnaire → `exporterMots(motsDe(c))`. Page
d'import, fichier `nihonjo_progression` reconnu par `lireListe` →
`appliquerProgression` (`rapprocherProgression` → `progression.fusionner` →
`Depot::fusionnerStatuts`).

## 6 bis. Préférences (23/10)

Toute vue → `preference(cle, defaut)` (copie arrivée avec `donnees`) ;
`ecrirePreference(cle, valeur)` → copie + envoi immédiat (`keepalive`), ou
`aRenvoyer` si un envoi de cette clé est en route (renvoyé à son retour) →
`appeler('preference.ecrire')` → `Depot::ecrirePreference` (liste blanche
`CLES_PREFERENCES`). `pagehide` / `visibilitychange` → `envoyerPreferencesEnAttente`
(en-tête en cache, `enteteConnexionImmediat`). Au chargement (`app.js` `entrer`) :
`reprendrePreferencesLocales` (anciennes clés `nihonjo_*` → compte, puis
effacées) → `appliquerThemeDuCompte`.

## 7. Kana : tableau et jeu (23/10)

`vues/kana.js` `afficher` : segments Hiragana / Katakana / Les deux
(préférence `kana_alphabet`) → `GROUPES` (`donnees/syllabaires.js`) → un
`<table>` par groupe, chaque glyphe classé par `maitrise(etat.kana[g])` →
bouton d'en-tête de ligne `[data-ligne]` → `lancerJeuKana` sur cette ligne.
Bouton « Jouer » → `#/jeu-kana` → `vues/jeu_kana.js` `afficher` :
`afficherReglages` (lignes, alphabet, nombre ; `nihonjo_jeu_kana`) →
`lancerJeuKana` → `caracteres` + `tirer` (non acquis d'abord) →
`afficherPartie` (`body.dataset.jeu`, `normaliserRomaji`, « Je ne sais
pas ») → `terminer` (caractère trouvé ; réussite = du premier coup) :
`appeler('kana.resultat')`
→ `Depot::enregistrerKana` (`kana_progression`) → `etat.kana` mis à jour →
raté remis dans `partie.file` 3 à 6 plus loin → `afficherBilan` (« Rejouer
les ratés »).

## 7 bis. Kanji : page et jeu (26/10)

Onglet « Kanji » → `#/kanji` → `vues/kanji.js` `afficher` : groupe
(`kanjisDuGroupe`, `assets/js/kanjis.js` ; préférence `kanji_niveau`) →
grille de `.case-kanji` (état : `etatKanji` ← `donnees().kanji`) → toucher →
`ouvrirFiche` (dialogue) → « S'entraîner » → `lancerJeuKanji(réglages, [k])`.
Bouton « Jouer », cartes « Kanji » de l'accueil → `#/jeu-kanji` →
`vues/jeu_kanji.js` : `afficherReglages` (préférence `jeu_kanji`) →
`lancerJeuKanji` (`tirer` : à revoir d'abord ; mélangé : `faceteFaible`) →
`afficherQuestion` → `repondre` (sens : `comparerFrancais` ; lecture :
`lectureJuste` ; choix : la tuile) → `appeler('kanji.resultat')` →
`Depot::enregistrerKanji` → `donnees().kanji[k]` → `afficherCorrection` →
`afficherBilan`. Les données : `donnees/kanjis.js`, fabriqué par
`outils/generer_kanjis.py` (KANJIDIC2 + liste v1 + kanjis de l'amorce).
L'anneau « Kanjis » de l'accueil : `progression()` et `rendreSelection`
(`vues/reviser.js`).

## 8. Reprise des données v1 du navigateur

`vues/reviser.js` `afficherBandeauMigration` → bouton `[data-importer-v1]` →
`echanges.js` `importerAncienneVersion` → `migration_navigateur.js`
`detecterAnciennesDonnees`
(`ouvrirBaseV1` sans créer, `lireTable` × 2, localStorage
`nihonjo_custom_chapters` / `nihonjo_chap_categories`) → bouton → `migrer` →
`import.mots` → `chapitre.creer` (chapitres vides) → `recharger` →
`progressionVersMots` → `progression.fusionner` → `ecrirePreference('migration_v1')`.

## Les fichiers de soutien

| fichier | contient |
|---|---|
| `assets/js/utils.js` | `echapper`, `normaliser`, `melanger`, `libelleChapitre`, `pluriel`, `telechargerJson`, `choisirFichierJson`, `memoire` |
| `assets/js/ui.js` | `toast` (3 au plus), `tenter`, `dialogue`, `confirmer` |
| `assets/js/composants.js` | `barreStatuts`, `badgeStatut`, `japonaisEnLigne`, `optionsChapitres`, `segments`, `avatar` |
| `assets/js/masu.js` | `masu`, `casesEssais` |
| `assets/js/clavier.js`, `kana.js` | `creerClavier` ; tables `HIRAGANA`, `KATAKANA`, `DAKUTEN_*` |
| `assets/js/icones.js` | `icone(nom)`, tracés `TRACES` |
| `assets/js/auth.js` | `initialiserConnexion`, `fournisseursDisponibles`, `identiteNavigateur`, `seConnecterGoogle`, `allerVersDiscord`, `choisirAdresseDev`, `seDeconnecter`, `enteteConnexion`, `messageFirebase` (24/10 : `seConnecter` et `photoCompte` ont disparu ; la photo vient du serveur) |
| `assets/js/session.js` | `terminerSession`, `EVENEMENT_SORTIE`, `libelleFournisseur`, `dateLisible` |
| `assets/js/donnees/syllabaires.js` | `GROUPES`, `versKatakana`, `toutesLesLignes`, `caracteres`, `maitrise` |
| `api/lib/Authentification.php` | `VerificateurJetonFirebase`, `Comptes` (`pourIdentite`, `lire`, `deSession`, `modifierPseudo`, `profil`, `lister`, `changerRole`, `supprimer`), `JetonsSignes`, `Cookies`, `ConnexionDiscord`, `Authentification` (`mode`, `pourInterface`, `utilisateur`, `inscrire`, `deconnecter`, `debutDiscord`, `retourDiscord`, `attenteDiscord`) |
| `api/discord.php` | les deux redirections de Discord (aller, retour) |
| `assets/js/donnees/liste_kanjis.js` | `dictionnaireKanjis` : leurres de « Mots à trous (kanji) » uniquement |
