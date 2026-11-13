// L'état partagé du front : la copie en mémoire de la base (réponse de
// l'action « donnees »), et les dérivés dont plusieurs vues ont besoin.
//
// Règle : après une écriture qui touche plusieurs mots (import, chapitre),
// appeler `recharger()`. Après une écriture sur UN mot, `remplacerMot()` suffit
// et évite de retélécharger ~300 Ko.

import { appeler } from './api.js';
import { melanger, retenirPagesDuManuel } from './utils.js';
import { toast } from './ui.js';

const etat = {
  utilisateur: null,
  kana: {},
  kanji: {}, // progression des kanjis (page et jeu « Kanji ») : caractère → { statut, serie_sens, serie_lecture… }
  preferences: {},
  categories: [],
  chapitres: [],
  mots: [],
  parId: new Map(),
};

const abonnes = new Set();

export function donnees() {
  return etat;
}

export async function recharger() {
  const d = await appeler('donnees');
  etat.utilisateur = d.utilisateur;
  etat.kana = d.kana && !Array.isArray(d.kana) ? d.kana : {}; // PHP renvoie [] pour un objet vide
  etat.kanji = d.kanji && !Array.isArray(d.kanji) ? d.kanji : {};
  etat.preferences = d.preferences && !Array.isArray(d.preferences) ? d.preferences : {};
  etat.categories = d.categories;
  etat.chapitres = d.chapitres;
  retenirPagesDuManuel(d.chapitres.map((c) => c.id)); // « Chapitre N » (libelleChapitre)
  etat.mots = d.mots;
  etat.parId = new Map(d.mots.map((m) => [m.id, m]));
  abonnes.forEach((f) => f());
}

/**
 * Déconnexion, compte supprimé : plus rien du compte en mémoire (le suivant
 * ne doit ni voir ses mots, ni recevoir ses réglages).
 */
export function oublierCompte() {
  Object.assign(etat, { utilisateur: null, kana: {}, kanji: {}, preferences: {}, categories: [], chapitres: [], mots: [], parId: new Map() });
  enCours.clear();
  aRenvoyer.clear();
}

/** Le compte a changé (pseudo choisi dans « Mon compte ») : la copie en mémoire suit. */
export function majUtilisateur(utilisateur) {
  etat.utilisateur = { ...etat.utilisateur, ...utilisateur };
}

/** Prévenu après chaque `recharger()` (la barre de navigation met à jour ses compteurs). */
export function surRechargement(fonction) {
  abonnes.add(fonction);
}

export function remplacerMot(mot) {
  const i = etat.mots.findIndex((m) => m.id === mot.id);
  if (i === -1) etat.mots.push(mot);
  else etat.mots[i] = mot;
  etat.parId.set(mot.id, mot);
}

export function retirerMot(id) {
  etat.mots = etat.mots.filter((m) => m.id !== id);
  etat.parId.delete(id);
}

export function majProgression(motId, progression) {
  const mot = etat.parId.get(motId);
  if (mot) mot.progression = progression;
}

/** Le chapitre « Mes mots » du compte (tous ses mots y sont, imposé par le serveur). */
export function chapitreMesMots() {
  return etat.chapitres.find((c) => c.nom === 'mes_mots' && c.origine === 'perso') || null;
}

/** Les chapitres du compte, « Mes mots » d'abord puis par nom. */
export function chapitresDuCompte() {
  return etat.chapitres.filter((c) => c.origine === 'perso')
    .sort((a, b) => (a.nom === 'mes_mots' ? -1 : b.nom === 'mes_mots' ? 1 : a.nom.localeCompare(b.nom, 'fr')));
}

export function estAdmin() {
  return etat.utilisateur?.role === 'admin';
}

export function statut(mot) {
  return mot.progression?.statut || 'non acquis';
}

/** Les catégories dans leur ordre, chacune avec ses chapitres ; les catégories vides sont omises. */
export function categoriesAvecChapitres() {
  return etat.categories
    .map((cat) => ({
      ...cat,
      chapitres: etat.chapitres.filter((c) => c.categorie === cat.nom),
    }))
    .filter((cat) => cat.chapitres.length > 0);
}

export function thematiques() {
  const toutes = new Set();
  etat.mots.forEach((m) => m.thematiques.forEach((t) => toutes.add(t)));
  return [...toutes].sort((a, b) => a.localeCompare(b, 'fr'));
}

export function nomsCategories() {
  return etat.categories.map((c) => c.nom);
}

