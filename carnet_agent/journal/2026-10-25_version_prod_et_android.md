# 25/10/2026 (soir) — Version de production et application Android

*Outil : Claude (app), session cloud reliée au poste de José.*

## La demande

« Crée un .bat qui permet de convertir l'ensemble de la solution en
application Android. Si on ne peut pas glisser-déposer l'ensemble du projet
[en ligne] mais qu'il doit passer par un traitement, crée aussi un .bat pour
faire la version prod du projet. »

## Version de production

Un tri, pas une compilation : il n'y a rien à compiler, mais le dossier ne
peut pas partir tel quel (la base du poste, les secrets). Liste blanche,
garde-fous qui cherchent les fichiers dangereux dans la copie, zip ; les
essais de l'API d'abord si Docker tourne.

## Application Android : deux versions le même soir

1. **D'abord une TWA (Bubblewrap)** : l'application ouvrait le site en ligne
   dans Chrome. Répétée jusqu'à la génération du projet (deux défauts
   corrigés en chemin : le nom de version s'écrit `appVersion` dans
   `twa-manifest.json`, et les mots de passe à guillemets cassaient
   jarsigner).
2. **José : « Tu ne peux pas t'inspirer de la façon de faire
   d'odyvresse_all ? Il construit aussi la version android. »** Remplacée par
   la méthode d'Odyvresse (`odyvresse/build_mobile_production.bat`,
   `odyvresse_app/`) : Capacitor, Java d'Android Studio, `assembleDebug`.
   Ses outils sont déjà sur le poste, et ses pièges déjà payés
   (`deckolector/doc_pour_agents/connexion_google_mobile.md`). Les fichiers
   de la TWA sont partis dans `_a_supprimer\twa\` du poste.

## Ce qui a changé pour Nihonjo, et pourquoi

- **Le front est dans l'APK, l'API reste en ligne** : `config_application.js`
  donne le serveur, `plateforme.js` décide (site ou application). Odyvresse
  appelle un back sur un autre domaine ; Nihonjo a l'API sur le même nom que
  le site, d'où le piège suivant.
- ⚠️ **`server.hostname` ne peut pas être `nihonjo.odyvresse.com`** :
  Capacitor sert lui-même TOUT ce qui est demandé à ce nom
  (`WebViewLocalServer.isMainUrl`), les appels à l'API n'auraient jamais
  quitté le téléphone. Pris `odyvresse.com`, comme Odyvresse (mêmes
  réglages Firebase, déjà éprouvés sur téléphone).
- **CORS** pour cette seule origine, sans cookie ; d'où **pas de Discord**
  dans l'application.
- **Le mot de passe Basic** bloquait l'application (et la vérification
  préalable OPTIONS ne le porte jamais) : `api/.htaccess` le lève pour
  `api/index.php` quand l'`Origin` est celle de l'application. Éprouvé sous
  un vrai Apache 2.4 installé dans le bac à sable, avec un `.htaccess` racine
  comme celui d'OVH (401 / 200 / 403 aux bons endroits, et rien de changé
  sans `.htaccess` racine, comme dans Docker).
- **Pas de compilation du front** : pas de `registerPlugin` ; le greffon est
  appelé par le pont que la WebView injecte (`Capacitor.nativePromise`).
- **Connexion Google** : les trois pièges d'Odyvresse repris (client
  « Web », jamais `scopes`, `logout` natif), plus la promesse
  d'initialisation oubliée si elle échoue.
- `application_android/` est **sous git** (le point fragile noté chez
  Odyvresse : `odyvresse_app` ne l'est pas).

## Vérifié / pas vérifié

- `tests/application_simulee.py` (nouveau) : front sur une autre origine,
  faux `window.Capacitor` ; appels vers le serveur, CORS en lecture et en
  écriture, Discord absent, origine inconnue refusée ; connexion Google
  native avec greffon et Firebase simulés.
- Bac à sable : `npm ci`, `capacitor add android`, icônes, `sync`.
- Pas vérifié : Gradle, un téléphone, la vraie connexion Google, `<If>` chez
  OVH (`en_suspens.md`).

## Addendum 26/10 — « Not Found » sur nihonjo.odyvresse.com

Après la mise en ligne, tout répondait 404, même `/index.html` ; seuls
`data/` et `api/config.php` répondaient 403. Le Multisite OVH était juste
(`www/nihonjo` pour les deux noms). La cause : le `.htaccess` du dossier
PARENT `www/` (celui d'Odyvresse, 22/08) réécrit toute requête vers
`/odyvresse_front/`, et `www/nihonjo` en hérite. Corrigé en conditionnant la
règle sur `HTTP_HOST` (`deploiement.md`). Reproduit avant / après sous
Apache. Leçon : un 404 sur un fichier qu'on voit dans le FTP, avec des 403
qui marchent → chercher une réécriture héritée d'un dossier parent.

Puis, à la demande de José : un `.htaccess` racine **pour Nihonjo**, versionné
et copié par `construire_version_prod.bat`. Ses propres règles de réécriture
suffisent à écarter celles du parent (vérifié avec le parent non corrigé) ;
il redirige `www.nihonjo…` vers `https://nihonjo.odyvresse.com/` et ferme
fichiers cachés, `.md`, `.bat`, bases. Le passage http → https est écrit
mais commenté : avec curl sans port dans `Host`, `SERVER_PORT` valait 80 et
la règle redirigeait tout — chez OVH, non éprouvé, elle risquerait la boucle.
Le mot de passe Basic y est commenté (José l'avait supprimé du serveur).
