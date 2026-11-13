// La fin d'une session, commune au menu du compte et à « Mon compte » :
// oublier l'identité du navigateur (Google, adresse d'essai), fermer la
// session du serveur (cookie Discord), vider la copie en mémoire du compte,
// puis prévenir app.js, qui réaffiche l'écran de connexion.
//
// (Un module à part plutôt qu'une fonction d'app.js : une vue qui importerait
// app.js créerait une dépendance circulaire avec le point d'entrée.)

import { appeler } from './api.js';
import { seDeconnecter } from './auth.js';
import { oublierCompte } from './etat.js';

/** `detail` : le message à afficher sur l'écran de connexion. */
export const EVENEMENT_SORTIE = 'nihonjo:sortie';

export async function terminerSession(message = 'Vous êtes déconnecté.') {
  try {
    await seDeconnecter();
  } catch (e) {
    console.warn('Déconnexion du navigateur :', e);
  }
  await appeler('deconnexion', {}, { silencieux: true }).catch(() => {});
  oublierCompte();
  window.dispatchEvent(new CustomEvent(EVENEMENT_SORTIE, { detail: message }));
}

/** D'où vient un compte, à lire après « compte » : « compte Google », « compte d'essai ». */
export function libelleFournisseur(fournisseur) {
  return { google: 'Google', discord: 'Discord', dev: 'd’essai' }[fournisseur] || 'local';
}

/** La date d'une colonne SQLite (« 2026-10-24 14:30:00 », en UTC) en français. */
export function dateLisible(valeur, { heure = false } = {}) {
  if (!valeur) return '';
  const d = new Date(`${String(valeur).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', ...(heure ? { hour: '2-digit', minute: '2-digit' } : {}) });
}
