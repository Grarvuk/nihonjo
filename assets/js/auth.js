// Connexion — comme sur Odyvresse : on « crée un compte » (s'inscrit) puis on
// « se connecte », avec Google ou avec Discord.
//
// - Google : Firebase Authentication, projet « odyvresse », fenêtre
//   surgissante (signInWithPopup, repli en redirection). Le jeton d'identité
//   part avec chaque appel à l'API dans l'en-tête `X-Nihonjo-Jeton`
//   (pourquoi pas `Authorization` : api/lib/Authentification.php).
// - Discord : OAuth2 mené par le SERVEUR (api/discord.php) ; au retour, un
//   cookie de session HttpOnly que ce code ne voit pas. On le détecte en
//   appelant `moi` (app.js).
//
// Le mode vient du serveur (`sante` → auth.mode, auth.fournisseurs) :
//   firebase : Google, et Discord s'il est configuré (production, et en
//              local : « localhost » est un domaine autorisé par Firebase) ;
//   aucune   : pas de connexion, un seul compte (poste local hors ligne) ;
//   dev      : tests automatiques, une adresse saisie suffit (jamais en ligne).
//
// Ce module ne fait AUCUN appel à l'API (api.js en dépend) : l'inscription
// (`compte.creer`) et la déconnexion côté serveur sont dans app.js.
//
// Le SDK Firebase n'est chargé qu'en mode firebase, à la demande : les tests
// (et un poste hors ligne en mode « aucune ») n'en ont pas besoin.
//
// Dans l'APPLICATION Android (plateforme.js), comme sur Odyvresse : Google
// par le sélecteur de compte NATIF (greffon @capgo/capacitor-social-login),
// dont le jeton d'identité devient une session Firebase
// (signInWithCredential) ; la suite est la même que sur le site. Pas de
// Discord dans l'application.

import { memoire } from './utils.js';
import { estApplication, greffon, ID_CLIENT_WEB_GOOGLE } from './plateforme.js';

// Version épinglée : une version majeure nouvelle ne doit pas arriver toute seule.
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
// Seule donnée gardée dans le navigateur, et en mode dev seulement (tests) :
// l'adresse d'essai, l'équivalent de la session Firebase.
const CLE_DEV = 'nihonjo_dev_email';

let mode = null;
let fournisseurs = { google: false, discord: false };
let fb = null;
let auth = null;
let erreurSdk = null;
let emailDev = null;

/**
 * Prépare la connexion d'après la réponse de `sante`.
 * @returns {Promise<boolean>} une identité est-elle déjà là, côté navigateur
 *   (session Google, adresse d'essai, ou poste sans connexion) ? Une session
 *   Discord ne se voit pas ici : app.js la cherche avec `moi`.
 */
