// Les exercices « une question par mot », et l'écran qui les déroule.
//
// Un exercice = une entrée de MODES : ce qu'on montre (`question`), ce qu'on
// accepte (`reponses`), ce qu'il demande (`niveau`, qui règle la progression
// au serveur), et s'il faut des kanjis. Ajouter un exercice, c'est ajouter une
// entrée ici et la ranger dans GROUPES_MODES — rien d'autre (l'écran
// « Réviser » les liste tout seul). Voir le skill exercices-nihonjo.
//
// Revu le 25/10/2026 (revue du concepteur) : plus de rōmaji en réponse
// japonaise, homonymes acceptés, faute de frappe tolérée en français, trous
// seulement sur un kanji, dictée et choix de lecture ajoutés.

import { appeler } from '../api.js';
import { majProgression, statut, donnees } from '../etat.js';
import { naviguer } from '../routeur.js';
import { masu } from '../masu.js';
import { creerClavier } from '../clavier.js';
import { badgeStatut, japonaisEnLigne } from '../composants.js';
import { echapper, melanger, normaliser, aDesKanjis, pluriel, comparerFrancais, estEnLettresLatines } from '../utils.js';
import { dictionnaireKanjis } from '../donnees/liste_kanjis.js';
import { versHiragana } from '../donnees/syllabaires.js';
import { icone } from '../icones.js';
import { toast } from '../ui.js';
import { prononcer, sonDisponible, RAISON_SANS_VOIX } from '../son.js';

// Caractères qu'on ne transforme jamais en trou : un « 〜 » ou une espace à
// deviner n'apprend rien. (La v1 pouvait les choisir.)
const NON_DEVINABLES = /[\s〜~・、。()（）]/u;
const KANJI = /\p{Script=Han}/u;

/** Index d'un caractère à cacher dans `texte` (parmi ceux que `retenir` accepte), ou -1. */
function choisirTrou(texte, retenir = () => true) {
  const candidats = Array.from(texte).map((c, i) => (!NON_DEVINABLES.test(c) && retenir(c) ? i : -1)).filter((i) => i >= 0);
  if (!candidats.length) return -1;
  return candidats[Math.floor(Math.random() * candidats.length)];
}

function questionATrou(base, retenir) {
  const trou = choisirTrou(base, retenir);
  return { base, trou, manquant: trou >= 0 ? Array.from(base)[trou] : base };
}

/** La première écriture en kanji qui contient vraiment un kanji (pas « する » rangé en kanji). */
const kanjiAvecKanji = (mot) => mot.jp_kanji.find((k) => KANJI.test(k)) || '';

const aide = (mot) => (mot.context ? `<span class="aide-contexte">${echapper(mot.context)}</span>` : '');
const aideSens = (mot) => `<span class="aide-sens">${echapper(mot.fr.join(', '))}</span>${aide(mot)}`;

/**
 * Les autres mots qui ont le même sens principal que `mot` (« partir » :
 * 出かける et 出発する) : en Français → japonais, écrire l'un d'eux est juste —
 * la question ne permet pas de les départager.
 */
function homonymes(mot) {
  const sens = new Set(mot.fr.map(normaliser));
  const premier = normaliser(mot.fr[0]);
  return donnees().mots.filter((m) => m.id !== mot.id
    && (m.fr.some((f) => normaliser(f) === premier) || sens.has(normaliser(m.fr[0] || ''))));
}

/**
 * niveau : ce que l'exercice demande, envoyé avec le résultat
 * (`progression.resultat`) — 'production' (écrire le japonais), 'rappel'
 * (retrouver le sens, une lecture), 'reconnaissance' (choisir parmi des
 * propositions). Seules les deux premières font avancer vers « acquis »
 * (Depot::enregistrerResultat).
 * japonais : la réponse s'écrit en japonais ; du rōmaji est refusé avant
 * correction (on le dit, la réponse ne compte pas).
 * francais : la réponse est un sens français, comparé avec tolérance
 * (comparerFrancais).
 * seulementTuiles : pas de champ, on choisit une tuile.
 * disponible / indisponible : l'exercice dépend du navigateur (la voix).
 * monter(feuille, mot, q) : après l'affichage de la question.
 */
