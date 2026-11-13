// « Kana » : le cours des deux syllabaires, en tableaux (sons de base,
// sons voisés, combinaisons). Chaque caractère porte la maîtrise du compte
// (jeu des kana) ; l'en-tête d'une ligne lance le jeu sur cette ligne.

import { donnees, preference, ecrirePreference } from '../etat.js';
import { GROUPES, maitrise, caracteres } from '../donnees/syllabaires.js';
import { segments } from '../composants.js';
import { classeStatut, echapper } from '../utils.js';
import { icone } from '../icones.js';
import { naviguer } from '../routeur.js';
import { lancerJeuKana, reglagesJeu } from './jeu_kana.js';

const CLE_ALPHABET = 'kana_alphabet'; // préférence du compte (dans la base)

export function afficher(racine) {
  let alphabet = preference(CLE_ALPHABET, 'hira');
  racine.innerHTML = `
    <div class="page-kana">
      <header class="entete-vue entete-avec-action">
        <div>
          <h1>Kana</h1>
          <p class="sous-titre">Les deux alphabets syllabiques du japonais : les hiragana pour les mots japonais et la grammaire, les katakana pour les mots venus d'ailleurs. Chaque caractère se lit d'un seul son.</p>
        </div>
        <button type="button" class="bouton bouton-principal" data-jouer>${icone('jouer')}Jouer</button>
      </header>
      <div class="barre-kana">
        ${segments('alphabet', [['hira', 'Hiragana'], ['kata', 'Katakana'], ['deux', 'Les deux']], alphabet, 'Alphabet')}
        <ul class="legende legende-kana" aria-label="Votre maîtrise, d'après le jeu">
          <li><i class="pastille pastille-acquis"></i>Acquis</li>
          <li><i class="pastille pastille-a-revoir"></i>À revoir</li>
          <li><i class="pastille pastille-non-acquis"></i>Jamais joué</li>
        </ul>
        <p class="bilan-kana" data-bilan aria-live="polite"></p>
      </div>
      <div class="groupes-kana" data-groupes></div>
    </div>`;

  const zone = racine.querySelector('[data-groupes]');

  const glyphe = (texte) => {
    const etat = maitrise(donnees().kana?.[texte]);
    return `<span class="glyphe etat-${classeStatut(etat)}" lang="ja" title="${etat === 'non acquis' ? 'Jamais joué' : etat === 'acquis' ? 'Acquis' : 'À revoir'}">${echapper(texte)}</span>`;
  };

  const rendre = () => {
    zone.innerHTML = GROUPES.map((g) => `
      <section class="feuille groupe-kana" aria-labelledby="titre-${g.id}">
        <h2 id="titre-${g.id}">${echapper(g.nom)}</h2>
        <p class="note-kana">${echapper(g.note)}</p>
        <table class="tableau-kana tableau-kana-${g.colonnes.length}${alphabet === 'deux' ? ' tableau-kana-deux' : ''}">
          <thead><tr><th scope="col"><span class="sr-only">Ligne</span></th>${g.colonnes.map((c) => `<th scope="col">${echapper(c)}</th>`).join('')}</tr></thead>
          <tbody>${g.lignes.map((l) => `
            <tr>
              <th scope="row"><button type="button" class="ligne-kana" data-ligne="${l.id}" title="S'entraîner sur cette ligne" aria-label="S'entraîner sur la ligne ${echapper(l.libelle)}">${echapper(l.libelle)}${icone('jouer')}</button></th>
              ${l.cases.map((c) => (c ? `
                <td><span class="case-kana">
                  <span class="glyphes">${alphabet !== 'kata' ? glyphe(c.hira) : ''}${alphabet !== 'hira' ? glyphe(c.kata) : ''}</span>
                  <span class="romaji">${echapper(c.romaji[0])}</span>
                </span></td>` : '<td class="case-vide" aria-hidden="true"></td>')).join('')}
            </tr>`).join('')}
          </tbody>
        </table>
      </section>`).join('');

    // Bilan : caractères acquis dans l'alphabet affiché.
    const tous = caracteres(GROUPES.flatMap((g) => g.lignes.map((l) => l.id)), alphabet);
    const acquis = tous.filter((c) => maitrise(donnees().kana?.[c.glyphe]) === 'acquis').length;
    racine.querySelector('[data-bilan]').textContent = `${acquis} caractère${acquis > 1 ? 's' : ''} acquis sur ${tous.length}.`;
  };

  racine.querySelector('.barre-kana').addEventListener('change', (e) => {
    if (e.target.name !== 'alphabet') return;
    alphabet = e.target.value;
    ecrirePreference(CLE_ALPHABET, alphabet);
    rendre();
  });
  zone.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ligne]');
    if (b) lancerJeuKana({ ...reglagesJeu(), lignes: [b.dataset.ligne], alphabet, nombre: 'tous' });
  });
  racine.querySelector('[data-jouer]').addEventListener('click', () => naviguer('jeu-kana'));

  rendre();
}
