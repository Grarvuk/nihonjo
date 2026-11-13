// Rendu « genkō yōshi » : chaque caractère japonais dans sa case (masu),
// avec la croix de repère en pointillés des cahiers d'écriture. C'est
// l'élément visuel fort de l'application ; la mise en forme est dans
// assets/css/nihonjo.css, section « Cases ».

import { echapper } from './utils.js';

/**
 * @param {string} texte
 * @param {object} [o]
 * @param {number} [o.trou=-1]      index (en caractères) de la case laissée vide
 * @param {'grand'|'moyen'|'petit'} [o.taille='grand']
 * @param {string} [o.lecture]     lecture en kana affichée sous les cases
 */
export function masu(texte, { trou = -1, taille = 'grand', lecture = '' } = {}) {
  // Array.from et non split('') : un caractère hors du plan de base (rare
  // en kanji, mais possible) compte pour deux unités UTF-16.
  const cases = Array.from(String(texte)).map((c, i) =>
    i === trou
      ? '<span class="masu masu-trou"><span class="sr-only">caractère manquant</span></span>'
      : `<span class="masu">${echapper(c)}</span>`);
  // --n : nombre de cases, pour que les grandes cases rétrécissent sur un
  // téléphone au lieu de passer à la ligne (règle .masu-grand du CSS).
  const ligne = `<span class="masu-ligne masu-${taille}" lang="ja" style="--n:${Math.max(cases.length, 3)}">${cases.join('')}</span>`;
  return lecture
    ? `<span class="masu-bloc">${ligne}<span class="masu-lecture" lang="ja">${echapper(lecture)}</span></span>`
    : ligne;
}

/** Une rangée de cases d'essai (exercice d'écriture) : `faites` cases cochées sur `total`. */
export function casesEssais(faites, total) {
  let html = '';
  for (let i = 0; i < total; i++) {
    html += `<span class="masu masu-essai${i < faites ? ' masu-faite' : ''}" aria-hidden="true">${i < faites ? '○' : ''}</span>`;
  }
  return `<span class="masu-ligne masu-petit" role="img" aria-label="${faites} sur ${total}">${html}</span>`;
}