/**
 * Les cinq états : les quatre de la base et « a rafraichir », que le SERVEUR
 * calcule (un acquis dont la date de rafraîchissement est arrivée,
 * Depot::lireMots). « appris » = acquis + à rafraîchir : ce qui compte comme
 * su sur l'accueil (« N acquis sur M »).
 */
export function compterStatuts(mots) {
  const compte = { 'non acquis': 0, 'en cours': 0, 'a revoir': 0, acquis: 0, 'a rafraichir': 0 };
  mots.forEach((m) => { compte[statut(m)]++; });
  compte.appris = compte.acquis + compte['a rafraichir'];
  return compte;
}

/** Un mot su : acquis, ou acquis depuis longtemps (à rafraîchir). */
export function estAppris(mot) {
  const s = statut(mot);
  return s === 'acquis' || s === 'a rafraichir';
}

// ---------------------------------------------------------------------
// Préférences du compte — dans la BASE, plus dans le navigateur
// ---------------------------------------------------------------------
//
// Depuis le 23/10/2026, tout ce que l'application gardait dans le
// localStorage (sélection de révision, filtres, réglages, thème) est rangé
// dans la table `preference`, par compte : on retrouve ses réglages sur tous
// ses appareils. Lecture : la copie arrivée avec « donnees » (immédiate).
// Écriture : la copie et le serveur tout de suite (voir plus bas pourquoi
// sans délai).
//
// Restent dans le navigateur, et c'est voulu : la session de connexion
// (Firebase la garde lui-même), l'adresse du mode « dev » des essais, et la
// LECTURE des données de l'ancienne version (migration_navigateur.js).

// Envoi IMMÉDIAT à chaque changement (et non après un délai) : un délai
// laissait une fenêtre où l'on recharge la page avant l'envoi, et la page
// rechargée relisait l'ancien réglage (vécu dans le parcours, 23/10). Pendant
// qu'un envoi est en route pour une clé, les changements suivants attendent
// et partent ensemble à son retour (la dernière valeur seulement) : jamais
// deux envois de la même clé en même temps, donc jamais dans le désordre.
// `keepalive` : une requête partie survit au rechargement de la page.
const enCours = new Set();    // clés dont un envoi est en route
const aRenvoyer = new Set();  // clés changées pendant cet envoi

export function preference(cle, defaut) {
  const v = etat.preferences[cle];
  return v === undefined || v === null ? defaut : v;
}

export function ecrirePreference(cle, valeur) {
  etat.preferences[cle] = valeur;
  if (!etat.utilisateur) return; // pas de compte (écran de connexion) : rien à enregistrer
  if (enCours.has(cle)) aRenvoyer.add(cle);
  else envoyerPreference(cle);
}

function envoyerPreference(cle, { immediat = false } = {}) {
  enCours.add(cle);
  aRenvoyer.delete(cle);
  return appeler('preference.ecrire', { cle, valeur: etat.preferences[cle] ?? null }, { keepalive: true, immediat })
    .catch((e) => toast(`Réglage non enregistré : ${e.message}`, 'erreur'))
    .finally(() => {
      enCours.delete(cle);
      if (aRenvoyer.has(cle)) envoyerPreference(cle);
    });
}

/** La page se ferme : ce qui attendait la fin d'un envoi part tout de suite. */
export function envoyerPreferencesEnAttente() {
  [...aRenvoyer].forEach((cle) => envoyerPreference(cle, { immediat: true }));
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') envoyerPreferencesEnAttente();
});
window.addEventListener('pagehide', envoyerPreferencesEnAttente); // rechargement, fermeture

// Les clés que les versions d'avant le 23/10 écrivaient dans le localStorage.
const ANCIENNES_CLES = {
  nihonjo_chapitres: 'chapitres_coches',
  nihonjo_filtres: 'filtres',
  nihonjo_filtres_lexique: 'filtres_lexique',
  nihonjo_ecriture: 'ecriture',
  nihonjo_theme: 'theme',
  nihonjo_kana_alphabet: 'kana_alphabet',
  nihonjo_jeu_kana: 'jeu_kana',
  nihonjo_dernier_mode: 'dernier_mode',
  nihonjo_migration_v1: 'migration_v1',
};

/**
 * Une fois par navigateur : reprend dans le compte ce que ce navigateur
 * gardait encore (si le compte n'a pas déjà sa propre valeur), puis l'EFFACE
 * du navigateur. Appelé après le premier chargement des données.
 */
