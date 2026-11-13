// Exercice « Paires » (23/10/2026, conçu avec le skill concepteur-exercices-nihonjo).
//
// Une grille de 3 rangées de 6 tuiles (au téléphone : 6 rangées de 3) :
// 9 mots, chacun écrit DEUX fois sous deux formes différentes : surtout kana
// et kanji, parfois hiragana et katakana, rarement le français (voir
// preparerGrille). On glisse une tuile sur son autre écriture (ou on touche
// les deux, l'une après l'autre : clavier, lecteur d'écran, souris fatiguée).
//
// Progression : un mot est réussi si sa paire est faite sans s'être trompé
// AVEC lui (glissé sur une mauvaise tuile, ou mauvaise tuile glissée sur
// lui) ; sinon « à revoir ». Même action que les autres exercices
// (`progression.resultat`), donc même règle acquis / à revoir.

import { appeler } from '../api.js';
import { majProgression, tirerPrioritaires } from '../etat.js';
import { naviguer } from '../routeur.js';
import { echapper, melanger, normaliser, pluriel } from '../utils.js';
import { icone } from '../icones.js';
import { toast } from '../ui.js';

export const NOMBRE_PAIRES = 9; // 3 × 6 tuiles
const SEUIL_GLISSER = 8; // px avant qu'un appui devienne un glisser

// Ce que José veut voir dans une grille (25/10) : surtout des paires
// KANA ↔ MOT ÉCRIT AVEC UN OU DEUX KANJIS (時計, 食べる — pas 日本語学校 :
// on s'adresse à des apprenants), une ou deux paires du même mot en
// HIRAGANA ↔ KATAKANA, et au plus deux paires avec le FRANÇAIS. Le français
// et les doublons d'alphabet ne servent au-delà que si la sélection n'a pas
// assez de mots à kanjis (« Mes mots » d'un débutant, par exemple).
export const MAX_FRANCAIS = 2;
export const MAX_ALPHABETS = 2;
const MAX_KANJIS = 2; // kanjis par tuile
const MAX_KANA = 8; // caractères d'une tuile en kana
const MAX_FRANCAIS_LETTRES = 16;

const KANJI = /[㐀-鿿豈-﫿々]/gu;
const KANA_SEUL = /^[ぁ-ゖァ-ヺー〜・]+$/u;
const nbKanjis = (texte) => (texte.match(KANJI) || []).length;
const versHiragana = (texte) => Array.from(texte).map((c) => {
  const code = c.codePointAt(0);
  return code >= 0x30A1 && code <= 0x30F6 ? String.fromCodePoint(code - 0x60) : c;
}).join('');
const versKatakana = (texte) => Array.from(texte).map((c) => {
  const code = c.codePointAt(0);
  return code >= 0x3041 && code <= 0x3096 ? String.fromCodePoint(code + 0x60) : c;
}).join('');

/**
 * Les paires possibles d'un mot, de la plus voulue à la moins voulue :
 * { genre, formes: [[forme, texte], [forme, texte]] }.
 */
function pairesDuMot(mot) {
  const kana = mot.jp_kana[0] || '';
  const kanji = mot.jp_kanji.find((k) => { const n = nbKanjis(k); return n >= 1 && n <= MAX_KANJIS; }) || '';
  const fr = mot.fr[0] || '';
  const possibles = [];
  // Des tuiles courtes : une phrase entière ne se lit pas d'un coup d'œil.
  const court = Array.from(kana).length <= MAX_KANA;
  if (kanji && kana && court) possibles.push({ genre: 'kanji', formes: [['kanji', kanji], ['kana', kana]] });
  // Le même mot dans les deux alphabets : un mot japonais (écrit en
  // hiragana), court, sans « ー » (けーき n'existe pas).
  if (kana && KANA_SEUL.test(kana) && /[\u3041-\u3096]/u.test(kana) && !kana.includes('ー') && Array.from(kana).length <= 6) {
    const hira = versHiragana(kana);
    const kata = versKatakana(kana);
    if (hira !== kata) possibles.push({ genre: 'alphabets', formes: [['hira', hira], ['kata', kata]] });
  }
  if (fr && fr.length <= MAX_FRANCAIS_LETTRES && (kana || kanji) && court) possibles.push({ genre: 'fr', formes: [['fr', fr], kanji && Math.random() < 0.5 ? ['kanji', kanji] : ['kana', kana || kanji]] });
  return possibles;
}