export const MODES = {
  'fr-jp': {
    nom: 'Français → japonais',
    consigne: 'Écrivez ce mot en japonais, en kana ou en kanji.',
    exemple: [{ texte: 'eau' }, { texte: 'みず', lang: true }],
    niveau: 'production',
    japonais: true,
    preparer: () => ({}),
    question: (mot) => `<p class="question-fr">${echapper(mot.fr.join(', '))}</p>`,
    aide,
    reponses: (mot) => [...mot.jp_kana, ...mot.jp_kanji],
    autresReponses: (mot) => homonymes(mot).map((m) => ({ mot: m, reponses: [...m.jp_kana, ...m.jp_kanji] })),
  },
  'jp-fr': {
    nom: 'Japonais → français',
    consigne: 'Lisez le mot, donnez son sens en français.',
    exemple: [{ texte: 'みず', lang: true }, { texte: 'eau' }],
    niveau: 'rappel',
    francais: true,
    preparer: () => ({}),
    // Le mot tel qu'il se lit, en kana (« sens avec lecture ») ; le kanji
    // seul est l'affaire de Kanjis → français. Un mot sans kana : son kanji.
    question: (mot) => masu(mot.jp_kana[0] || mot.jp_kanji[0] || ''),
    aide,
    reponses: (mot) => mot.fr,
  },
  dictee: {
    nom: 'Dictée',
    consigne: 'Écoutez le mot, écrivez-le en japonais.',
    exemple: [{ texte: 'écouter' }, { texte: 'みず', lang: true }],
    niveau: 'production',
    japonais: true,
    filtre: (mot) => mot.jp_kana.length > 0,
    disponible: sonDisponible,
    indisponible: 'pas de voix japonaise',
    preparer: () => ({}),
    question: () => `
      <div class="dictee">
        <button type="button" class="bouton-ecoute" data-ecouter-question aria-label="Écouter le mot">${icone('son')}</button>
        <button type="button" class="bouton-texte" data-ecouter-lent>Plus lentement</button>
      </div>`,
    aide: () => '',
    reponses: (mot) => [...mot.jp_kana, ...mot.jp_kanji],
    monter: (feuille, mot) => {
      const dire = (lent) => { if (!prononcer(mot.jp_kana[0], { lent })) toast(RAISON_SANS_VOIX, 'erreur'); };
      feuille.querySelector('[data-ecouter-question]').addEventListener('click', () => dire(false));
      feuille.querySelector('[data-ecouter-lent]').addEventListener('click', () => dire(true));
      dire(false);
    },
  },
  'trous-kana': {
    nom: 'Mots à trous (kana)',
    consigne: 'Écrivez le kana qui manque.',
    exemple: [{ texte: 'み＿', lang: true }, { texte: 'ず', lang: true }],
    niveau: 'rappel',
    japonais: true,
    // Un mot sans kana (kanji seul) n'a rien à trouer ici.
    filtre: (mot) => mot.jp_kana.length > 0,
    preparer: (mot) => questionATrou(mot.jp_kana[0]),
    question: (mot, q) => masu(q.base, { trou: q.trou }),
    aide: aideSens,
    // Le caractère manquant, ou le mot entier. (La v1 acceptait aussi
    // n'importe quel morceau du mot : `motCompletAttendu.includes(saisie)`.)
    reponses: (mot, q) => [q.manquant, q.base],
  },
  'trous-kanji': {
    nom: 'Mots à trous (kanji)',
    consigne: 'Choisissez le kanji qui manque.',
    exemple: [{ texte: '学＿', lang: true }, { texte: '校', lang: true }],
    niveau: 'reconnaissance',
    japonais: true,
    // Le trou tombe TOUJOURS sur un kanji (pas sur le « べる » de 食べる).
    filtre: (mot) => kanjiAvecKanji(mot) !== '',
    preparer: (mot) => questionATrou(kanjiAvecKanji(mot), (c) => KANJI.test(c)),
    question: (mot, q) => masu(q.base, { trou: q.trou }),
    aide: aideSens,
    reponses: (mot, q) => [q.manquant, q.base],
    tuiles: (mot, q) => propositionsKanji(q),
  },
  'lecture-kanji': {
    nom: 'Kanjis → français',
    consigne: 'Le mot en kanji, sans sa lecture : donnez son sens.',
    exemple: [{ texte: '水', lang: true }, { texte: 'eau' }],
    niveau: 'rappel',
    francais: true,
    kanjiRequis: true,
    preparer: () => ({}),
    question: (mot) => masu(mot.jp_kanji[0]),
    aide,
    reponses: (mot) => mot.fr,
  },
  transcription: {
    nom: 'Kanjis → kana',
    consigne: 'Écrivez la lecture en kana.',
    exemple: [{ texte: '水', lang: true }, { texte: 'みず', lang: true }],
    niveau: 'production',
    japonais: true,
    kanjiRequis: true,
    preparer: () => ({}),
    question: (mot) => masu(mot.jp_kanji[0]),
    aide,
    // Kana seulement. (La v1 acceptait aussi le kanji affiché : il suffisait de le recopier.)
    reponses: (mot) => mot.jp_kana,
  },
  'choix-lecture': {
    nom: 'Choix de la lecture',
    consigne: 'Choisissez la lecture de ce mot.',
    exemple: [{ texte: '水', lang: true }, { texte: 'みず', lang: true }],
    niveau: 'reconnaissance',
    kanjiRequis: true,
    seulementTuiles: true,
    filtre: (mot) => mot.jp_kana.length > 0,
    preparer: (mot) => ({ manquant: mot.jp_kana[0] }),
    question: (mot) => masu(mot.jp_kanji[0]),
    aide,
    reponses: (mot) => mot.jp_kana,
    tuiles: (mot) => lecturesProches(mot),
  },
};