export function reprendrePreferencesLocales() {
  let stockage;
  try { stockage = window.localStorage; } catch { return; }
  if (!stockage) return;
  Object.entries(ANCIENNES_CLES).forEach(([ancienne, cle]) => {
    let brut = null;
    try { brut = stockage.getItem(ancienne); } catch { /* navigation privée */ }
    if (brut === null) return;
    try {
      if (etat.preferences[cle] === undefined) ecrirePreference(cle, JSON.parse(brut));
    } catch { /* valeur illisible : abandonnée */ }
    try { stockage.removeItem(ancienne); } catch { /* sans conséquence */ }
  });
}

// ---------------------------------------------------------------------
// Sélection de révision (écran « Réviser »)
// ---------------------------------------------------------------------

// Forme héritée de la v1 ({ cléChapitre: coché }) : un chapitre absent de
// l'objet est COCHÉ.
export function chapitreCoche(id) {
  return preference('chapitres_coches', {})[id] !== false;
}

export function cocherChapitres(ids, coche) {
  const etats = { ...preference('chapitres_coches', {}) };
  ids.forEach((id) => {
    if (coche) delete etats[id]; // absent = coché : l'objet reste petit
    else etats[id] = false;
  });
  ecrirePreference('chapitres_coches', etats);
}

/** Un chapitre renommé garde sa case cochée. */
export function renommerChapitreCoche(ancien, nouveau) {
  const etats = { ...preference('chapitres_coches', {}) };
  if (ancien in etats) {
    etats[nouveau] = etats[ancien];
    delete etats[ancien];
    ecrirePreference('chapitres_coches', etats);
  }
}

/** Ne garder cochés que ces chapitres (« Réviser ce chapitre »). */
export function cocherSeulement(ids) {
  const garder = new Set(ids);
  const etats = {};
  etat.chapitres.forEach((c) => { if (!garder.has(c.id)) etats[c.id] = false; });
  ecrirePreference('chapitres_coches', etats);
}

export function filtres() {
  return { thematique: 'tous', statut: 'tous', limite: '', ...preference('filtres', {}) };
}

export function ecrireFiltres(f) {
  ecrirePreference('filtres', f);
}

/** Nombre de mots par révision, sans choix enregistré (José, 25/10 : « par défaut 20 »). */
export const NOMBRE_PAR_DEFAUT = 20;

/**
 * Le nombre de mots à réviser choisi sur l'accueil (préférence `filtres.limite`),
 * toujours ≥ 1. Une valeur vide ou invalide — dont le « vide = tous » d'avant
 * le 25/10 — vaut NOMBRE_PAR_DEFAUT.
 */
export function nombreAReviser() {
  const n = parseInt(filtres().limite, 10);
  return n > 0 ? n : NOMBRE_PAR_DEFAUT;
}

/**
 * Les mots des chapitres cochés, SANS les filtres thème et état : ce que
 * mesurent les barres de progression de l'accueil (filtrer sur « acquis »
 * ne doit pas afficher 100 %).
 */
export function motsDesChapitresCoches() {
  const coches = new Set(etat.chapitres.filter((c) => chapitreCoche(c.id)).map((c) => c.id));
  return etat.mots.filter((m) => m.chapitres.some((c) => coches.has(c)));
}

/** Les mots retenus par la sélection courante (chapitres cochés + thème + état), sans limite ni mélange. */
export function motsSelectionnes() {
  const f = filtres();
  const coches = new Set(etat.chapitres.filter((c) => chapitreCoche(c.id)).map((c) => c.id));
  return etat.mots.filter((m) =>
    m.chapitres.some((c) => coches.has(c)) &&
    (f.thematique === 'tous' || m.thematiques.includes(f.thematique)) &&
    (f.statut === 'tous' || statut(m) === f.statut));
}

/**
 * `n` mots, dans l'ordre : les « à revoir » (mélangés), les « à rafraîchir »
 * — les plus anciennement validés d'abord (`valide_le`) —, les en cours
 * (mélangés), les nouveaux (mélangés), enfin les acquis, eux aussi les plus
 * anciens d'abord. Ainsi les mots appris il y a longtemps reviennent avant
 * d'être oubliés (José, 25/10).
 */
export function tirerPrioritaires(mots, n) {
  const paquets = { 'a revoir': [], 'a rafraichir': [], 'en cours': [], 'non acquis': [], acquis: [] };
  mots.forEach((m) => paquets[statut(m)].push(m));
  const plusAnciens = (liste) => melanger(liste).sort((a, b) => String(a.progression?.valide_le || '').localeCompare(String(b.progression?.valide_le || '')));
  return [
    ...melanger(paquets['a revoir']), ...plusAnciens(paquets['a rafraichir']), ...melanger(paquets['en cours']),
    ...melanger(paquets['non acquis']), ...plusAnciens(paquets.acquis),
  ].slice(0, n);
}
