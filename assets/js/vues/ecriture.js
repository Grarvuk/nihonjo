// Exercice d'écriture (le « drill » de la v1) : écrire le même mot N fois de
// suite sans faute ; une erreur remet le compte à zéro. « De mémoire » (le
// réglage `difficile`, par défaut depuis le 25/10/2026) : le modèle japonais
// disparaît dès la première lettre ou après MODELE_VISIBLE ms, et ne revient
// qu'après une erreur ou d'un toucher sur sa place. Ne touche pas à la
// progression (comme en v1).

import { donnees } from '../etat.js';
import { naviguer } from '../routeur.js';
import { masu, casesEssais } from '../masu.js';
import { creerClavier } from '../clavier.js';
import { echapper, normaliser } from '../utils.js';
import { icone } from '../icones.js';
import { reglagesEcriture } from './liste.js';

let file = null;
const MODELE_VISIBLE = 4000; // ms : le temps de regarder le mot avant de l'écrire de mémoire

export function lancerEcriture(ids) {
  if (!ids.length) return;
  const r = reglagesEcriture();
  file = { ids, index: 0, repetitions: r.repetitions, difficile: r.difficile };
  naviguer('ecriture');
}

export function afficher(racine) {
  if (!file) {
    naviguer('liste');
    return undefined;
  }
  const minuteries = new Set();
  const plusTard = (f, ms) => {
    const t = setTimeout(() => { minuteries.delete(t); f(); }, ms);
    minuteries.add(t);
  };

  const terminer = () => {
    file = null;
    naviguer('liste');
  };

  const afficherMot = () => {
    const mot = donnees().parId.get(file.ids[file.index]);
    if (!mot) return terminer();
    let reussis = 0;
    const modele = mot.jp_kanji.length
      ? masu(mot.jp_kanji[0], { taille: 'moyen', lecture: mot.jp_kana.join('、') })
      : masu(mot.jp_kana[0], { taille: 'moyen' });

    racine.innerHTML = `
      <div class="exercice ecriture">
        <div class="exercice-barre">
          <button type="button" class="bouton bouton-discret" data-arreter>${icone('retour')}Retour à la liste</button>
          <span class="exercice-titre">Écriture</span>
          <span class="exercice-position">${file.ids.length > 1 ? `Mot ${file.index + 1} sur ${file.ids.length}` : ''}</span>
        </div>
        <article class="feuille feuille-exercice">
          <p class="consigne">Écrivez ce mot ${file.repetitions} fois de suite sans faute${file.difficile ? ', de mémoire' : ''}.</p>
          <p class="question-fr">${echapper(mot.fr.join(', '))}</p>
          <div class="modele" data-modele${file.difficile ? ' title="Toucher pour revoir le modèle"' : ''}>${modele}</div>
          <div class="essais" data-essais>${casesEssais(0, file.repetitions)}</div>
          <div class="saisie">
            <input type="text" class="champ-reponse" data-saisie autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Kana, kanji ou rōmaji" aria-label="Votre saisie">
            <button type="button" class="bouton-icone bouton-clavier" data-clavier aria-label="Clavier de kana" title="Clavier de kana" aria-expanded="false">${icone('clavier')}</button>
          </div>
          <p class="message-ecriture" data-message role="status"></p>
          <div data-zone-clavier></div>
        </article>
      </div>`;

    const champ = racine.querySelector('[data-saisie]');
    const zoneModele = racine.querySelector('[data-modele]');
    const message = racine.querySelector('[data-message]');
    const clavier = creerClavier(champ, racine.querySelector('[data-zone-clavier]'));
    const boutonClavier = racine.querySelector('[data-clavier]');
    boutonClavier.addEventListener('click', () => {
      boutonClavier.setAttribute('aria-expanded', String(clavier.basculer()));
      champ.focus();
    });
    racine.querySelector('[data-arreter]').addEventListener('click', terminer);

    // Chaque affichage du modèle relance le compte à rebours (de mémoire).
    let cacheTard = null;
    const montrerModele = (visible) => {
      zoneModele.classList.toggle('modele-cache', !visible);
      clearTimeout(cacheTard);
      if (visible && file.difficile && !champ.disabled) cacheTard = setTimeout(() => montrerModele(false), MODELE_VISIBLE);
    };
    minuteries.add({ annuler: () => clearTimeout(cacheTard) });
    zoneModele.addEventListener('click', () => { if (file.difficile && zoneModele.classList.contains('modele-cache')) montrerModele(true); });
    const attendues = [...mot.jp_kana, ...mot.jp_kanji, ...mot.jp_romaji].map(normaliser).filter(Boolean);

    champ.addEventListener('input', () => {
      if (file.difficile && champ.value.length > 0) montrerModele(false);
    });
    champ.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing || !champ.value.trim()) return;
      e.preventDefault();
      if (attendues.includes(normaliser(champ.value))) {
        reussis++;
        champ.value = '';
        champ.classList.remove('champ-faux');
        champ.classList.add('champ-bon');
        plusTard(() => champ.classList.remove('champ-bon'), 400);
        message.textContent = '';
        if (file.difficile) montrerModele(false);
        racine.querySelector('[data-essais]').innerHTML = casesEssais(reussis, file.repetitions);
        if (reussis >= file.repetitions) {
          champ.disabled = true;
          montrerModele(true);
          message.textContent = 'Mot validé.';
          message.className = 'message-ecriture message-bon';
          plusTard(() => {
            file.index++;
            if (file.index < file.ids.length) afficherMot();
            else terminer();
          }, 1000);
        }
      } else {
        reussis = 0;
        champ.classList.add('champ-faux');
        montrerModele(true);
        message.textContent = 'Erreur : le compte repart de zéro.';
        message.className = 'message-ecriture message-faux';
        racine.querySelector('[data-essais]').innerHTML = casesEssais(0, file.repetitions);
        plusTard(() => champ.classList.remove('champ-faux'), 500);
      }
    });
    if (file.difficile) montrerModele(true); // lance le compte à rebours
    if (matchMedia('(pointer: fine)').matches) champ.focus();
  };

  afficherMot();
  return () => minuteries.forEach((t) => (t.annuler ? t.annuler() : clearTimeout(t)));
}