let partie = null;

/**
 * Les tuiles d'une grille : au plus 9 mots pris dans `candidats` (à revoir
 * d'abord). D'abord les paires kana ↔ kanji ; puis 1 ou 2 paires hiragana ↔
 * katakana et au plus 2 paires avec le français ; au-delà de ces quotas,
 * seulement pour remplir une grille qui sinon resterait trop petite.
 * Deux tuiles de la grille n'affichent jamais le même texte : sinon une
 * paire juste pourrait être refusée (deux mots qui partagent « ce, cette »).
 */
export function preparerGrille(candidats, nombre = NOMBRE_PAIRES) {
  const tires = tirerPrioritaires(candidats, candidats.length);
  // À priorité égale, les mots SANS paire à kanjis passent devant pour les
  // paires d'alphabet et de français : les mots à kanjis restent aux paires voulues.
  const aKanji = (m) => pairesDuMot(m).some((p) => p.genre === 'kanji');
  const ordre = tires;
  const ordreAutres = [...tires.filter((m) => !aKanji(m)), ...tires.filter(aKanji)];
  const vus = new Set();
  const choisis = []; // { mot, paire }
  const pris = new Set();
  const libre = (paire) => {
    const [ta, tb] = paire.formes.map(([, t]) => normaliser(t));
    return ta && tb && ta !== tb && !vus.has(ta) && !vus.has(tb);
  };
  const prendre = (mot, paire) => {
    paire.formes.forEach(([, t]) => vus.add(normaliser(t)));
    choisis.push({ mot, paire });
    pris.add(mot.id);
  };
  // Une passe = un genre de paire, avec son plafond.
  const passe = (genre, plafond) => {
    let n = choisis.filter((c) => c.paire.genre === genre).length;
    for (const mot of genre === 'kanji' ? ordre : ordreAutres) {
      if (choisis.length >= nombre || n >= plafond) return;
      if (pris.has(mot.id)) continue;
      const paire = pairesDuMot(mot).find((p) => p.genre === genre && libre(p));
      if (paire) { prendre(mot, paire); n++; }
    }
  };
  const alphabets = 1 + (Math.random() < 0.5 ? 1 : 0); // une ou deux paires hiragana ↔ katakana
  const francais = Math.random() < 0.5 ? 1 : 2;
  // Les mots à kanjis d'abord (en gardant la place des autres genres), puis
  // les alphabets — de préférence sur des mots sans kanji, qui ne serviraient
  // pas autrement —, puis le français.
  passe('kanji', nombre - alphabets - francais);
  passe('alphabets', alphabets);
  passe('fr', francais);
  passe('kanji', nombre);
  // Pas assez de mots à kanjis : on remplit, dans les plafonds d'abord, puis au-delà.
  passe('alphabets', MAX_ALPHABETS);
  passe('fr', MAX_FRANCAIS);
  passe('alphabets', nombre);
  passe('fr', nombre);

  const tuiles = choisis.flatMap(({ mot, paire }) => paire.formes.map(([forme, texte]) => ({ motId: mot.id, forme, texte })));
  return { mots: choisis.map((c) => c.mot), tuiles: melanger(tuiles) };
}

/** Combien de paires une sélection permet (pour la carte de l'accueil). */
export function pairesPossibles(candidats) {
  return preparerGrille(candidats).mots.length;
}

