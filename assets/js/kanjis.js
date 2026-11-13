// Les kanjis comme matière à part (26/10/2026) : la page « Kanji » (le
// cours) et le jeu des kanjis. Les données sont dans donnees/kanjis.js
// (fabriqué par outils/generer_kanjis.py) ; la progression du compte dans
// donnees().kanji (table kanji_progression, action `kanji.resultat`). Un
// kanji n'est pas un mot : il n'entre jamais dans `progression`.
//
// Ce module dit QUELS kanjis (les groupes), ce qu'on accepte en réponse
// (sens, lectures) et comment montrer une lecture.

import { KANJIS } from './donnees/kanjis.js';
import { versHiragana } from './donnees/syllabaires.js';
import { donnees, motsDesChapitresCoches } from './etat.js';
import { normaliser, melanger } from './utils.js';

export const PAR_KANJI = new Map(KANJIS.map((k) => [k.k, k]));

/**
 * Les groupes de la page et du jeu. « Mes chapitres » : les kanjis des mots
 * des chapitres cochés sur l'accueil (la même sélection que l'anneau des
 * mots) ; puis les trois premières années de l'école japonaise ; « plus
 * loin » : les autres kanjis du vocabulaire du cours.
 */
export const GROUPES_KANJI = [
  { id: 'choisis', nom: 'Mes chapitres', note: 'Les kanjis des mots de vos chapitres choisis (accueil, « Quels mots réviser »).' },
  { id: '1', nom: '1re année', note: 'Les 80 premiers kanjis de l’école japonaise : nombres, nature, corps.' },
  { id: '2', nom: '2e année', note: '160 kanjis du quotidien : temps, lieux, actions.' },
  { id: '3', nom: '3e année', note: '200 kanjis plus abstraits.' },
  { id: '0', nom: 'Plus loin', note: 'Les autres kanjis du vocabulaire du manuel, dans l’ordre où il les fait rencontrer.' },
];

/** Les kanjis qu'emploient ces mots, dans l'ordre de KANJIS (ceux absents des données sont ignorés). */
export function kanjisDesMots(mots) {
  const vus = new Set();
  mots.forEach((m) => m.jp_kanji.forEach((e) => Array.from(e).forEach((c) => { if (PAR_KANJI.has(c)) vus.add(c); })));
  return KANJIS.filter((k) => vus.has(k.k));
}

export function kanjisDuGroupe(id) {
  if (id === 'choisis') return kanjisDesMots(motsDesChapitresCoches());
  return KANJIS.filter((k) => String(k.n) === id);
}

/** L'état d'un kanji pour le compte : non acquis, en cours, a revoir, acquis. */
export function etatKanji(k) {
  return donnees().kanji?.[k]?.statut || 'non acquis';
}

export function compterKanjis(liste) {
  const c = { acquis: 0, 'en cours': 0, 'a revoir': 0, 'non acquis': 0 };
  liste.forEach((k) => { c[etatKanji(k.k)]++; });
  return c;
}

/** Le sens affiché : « jour, soleil ». */
export function sensAffiche(k) {
  return k.sens.join(', ');
}

/** Les sens acceptés en réponse (comparerFrancais). */
export function sensAcceptes(k) {
  return [...k.sens, ...k.aussi];
}

/**
 * Une lecture kun en HTML : le radical, puis la terminaison écrite en kana
 * (okurigana) en retrait — い.きる → い<span>きる</span>. Les « - » (préfixe,
 * suffixe) sont retirés.
 */
export function kunEnHtml(lecture, echapper) {
  const [radical, fin] = lecture.replace(/-/g, '').split('.');
  return fin ? `${echapper(radical)}<span class="okurigana">${echapper(fin)}</span>` : echapper(radical);
}

/** Les lectures kun à montrer d'abord (sans préfixe ni suffixe, sans doublon), au plus `n`. */
export function kunPrincipales(k, n = 4) {
  const vues = new Set();
  return k.kun.filter((l) => !l.startsWith('-') && !l.endsWith('-')).filter((l) => {
    const cle = l.replace('.', '');
    if (vues.has(cle)) return false;
    vues.add(cle);
    return true;
  }).slice(0, n);
}

/**
 * Les lectures acceptées, en hiragana normalisé : chaque on (écrit en
 * hiragana ou en katakana, au choix : c'est une lecture, pas une
 * orthographe), chaque kun seul (い) ou avec sa terminaison (いきる).
 */
export function lecturesAcceptees(k) {
  const formes = new Set();
  const ajouter = (t) => { const f = versHiragana(normaliser(t)); if (f) formes.add(f); };
  k.on.forEach(ajouter);
  k.kun.forEach((l) => {
    const propre = l.replace(/-/g, '');
    ajouter(propre.split('.')[0]);
    ajouter(propre.replace('.', ''));
  });
  return formes;
}

export function lectureJuste(k, saisie) {
  return lecturesAcceptees(k).has(versHiragana(normaliser(saisie)));
}

/** Les mots du compte qui emploient ce kanji (pour la fiche et la correction), au plus `n`. */
export function motsAvecKanji(k, n = 4) {
  // Le même mot peut être dans le cours deux fois (deux chapitres) : une seule ligne.
  const vus = new Set();
  return donnees().mots.filter((m) => {
    if (!m.jp_kanji.some((e) => e.includes(k))) return false;
    const cle = `${m.jp_kanji[0]}|${m.fr[0]}`;
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  }).slice(0, n);
}

/**
 * Trois leurres pour « Reconnaître » : d'autres kanjis du même ensemble, de
 * préférence d'un nombre de traits voisin (un kanji de 2 traits parmi des
 * kanjis de 12 se reconnaîtrait sans rien savoir), jamais de même sens.
 */
export function leurresKanji(k, reserve) {
  const autres = (reserve.length >= 8 ? reserve : KANJIS).filter((x) => x.k !== k.k && x.sens[0] !== k.sens[0]);
  const proches = melanger(autres).sort((a, b) => Math.abs(a.t - k.t) - Math.abs(b.t - k.t));
  return melanger(proches.slice(0, 8)).slice(0, 3);
}