export const GROUPES_MODES = [
  { nom: 'Traduire', modes: ['fr-jp', 'jp-fr', 'dictee'] },
  { nom: 'Compléter', modes: ['trous-kana', 'trous-kanji'] },
  { nom: 'Lire les kanjis', modes: ['lecture-kanji', 'transcription', 'choix-lecture'] },
];

/** Les mots utilisables par un mode parmi `mots` (avant limite et mélange). Aucun si l'exercice est indisponible ici. */
export function motsPourMode(idMode, mots) {
  const mode = MODES[idMode];
  if (mode.disponible && !mode.disponible()) return [];
  return mots.filter((m) => (!mode.kanjiRequis || aDesKanjis(m)) && (!mode.filtre || mode.filtre(m)));
}

/**
 * Dix kanjis : le bon, et neuf leurres pris d'abord dans les mots de la
 * session (des kanjis que l'on est en train d'apprendre, donc plausibles),
 * puis dans la liste des kanjis. Jamais un kanji déjà visible dans le mot,
 * jamais de kana (un kana se reconnaît d'un coup d'œil : il ne trompait
 * personne).
 */
function propositionsKanji(q) {
  const visibles = new Set(Array.from(q.base));
  const pris = new Set([q.manquant]);
  const leurres = [];
  const ajouter = (liste) => {
    for (const c of melanger(liste)) {
      if (leurres.length >= 9) return;
      if (!KANJI.test(c) || visibles.has(c) || pris.has(c)) continue;
      pris.add(c);
      leurres.push(c);
    }
  };
  ajouter((session?.mots || []).flatMap((m) => m.jp_kanji.flatMap((k) => Array.from(k))));
  ajouter(dictionnaireKanjis.map((k) => k.kanji));
  return melanger([q.manquant, ...leurres]);
}

