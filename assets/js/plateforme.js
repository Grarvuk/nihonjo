// Où tourne Nihonjo : dans un navigateur (le site), ou dans l'application
// Android (Capacitor, comme Odyvresse : creer_application_android.bat).
//
// Dans l'application, les fichiers du front sont DANS l'APK et servis par la
// WebView sous une origine à elle (`server.hostname` de
// application_android/capacitor.config.json) ; l'API, elle, reste sur le
// serveur en ligne. D'où deux différences, et deux seulement :
//   - les appels partent vers SERVEUR_APPLICATION (urlServeur), et le serveur
//     répond en CORS à cette origine (api/index.php, `origines_application`) ;
//   - la connexion Google passe par le sélecteur de compte NATIF d'Android
//     (auth.js) : Google refuse la connexion dans une WebView, et la fenêtre
//     surgissante n'y revient jamais (vécu sur Odyvresse,
//     deckolector/doc_pour_agents/connexion_google_mobile.md).
// Discord n'est pas proposé dans l'application : son retour est une
// redirection vers le site et une session par cookie, que l'application, sur
// une autre origine, ne reçoit pas.

import { SERVEUR_APPLICATION } from './config_application.js';

/**
 * Identifiant du client OAuth « Web » du projet Firebase `odyvresse` (le même
 * qu'Odyvresse : même projet). ⚠️ « Web » même sur Android : le Credential
 * Manager demande l'identifiant du SERVEUR destinataire du jeton. Le client
 * Android, lui, relie le paquet com.odyvresse.nihonjo à l'empreinte SHA-1 de
 * la clé (console Firebase) et n'est jamais cité dans le code. Pas un secret.
 */
export const ID_CLIENT_WEB_GOOGLE = '31939934404-ld0cq611kn4u6hm6ihmu88fuvi652c0p.apps.googleusercontent.com';

/** Vrai dans l'application Android (la WebView de Capacitor injecte `window.Capacitor`). */
export function estApplication() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

/** L'adresse d'un fichier du serveur : relative sur le site, absolue dans l'application. */
export function urlServeur(chemin) {
  return estApplication() ? new URL(chemin, SERVEUR_APPLICATION).href : chemin;
}

/**
 * Appelle une méthode d'un greffon natif. Sans compilation, pas de
 * `registerPlugin` (@capacitor/core) : on passe par le pont que la WebView
 * injecte (`Capacitor.nativePromise`), ce que fait registerPlugin en dessous.
 */
export function greffon(nom, methode, options = {}) {
  if (!estApplication()) return Promise.reject(new Error(`Greffon ${nom} : hors de l'application.`));
  return window.Capacitor.nativePromise(nom, methode, options);
}
