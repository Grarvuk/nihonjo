// « Kanji » : le cours des kanjis (26/10/2026). Une grille par groupe (Mes
// chapitres, 1re à 3e année, plus loin) ; chaque kanji porte l'état du
// compte (jeu des kanjis). Un toucher ouvre sa fiche : sens, lectures on et
// kun, nombre de traits, les mots du compte qui l'emploient, et de quoi
// s'entraîner tout de suite.

import { preference, ecrirePreference, donnees } from '../etat.js';
import {
  GROUPES_KANJI, PAR_KANJI, kanjisDuGroupe, etatKanji, compterKanjis, sensAffiche, kunEnHtml, kunPrincipales, motsAvecKanji,
} from '../kanjis.js';
import { segments, japonaisEnLigne, badgeStatut } from '../composants.js';
import { masu } from '../masu.js';
import { classeStatut, echapper, pluriel, LIBELLES_STATUT } from '../utils.js';
import { icone } from '../icones.js';
import { naviguer } from '../routeur.js';
import { dialogue } from '../ui.js';
import { lancerJeuKanji, reglagesJeuKanji } from './jeu_kanji.js';

const CLE_GROUPE = 'kanji_niveau'; // préférence du compte (dans la base)

/** Le groupe montré d'abord : celui choisi la dernière fois ; sinon « Mes chapitres » s'il a des kanjis. */
function groupeInitial() {
  const choisi = preference(CLE_GROUPE, null);
  if (GROUPES_KANJI.some((g) => g.id === choisi)) return choisi;
  return kanjisDuGroupe('choisis').length ? 'choisis' : '1';
}

export function afficher(racine) {
  let groupe = groupeInitial();
  racine.innerHTML = `
    <div class="page-kanji">
      <header class="entete-vue entete-avec-action">
        <div>
          <h1>Kanji</h1>
          <p class="sous-titre">Chaque kanji porte un sens et se lit de plusieurs façons : la lecture on, venue du chinois (écrite ici en katakana), et la lecture kun, japonaise (en hiragana). Touchez un kanji pour sa fiche.</p>
        </div>
        <button type="button" class="bouton bouton-principal" data-jouer>${icone('jouer')}Jouer</button>
      </header>
      <div class="barre-kana">
        ${segments('groupe', GROUPES_KANJI.map((g) => [g.id, g.nom]), groupe, 'Quels kanjis')}
        <ul class="legende legende-kana" aria-label="Votre progression, d'après le jeu">
          <li><i class="pastille pastille-acquis"></i>Acquis</li>
          <li><i class="pastille pastille-en-cours"></i>En cours</li>
          <li><i class="pastille pastille-a-revoir"></i>À revoir</li>
          <li><i class="pastille pastille-non-acquis"></i>Jamais joué</li>
        </ul>
      </div>
      <section class="feuille groupe-kanji">
        <div class="groupe-kanji-tete">
          <p class="note-kana" data-note></p>
          <p class="bilan-kana" data-bilan aria-live="polite"></p>
          <button type="button" class="bouton bouton-secondaire" data-jouer-groupe>${icone('jouer')}S’entraîner sur ce groupe</button>
        </div>
        <div class="grille-kanji" data-grille></div>
      </section>
      <p class="source-kanji">Lectures et traits : KANJIDIC2, © EDRDG, licence CC BY-SA 4.0.</p>
    </div>`;

  const grille = racine.querySelector('[data-grille]');

  const rendre = () => {
    const liste = kanjisDuGroupe(groupe);
    const g = GROUPES_KANJI.find((x) => x.id === groupe);
    racine.querySelector('[data-note]').textContent = g.note;
    const c = compterKanjis(liste);
    racine.querySelector('[data-bilan]').textContent = liste.length
      ? `${c.acquis} acquis sur ${liste.length}${c['a revoir'] ? `, ${c['a revoir']} à revoir` : ''}.`
      : '';
    racine.querySelector('[data-jouer-groupe]').disabled = !liste.length;
    grille.innerHTML = liste.length ? liste.map((k) => {
      const etat = etatKanji(k.k);
      return `<button type="button" class="case-kanji etat-${classeStatut(etat)}" data-kanji="${echapper(k.k)}" title="${echapper(`${sensAffiche(k)} — ${LIBELLES_STATUT[etat] || ''}`)}">
          <span class="case-kanji-glyphe" lang="ja">${echapper(k.k)}</span>
          <span class="case-kanji-sens">${echapper(k.sens[0] || '')}</span>
        </button>`;
    }).join('') : '<p class="vide">Aucun kanji dans les mots de vos chapitres choisis. Choisissez des chapitres sur l’accueil, ou un autre groupe.</p>';
  };

  racine.querySelector('.barre-kana').addEventListener('change', (e) => {
    if (e.target.name !== 'groupe') return;
    groupe = e.target.value;
    ecrirePreference(CLE_GROUPE, groupe);
    rendre();
  });
  grille.addEventListener('click', (e) => {
    const b = e.target.closest('[data-kanji]');
    if (b) ouvrirFiche(b.dataset.kanji, () => rendre());
  });
  racine.querySelector('[data-jouer]').addEventListener('click', () => naviguer('jeu-kanji'));
  racine.querySelector('[data-jouer-groupe]').addEventListener('click', () => lancerJeuKanji({ ...reglagesJeuKanji(), groupe }));

  rendre();
}

