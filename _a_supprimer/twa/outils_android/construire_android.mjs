// Fabrique l'application Android de Nihonjo (lancé par creer_application_android.bat).
//
// Ce que c'est : une « Trusted Web Activity » (TWA). L'application ouvre le
// SITE en ligne (android/twa-manifest.json, champ `host`) en plein écran,
// dans le Chrome du téléphone. Nihonjo a besoin de son serveur (PHP, base
// SQLite, connexion Google / Discord) : on ne peut pas l'embarquer dans le
// téléphone. Conséquence heureuse : une mise en ligne du site met à jour
// l'application sans la republier. Et la connexion Google marche (Google
// refuse de se connecter dans une WebView, pas dans Chrome).
//
// L'outil : Bubblewrap (Google, version épinglée dans package.json). Étapes :
//   1. `bubblewrap doctor` — la première fois, Bubblewrap demande (en
//      anglais) s'il doit installer Java (JDK 17) et le SDK Android dans
//      %USERPROFILE%\.bubblewrap : répondre Yes, accepter la licence.
//   2. la clé de signature android/nihonjo-signature.keystore : créée au
//      premier passage avec le mot de passe choisi. ⚠️ La garder (hors git)
//      et noter le mot de passe : sans elle, impossible de publier une mise à
//      jour de l'application.
//   3. `bubblewrap update` — régénère le projet Android depuis
//      twa-manifest.json, numéro de version + 1. Les icônes sont lues par un
//      petit serveur local (assets/icones/, port 8799) : le site en ligne est
//      derrière un mot de passe, Bubblewrap ne pourrait pas les télécharger.
//   4. `bubblewrap build` — compile et signe : APK (à installer directement)
//      et AAB (pour le Play Store), copiés dans sortie_android/.
//   5. .well-known/assetlinks.json — la preuve que le site et l'application
//      vont ensemble (empreinte de la clé). Il part en ligne avec la version
//      de production (construire_version_prod.bat). Sans lui, l'application
//      marche mais affiche une barre d'adresse en haut.
//
// Mot de passe sans le taper : variable d'environnement
// NIHONJO_ANDROID_MOT_DE_PASSE (pour une construction automatique).

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, createReadStream } from 'node:fs';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { createRequire } from 'node:module';

const ICI = dirname(fileURLToPath(import.meta.url));
const RACINE = resolve(ICI, '..', '..');
const PROJET = join(RACINE, 'android');
const MANIFESTE = join(PROJET, 'twa-manifest.json');
const SORTIE = join(RACINE, 'sortie_android');
const ICONES = join(RACINE, 'assets', 'icones');
const PORT_ICONES = 8799; // le même que dans iconUrl / maskableIconUrl de twa-manifest.json
const BUBBLEWRAP = join(ICI, 'node_modules', '@bubblewrap', 'cli', 'bin', 'bubblewrap.js');
const CONFIG_BUBBLEWRAP = join(homedir(), '.bubblewrap', 'config.json');

const require = createRequire(import.meta.url);
const core = require('@bubblewrap/core');

function titre(texte) {
  console.log(`\n--- ${texte} ${'-'.repeat(Math.max(0, 60 - texte.length))}`);
}

function arreter(message) {
  console.error(`\n[ERREUR] ${message}`);
  process.exit(1);
}

/**
 * Lance Bubblewrap dans android/, la console reste branchée (ses questions
 * s'affichent). ⚠️ Asynchrone : pendant `update`, CE processus sert les
 * icônes (serveurIcones) ; un spawnSync le bloquerait, et Bubblewrap
 * attendrait les icônes pour toujours.
 */
function bubblewrap(args, env = {}) {
  return new Promise((repondre) => {
    const p = spawn(process.execPath, [BUBBLEWRAP, ...args], {
      cwd: PROJET, stdio: 'inherit', env: { ...process.env, ...env },
    });
    p.on('close', (code) => repondre(code === 0));
    p.on('error', () => repondre(false));
  });
}