/**
 * Quatre lectures : la bonne et trois leurres qui lui ressemblent, pour qu'il
 * faille vraiment lire le kanji. Le kana déjà visible dans le mot (« ゴム » de
 * 消しゴム, « べる » de 食べる) est GARDÉ dans chaque leurre : sinon la bonne
 * réponse se reconnaîtrait à sa fin. Les leurres sont des lectures de kanjis
 * d'autres mots (même premier kana, même longueur, un kanji en commun : plus
 * proches), suivies de ce kana visible.
 */
function lecturesProches(mot) {
  const juste = mot.jp_kana[0];
  const exclues = new Set(mot.jp_kana);
  const decouper = (kanji, kana) => {
    // La fin en kana de l'écriture en kanji, si la lecture finit pareil.
    const fin = (kanji.match(/[^\p{Script=Han}々]+$/u) || [''])[0];
    return fin && kana.endsWith(fin) && kana.length > fin.length ? [kana.slice(0, -fin.length), fin] : [kana, ''];
  };
  const [radical, fin] = decouper(mot.jp_kanji[0], juste);
  const kanjisDuMot = new Set(Array.from(mot.jp_kanji[0]).filter((c) => KANJI.test(c)));
  const longueur = Array.from(radical).length;
  const candidates = new Map();
  donnees().mots.forEach((m) => {
    if (m.id === mot.id || !m.jp_kanji.length || !m.jp_kana.length) return;
    const [r] = decouper(m.jp_kanji[0], m.jp_kana[0]);
    const leurre = r + fin;
    if (exclues.has(leurre) || candidates.has(leurre) || r === radical) return;
    const l = Array.from(r).length;
    const score = (r[0] === radical[0] ? 2 : 0)
      + (l === longueur ? 2 : Math.abs(l - longueur) === 1 ? 1 : 0)
      + (Array.from(m.jp_kanji[0]).some((c) => kanjisDuMot.has(c)) ? 1.5 : 0);
    // Le hasard départage les ex æquo ; `proche` : longueur à un kana près.
    candidates.set(leurre, { score: score + Math.random(), proche: Math.abs(l - longueur) <= 1 });
  });
  const tries = [...candidates.entries()].sort((a, b) => b[1].score - a[1].score);
  const proches = tries.filter(([, c]) => c.proche);
  const leurres = (proches.length >= 3 ? proches : tries).slice(0, 3).map(([k]) => k);
  return melanger([juste, ...leurres]);
}

/**
 * Juge une saisie (25/10/2026). Rend { reussite, note, autreAlphabet } ;
 * `note` explique une réponse acceptée qui n'est pas celle de la fiche
 * (homonyme, faute de frappe). `autreAlphabet` (26/10, José) : le bon mot
 * écrit dans l'autre syllabaire (ミズ pour みず) — juste, mais le serveur ne
 * le laisse pas devenir « acquis » ainsi (Depot::enregistrerResultat).
 */
export function juger(mode, mot, q, saisie) {
  const s = normaliser(saisie);
  if (mode.reponses(mot, q).map(normaliser).filter(Boolean).includes(s)) return { reussite: true };
  if (mode.francais) {
    const r = comparerFrancais(saisie, mode.reponses(mot, q));
    if (r?.exact) return { reussite: true };
    if (r?.proche) return { reussite: true, note: `Accepté, à une faute près : on écrit « ${r.proche} ».` };
  }
  if (mode.autresReponses) {
    const autre = mode.autresReponses(mot, q).find((a) => a.reponses.map(normaliser).includes(s));
    if (autre) {
      const ecrit = [autre.mot.jp_kanji[0], autre.mot.jp_kana[0]].filter(Boolean).join(' · ');
      return { reussite: true, note: `Juste aussi : ${ecrit} a le même sens. Le mot de la fiche est ci-dessous.` };
    }
  }
  if (mode.japonais && s) {
    const juste = mode.reponses(mot, q).filter(Boolean).find((r) => versHiragana(normaliser(r)) === versHiragana(s));
    if (juste) {
      return { reussite: true, autreAlphabet: true, note: `C’est le bon mot, mais il s’écrit « ${juste} ». Compté juste, sans le rapprocher d’« acquis ».` };
    }
  }
  return { reussite: false };
}

