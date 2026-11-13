// Jeu des kana, dans les deux sens (réglage `sens`) : « lire » — un
// caractère s'affiche, on écrit sa lecture en rōmaji ; « écrire » (25/10/2026)
// — la lecture s'affiche, on écrit le caractère (clavier de kana). On peut se tromper autant qu'on veut : le caractère reste tant qu'il n'est
// pas trouvé (ou révélé puis recopié). Un caractère raté revient une fois un
// peu plus loin dans la partie.
//
// Chaque caractère terminé est enregistré pour le compte (`kana.resultat`) :
// réussite = trouvé du premier coup, sans « Je ne sais pas ». Ces compteurs
// colorent le tableau de la page « Kana » (`maitrise`, syllabaires.js).

import { appeler } from '../api.js';
import { donnees, preference, ecrirePreference } from '../etat.js';
import { GROUPES, caracteres, maitrise } from '../donnees/syllabaires.js';
import { masu } from '../masu.js';
import { creerClavier } from '../clavier.js';
import { segments } from '../composants.js';
import { echapper, melanger, pluriel } from '../utils.js';
import { icone } from '../icones.js';
import { naviguer } from '../routeur.js';
import { toast } from '../ui.js';

const CLE_REGLAGES = 'jeu_kana'; // préférence du compte (dans la base)
// Un caractère raté revient entre 3 et 6 caractères plus loin.
const RETOUR_MIN = 3;
const RETOUR_MAX = 6;

export function reglagesJeu() {
  return { alphabet: 'hira', sens: 'lire', lignes: GROUPES[0].lignes.map((l) => l.id), nombre: '20', ...preference(CLE_REGLAGES, {}) };
}

let partie = null;

/** Lance une partie avec ces réglages (enregistrés pour la prochaine fois). */
export function lancerJeuKana(reglages) {
  ecrirePreference(CLE_REGLAGES, reglages);
  const reserve = caracteres(reglages.lignes, reglages.alphabet);
  if (!reserve.length) {
    toast('Choisissez au moins une ligne.', 'erreur');
    return;
  }
  partie = {
    reglages,
    reserve,
    file: tirer(reserve, reglages.nombre),
    index: 0,
    premierCoup: 0,
    erreursTotal: 0,
    rates: new Map(), // glyphe → { caractere, erreurs }
    revenus: new Set(),
  };
  naviguer('jeu-kana');
}

/**
 * Ordre de passage : les caractères pas encore acquis d'abord (mélangés),
 * puis les acquis (mélangés). « 20 » / « 50 » : on coupe, en refaisant un
 * tour de la réserve s'il le faut ; « tous » : chacun une fois ; « infini » :
 * la file se remplit à mesure.
 */
function tirer(reserve, nombre) {
  const tour = () => {
    const nonAcquis = reserve.filter((c) => maitrise(donnees().kana?.[c.glyphe]) !== 'acquis');
    const acquis = reserve.filter((c) => maitrise(donnees().kana?.[c.glyphe]) === 'acquis');
    return [...melanger(nonAcquis), ...melanger(acquis)];
  };
  if (nombre === 'tous' || nombre === 'infini') return tour();
  const voulu = parseInt(nombre, 10) || 20;
  const file = [];
  while (file.length < voulu) file.push(...tour());
  return file.slice(0, voulu);
}

