// Clavier de kana intégré, rattaché à UN champ de saisie.
//
// ⚠️ La v1 définissait deux fois `creerToucheClavier` : la seconde écrasait la
// première et écrivait toujours dans le champ de l'exercice — le clavier du
// formulaire d'ajout remplissait donc un champ caché. Ici chaque clavier
// connaît sa cible ; il n'y a plus de variable globale « champ visé ».

import { HIRAGANA, KATAKANA, DAKUTEN_HIRAGANA, DAKUTEN_KATAKANA } from './kana.js';
import { icone } from './icones.js';

/**
 * Crée un clavier pour `cible` et le place dans `conteneur` (masqué).
 * @returns {{ element: HTMLElement, basculer: (ouvert?: boolean) => boolean, estOuvert: () => boolean }}
 */
export function creerClavier(cible, conteneur) {
  const el = document.createElement('div');
  el.className = 'clavier';
  el.hidden = true;
  el.innerHTML = `
    <div class="clavier-onglets" role="tablist">
      <button type="button" role="tab" data-jeu="hira" aria-selected="true">ひらがな</button>
      <button type="button" role="tab" data-jeu="kata" aria-selected="false">カタカナ</button>
      <button type="button" class="clavier-effacer" data-effacer aria-label="Effacer le dernier caractère">${icone('retour')}</button>
    </div>
    <div class="clavier-grille" data-grille></div>
    <div class="clavier-grille clavier-voises" data-voises></div>`;
  conteneur.appendChild(el);

  const remplir = (jeu) => {
    const [base, voises] = jeu === 'kata' ? [KATAKANA, DAKUTEN_KATAKANA] : [HIRAGANA, DAKUTEN_HIRAGANA];
    el.querySelector('[data-grille]').innerHTML = rangees(base);
    el.querySelector('[data-voises]').innerHTML = rangees(voises);
    el.querySelectorAll('[role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.jeu === jeu)));
  };
  remplir('hira');

  // mousedown empêché : le champ garde le focus et la position du curseur.
  el.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault();
  });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.jeu) return remplir(b.dataset.jeu);
    if (b.hasAttribute('data-effacer')) return effacer(cible);
    if (b.dataset.car) inserer(cible, b.dataset.car);
  });

  let modeSaisieInitial = cible.inputMode;
  const basculer = (ouvert = el.hidden) => {
    el.hidden = !ouvert;
    // Sur téléphone, le clavier du système recouvrirait celui-ci : on le
    // coupe tant que le clavier de kana est ouvert.
    if (ouvert) {
      modeSaisieInitial = cible.inputMode;
      cible.inputMode = 'none';
    } else {
      cible.inputMode = modeSaisieInitial;
    }
    return ouvert;
  };

  return { element: el, basculer, estOuvert: () => !el.hidden };
}

/**
 * Une rangée par famille (5 touches : a i u e o), rangées dans DEUX colonnes :
 * la première moitié des familles (あ, か, さ…) à gauche, la seconde (ま,
 * や, ら…) à droite (José, 25/10 : か行 SOUS あ行, pas à côté). Clavier
 * étroit : les deux colonnes se suivent, l'ordre gojūon reste entier.
 */
function rangees(touches) {
  const familles = [];
  for (let i = 0; i < touches.length; i += 5) {
    familles.push(`<div class="clavier-rangee">${touches.slice(i, i + 5).map(touche).join('')}</div>`);
  }
  const moitie = Math.ceil(familles.length / 2);
  return `<div class="clavier-colonne">${familles.slice(0, moitie).join('')}</div>`
    + `<div class="clavier-colonne">${familles.slice(moitie).join('')}</div>`;
}

function touche(car) {
  return car
    ? `<button type="button" class="touche" data-car="${car}" lang="ja">${car}</button>`
    : '<span class="touche touche-vide" aria-hidden="true"></span>';
}

function inserer(champ, texte) {
  const debut = champ.selectionStart ?? champ.value.length;
  const fin = champ.selectionEnd ?? champ.value.length;
  champ.value = champ.value.slice(0, debut) + texte + champ.value.slice(fin);
  const pos = debut + texte.length;
  champ.setSelectionRange?.(pos, pos);
  champ.focus();
  champ.dispatchEvent(new Event('input', { bubbles: true }));
}

function effacer(champ) {
  const debut = champ.selectionStart ?? champ.value.length;
  const fin = champ.selectionEnd ?? champ.value.length;
  if (debut === fin && debut === 0) return;
  const de = debut === fin ? debut - 1 : debut;
  champ.value = champ.value.slice(0, de) + champ.value.slice(fin);
  champ.setSelectionRange?.(de, de);
  champ.focus();
  champ.dispatchEvent(new Event('input', { bubbles: true }));
}