// ---------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------

let session = null;

/**
 * Prépare une session et ouvre l'écran d'exercice. `limite` > 0 : `limite`
 * mots tirés au hasard. `limite` ≤ 0 : les mots tels quels, DANS CET ORDRE —
 * l'appelant les a rangés (tirerPrioritaires : les mots à reprendre d'abord).
 */
export function lancerSession(idMode, mots, limite) {
  const tirage = limite > 0 ? melanger(mots).slice(0, limite) : [...mots];
  session = { mode: idMode, mots: tirage, index: 0, bons: 0, faux: 0, erreurs: [], resultats: [] };
  naviguer('exercice');
}

export function afficher(racine) {
  if (!session) {
    naviguer('reviser');
    return undefined;
  }
  const mode = MODES[session.mode];
  // Trois colonnes au bureau (maquette de Manus, 25/10) : la session à gauche,
  // la question au centre, le compte de la session à droite. Au téléphone, la
  // colonne de gauche se réduit à une ligne et celle de droite passe dessous.
  racine.innerHTML = `
    <div class="exercice exercice-session">
      <aside class="session-rail" aria-label="La session">
        <button type="button" class="bouton-texte session-quitter" data-arreter>${icone('retour')}Quitter la session</button>
        <div class="session-titre">
          <span class="surtitre">Session</span>
          <h1 class="exercice-titre">${echapper(mode.nom).replace(' → ', '<br>→ ')}</h1>
          <p>${pluriel(session.mots.length, 'mot')}, les mots à reprendre d'abord</p>
        </div>
        <div class="session-progres">
          <div class="session-progres-tete"><span>Progression</span><strong data-avance></strong></div>
          <div class="jauge" aria-hidden="true"><i data-jauge></i></div>
          <div class="session-etapes" data-etapes aria-hidden="true"></div>
        </div>
        <p class="exercice-score" aria-label="Score"><span class="note-bonne">○ <b data-bons>0</b></span><span class="note-fausse">× <b data-faux>0</b></span></p>
      </aside>
      <section class="session-centre">
        <article class="feuille feuille-exercice" data-feuille></article>
      </section>
      <aside class="session-droite" aria-label="Dans cette session">
        <div class="carte-session">
          <span class="surtitre">Dans cette session</span>
          <div class="chiffre-session"><strong data-bons-droite>0</strong><span>bonnes réponses</span></div>
          <div class="chiffre-session"><strong data-revoir-droite>0</strong><span>mots à revoir</span></div>
          <div class="chiffre-session"><strong data-restants>0</strong><span>mots restants</span></div>
        </div>
        <div class="carte-session carte-session-douce">
          <span class="surtitre">Raccourcis</span>
          <p><kbd>Entrée</kbd> valide la réponse, puis passe au mot suivant.</p>
        </div>
      </aside>
    </div>`;
  const surTouche = (e) => {
    if (e.key !== 'Enter' || e.isComposing) return;
    // Entrée dans le champ : valider ; une fois la correction affichée : suivant.
    // Toujours relire la feuille : afficherMot() la remplace à chaque mot.
    const feuille = racine.querySelector('[data-feuille]');
    const suivant = feuille.querySelector('[data-suivant]');
    if (suivant) {
      e.preventDefault();
      suivant.click();
    } else if (e.target.matches('[data-reponse]')) {
      e.preventDefault();
      feuille.querySelector('[data-valider]')?.click();
    }
  };
  document.addEventListener('keydown', surTouche);
  racine.querySelector('[data-arreter]').addEventListener('click', () => {
    if (session.bons + session.faux > 0) afficherBilan(racine);
    else naviguer('reviser');
  });

  afficherMot(racine);
  return () => document.removeEventListener('keydown', surTouche);
}