/** La fiche d'un kanji, en boîte de dialogue. */
export function ouvrirFiche(caractere) {
  const k = PAR_KANJI.get(caractere);
  if (!k) return;
  const p = donnees().kanji?.[caractere];
  const etat = etatKanji(caractere);
  const kun = kunPrincipales(k, 6);
  const autresKun = k.kun.length - kun.length;
  const mots = motsAvecKanji(caractere, 6);
  const corps = `
    <div class="fiche-kanji">
      <div class="fiche-kanji-tete">
        ${masu(caractere)}
        <div>
          <p class="fiche-kanji-sens">${echapper(sensAffiche(k))}</p>
          <p class="fiche-kanji-infos">${pluriel(k.t, 'trait')} · ${echapper(k.n ? `${k.n}${k.n === 1 ? 're' : 'e'} année` : 'plus loin')} · ${badgeStatut(etat)}</p>
          ${p ? `<p class="fiche-kanji-infos">Sens : ${Math.min(p.serie_sens, 2)}/2 · Lecture : ${Math.min(p.serie_lecture, 2)}/2 de suite</p>` : ''}
        </div>
      </div>
      <dl class="fiche-kanji-lectures">
        <div><dt>On</dt><dd lang="ja">${k.on.length ? k.on.map(echapper).join('、') : '<span class="vide-court">—</span>'}</dd></div>
        <div><dt>Kun</dt><dd lang="ja">${kun.length ? kun.map((l) => kunEnHtml(l, echapper)).join('、') : '<span class="vide-court">—</span>'}${autresKun > 0 ? ` <small>(+${autresKun})</small>` : ''}</dd></div>
      </dl>
      ${mots.length ? `
        <h3>Dans vos mots</h3>
        <ul class="fiche-kanji-mots">${mots.map((m) => `<li>${japonaisEnLigne(m)}<span class="bilan-fr">${echapper(m.fr.join(', '))}</span></li>`).join('')}</ul>` : ''}
    </div>`;
  dialogue({
    titre: `Le kanji ${caractere}`,
    corps,
    actions: [
      { libelle: 'Fermer', valeur: null },
      { libelle: 'S’entraîner sur ce kanji', genre: 'principal', valeur: 'jouer' },
    ],
  }).then((r) => {
    if (r === 'jouer') lancerJeuKanji({ ...reglagesJeuKanji(), exercice: 'melange', nombre: 'tous' }, [k]);
  });
}
