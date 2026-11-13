// Point d'entrée du front : connexion, puis chargement de la base, puis la
// vue demandée par l'ancre de l'URL. Chaque vue (assets/js/vues/*.js) exporte
// `afficher(racine)` et peut renvoyer une fonction de nettoyage, appelée
// quand on la quitte (écouteurs clavier de l'exercice, minuteries).

import { appeler, EVENEMENT_DECONNEXION, EVENEMENT_COMPTE_INEXISTANT } from './api.js';
import {
  initialiserConnexion, modeConnexion, fournisseursDisponibles, identiteNavigateur,
  seConnecterGoogle, allerVersDiscord, choisirAdresseDev,
} from './auth.js';
import { recharger, donnees, preference, ecrirePreference, reprendrePreferencesLocales } from './etat.js';
import { terminerSession, EVENEMENT_SORTIE, libelleFournisseur } from './session.js';
import { avatar } from './composants.js';
import { vueDemandee } from './routeur.js';
import { icone } from './icones.js';
import { echapper } from './utils.js';
import { toast } from './ui.js';
import * as reviser from './vues/reviser.js';
import * as liste from './vues/liste.js';
import * as exercice from './vues/exercice.js';
import * as ecriture from './vues/ecriture.js';
import * as kana from './vues/kana.js';
import * as jeuKana from './vues/jeu_kana.js';
import * as kanji from './vues/kanji.js';
import * as jeuKanji from './vues/jeu_kanji.js';
import * as paires from './vues/paires.js';
import * as importer from './vues/importer.js';
import * as lexique from './vues/lexique.js';
import * as chapitres from './vues/chapitres.js';
import * as compte from './vues/compte.js';
import * as comptes from './vues/comptes.js';
import { ouvrirSauvegarde } from './echanges.js';

const VUES = {
  reviser, liste, exercice, ecriture, paires, importer, kana, 'jeu-kana': jeuKana, kanji, 'jeu-kanji': jeuKanji, lexique, chapitres,
  compte, comptes, // « Mon compte », « Gérer les comptes » (menu du compte ; pas d'onglet)
};
// L'écran « Données » a disparu le 23/10 (tout est en base) : un ancien lien
// #/donnees retombe sur l'accueil, comme toute vue inconnue.
// Onglet de la navigation éclairé pour chaque vue.
const ONGLET = {
  reviser: 'reviser', liste: 'reviser', exercice: 'reviser', ecriture: 'reviser', paires: 'reviser',
  kana: 'kana', 'jeu-kana': 'kana', kanji: 'kanji', 'jeu-kanji': 'kanji', lexique: 'lexique', importer: 'lexique', chapitres: 'chapitres',
};

let nettoyer = null;
let routageBranche = false;