export function normaliserRomaji(texte) {
  return String(texte || '').normalize('NFKC').toLowerCase().replace(/[\s'’\-.]/g, '');
}

export function afficher(racine) {
  // Une partie terminée ne reprend pas : on revient aux réglages.
  if (!partie || partie.terminee) {
    partie = null;
    return afficherReglages(racine);
  }
  return afficherPartie(racine);
}

// ---------------------------------------------------------------------
// Réglages
// ---------------------------------------------------------------------

function afficherReglages(racine) {
  const r = reglagesJeu();
  const choisies = new Set(r.lignes);
  racine.innerHTML = `
    <div class="jeu-kana">
      <div class="barre-vue"><button type="button" class="bouton bouton-discret" data-retour>${icone('retour')}Tableau des kana</button></div>
      <header class="entete-vue">
        <h1>Jeu des kana</h1>
        <p class="sous-titre">Lire : un caractère s'affiche, écrivez sa lecture en lettres latines (rōmaji). Écrire : la lecture s'affiche, écrivez le caractère. Autant d'essais que vous voulez ; un caractère raté revient un peu plus tard.</p>
      </header>
      <div class="feuille reglages-jeu">
        ${segments('sens', [['lire', 'Lire : kana → rōmaji'], ['ecrire', 'Écrire : rōmaji → kana']], r.sens, 'Sens')}
        ${segments('alphabet', [['hira', 'Hiragana'], ['kata', 'Katakana'], ['deux', 'Les deux']], r.alphabet, 'Alphabet')}
        <div class="choix-lignes">${GROUPES.map((g) => `
          <section class="groupe-lignes">
            <div class="categorie-tete">
              <h2>${echapper(g.nom)}</h2>
              <span class="categorie-actions">
                <button type="button" class="lien" data-tout="${g.id}">Tout</button>
                <button type="button" class="lien" data-aucun="${g.id}">Aucun</button>
              </span>
            </div>
            <div class="puces puces-compactes">${g.lignes.map((l) => `
              <button type="button" class="puce puce-ligne" aria-pressed="${choisies.has(l.id)}" data-ligne="${l.id}" data-groupe="${g.id}" title="Ligne ${echapper(l.libelle)}">
                <span lang="ja">${l.cases.filter(Boolean).map((c) => echapper(c.hira)).join('')}</span>
              </button>`).join('')}
            </div>
          </section>`).join('')}
        </div>
        ${segments('nombre', [['20', '20'], ['50', '50'], ['tous', 'Tous une fois'], ['infini', 'Sans fin']], r.nombre, 'Nombre de caractères')}
        <div class="lancer-jeu">
          <p class="compte-peupler" data-compte aria-live="polite"></p>
          <button type="button" class="bouton bouton-principal" data-commencer>${icone('jouer')}Commencer</button>
        </div>
      </div>
    </div>`;

  const lire = () => ({
    sens: racine.querySelector('input[name="sens"]:checked').value,
    alphabet: racine.querySelector('input[name="alphabet"]:checked').value,
    nombre: racine.querySelector('input[name="nombre"]:checked').value,
    lignes: [...choisies],
  });
  const majCompte = () => {
    const n = caracteres([...choisies], lire().alphabet).length;
    racine.querySelector('[data-compte]').textContent = n ? `${pluriel(n, 'caractère')} dans la sélection.` : 'Aucune ligne choisie.';
    racine.querySelector('[data-commencer]').disabled = n === 0;
    ecrirePreference(CLE_REGLAGES, lire());
  };

  racine.querySelector('.reglages-jeu').addEventListener('click', (e) => {
    const puce = e.target.closest('[data-ligne]');
    if (puce) {
      if (choisies.has(puce.dataset.ligne)) choisies.delete(puce.dataset.ligne);
      else choisies.add(puce.dataset.ligne);
      puce.setAttribute('aria-pressed', String(choisies.has(puce.dataset.ligne)));
      return majCompte();
    }
    const groupe = e.target.closest('[data-tout], [data-aucun]');
    if (groupe) {
      const id = groupe.dataset.tout ?? groupe.dataset.aucun;
      const ajouter = groupe.hasAttribute('data-tout');
      racine.querySelectorAll(`[data-groupe="${id}"]`).forEach((p) => {
        if (ajouter) choisies.add(p.dataset.ligne);
        else choisies.delete(p.dataset.ligne);
        p.setAttribute('aria-pressed', String(ajouter));
      });
      majCompte();
    }
  });
  racine.querySelector('.reglages-jeu').addEventListener('change', majCompte);
  racine.querySelector('[data-commencer]').addEventListener('click', () => lancerJeuKana(lire()));
  racine.querySelector('[data-retour]').addEventListener('click', () => naviguer('kana'));
  majCompte();
  return undefined;
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

function afficherPartie(racine) {
  const sansFin = partie.reglages.nombre === 'infini';
  const ecrire = partie.reglages.sens === 'ecrire';
  // Sur téléphone, la navigation du bas laisse la place au jeu (CSS « data-jeu »).
  document.body.dataset.jeu = 'en-cours';
  racine.innerHTML = `
    <div class="exercice jeu-kana">
      <div class="exercice-barre">
        <button type="button" class="bouton bouton-discret" data-arreter>${icone('retour')}Arrêter</button>
        <span class="exercice-titre">Jeu des kana${ecrire ? ' · écrire' : ''}</span>
        <span class="exercice-score" aria-label="Score"><span class="note-bonne" title="Trouvés du premier coup">○ <b data-bons>0</b></span><span class="note-fausse" title="Erreurs">× <b data-faux>0</b></span></span>
      </div>
      <div class="jauge" aria-hidden="true"${sansFin ? ' hidden' : ''}><i data-jauge></i></div>
      <article class="feuille feuille-exercice" data-feuille></article>
    </div>`;
  const minuteries = new Set();
  const plusTard = (f, ms) => { const t = setTimeout(() => { minuteries.delete(t); f(); }, ms); minuteries.add(t); };

  racine.querySelector('[data-arreter]').addEventListener('click', () => {
    // ⚠️ Sinon le « caractère suivant » déjà programmé écraserait le bilan.
    minuteries.forEach(clearTimeout);
    minuteries.clear();
    if (partie.index > 0) afficherBilan(racine);
    else { partie = null; naviguer('jeu-kana'); }
  });

  const majScore = () => {
    racine.querySelector('[data-bons]').textContent = partie.premierCoup;
    racine.querySelector('[data-faux]').textContent = partie.erreursTotal;
    if (!sansFin) racine.querySelector('[data-jauge]').style.width = `${(partie.index / partie.file.length) * 100}%`;
  };

  const afficherCaractere = () => {
    if (partie.index >= partie.file.length) {
      if (sansFin) partie.file.push(...tirer(partie.reserve, 'tous'));
      else return afficherBilan(racine);
    }
    const c = partie.file[partie.index];
    let erreurs = 0;
    let revele = false;
    majScore();

    // Feuille neuve à chaque caractère (même raison que dans exercice.js :
    // pas d'écouteurs empilés).
    const feuille = document.createElement('article');
    feuille.className = 'feuille feuille-exercice';
    feuille.dataset.feuille = '';
    racine.querySelector('[data-feuille]').replaceWith(feuille);
    feuille.innerHTML = `
      <div class="exercice-tete">
        <span class="exercice-position">Caractère ${partie.index + 1}${sansFin ? '' : ` sur ${partie.file.length}`}</span>
        <span class="badge badge-non-acquis">${c.alphabet === 'hira' ? 'Hiragana' : 'Katakana'}</span>
      </div>
      ${ecrire ? `
      <p class="consigne">Écrivez ce son en ${c.alphabet === 'hira' ? 'hiragana' : 'katakana'}.</p>
      <div class="question question-kana" data-question>
        <p class="question-romaji" lang="en">${echapper(c.romaji[0])}</p>
        <div data-glyphe-trouve hidden>${masu(c.glyphe)}</div>
      </div>` : `
      <p class="consigne">Écrivez sa lecture en lettres latines.</p>
      <div class="question question-kana" data-question>${masu(c.glyphe)}</div>`}
      <p class="aide aide-kana" data-aide role="status"></p>
      <div class="saisie">
        ${ecrire
    ? `<input type="text" class="champ-reponse" data-romaji lang="ja" inputmode="none" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${c.alphabet === 'hira' ? 'あ, し, つ…' : 'ア, シ, ツ…'}" aria-label="Le caractère en kana">
        <button type="button" class="bouton-icone bouton-clavier" data-clavier aria-label="Clavier de kana" title="Clavier de kana" aria-expanded="true">${icone('clavier')}</button>`
    : '<input type="text" class="champ-reponse" data-romaji lang="en" inputmode="latin" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ka, shi, tsu…" aria-label="Lecture en rōmaji">'}
      </div>
      <div class="actions">
        <button type="button" class="bouton bouton-principal" data-valider>Valider</button>
        <button type="button" class="bouton bouton-discret" data-reveler>Je ne sais pas</button>
      </div>
      <div data-zone-clavier></div>`;
    const champ = feuille.querySelector('[data-romaji]');
    const aide = feuille.querySelector('[data-aide]');
    // Écrire : le caractère lui-même (le clavier propose les deux alphabets,
    // un hiragana pour un katakana demandé est une erreur).
    const comparer = ecrire ? (t) => String(t || '').normalize('NFKC').replace(/\s/g, '') : normaliserRomaji;
    const attendues = ecrire ? [c.glyphe] : c.romaji.map(normaliserRomaji);
    const solution = ecrire ? c.glyphe : c.romaji[0];
    if (ecrire) {
      // Le clavier ouvert d'emblée, sur le bon alphabet.
      const clavier = creerClavier(champ, feuille.querySelector('[data-zone-clavier]'));
      clavier.basculer(true);
      if (c.alphabet === 'kata') clavier.element.querySelector('[data-jeu="kata"]')?.click();
      const bouton = feuille.querySelector('[data-clavier]');
      bouton.addEventListener('click', () => { bouton.setAttribute('aria-expanded', String(clavier.basculer())); champ.focus(); });
    }

    const terminer = () => {
      champ.disabled = true;
      feuille.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const trouve = feuille.querySelector('[data-glyphe-trouve]');
      if (trouve) trouve.hidden = false;
      feuille.querySelector('.masu').classList.add('masu-trouve');
      const reussite = erreurs === 0 && !revele;
      if (reussite) partie.premierCoup++;
      else {
        const r = partie.rates.get(c.glyphe) || { caractere: c, erreurs: 0 };
        r.erreurs += erreurs + (revele ? 1 : 0);
        partie.rates.set(c.glyphe, r);
        // Revient une fois, quelques caractères plus loin.
        if (!partie.revenus.has(c.glyphe)) {
          partie.revenus.add(c.glyphe);
          const pos = Math.min(partie.file.length, partie.index + 1 + RETOUR_MIN + Math.floor(Math.random() * (RETOUR_MAX - RETOUR_MIN + 1)));
          partie.file.splice(pos, 0, c);
        }
      }
      aide.innerHTML = `<span class="kana-trouve">${reussite ? 'Du premier coup' : 'Trouvé'} : ${echapper(ecrire ? `${c.glyphe} (${c.romaji[0]})` : c.romaji[0])}</span>`;
      partie.index++;
      majScore();
      appeler('kana.resultat', { kana: c.glyphe, reussite }).then((stats) => {
        const tous = donnees().kana || (donnees().kana = {});
        tous[c.glyphe] = stats;
      }).catch((e) => toast(`Résultat non enregistré : ${e.message}`, 'erreur'));
      plusTard(afficherCaractere, reussite ? 450 : 900);
    };

    const valider = () => {
      const saisie = comparer(champ.value);
      if (!saisie) return champ.focus();
      if (attendues.includes(saisie)) return terminer();
      if (revele) {
        aide.innerHTML = `Recopiez « <strong lang="ja">${echapper(solution)}</strong> » pour continuer.`;
      } else {
        erreurs++;
        partie.erreursTotal++;
        majScore();
        aide.textContent = erreurs === 1 ? 'Ce n’est pas ça. Essayez encore.' : `Toujours pas (${erreurs} essais). Essayez encore, ou « Je ne sais pas ».`;
      }
      champ.classList.remove('champ-faux');
      void champ.offsetWidth; // relance l'animation de secousse
      champ.classList.add('champ-faux');
      champ.select();
    };

    feuille.querySelector('[data-valider]').addEventListener('click', valider);
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        valider();
      }
    });
    champ.addEventListener('input', () => champ.classList.remove('champ-faux'));
    feuille.querySelector('[data-reveler]').addEventListener('click', () => {
      revele = true;
      aide.innerHTML = ecrire
        ? `C'est « <strong lang="ja">${echapper(c.glyphe)}</strong> ». Écrivez-le pour continuer.`
        : `C'est « <strong>${echapper(c.romaji.join(' » ou « '))}</strong> ». Écrivez-le pour continuer.`;
      champ.value = '';
      champ.focus();
    });
    // Le focus ouvrirait le clavier du téléphone par-dessus celui de kana.
    if (!ecrire || matchMedia('(pointer: fine)').matches) champ.focus();
  };

  afficherCaractere();
  return () => minuteries.forEach(clearTimeout);
}