function majCompteurs(racine) {
  const faits = session.resultats.length;
  const total = session.mots.length;
  racine.querySelector('[data-bons]').textContent = session.bons;
  racine.querySelector('[data-faux]').textContent = session.faux;
  racine.querySelector('[data-bons-droite]').textContent = session.bons;
  racine.querySelector('[data-revoir-droite]').textContent = new Set(session.erreurs.map((m) => m.id)).size;
  racine.querySelector('[data-restants]').textContent = total - faits;
  racine.querySelector('[data-avance]').textContent = `${Math.min(session.index + 1, total)} / ${total}`;
  racine.querySelector('[data-jauge]').style.width = `${(faits / total) * 100}%`;
  // Les pastilles : les mots faits (○ ou ×), le mot en cours, les suivants.
  const debut = Math.max(0, Math.min(session.index - 2, total - 6));
  const etapes = [];
  for (let i = debut; i < Math.min(total, debut + 6); i++) {
    const r = session.resultats[i];
    if (r === true) etapes.push(`<span class="pas pas-bon">${icone('coche')}</span>`);
    else if (r === false) etapes.push(`<span class="pas pas-faux">${icone('croix')}</span>`);
    else etapes.push(`<span class="pas${i === session.index ? ' pas-courant' : ''}">${i + 1}</span>`);
  }
  if (debut + 6 < total) etapes.push('<span class="pas pas-suite">…</span>');
  racine.querySelector('[data-etapes]').innerHTML = etapes.join('');
}