/** Une question dont la réponse ne s'affiche pas (des * à la place). */
function demanderSecret(question) {
  return new Promise((repondre) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muet = false;
    rl._writeToOutput = (s) => {
      if (!muet) rl.output.write(s);
      else if (s.includes('\n') || s.includes('\r')) rl.output.write('\n');
      else rl.output.write('*'.repeat(s.length));
    };
    rl.question(question, (r) => { rl.close(); repondre(r); });
    muet = true;
  });
}

/** Sert assets/icones/ le temps de `bubblewrap update`. */
function serveurIcones() {
  const serveur = createServer((req, res) => {
    const fichier = join(ICONES, basename(decodeURIComponent((req.url || '').split('?')[0])));
    if (!existsSync(fichier) || extname(fichier) !== '.png') {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': 'image/png' });
    createReadStream(fichier).pipe(res);
  });
  return new Promise((ok, ko) => {
    serveur.once('error', ko);
    serveur.listen(PORT_ICONES, '127.0.0.1', () => ok(serveur));
  });
}

/** AAAA.MM.JJ, ou AAAA.MM.JJ.2, .3… si une version du jour existe déjà. */
function nomDeVersion(actuel) {
  const d = new Date();
  const jour = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  if (!actuel || !String(actuel).startsWith(jour)) return jour;
  const n = Number(String(actuel).slice(jour.length + 1)) || 1;
  return `${jour}.${n + 1}`;
}

async function principal() {
  console.log('Nihonjo : application Android (Trusted Web Activity, Bubblewrap)');
  if (!existsSync(MANIFESTE)) arreter(`Fichier introuvable : ${MANIFESTE}`);
  const manifeste = JSON.parse(readFileSync(MANIFESTE, 'utf8'));
  console.log(`Site ouvert par l'application : https://${manifeste.host}${manifeste.startUrl}`);
  console.log(`Identifiant Android            : ${manifeste.packageId}`);

  // 1. Java et le SDK Android (installés par Bubblewrap la première fois).
  titre('1/5 Java et SDK Android');
  if (!existsSync(CONFIG_BUBBLEWRAP)) {
    console.log('Premier lancement : Bubblewrap va poser ses questions EN ANGLAIS.');
    console.log('  - "Do you want Bubblewrap to install the JDK"          -> Yes (Entree)');
    console.log('  - "Do you want Bubblewrap to install the Android SDK"  -> Yes (Entree)');
    console.log('  - "Do you agree to the Android SDK terms and conditions" -> y');
    console.log('Le telechargement (environ 500 Mo) prend quelques minutes.');
  }
  if (!await bubblewrap(['doctor'])) arreter('Bubblewrap ne trouve pas Java ou le SDK Android (voir ci-dessus).');
  const config = new core.Config(...(() => {
    const c = JSON.parse(readFileSync(CONFIG_BUBBLEWRAP, 'utf8'));
    return [c.jdkPath, c.androidSdkPath];
  })());
  const cles = new core.KeyTool(new core.JdkHelper(process, config), new core.ConsoleLog('keytool'));

  // 2. La clé de signature.
  titre('2/5 Cle de signature');
  const cheminCle = resolve(PROJET, manifeste.signingKey.path);
  const alias = manifeste.signingKey.alias;
  let motDePasse = process.env.NIHONJO_ANDROID_MOT_DE_PASSE || '';
  if (!existsSync(cheminCle)) {
    console.log(`Pas encore de cle : creation de ${cheminCle}`);
    console.log('Choisissez un mot de passe (6 caracteres au moins) et NOTEZ-LE :');
    console.log('sans lui ni ce fichier, aucune mise a jour de l\'application ne sera possible.');
    if (!motDePasse) {
      motDePasse = await demanderSecret('Mot de passe : ');
      const encore = await demanderSecret('Le meme, encore une fois : ');
      if (motDePasse !== encore) arreter('Les deux mots de passe different.');
    }
    if (motDePasse.length < 6) arreter('Le mot de passe doit faire 6 caracteres au moins.');
    // Bubblewrap passe le mot de passe à jarsigner entre guillemets : un « " »
    // le couperait, et la signature échouerait des minutes plus tard.
    if (/["%^&|<>]/.test(motDePasse)) arreter('Le mot de passe ne doit contenir aucun de ces signes : " % ^ & | < >');
    await cles.createSigningKey({
      path: cheminCle, alias, password: motDePasse, keypassword: motDePasse,
      fullName: 'Nihonjo', organizationalUnit: 'Nihonjo', organization: 'Odyvresse', country: 'FR',
    });
    console.log('[OK] Cle creee. Sauvegardez ce fichier hors du projet (cle USB, coffre de mots de passe).');
  } else {
    console.log(`Cle : ${cheminCle}`);
    if (!motDePasse) motDePasse = await demanderSecret('Mot de passe de la cle : ');
  }
  let empreinte;
  try {
    const info = await cles.keyInfo({ path: cheminCle, alias, password: motDePasse, keypassword: motDePasse });
    empreinte = info.fingerprints.get('SHA256');
  } catch (e) {
    arreter('Mot de passe refuse par la cle (ou cle illisible).');
  }
  if (!empreinte) arreter('Empreinte SHA-256 de la cle introuvable.');
  console.log(`[OK] Empreinte SHA-256 : ${empreinte}`);

  // 3. Le projet Android, régénéré depuis twa-manifest.json.
  titre('3/5 Projet Android');
  // ⚠️ Dans twa-manifest.json, le nom de version s'écrit `appVersion` (et
  // non `appVersionName`, le nom de l'option de la commande) : TwaManifest.
  const version = nomDeVersion(manifeste.appVersion);
  const serveur = await serveurIcones().catch(() => arreter(`Le port ${PORT_ICONES} est occupe (icones).`));
  // node-fetch : le moteur par défaut (fetch-h2) reste suspendu sur une adresse http:// locale.
  const genere = await bubblewrap(['update', `--appVersionName=${version}`, '--fetchEngine=node-fetch']);
  serveur.close();
  if (!genere) arreter('Bubblewrap n\'a pas pu generer le projet Android.');
  const apres = JSON.parse(readFileSync(MANIFESTE, 'utf8'));

  // 4. Compilation et signature.
  titre('4/5 Compilation (plusieurs minutes la premiere fois)');
  if (!await bubblewrap(['build'], { BUBBLEWRAP_KEYSTORE_PASSWORD: motDePasse, BUBBLEWRAP_KEY_PASSWORD: motDePasse })) {
    arreter('La compilation a echoue (voir ci-dessus).');
  }
  mkdirSync(SORTIE, { recursive: true });
  const apk = join(SORTIE, `Nihonjo-${apres.appVersion}.apk`);
  const aab = join(SORTIE, `Nihonjo-${apres.appVersion}.aab`);
  copyFileSync(join(PROJET, 'app-release-signed.apk'), apk);
  copyFileSync(join(PROJET, 'app-release-bundle.aab'), aab);

  // 5. Le lien site ↔ application (Digital Asset Links).
  titre('5/5 Lien entre le site et l\'application');
  // Les empreintes ajoutées à la main dans twa-manifest.json (« fingerprints »,
  // par exemple celle de la signature du Play Store) s'ajoutent à la nôtre.
  const autres = (apres.fingerprints || []).map((f) => f.value).filter((v) => v && v !== empreinte);
  const dossierLien = join(RACINE, '.well-known');
  mkdirSync(dossierLien, { recursive: true });
  writeFileSync(join(dossierLien, 'assetlinks.json'), core.DigitalAssetLinks.generateAssetLinks(apres.packageId, empreinte, ...autres));
  console.log(`[OK] ${join(dossierLien, 'assetlinks.json')}`);

  console.log(`
===================================================
  Application Android prete (version ${apres.appVersion}, code ${apres.appVersionCode})
===================================================
  A installer sur un telephone : ${apk}
     (copier le fichier sur le telephone, l'ouvrir, autoriser
      l'installation depuis cette source)
  Pour le Play Store          : ${aab}

  Ensuite : construire_version_prod.bat, puis envoyer version_prod\\
  en ligne (il contient .well-known\\assetlinks.json). Tant que ce
  fichier n'est pas en ligne, l'application affiche une barre
  d'adresse en haut de l'ecran.
`);
}

principal().catch((e) => arreter(e && e.message ? e.message : String(e)));