function rendre() {
  if (nettoyer) nettoyer();
  nettoyer = null;
  const nom = VUES[vueDemandee()] ? vueDemandee() : 'reviser';
  document.body.dataset.vue = nom;
  delete document.body.dataset.jeu; // posé par le jeu des kana (ou des kanjis) pendant une partie
  document.querySelectorAll('[data-onglet]').forEach((a) => {
    if (a.dataset.onglet === ONGLET[nom]) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const racine = document.getElementById('vue');
  racine.innerHTML = '';
  window.scrollTo(0, 0);
  const r = VUES[nom].afficher(racine);
  if (typeof r === 'function') nettoyer = r;
}

// ---------------------------------------------------------------------
// Thème : cahier (clair) / tableau noir (sombre). Sans choix enregistré,
// on suit le réglage du système. Le choix est une préférence du COMPTE
// (dans la base) : il s'applique dès que les données arrivent ; avant la
// connexion, c'est le réglage du système.
// ---------------------------------------------------------------------

const CLE_THEME = 'theme';

function themeEffectif() {
  const choisi = document.documentElement.dataset.theme;
  if (choisi) return choisi;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'sombre' : 'clair';
}

function majBoutonTheme() {
  const b = document.querySelector('[data-bascule-theme]');
  const sombre = themeEffectif() === 'sombre';
  b.innerHTML = icone(sombre ? 'soleil' : 'lune');
  b.setAttribute('aria-label', sombre ? 'Passer au thème clair' : 'Passer au thème sombre');
  b.title = b.getAttribute('aria-label');
}

function appliquerThemeDuCompte() {
  const choisi = preference(CLE_THEME, null);
  if (choisi === 'clair' || choisi === 'sombre') document.documentElement.dataset.theme = choisi;
  else delete document.documentElement.dataset.theme;
  majBoutonTheme();
}

function initTheme() {
  document.querySelector('[data-bascule-theme]').addEventListener('click', () => {
    const suivant = themeEffectif() === 'sombre' ? 'clair' : 'sombre';
    document.documentElement.dataset.theme = suivant;
    ecrirePreference(CLE_THEME, suivant);
    majBoutonTheme();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', majBoutonTheme);
  majBoutonTheme();
}

// ---------------------------------------------------------------------
// Compte : écran de connexion et menu de l'en-tête
// ---------------------------------------------------------------------

function afficherPanne(titre, message) {
  document.body.dataset.vue = 'connexion';
  const racine = document.getElementById('vue');
  racine.innerHTML = `
    <div class="feuille panne">
      <h1>${echapper(titre)}</h1>
      <p>${echapper(message)}</p>
      <p class="discret">En local : lancez <code>lancer_nihonjo.bat</code> et ouvrez <code>http://localhost:8080</code> (pas le fichier <code>index.html</code> directement).</p>
      <button class="bouton bouton-principal" type="button" data-reessayer>Réessayer</button>
    </div>`;
  racine.querySelector('[data-reessayer]').addEventListener('click', () => location.reload());
}

// Ce que disent les retours de Discord (api/discord.php → #/connexion?discord=<raison>).
const RETOURS_DISCORD = {
  refuse: 'Connexion Discord annulée.',
  expire: 'La connexion Discord a pris trop de temps : recommencez.',
  erreur: "Discord n'a pas pu confirmer la connexion : réessayez dans un instant.",
  absent: "La connexion Discord n'est pas configurée sur ce serveur.",
};

function viderVue() {
  if (nettoyer) nettoyer();
  nettoyer = null;
  document.body.dataset.vue = 'connexion';
  majMenuCompte(null);
  return document.getElementById('vue');
}

/**
 * L'écran de connexion, sur le modèle d'Odyvresse : deux groupes,
 * « Se connecter » et « Créer un compte », chacun avec Google et (s'il est
 * configuré) Discord. En mode dev : une adresse et les deux mêmes choix.
 */
function afficherConnexion(message = '') {
  const racine = viderVue();
  const dev = modeConnexion() === 'dev';
  const { google, discord } = fournisseursDisponibles();
  const boutons = (intention) => `
    <div class="connexion-boutons">
      ${google ? `<button class="bouton ${intention === 'connexion' ? 'bouton-principal' : 'bouton-secondaire'} bouton-large bouton-fournisseur" type="button" data-${intention}="google">${icone('compte')}<span>${intention === 'connexion' ? 'Se connecter avec Google' : 'Créer un compte avec Google'}</span></button>` : ''}
      ${discord ? `<button class="bouton ${intention === 'connexion' ? 'bouton-principal' : 'bouton-secondaire'} bouton-large bouton-fournisseur bouton-discord" type="button" data-${intention}="discord">${icone('bulle')}<span>${intention === 'connexion' ? 'Se connecter avec Discord' : 'Créer un compte avec Discord'}</span></button>` : ''}
    </div>`;
  racine.innerHTML = `
    <div class="connexion">
      <div class="feuille feuille-connexion">
        <span class="masu-ligne masu-grand connexion-cases" lang="ja" style="--n:3" aria-hidden="true"><span class="masu">日</span><span class="masu">本</span><span class="masu">語</span></span>
        <h1>Nihonjo</h1>
        <p class="sous-titre">Révisions de vocabulaire japonais. Vos mots, vos chapitres et votre progression sont gardés dans votre compte, sur tous vos appareils.</p>
        ${message ? `<p class="connexion-message" role="status">${echapper(message)}</p>` : ''}
        ${dev ? `
          <form class="connexion-dev" data-form-dev>
            <label class="champ"><span class="champ-libelle">Adresse (mode essai, sans mot de passe)</span>
              <input type="text" name="email" autocomplete="off" placeholder="jose@exemple.fr" required></label>
            <div class="connexion-boutons connexion-boutons-ligne">
              <button class="bouton bouton-principal" type="submit" data-intention="connexion">Se connecter</button>
              <button class="bouton bouton-secondaire" type="button" data-intention="inscription">Créer un compte</button>
            </div>
          </form>` : !google && !discord ? `
          <p class="connexion-message">Aucun moyen de connexion n'est configuré sur ce serveur (api/config.php).</p>` : `
          <section class="connexion-groupe" aria-labelledby="titre-se-connecter">
            <h2 id="titre-se-connecter">Se connecter</h2>
            ${boutons('connexion')}
          </section>
          <div class="connexion-ou" aria-hidden="true"><span>ou</span></div>
          <section class="connexion-groupe" aria-labelledby="titre-creer-compte">
            <h2 id="titre-creer-compte">Créer un compte</h2>
            <p class="connexion-note">Pas de mot de passe à inventer : votre compte Google ou Discord suffit. C'est gratuit.</p>
            ${boutons('inscription')}
          </section>
          ${google ? '<p class="connexion-note">Le même compte Google que sur Odyvresse.</p>' : ''}`}
      </div>
    </div>`;

  const occupe = (actif) => racine.querySelectorAll('.feuille-connexion button').forEach((b) => { b.disabled = actif; });
  const agir = async (action) => {
    occupe(true);
    try {
      await action();
    } catch (e) {
      toast(e.message, 'erreur', 9000);
    } finally {
      occupe(false); // sans effet si l'écran a déjà changé
    }
  };
  racine.querySelectorAll('[data-connexion]').forEach((b) => b.addEventListener('click', () => agir(async () => {
    if (b.dataset.connexion === 'discord') return allerVersDiscord('connexion');
    if (await seConnecterGoogle()) await entrer(); // sans compte : l'écran « Créer le compte » suit
    return undefined;
  })));
  racine.querySelectorAll('[data-inscription]').forEach((b) => b.addEventListener('click', () => agir(async () => {
    if (b.dataset.inscription === 'discord') return allerVersDiscord('inscription');
    if (await seConnecterGoogle()) await creerCompte();
    return undefined;
  })));
  const form = racine.querySelector('[data-form-dev]');
  if (form) {
    const adresse = () => {
      if (!form.reportValidity()) return false;
      return choisirAdresseDev(new FormData(form).get('email'));
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      agir(async () => { if (adresse()) await entrer(); });
    });
    form.querySelector('[data-intention="inscription"]').addEventListener('click', () => agir(async () => { if (adresse()) await creerCompte(); }));
  }
}

/**
 * L'identité est connue (Google, Discord, adresse d'essai) mais n'a pas de
 * compte Nihonjo : on propose de le créer, comme Odyvresse (« compte non
 * inscrit »). `identite` : email, nom, photo, fournisseur.
 */
function afficherCompteInexistant(identite = {}) {
  const racine = viderVue();
  const navigateur = identiteNavigateur();
  const qui = { ...(navigateur || {}), ...Object.fromEntries(Object.entries(identite).filter(([, v]) => v)) };
  const fournisseur = libelleFournisseur(qui.fournisseur);
  racine.innerHTML = `
    <div class="connexion">
      <div class="feuille feuille-connexion">
        ${avatar(qui, { grand: true })}
        <h1>Pas encore de compte Nihonjo</h1>
        <p class="sous-titre">${qui.nom ? `<strong>${echapper(qui.nom)}</strong>` : 'Ce compte'}${qui.email ? ` (${echapper(qui.email)})` : ''} : votre compte ${echapper(fournisseur)} est bien reconnu, mais il n'a pas encore de compte Nihonjo.</p>
        <p class="connexion-note">Créez-le en un clic : vous retrouverez ensuite vos mots, vos chapitres et votre progression sur tous vos appareils.</p>
        <div class="connexion-boutons">
          <button class="bouton bouton-principal bouton-large" type="button" data-creer-compte>${icone('plus')}Créer mon compte</button>
          <button class="bouton bouton-discret bouton-large" type="button" data-autre-compte>Utiliser un autre compte</button>
        </div>
      </div>
    </div>`;
  racine.querySelector('[data-creer-compte]').addEventListener('click', async (e) => {
    const bouton = e.currentTarget;
    bouton.disabled = true;
    try {
      await creerCompte();
    } catch (erreur) {
      toast(erreur.message, 'erreur', 9000);
      bouton.disabled = false;
    }
  });
  racine.querySelector('[data-autre-compte]').addEventListener('click', () => terminerSession(''));
}

/** « Créer un compte » : l'identité de la requête devient un compte, puis on entre. */
async function creerCompte() {
  const r = await appeler('compte.creer', {}, { silencieux: true });
  const nom = r.utilisateur.nom || r.utilisateur.email;
  toast(r.nouveau ? `Bienvenue sur Nihonjo, ${nom} ! Votre compte est créé.` : `Vous aviez déjà un compte : bon retour, ${nom}.`, 'succes', 6000);
  await entrer();
}

function majMenuCompte(utilisateur) {
  const zone = document.querySelector('[data-compte]');
  if (!utilisateur) {
    zone.innerHTML = '';
    return;
  }
  // Sans connexion (poste local, mode « aucune ») : le menu reste, pour
  // « Mon compte » et la sauvegarde complète, mais sans « Se déconnecter ».
  const local = modeConnexion() === 'aucune';
  const admin = utilisateur.role === 'admin';
  zone.innerHTML = `
    <details class="menu-compte">
      <summary aria-label="Mon compte : ${echapper(utilisateur.nom)}" title="${echapper(utilisateur.nom)}">
        ${local ? `<span class="avatar">${icone('compte')}</span>` : avatar(utilisateur)}
      </summary>
      <div class="menu-compte-panneau">
        <strong>${local ? 'Poste local' : echapper(utilisateur.nom)}</strong>
        <span class="menu-compte-email">${local ? 'Sans connexion : un seul compte sur ce poste.' : `${echapper(utilisateur.email)}${utilisateur.email ? ' · ' : ''}compte ${echapper(libelleFournisseur(utilisateur.fournisseur))}`}</span>
        ${admin ? '<span class="badge badge-admin">Administrateur</span>' : ''}
        <a class="bouton bouton-discret bouton-large menu-compte-lien" href="#/compte">${icone('compte')}Mon compte</a>
        <a class="bouton bouton-discret bouton-large menu-compte-lien" href="#/importer">${icone('importer')}Importer ou exporter des mots</a>
        ${admin ? `<a class="bouton bouton-discret bouton-large menu-compte-lien" href="#/comptes">${icone('equipe')}Gérer les comptes</a>` : ''}
        ${admin ? `<button type="button" class="bouton bouton-discret bouton-large menu-compte-lien" data-sauvegarde-complete>${icone('base')}Sauvegarde complète…</button>` : ''}
        ${local ? '' : `<button type="button" class="bouton bouton-secondaire bouton-large" data-deconnexion>${icone('sortie')}Se déconnecter</button>`}
      </div>
    </details>`;
  const menu = zone.querySelector('.menu-compte');
  zone.querySelectorAll('a.menu-compte-lien').forEach((a) => a.addEventListener('click', () => { menu.open = false; }));
  zone.querySelector('[data-sauvegarde-complete]')?.addEventListener('click', () => { menu.open = false; ouvrirSauvegarde(); });
  zone.querySelector('[data-deconnexion]')?.addEventListener('click', () => terminerSession());
}

// Un clic hors du menu du compte le referme (un seul écouteur pour toute la vie de la page).
document.addEventListener('click', (e) => {
  const menu = document.querySelector('.menu-compte');
  if (menu && !menu.contains(e.target)) menu.open = false;
});

async function entrer() {
  const racine = document.getElementById('vue');
  racine.innerHTML = '<p class="chargement">Chargement du vocabulaire…</p>';
  try {
    await recharger();
  } catch (e) {
    if (document.body.dataset.vue === 'connexion' && racine.querySelector('.connexion')) return; // 401 déjà traité
    afficherPanne('La base ne répond pas', e.message);
    return;
  }
  // Ce que ce navigateur gardait encore (versions d'avant le 23/10) passe dans
  // le compte, puis est effacé du navigateur.
  reprendrePreferencesLocales();
  appliquerThemeDuCompte();
  majMenuCompte(donnees().utilisateur);
  // Retour de Discord après une inscription : #/reviser?bienvenue=1.
  if (/[?&]bienvenue=1/.test(location.hash)) {
    history.replaceState(null, '', '#/reviser');
    toast(`Bienvenue sur Nihonjo, ${donnees().utilisateur.nom} ! Votre compte est créé.`, 'succes', 6000);
  }
  if (!routageBranche) {
    window.addEventListener('hashchange', rendre);
    routageBranche = true;
  }
  rendre();
}

/** Le pseudo a changé (« Mon compte ») : l'en-tête suit. */
window.addEventListener('nihonjo:compte-modifie', () => majMenuCompte(donnees().utilisateur));

/** La raison d'un retour de Discord (#/connexion?discord=<raison>), effacée de l'adresse. */
function retourDiscord() {
  const m = /^#\/connexion\?(?:.*&)?discord=([a-z]+)/.exec(location.hash);
  if (!m) return null;
  history.replaceState(null, '', '#/reviser');
  return m[1];
}

// ---------------------------------------------------------------------

async function demarrer() {
  document.querySelectorAll('[data-icone]').forEach((el) => el.insertAdjacentHTML('afterbegin', icone(el.dataset.icone)));
  initTheme();
  window.addEventListener(EVENEMENT_DECONNEXION, (e) => {
    if (document.body.dataset.vue !== 'connexion') afficherConnexion(e.detail || 'Votre session a expiré : reconnectez-vous.');
  });
  window.addEventListener(EVENEMENT_COMPTE_INEXISTANT, (e) => afficherCompteInexistant(e.detail));
  window.addEventListener(EVENEMENT_SORTIE, (e) => afficherConnexion(e.detail));

  let sante;
  try {
    sante = await appeler('sante');
  } catch (e) {
    afficherPanne('La base ne répond pas', e.message);
    return;
  }
  let connecte;
  try {
    connecte = await initialiserConnexion(sante);
  } catch (e) {
    afficherPanne('La connexion ne se charge pas', `Le service de connexion ne répond pas : ${e.message}`);
    return;
  }
  const raison = retourDiscord();
  if (raison === 'inexistant') {
    // Revenu de Discord avec un compte Discord sans compte Nihonjo : le
    // serveur garde l'identité 15 minutes (cookie), on propose l'inscription.
    const attente = await appeler('discord.attente').catch(() => null);
    if (attente) afficherCompteInexistant(attente);
    else afficherConnexion(RETOURS_DISCORD.expire);
    return;
  }
  if (!connecte && modeConnexion() === 'firebase') {
    // Une session Discord (cookie HttpOnly, invisible au code) ?
    connecte = await appeler('session', undefined, { silencieux: true }).then((r) => r.connecte, () => false);
  }
  if (connecte) {
    await entrer();
    if (raison && RETOURS_DISCORD[raison]) toast(RETOURS_DISCORD[raison], 'erreur', 7000);
  } else {
    afficherConnexion(raison ? RETOURS_DISCORD[raison] || '' : '');
  }
}

demarrer();