function afficherMot(racine) {
  const mode = MODES[session.mode];
  const mot = session.mots[session.index];
  const q = mode.preparer(mot);
  // Une feuille NEUVE par mot : réutiliser l'ancienne empilerait ses
  // écouteurs (un clic sur « Suivant » sauterait plusieurs mots).
  const feuille = document.createElement('article');
  feuille.className = 'feuille feuille-exercice';
  feuille.dataset.feuille = '';
  racine.querySelector('[data-feuille]').replaceWith(feuille);
  majCompteurs(racine);

  feuille.innerHTML = `
    <div class="exercice-tete">
      <span class="exercice-position">Mot ${session.index + 1} sur ${session.mots.length}</span>
      ${badgeStatut(statut(mot))}
    </div>
    <p class="consigne surtitre">${echapper(mode.consigne)}</p>
    <div class="question">${mode.question(mot, q)}</div>
    <p class="aide">${mode.aide(mot)}</p>
    ${mode.tuiles ? `<div class="tuiles${mode.seulementTuiles ? ' tuiles-larges' : ''}" data-tuiles>${mode.tuiles(mot, q).map((c) => `<button type="button" class="tuile" lang="ja" data-tuile="${echapper(c)}">${echapper(c)}</button>`).join('')}</div>` : ''}
    ${mode.seulementTuiles ? '' : `
    <div class="saisie">
      <input type="text" class="champ-reponse" data-reponse autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${mode.japonais ? 'En kana ou en kanji' : 'Votre réponse'}" aria-label="Votre réponse"${mode.japonais ? ' lang="ja"' : ''}>
      <button type="button" class="bouton-icone bouton-clavier" data-clavier aria-label="Clavier de kana" title="Clavier de kana" aria-expanded="false">${icone('clavier')}</button>
    </div>
    <p class="message-saisie" data-message-saisie role="status"></p>`}
    <div class="actions" data-actions>
      ${mode.seulementTuiles ? '' : '<button type="button" class="bouton bouton-principal" data-valider>Valider</button>'}
      <button type="button" class="bouton bouton-discret" data-passer>Passer</button>
    </div>
    <div data-correction></div>
    <!-- Le clavier EN DERNIER (José, 25/10) : Valider, la correction et
         « Suivant » restent sous la main, au-dessus de lui. -->
    <div data-zone-clavier></div>`;

  const champ = feuille.querySelector('[data-reponse]');
  const clavier = champ ? creerClavier(champ, feuille.querySelector('[data-zone-clavier]')) : { basculer: () => false };
  const boutonClavier = feuille.querySelector('[data-clavier]');
  boutonClavier?.addEventListener('click', () => {
    boutonClavier.setAttribute('aria-expanded', String(clavier.basculer()));
    champ.focus();
  });
  if (mode.monter) mode.monter(feuille, mot, q);

  const repondre = async (saisie, passe = false) => {
    if (feuille.dataset.repondu) return;
    feuille.dataset.repondu = '1';
    const { reussite, note, autreAlphabet } = passe ? { reussite: false } : juger(mode, mot, q, saisie);
    session.resultats[session.index] = reussite;
    feuille.dataset.resultat = reussite ? 'bon' : 'faux'; // la couleur du champ (CSS)
    if (reussite) session.bons++;
    else {
      session.faux++;
      session.erreurs.push(mot);
    }
    if (champ) champ.disabled = true;
    clavier.basculer(false);
    feuille.querySelector('[data-actions]').remove();
    feuille.querySelectorAll('.tuile').forEach((t) => {
      t.disabled = true;
      if (normaliser(t.dataset.tuile) === normaliser(q.manquant)) t.classList.add('tuile-bonne');
      else if (t.dataset.tuile === saisie) t.classList.add('tuile-fausse');
    });
    afficherCorrection(feuille, mot, { reussite, passe, saisie, note, autreAlphabet });
    majCompteurs(racine);

    // Les paliers (en cours, acquis, à revoir, date de retour) se calculent
    // au serveur, d'après le niveau de l'exercice (Depot::enregistrerResultat).
    try {
      const progression = await appeler('progression.resultat', { mot_id: mot.id, reussite, niveau: mode.niveau, autre_alphabet: Boolean(autreAlphabet) });
      majProgression(mot.id, progression);
    } catch (e) {
      toast(`Progression non enregistrée : ${e.message}`, 'erreur');
    }
  };

  feuille.querySelector('[data-valider]')?.addEventListener('click', () => {
    if (!champ.value.trim()) return champ.focus();
    // Du rōmaji là où l'on attend du japonais : on ne corrige pas, on le dit
    // (la réponse ne compte pas ; « mizu » n'apprend pas à écrire みず).
    if (mode.japonais && estEnLettresLatines(champ.value)) {
      feuille.querySelector('[data-message-saisie]').textContent = 'Écrivez en kana ou en kanji : le rōmaji ne compte pas ici. Le clavier de kana est à droite du champ.';
      champ.classList.add('champ-faux');
      return champ.focus();
    }
    return repondre(champ.value.trim());
  });
  champ?.addEventListener('input', () => {
    champ.classList.remove('champ-faux');
    const m = feuille.querySelector('[data-message-saisie]');
    if (m) m.textContent = '';
  });
  feuille.querySelector('[data-passer]').addEventListener('click', () => repondre('', true));
  feuille.querySelector('[data-tuiles]')?.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tuile]');
    if (!t) return;
    if (champ) champ.value = t.dataset.tuile;
    repondre(t.dataset.tuile);
  });
  feuille.addEventListener('click', (e) => {
    if (e.target.closest('[data-suivant]')) {
      session.index++;
      if (session.index < session.mots.length) afficherMot(racine);
      else afficherBilan(racine);
    }
  });

  // Sur téléphone, le focus automatique ouvrirait le clavier du système par-dessus la question.
  if (champ && matchMedia('(pointer: fine)').matches) champ.focus();
}