export async function initialiserConnexion(sante) {
  mode = sante?.auth?.mode || 'firebase';
  fournisseurs = { google: false, discord: false, ...(sante?.auth?.fournisseurs || {}) };
  // Discord revient par une redirection vers le SITE et une session par
  // cookie : rien de cela n'atteint l'application (autre origine).
  if (estApplication()) fournisseurs.discord = false;
  if (mode === 'aucune') return true;
  if (mode === 'dev') {
    emailDev = memoire.lire(CLE_DEV, null);
    return Boolean(emailDev);
  }
  if (!sante?.auth?.firebase) return false;
  try {
    const [app, module] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`)]);
    fb = module;
    auth = fb.getAuth(app.initializeApp(sante.auth.firebase));
    auth.languageCode = 'fr';
  } catch (e) {
    // Hors ligne, gstatic bloqué… Discord peut encore marcher : on ne bloque
    // pas l'écran de connexion, le bouton Google dira ce qui ne va pas.
    console.warn('SDK Firebase indisponible :', e);
    erreurSdk = 'Le service de connexion Google (Firebase) ne se charge pas : vérifiez le réseau, puis rechargez la page.';
    return false;
  }
  try {
    await fb.getRedirectResult(auth); // retour d'une connexion par redirection (fenêtre bloquée)
  } catch (e) {
    console.warn('Retour de connexion Firebase :', e);
  }
  const utilisateur = await new Promise((resolve) => {
    const arreter = fb.onAuthStateChanged(auth, (u) => { arreter(); resolve(u); });
  });
  return Boolean(utilisateur);
}

export function modeConnexion() {
  return mode;
}

/** Les boutons à proposer : { google, discord } (le mode dev a son propre formulaire). */
export function fournisseursDisponibles() {
  return { ...fournisseurs };
}

/** Qui est connecté côté navigateur : 'google', 'dev', ou null (Discord : cookie invisible ici). */
export function identiteNavigateur() {
  if (mode === 'dev' && emailDev) return { fournisseur: 'dev', email: emailDev };
  const u = auth?.currentUser;
  return u ? { fournisseur: 'google', email: u.email || '', nom: u.displayName || '', photo: u.photoURL || '' } : null;
}

let dernierEntete = {};

/** En-têtes à joindre à un appel de l'API. getIdToken() renouvelle seul le jeton (1 h). */
export async function enteteConnexion() {
  if (mode === 'firebase' && auth?.currentUser) dernierEntete = { 'X-Nihonjo-Jeton': await auth.currentUser.getIdToken() };
  else if (mode === 'dev' && emailDev) dernierEntete = { 'X-Nihonjo-Dev-Email': emailDev };
  else dernierEntete = {};
  return dernierEntete;
}

/**
 * Le dernier en-tête obtenu, SANS attendre : pour un envoi pendant que la page
 * se ferme (une attente laisserait partir la page avant la requête). Le jeton
 * Firebase en cache vaut une heure : il a servi il y a peu.
 */
export function enteteConnexionImmediat() {
  return dernierEntete;
}

/**
 * Ouvre la fenêtre Google.
 * @returns {Promise<boolean>} identité obtenue (false : fenêtre fermée, ou redirection en cours)
 */
export async function seConnecterGoogle() {
  if (!auth) throw new Error(erreurSdk || "La connexion Google n'est pas disponible ici.");
  if (estApplication()) return seConnecterGoogleNatif();
  const fournisseur = new fb.GoogleAuthProvider();
  fournisseur.setCustomParameters({ prompt: 'select_account' });
  try {
    await fb.signInWithPopup(auth, fournisseur);
    return true;
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await fb.signInWithRedirect(auth, fournisseur);
      return false;
    }
    if (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request') return false;
    throw new Error(messageFirebase(e));
  }
}

// --- Application Android : le sélecteur de compte natif ---------------------
// Les pièges, tous vécus sur Odyvresse (deckolector/doc_pour_agents/
// connexion_google_mobile.md) : l'identifiant client « Web », jamais
// `scopes`, déconnexion native en plus de Firebase, initialisation mémorisée
// comme PROMESSE (oubliée si elle échoue).

let initialisationNative = null;

function initialiserGoogleNatif() {
  if (!initialisationNative) {
    initialisationNative = greffon('SocialLogin', 'initialize', { google: { webClientId: ID_CLIENT_WEB_GOOGLE } })
      .catch((e) => { initialisationNative = null; throw e; });
  }
  return initialisationNative;
}

async function seConnecterGoogleNatif() {
  let reponse;
  try {
    await initialiserGoogleNatif();
    // ⚠️ AUCUN `scopes` : leur seule présence fait passer le greffon par un
    // autre chemin, qui exige une MainActivity modifiée (« You CANNOT use
    // scopes without modifying the main activity »). openid, email et profil
    // sont déjà demandés.
    reponse = await greffon('SocialLogin', 'login', { provider: 'google', options: {} });
  } catch (e) {
    const texte = String(e?.message || e || '');
    if (/cancel|annul/i.test(texte)) return false; // sélecteur fermé
    throw new Error(`Connexion Google impossible (${texte}). Si cela dure : l'empreinte SHA-1 de l'application est-elle déclarée dans la console Firebase (application Android com.odyvresse.nihonjo) ?`);
  }
  const resultat = reponse?.result || {};
  if (!resultat.idToken) {
    throw new Error("Google n'a rendu aucun jeton d'identité : vérifiez l'empreinte SHA-1 de l'application dans la console Firebase.");
  }
  try {
    await fb.signInWithCredential(auth, fb.GoogleAuthProvider.credential(resultat.idToken));
  } catch (e) {
    throw new Error(messageFirebase(e));
  }
  return true;
}

/**
 * Part chez Discord (la page change) ; le serveur ramène ensuite sur
 * #/reviser (connecté) ou #/connexion?discord=<raison>.
 * @param {'connexion'|'inscription'} intention
 */
export function allerVersDiscord(intention) {
  location.assign(`api/discord.php?intention=${intention === 'inscription' ? 'inscription' : 'connexion'}`);
}

/** Mode dev : l'adresse d'essai tient lieu de compte Google. */
export function choisirAdresseDev(adresse) {
  emailDev = String(adresse || '').trim() || null;
  memoire.ecrire(CLE_DEV, emailDev);
  return Boolean(emailDev);
}

/** Oublie l'identité du navigateur (Google, adresse d'essai). La session Discord, elle, se ferme au serveur (`deconnexion`). */
export async function seDeconnecter() {
  if (mode === 'firebase' && auth?.currentUser) await fb.signOut(auth);
  // ⚠️ Firebase oublie le compte, Android non : sans cela, la connexion
  // suivante rouvre le même compte sans montrer le sélecteur. Un échec ici
  // n'empêche pas la déconnexion (Firebase est déjà fermé).
  if (estApplication()) await greffon('SocialLogin', 'logout', { provider: 'google' }).catch((e) => console.warn('Session Google native non fermée :', e));
  if (mode === 'dev') choisirAdresseDev(null);
  dernierEntete = {};
}

function messageFirebase(e) {
  const messages = {
    // ⚠️ Le cas attendu au premier déploiement : le domaine n'a pas encore
    // été ajouté dans la console Firebase.
    'auth/unauthorized-domain': `Ce site (${location.hostname}) n'est pas autorisé à utiliser la connexion Firebase. Dans la console Firebase du projet « odyvresse » : Authentication → Paramètres → Domaines autorisés → ajouter ${location.hostname}.`,
    'auth/network-request-failed': 'La connexion à Google a échoué : vérifiez le réseau.',
    'auth/too-many-requests': 'Trop de tentatives : réessayez dans quelques minutes.',
    'auth/user-disabled': 'Ce compte Google a été désactivé dans Firebase.',
  };
  return messages[e.code] || `Connexion impossible (${e.code || e.message}).`;
}
