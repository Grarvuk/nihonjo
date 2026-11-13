// Client de l'API PHP (api/index.php). Toutes les requêtes réseau du front
// passent ici : aucune autre fonction n'appelle fetch.
//
// L'URL est RELATIVE à la page : la même copie marche en local (Docker,
// http://localhost:8080/) et en ligne (https://nihonjo.odyvresse.com/), sans réglage.
// Dans l'application Android, elle est absolue (le front est dans l'APK,
// l'API sur le serveur) : urlServeur, plateforme.js.

import { enteteConnexion, enteteConnexionImmediat } from './auth.js';
import { urlServeur } from './plateforme.js';

const URL_API = urlServeur('api/index.php');

/** Émis quand le serveur répond 401 : l'application réaffiche l'écran de connexion. */
export const EVENEMENT_DECONNEXION = 'nihonjo:deconnexion';
/**
 * Émis quand l'identité (Google, Discord) n'a pas de compte Nihonjo (404
 * `compte_inexistant`) : l'application propose de le créer. `detail` : les
 * précisions du serveur (email, nom, fournisseur).
 */
export const EVENEMENT_COMPTE_INEXISTANT = 'nihonjo:compte-inexistant';

/**
 * Appelle une action de l'API. Sans `corps` : GET (lecture). Avec : POST JSON.
 * `keepalive` : la requête survit à la fermeture de la page (préférences).
 * `immediat` : l'en-tête de connexion est pris en cache, SANS attendre (la
 * page se ferme : une attente la laisserait partir avant la requête).
 * `silencieux` : un 401 ou un compte inexistant n'émet pas d'événement (on
 * sonde la session au démarrage, on crée le compte).
 * Renvoie `donnees` ; lève une Error dont le message est affichable tel quel,
 * avec `code` (ex. « compte_inexistant »), `details` et `statut` (HTTP).
 */
export async function appeler(action, corps, { keepalive = false, immediat = false, silencieux = false } = {}) {
  const ecriture = corps !== undefined;
  let reponse;
  try {
    reponse = await fetch(`${URL_API}?action=${encodeURIComponent(action)}`, {
      method: ecriture ? 'POST' : 'GET',
      headers: {
        // ⚠️ Le Content-Type JSON n'est pas décoratif : api/index.php refuse
        // toute écriture qui ne l'a pas (garde contre les requêtes forgées).
        ...(ecriture ? { 'Content-Type': 'application/json' } : {}),
        ...(immediat ? enteteConnexionImmediat() : await enteteConnexion()),
      },
      body: ecriture ? JSON.stringify(corps) : undefined,
      // Jamais de cookie vers un autre site : dans l'application, la requête
      // part d'une autre origine, et l'API n'accepte que le jeton de
      // l'en-tête (pas d'Access-Control-Allow-Credentials, api/index.php).
      credentials: 'same-origin',
      cache: 'no-store',
      // Une préférence envoyée pendant que la page se ferme doit partir quand même.
      keepalive,
    });
  } catch {
    throw new Error('Le serveur ne répond pas. Vérifiez que Docker tourne (ou la connexion).');
  }

  let charge = null;
  try {
    charge = await reponse.json();
  } catch {
    // Réponse non JSON : typiquement PHP absent (le fichier .php est renvoyé
    // brut) ou une page d'erreur de l'hébergeur.
    throw new Error(`Réponse illisible du serveur (HTTP ${reponse.status}). PHP est-il bien actif ?`);
  }
  if (!silencieux && reponse.status === 401 && action !== 'sante') {
    window.dispatchEvent(new CustomEvent(EVENEMENT_DECONNEXION, { detail: charge?.erreur }));
  }
  if (!silencieux && charge?.code === 'compte_inexistant') {
    window.dispatchEvent(new CustomEvent(EVENEMENT_COMPTE_INEXISTANT, { detail: charge.details || {} }));
  }
  if (!charge.ok) {
    const erreur = new Error(charge.erreur || `Erreur HTTP ${reponse.status}`);
    erreur.code = charge.code || null;
    erreur.details = charge.details || null;
    erreur.statut = reponse.status;
    throw erreur;
  }
  return charge.donnees;
}