/** Lance une grille sur ces mots (la sélection de l'accueil). */
export function lancerPaires(candidats) {
  const grille = preparerGrille(candidats);
  if (grille.mots.length < 2) {
    toast('Il faut au moins deux mots pour faire des paires.', 'erreur');
    return;
  }
  partie = {
    candidats,
    ...grille,
    trouvees: new Set(),
    ecartes: new Set(), // mots jetés à la corbeille (« je ne le connais pas »)
    fautifs: new Map(), // motId → nombre d'erreurs avec ce mot
    erreurs: 0,
    debut: Date.now(),
    terminee: false,
  };
  naviguer('paires');
}

export function afficher(racine) {
  if (!partie || partie.terminee) {
    partie = null;
    naviguer('reviser');
    return undefined;
  }
  const minuteries = new Set();
  const plusTard = (f, ms) => { const t = setTimeout(() => { minuteries.delete(t); f(); }, ms); minuteries.add(t); };
  const parId = new Map(partie.mots.map((m) => [m.id, m]));

  document.body.dataset.jeu = 'en-cours'; // le téléphone cache sa navigation (CSS)
  racine.innerHTML = `
    <div class="exercice paires">
      <div class="exercice-barre">
        <button type="button" class="bouton bouton-discret" data-arreter>${icone('retour')}Arrêter</button>
        <span class="exercice-titre">Paires</span>
        <span class="exercice-score" aria-label="Score"><span class="note-bonne">○ <b data-trouvees>0</b>/${partie.mots.length}</span><span class="note-fausse">× <b data-erreurs>0</b></span></span>
      </div>
      <div class="jauge" aria-hidden="true"><i data-jauge></i></div>
      <article class="feuille feuille-exercice" data-feuille>
        <p class="consigne">Glissez chaque mot sur son autre écriture. Ou touchez les deux, l'un après l'autre.</p>
        <div class="grille-paires" role="group" aria-label="Tuiles à apparier" data-grille>
          ${partie.tuiles.map((t, i) => `
            <button type="button" class="tuile-paire tuile-${t.forme}${t.forme !== 'fr' && Array.from(t.texte).length > 4 ? ' tuile-longue' : ''}" data-tuile="${i}" data-mot="${t.motId}"${t.forme === 'fr' ? '' : ' lang="ja"'}>${echapper(t.texte)}</button>`).join('')}
        </div>
        <button type="button" class="corbeille" data-corbeille aria-label="Corbeille : écarter le mot choisi">
          ${icone('corbeille')}<span>Un mot inconnu ? Glissez-le ici : il part avec son autre écriture, et passe « à revoir ».</span>
        </button>
        <p class="sr-only" aria-live="polite" data-annonce></p>
      </article>
    </div>`;

  const grille = racine.querySelector('[data-grille]');
  const corbeille = racine.querySelector('[data-corbeille]');
  const finiSiTout = () => {
    if (partie.trouvees.size + partie.ecartes.size === partie.mots.length) plusTard(() => afficherBilan(racine), 700);
  };
  const annonce = racine.querySelector('[data-annonce]');
  const tuile = (el) => partie.tuiles[Number(el.dataset.tuile)];
  let choisie = null; // tuile touchée en attente de sa partenaire
  let glisser = null; // { el, x0, y0, actif, cible }
  let ignorerClic = false;

  const majScore = () => {
    racine.querySelector('[data-trouvees]').textContent = partie.trouvees.size;
    racine.querySelector('[data-erreurs]').textContent = partie.erreurs;
    racine.querySelector('[data-jauge]').style.width = `${(partie.trouvees.size / partie.mots.length) * 100}%`;
  };

  const deselectionner = () => {
    if (choisie) choisie.classList.remove('tuile-choisie');
    choisie = null;
  };

  const essayer = (a, b) => {
    deselectionner();
    const ta = tuile(a);
    const tb = tuile(b);
    if (ta.motId === tb.motId) {
      partie.trouvees.add(ta.motId);
      [a, b].forEach((el) => { el.classList.add('tuile-trouvee'); el.disabled = true; });
      const mot = parId.get(ta.motId);
      annonce.textContent = `Paire trouvée : ${ta.texte} et ${tb.texte}.`;
      majScore();
      const reussite = !partie.fautifs.has(ta.motId);
      appeler('progression.resultat', { mot_id: ta.motId, reussite })
        .then((p) => majProgression(mot.id, p))
        .catch((e) => toast(`Progression non enregistrée : ${e.message}`, 'erreur'));
      finiSiTout();
      return;
    }
    // Erreur : elle compte pour les deux mots en jeu.
    partie.erreurs++;
    [ta.motId, tb.motId].forEach((id) => partie.fautifs.set(id, (partie.fautifs.get(id) || 0) + 1));
    annonce.textContent = `${ta.texte} et ${tb.texte} ne vont pas ensemble.`;
    [a, b].forEach((el) => {
      el.classList.remove('tuile-fausse');
      void el.offsetWidth; // rejouer la secousse si on retente aussitôt
      el.classList.add('tuile-fausse');
    });
    plusTard(() => [a, b].forEach((el) => el.classList.remove('tuile-fausse')), 450);
    majScore();
  };

  /**
   * La corbeille (José, 25/10) : le mot de cette tuile et son autre écriture
   * quittent la grille. Ne pas le connaître, c'est l'avoir « à revoir ».
   */
  const ecarter = (el) => {
    deselectionner();
    const t = tuile(el);
    if (partie.trouvees.has(t.motId) || partie.ecartes.has(t.motId)) return;
    partie.ecartes.add(t.motId);
    grille.querySelectorAll(`[data-mot="${t.motId}"]`).forEach((n) => { n.classList.add('tuile-ecartee'); n.disabled = true; });
    annonce.textContent = `${t.texte} écarté, avec son autre écriture.`;
    corbeille.classList.remove('corbeille-pleine');
    void corbeille.offsetWidth;
    corbeille.classList.add('corbeille-pleine');
    appeler('progression.resultat', { mot_id: t.motId, reussite: false })
      .then((p) => majProgression(t.motId, p))
      .catch((e) => toast(`Progression non enregistrée : ${e.message}`, 'erreur'));
    majScore();
    finiSiTout();
  };
  corbeille.addEventListener('click', () => {
    if (choisie) ecarter(choisie);
    else toast('Touchez d’abord un mot, puis la corbeille — ou glissez le mot dessus.');
  });

  // ----- glisser (souris, doigt, stylet : Pointer Events) ------------------
  // Pas de glisser-déposer HTML5 : il ne marche pas au doigt sur téléphone.
  const cibleSous = (x, y, el) => document.elementsFromPoint(x, y)
    .map((n) => n.closest?.('[data-tuile], [data-corbeille]'))
    .find((n) => n && n !== el && !n.disabled) || null;

  const finirGlisser = () => {
    if (!glisser) return;
    glisser.el.classList.remove('tuile-en-main');
    glisser.el.style.transform = '';
    glisser.cible?.classList.remove('tuile-survolee');
    glisser = null;
  };

  grille.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-tuile]');
    ignorerClic = false; // nouveau geste : un clic resté en suspens ne doit pas avaler celui-ci
    if (!el || el.disabled || e.button > 0) return;
    glisser = { el, x0: e.clientX, y0: e.clientY, actif: false, cible: null };
    el.setPointerCapture(e.pointerId);
  });
  grille.addEventListener('pointermove', (e) => {
    if (!glisser) return;
    const dx = e.clientX - glisser.x0;
    const dy = e.clientY - glisser.y0;
    if (!glisser.actif) {
      if (Math.hypot(dx, dy) < SEUIL_GLISSER) return;
      glisser.actif = true;
      deselectionner();
      glisser.el.classList.add('tuile-en-main');
    }
    glisser.el.style.transform = `translate(${dx}px, ${dy}px)`;
    const cible = cibleSous(e.clientX, e.clientY, glisser.el);
    if (cible !== glisser.cible) {
      glisser.cible?.classList.remove('tuile-survolee');
      cible?.classList.add('tuile-survolee'); // (la corbeille a son propre style de survol)
      glisser.cible = cible;
    }
  });
  grille.addEventListener('pointerup', () => {
    if (!glisser) return;
    const { actif, el, cible } = glisser;
    finirGlisser();
    if (actif) {
      ignorerClic = true; // le clic qui suit un glisser n'est pas un toucher
      if (cible?.hasAttribute('data-corbeille')) ecarter(el);
      else if (cible) essayer(el, cible);
    }
  });
  grille.addEventListener('pointercancel', finirGlisser);

  // ----- toucher l'une puis l'autre (et clavier : Entrée / Espace) ---------
  grille.addEventListener('click', (e) => {
    if (ignorerClic) { ignorerClic = false; return; }
    const el = e.target.closest('[data-tuile]');
    if (!el || el.disabled) return;
    if (!choisie) {
      choisie = el;
      el.classList.add('tuile-choisie');
    } else if (choisie === el) {
      deselectionner();
    } else {
      essayer(choisie, el);
    }
  });

  racine.querySelector('[data-arreter]').addEventListener('click', () => {
    minuteries.forEach(clearTimeout);
    minuteries.clear();
    if (partie.trouvees.size) afficherBilan(racine);
    else { partie = null; naviguer('reviser'); }
  });

  return () => { minuteries.forEach(clearTimeout); finirGlisser(); };
}