function afficherCorrection(feuille, mot, { reussite, passe, saisie, note, autreAlphabet }) {
  const titre = autreAlphabet ? 'Juste, dans l’autre alphabet' : reussite ? 'Bonne réponse' : passe ? 'Mot passé' : 'Mauvaise réponse';
  const ligne = (terme, valeur, jp = false) => (valeur
    ? `<div><dt>${terme}</dt><dd${jp ? ' lang="ja"' : ''}>${echapper(valeur)}</dd></div>` : '');
  feuille.querySelector('[data-correction]').innerHTML = `
    <div class="correction ${reussite ? 'correction-bonne' : 'correction-fausse'}" role="status">
      <div class="correction-tete">
        ${reussite
    ? '<svg class="note-trait" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17" pathLength="1"/></svg>'
    : '<svg class="note-trait" viewBox="0 0 48 48" aria-hidden="true"><path d="M12 12l24 24" pathLength="1"/><path d="M36 12L12 36" pathLength="1"/></svg>'}
        <div>
          <strong>${titre}</strong>
          ${!reussite && saisie ? `<span class="correction-saisie">Vous avez écrit « ${echapper(saisie)} »</span>` : ''}
          ${note ? `<span class="correction-note">${echapper(note)}</span>` : ''}
        </div>
        ${mot.jp_kana.length ? `<button type="button" class="bouton-icone bouton-ecouter" data-ecouter${sonDisponible() ? '' : ` disabled title="${echapper(RAISON_SANS_VOIX)}"`} aria-label="Écouter le mot">${icone('son')}</button>` : ''}
      </div>
      <dl class="correction-details">
        ${ligne('Kanji', mot.jp_kanji.join('、'), true)}
        ${ligne('Kana', mot.jp_kana.join('、'), true)}
        ${ligne('Rōmaji', mot.jp_romaji.join(', '))}
        ${ligne('Français', mot.fr.join(', '))}
      </dl>
      <button type="button" class="bouton bouton-principal" data-suivant>${session.index + 1 < session.mots.length ? 'Suivant' : 'Voir le bilan'}${icone('suivant')}</button>
    </div>`;
  feuille.querySelector('[data-ecouter]')?.addEventListener('click', () => prononcer(mot.jp_kana[0]));
  feuille.querySelector('[data-suivant]').focus({ preventScroll: true });
}

function afficherBilan(racine) {
  const total = session.bons + session.faux;
  const erreurs = [...new Map(session.erreurs.map((m) => [m.id, m])).values()];
  const mode = session.mode;
  racine.querySelector('[data-jauge]').style.width = '100%';
  racine.querySelector('.exercice-session').classList.add('session-finie');
  racine.querySelector('[data-feuille]').innerHTML = `
    <div class="bilan">
      <h1>Session terminée</h1>
      <p class="bilan-score"><span class="bilan-nombre">${session.bons}</span><span class="bilan-sur">sur ${total}</span></p>
      <p class="sous-titre">${total < session.mots.length ? `Arrêtée après ${pluriel(total, 'mot')} sur ${session.mots.length}.` : `${pluriel(total, 'mot')} travaillés.`}</p>
      ${erreurs.length ? `
        <h2>À retravailler</h2>
        <ul class="bilan-erreurs">${erreurs.map((m) => `<li><span class="bilan-jp">${japonaisEnLigne(m)}</span><span class="bilan-fr">${echapper(m.fr.join(', '))}</span></li>`).join('')}</ul>` : '<p class="bilan-parfait">Aucune erreur.</p>'}
      <div class="actions">
        ${erreurs.length ? `<button type="button" class="bouton bouton-principal" data-refaire>${icone('rejouer')}Refaire ${erreurs.length > 1 ? `les ${erreurs.length} erreurs` : 'l’erreur'}</button>` : ''}
        <button type="button" class="bouton bouton-secondaire" data-retour>Retour aux chapitres</button>
      </div>
    </div>`;
  racine.querySelector('[data-arreter]').hidden = true;
  racine.querySelector('[data-refaire]')?.addEventListener('click', () => lancerSession(mode, erreurs, 0));
  racine.querySelector('[data-retour]').addEventListener('click', () => {
    session = null;
    naviguer('reviser');
  });
  (racine.querySelector('[data-refaire]') || racine.querySelector('[data-retour]')).focus();
}