function afficherBilan(racine) {
  const joues = partie.index;
  const rates = [...partie.rates.values()].sort((a, b) => b.erreurs - a.erreurs);
  const taux = joues ? Math.round((partie.premierCoup / joues) * 100) : 0;
  const reglages = partie.reglages;
  partie.terminee = true;
  delete document.body.dataset.jeu;
  racine.querySelector('[data-arreter]').hidden = true;
  const jauge = racine.querySelector('[data-jauge]');
  if (jauge) jauge.style.width = '100%';
  const feuille = racine.querySelector('[data-feuille]');
  feuille.innerHTML = `
    <div class="bilan">
      <h1>Partie terminée</h1>
      <p class="bilan-score"><span class="bilan-nombre">${partie.premierCoup}</span><span class="bilan-sur">sur ${joues}</span></p>
      <p class="sous-titre">${taux} % trouvés du premier coup, ${pluriel(partie.erreursTotal, 'erreur')} en tout.</p>
      ${rates.length ? `
        <h2>À retravailler</h2>
        <ul class="kana-rates">${rates.map((r) => `
          <li><span class="kana-rate-glyphe" lang="ja">${echapper(r.caractere.glyphe)}</span><span class="kana-rate-romaji">${echapper(r.caractere.romaji[0])}</span><span class="kana-rate-nb">${pluriel(r.erreurs, 'erreur')}</span></li>`).join('')}
        </ul>` : '<p class="bilan-parfait">Tout du premier coup.</p>'}
      <div class="actions">
        ${rates.length ? `<button type="button" class="bouton bouton-principal" data-rates>${icone('rejouer')}Rejouer les ratés</button>` : ''}
        <button type="button" class="bouton bouton-secondaire" data-rejouer>Nouvelle partie</button>
        <button type="button" class="bouton bouton-discret" data-tableau>Voir le tableau</button>
      </div>
    </div>`;
  const ratesGlyphes = rates.map((r) => r.caractere);
  feuille.querySelector('[data-rates]')?.addEventListener('click', () => {
    partie = { ...partie, terminee: false, reserve: ratesGlyphes, file: melanger(ratesGlyphes), index: 0, premierCoup: 0, erreursTotal: 0, rates: new Map(), revenus: new Set(), reglages: { ...reglages, nombre: 'tous' } };
    afficherPartie(racine);
  });
  feuille.querySelector('[data-rejouer]').addEventListener('click', () => { partie = null; naviguer('jeu-kana'); });
  feuille.querySelector('[data-tableau]').addEventListener('click', () => { partie = null; naviguer('kana'); });
  (feuille.querySelector('[data-rates]') || feuille.querySelector('[data-rejouer]')).focus();
}