function afficherBilan(racine) {
  partie.terminee = true;
  delete document.body.dataset.jeu;
  const secondes = Math.round((Date.now() - partie.debut) / 1000);
  const duree = `${Math.floor(secondes / 60)} min ${String(secondes % 60).padStart(2, '0')} s`;
  const premierCoup = [...partie.trouvees].filter((id) => !partie.fautifs.has(id)).length;
  const aRevoir = partie.mots.filter((m) => partie.fautifs.has(m.id) || partie.ecartes.has(m.id));
  const complete = partie.trouvees.size + partie.ecartes.size === partie.mots.length;
  racine.querySelector('[data-arreter]').hidden = true;
  racine.querySelector('[data-jauge]').style.width = `${(partie.trouvees.size / partie.mots.length) * 100}%`;
  const feuille = racine.querySelector('[data-feuille]');
  feuille.innerHTML = `
    <div class="bilan">
      <h1>${complete ? 'Grille terminée' : 'Grille arrêtée'}</h1>
      <p class="bilan-score"><span class="bilan-nombre">${premierCoup}</span><span class="bilan-sur">sur ${partie.mots.length} sans erreur</span></p>
      <p class="sous-titre">${pluriel(partie.trouvees.size, 'paire trouvée', 'paires trouvées')} en ${duree}, ${pluriel(partie.erreurs, 'erreur')}${partie.ecartes.size ? `, ${pluriel(partie.ecartes.size, 'mot écarté', 'mots écartés')}` : ''}.</p>
      ${aRevoir.length ? `
        <h2>À revoir</h2>
        <ul class="bilan-erreurs">${aRevoir.map((m) => `
          <li><span>${echapper(m.fr.join(', '))}</span><span lang="ja">${echapper([m.jp_kanji[0], m.jp_kana[0]].filter(Boolean).join(' ・ '))}</span></li>`).join('')}
        </ul>` : (complete ? '<p class="bilan-parfait">Toutes les paires du premier coup.</p>' : '')}
      <div class="actions">
        <button type="button" class="bouton bouton-principal" data-nouvelle>${icone('rejouer')}Nouvelle grille</button>
        ${aRevoir.length > 1 ? '<button type="button" class="bouton bouton-secondaire" data-ratees>Rejouer les mots à revoir</button>' : ''}
        <button type="button" class="bouton bouton-discret" data-accueil>Retour à l'accueil</button>
      </div>
    </div>`;
  const candidats = partie.candidats;
  feuille.querySelector('[data-nouvelle]').addEventListener('click', () => lancerPaires(candidats));
  feuille.querySelector('[data-ratees]')?.addEventListener('click', () => lancerPaires(aRevoir));
  feuille.querySelector('[data-accueil]').addEventListener('click', () => { partie = null; naviguer('reviser'); });
  feuille.querySelector('[data-nouvelle]').focus();
}
