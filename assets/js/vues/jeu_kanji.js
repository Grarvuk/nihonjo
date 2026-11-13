// Jeu des kanjis (26/10/2026), trois exercices et leur mélange :
//   - « Le sens » : le kanji seul → son sens en français (rappel) ;
//   - « La lecture » : le kanji seul → une de ses lectures, on ou kun, en
//     kana (production ; le rōmaji est refusé, comme dans les exercices de
//     mots) ;
//   - « Reconnaître » : le sens → le kanji parmi quatre (reconnaissance : ne
//     mène qu'à « en cours ») ;
//   - « Mélangé » : pour chaque kanji, la facette la moins sûre (sens ou
//     lecture).
// Une réponse par kanji, puis la correction (sa fiche en bref) ; un kanji
// raté revient une fois un peu plus loin. Chaque réponse est envoyée au
// serveur (`kanji.resultat`), qui tient les paliers : « acquis » = sens ET
// lecture réussis deux fois de suite (Depot::enregistrerKanji).

import { appeler } from '../api.js';
import { donnees, preference, ecrirePreference } from '../etat.js';
import {
  GROUPES_KANJI, kanjisDuGroupe, etatKanji, sensAffiche, sensAcceptes, lectureJuste, kunEnHtml, kunPrincipales,
  motsAvecKanji, leurresKanji,
} from '../kanjis.js';
import { masu } from '../masu.js';
import { creerClavier } from '../clavier.js';
import { segments, badgeStatut, japonaisEnLigne } from '../composants.js';
import { echapper, melanger, pluriel, comparerFrancais, estEnLettresLatines } from '../utils.js';
import { icone } from '../icones.js';
import { naviguer } from '../routeur.js';
import { toast } from '../ui.js';

const CLE_REGLAGES = 'jeu_kanji'; // préférence du compte (dans la base)
const RETOUR_MIN = 3;
const RETOUR_MAX = 6;

export const EXERCICES_KANJI = {
  sens: { nom: 'Le sens', court: 'sens', consigne: 'Que veut dire ce kanji ? Répondez en français.', promesse: 'Le kanji seul : donnez son sens.' },
  lecture: { nom: 'La lecture', court: 'lecture', consigne: 'Écrivez une de ses lectures en kana, on ou kun.', promesse: 'Le kanji seul : une lecture, on ou kun.' },
  choix: { nom: 'Reconnaître', court: 'reconnaître', consigne: 'Quel kanji a ce sens ?', promesse: 'Un sens, quatre kanjis : trouvez le bon.' },
  melange: { nom: 'Mélangé', court: 'mélangé', promesse: 'Sens et lecture : la facette la moins sûre de chaque kanji.' },
};

export function reglagesJeuKanji() {
  return { exercice: 'melange', groupe: 'choisis', nombre: '20', ...preference(CLE_REGLAGES, {}) };
}

let partie = null;

/**
 * Lance une partie. `liste` (facultatif) : ces kanjis-là plutôt que le
 * groupe des réglages (la fiche d'un kanji, « Rejouer les ratés »).
 */
export function lancerJeuKanji(reglages, liste = null) {
  if (!liste) ecrirePreference(CLE_REGLAGES, reglages);
  const reserve = liste || kanjisDuGroupe(reglages.groupe);
  if (!reserve.length) {
    toast('Aucun kanji dans ce groupe.', 'erreur');
    return;
  }
  partie = {
    reglages, reserve, file: tirer(reserve, reglages, Boolean(liste)), index: 0, bons: 0, faux: 0,
    rates: new Map(), revenus: new Set(),
  };
  naviguer('jeu-kanji'); // même ancre : le routeur réaffiche quand même (rejouer les ratés)
}

/** La facette d'un kanji en « mélangé » : la série la plus courte ; à égalité, au hasard. */
function faceteFaible(k) {
  const p = donnees().kanji?.[k.k];
  const s = p?.serie_sens || 0;
  const l = p?.serie_lecture || 0;
  if (s !== l) return s < l ? 'sens' : 'lecture';
  return Math.random() < 0.5 ? 'sens' : 'lecture';
}

/**
 * La file : des questions { kanji, exercice }. Les kanjis à revoir d'abord,
 * puis en cours, nouveaux, acquis (mélangés dans chaque paquet). Une liste
 * explicite de un ou deux kanjis (la fiche) : le sens ET la lecture de chacun.
 */
function tirer(reserve, reglages, explicite) {
  const ordre = ['a revoir', 'en cours', 'non acquis', 'acquis'];
  const paquets = ordre.map((e) => melanger(reserve.filter((k) => etatKanji(k.k) === e)));
  let kanjis = paquets.flat();
  if (reglages.nombre !== 'tous') kanjis = kanjis.slice(0, parseInt(reglages.nombre, 10) || 20);
  const ex = reglages.exercice;
  if (explicite && ex === 'melange' && kanjis.length <= 2) {
    return kanjis.flatMap((k) => [{ kanji: k, exercice: 'sens' }, { kanji: k, exercice: 'lecture' }]);
  }
  return kanjis.map((k) => ({ kanji: k, exercice: ex === 'melange' ? faceteFaible(k) : ex }));
}

export function afficher(racine) {
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
  const r = reglagesJeuKanji();
  racine.innerHTML = `
    <div class="jeu-kana jeu-kanji">
      <div class="barre-vue"><button type="button" class="bouton bouton-discret" data-retour>${icone('retour')}Les kanjis</button></div>
      <header class="entete-vue">
        <h1>Jeu des kanjis</h1>
        <p class="sous-titre">Un kanji est acquis quand vous avez trouvé son sens ET une de ses lectures deux fois de suite. Reconnaître le kanji parmi quatre aide à démarrer, sans suffire.</p>
      </header>
      <div class="feuille reglages-jeu">
        ${segments('exercice', Object.entries(EXERCICES_KANJI).map(([id, e]) => [id, e.nom]), r.exercice, 'Exercice')}
        ${segments('groupe', GROUPES_KANJI.map((g) => [g.id, g.nom]), r.groupe, 'Quels kanjis')}
        ${segments('nombre', [['10', '10'], ['20', '20'], ['tous', 'Tous une fois']], r.nombre, 'Nombre de kanjis')}
        <div class="lancer-jeu">
          <p class="compte-peupler" data-compte aria-live="polite"></p>
          <button type="button" class="bouton bouton-principal" data-commencer>${icone('jouer')}Commencer</button>
        </div>
      </div>
    </div>`;
  const lire = () => ({
    exercice: racine.querySelector('input[name="exercice"]:checked').value,
    groupe: racine.querySelector('input[name="groupe"]:checked').value,
    nombre: racine.querySelector('input[name="nombre"]:checked').value,
  });
  const majCompte = () => {
    const liste = kanjisDuGroupe(lire().groupe);
    const aRevoir = liste.filter((k) => etatKanji(k.k) === 'a revoir').length;
    racine.querySelector('[data-compte]').textContent = liste.length
      ? `${pluriel(liste.length, 'kanji')} dans ce groupe${aRevoir ? `, dont ${aRevoir} à revoir (ils passent d’abord)` : ''}.`
      : 'Aucun kanji dans ce groupe : choisissez des chapitres sur l’accueil, ou un autre groupe.';
    racine.querySelector('[data-commencer]').disabled = !liste.length;
    ecrirePreference(CLE_REGLAGES, lire());
  };
  racine.querySelector('.reglages-jeu').addEventListener('change', majCompte);
  racine.querySelector('[data-commencer]').addEventListener('click', () => lancerJeuKanji(lire()));
  racine.querySelector('[data-retour]').addEventListener('click', () => naviguer('kanji'));
  majCompte();
  return undefined;
}

// ---------------------------------------------------------------------
// Partie
// ---------------------------------------------------------------------

function afficherPartie(racine) {
  document.body.dataset.jeu = 'en-cours';
  const titre = EXERCICES_KANJI[partie.reglages.exercice]?.court || '';
  racine.innerHTML = `
    <div class="exercice jeu-kanji">
      <div class="exercice-barre">
        <button type="button" class="bouton bouton-discret" data-arreter>${icone('retour')}Arrêter</button>
        <span class="exercice-titre">Jeu des kanjis · ${echapper(titre)}</span>
        <span class="exercice-score" aria-label="Score"><span class="note-bonne" title="Justes">○ <b data-bons>0</b></span><span class="note-fausse" title="Erreurs">× <b data-faux>0</b></span></span>
      </div>
      <div class="jauge" aria-hidden="true"><i data-jauge></i></div>
      <article class="feuille feuille-exercice" data-feuille></article>
    </div>`;
  racine.querySelector('[data-arreter]').addEventListener('click', () => {
    if (partie.index > 0) afficherBilan(racine);
    else { partie = null; naviguer('jeu-kanji'); }
  });
  afficherQuestion(racine);
  return undefined;
}

function majScore(racine) {
  racine.querySelector('[data-bons]').textContent = partie.bons;
  racine.querySelector('[data-faux]').textContent = partie.faux;
  racine.querySelector('[data-jauge]').style.width = `${(partie.index / partie.file.length) * 100}%`;
}

function afficherQuestion(racine) {
  if (partie.index >= partie.file.length) return afficherBilan(racine);
  const { kanji: k, exercice } = partie.file[partie.index];
  const ex = EXERCICES_KANJI[exercice];
  majScore(racine);
  // Une feuille neuve par question (pas d'écouteurs empilés, cf. exercice.js).
  const feuille = document.createElement('article');
  feuille.className = 'feuille feuille-exercice';
  feuille.dataset.feuille = '';
  racine.querySelector('[data-feuille]').replaceWith(feuille);
  const choix = exercice === 'choix' ? melanger([k, ...leurresKanji(k, partie.reserve)]) : [];
  feuille.innerHTML = `
    <div class="exercice-tete">
      <span class="exercice-position">Kanji ${partie.index + 1} sur ${partie.file.length}</span>
      ${badgeStatut(etatKanji(k.k))}
    </div>
    <p class="consigne surtitre">${echapper(ex.consigne)}</p>
    <div class="question question-kana">${exercice === 'choix' ? `<p class="question-fr">${echapper(sensAffiche(k))}</p>` : masu(k.k)}</div>
    ${exercice === 'choix' ? `
    <div class="tuiles tuiles-kanji" data-tuiles>${choix.map((c) => `<button type="button" class="tuile" lang="ja" data-tuile="${echapper(c.k)}">${echapper(c.k)}</button>`).join('')}</div>` : `
    <div class="saisie">
      <input type="text" class="champ-reponse" data-reponse autocomplete="off" autocapitalize="off" spellcheck="false"
        placeholder="${exercice === 'lecture' ? 'En kana : みず, スイ…' : 'Le sens en français'}" aria-label="Votre réponse"${exercice === 'lecture' ? ' lang="ja"' : ''}>
      ${exercice === 'lecture' ? `<button type="button" class="bouton-icone bouton-clavier" data-clavier aria-label="Clavier de kana" title="Clavier de kana" aria-expanded="false">${icone('clavier')}</button>` : ''}
    </div>
    <p class="message-saisie" data-message-saisie role="status"></p>`}
    <div class="actions" data-actions>
      ${exercice === 'choix' ? '' : '<button type="button" class="bouton bouton-principal" data-valider>Valider</button>'}
      <button type="button" class="bouton bouton-discret" data-passer>Je ne sais pas</button>
    </div>
    <div data-zone-clavier></div>
    <div data-correction></div>`;

  const champ = feuille.querySelector('[data-reponse]');
  if (exercice === 'lecture') {
    const clavier = creerClavier(champ, feuille.querySelector('[data-zone-clavier]'));
    const bouton = feuille.querySelector('[data-clavier]');
    bouton.addEventListener('click', () => { bouton.setAttribute('aria-expanded', String(clavier.basculer())); champ.focus(); });
    feuille.addEventListener('kanji-repondu', () => clavier.basculer(false));
  }

  const repondre = (saisie, passe = false) => {
    if (feuille.dataset.repondu) return;
    feuille.dataset.repondu = '1';
    let reussite = false;
    let note = '';
    if (!passe) {
      if (exercice === 'sens') {
        const r = comparerFrancais(saisie, sensAcceptes(k));
        reussite = Boolean(r);
        if (r?.proche) note = `Accepté, à une faute près : « ${r.proche} ».`;
      } else if (exercice === 'lecture') {
        reussite = lectureJuste(k, saisie);
      } else {
        reussite = saisie === k.k;
      }
    }
    feuille.dispatchEvent(new Event('kanji-repondu'));
    if (reussite) partie.bons++;
    else {
      partie.faux++;
      const r = partie.rates.get(k.k) || { kanji: k, erreurs: 0 };
      r.erreurs++;
      partie.rates.set(k.k, r);
      // Revient une fois, quelques questions plus loin (même exercice).
      if (!partie.revenus.has(k.k)) {
        partie.revenus.add(k.k);
        const pos = Math.min(partie.file.length, partie.index + 1 + RETOUR_MIN + Math.floor(Math.random() * (RETOUR_MAX - RETOUR_MIN + 1)));
        partie.file.splice(pos, 0, { kanji: k, exercice });
      }
    }
    if (champ) champ.disabled = true;
    feuille.querySelector('[data-actions]').remove();
    feuille.querySelectorAll('.tuile').forEach((t) => {
      t.disabled = true;
      if (t.dataset.tuile === k.k) t.classList.add('tuile-bonne');
      else if (t.dataset.tuile === saisie) t.classList.add('tuile-fausse');
    });
    partie.index++;
    majScore(racine);
    afficherCorrection(racine, feuille, k, { reussite, passe, saisie, note, exercice });
    appeler('kanji.resultat', { kanji: k.k, exercice, reussite }).then((stats) => {
      const tous = donnees().kanji || (donnees().kanji = {});
      tous[k.k] = stats;
    }).catch((e) => toast(`Résultat non enregistré : ${e.message}`, 'erreur'));
  };

  const valider = () => {
    if (!champ.value.trim()) return champ.focus();
    if (exercice === 'lecture' && estEnLettresLatines(champ.value)) {
      feuille.querySelector('[data-message-saisie]').textContent = 'Écrivez la lecture en kana : le rōmaji ne compte pas ici. Le clavier de kana est à droite du champ.';
      champ.classList.add('champ-faux');
      return champ.focus();
    }
    return repondre(champ.value.trim());
  };
  feuille.querySelector('[data-valider]')?.addEventListener('click', valider);
  champ?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); valider(); }
  });
  champ?.addEventListener('input', () => {
    champ.classList.remove('champ-faux');
    feuille.querySelector('[data-message-saisie]').textContent = '';
  });
  feuille.querySelector('[data-passer]').addEventListener('click', () => repondre('', true));
  feuille.querySelector('[data-tuiles]')?.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tuile]');
    if (t) repondre(t.dataset.tuile);
  });
  // Sur téléphone, le focus ouvrirait le clavier du système par-dessus la question.
  if (champ && matchMedia('(pointer: fine)').matches) champ.focus();
  return undefined;
}

function afficherCorrection(racine, feuille, k, { reussite, passe, saisie, note, exercice }) {
  const kun = kunPrincipales(k, 4);
  const mots = motsAvecKanji(k.k, 2);
  const titre = reussite ? 'Bonne réponse' : passe ? 'À retenir' : 'Mauvaise réponse';
  feuille.querySelector('[data-correction]').innerHTML = `
    <div class="correction ${reussite ? 'correction-bonne' : 'correction-fausse'}" role="status">
      <div class="correction-tete">
        ${reussite
    ? '<svg class="note-trait" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17" pathLength="1"/></svg>'
    : '<svg class="note-trait" viewBox="0 0 48 48" aria-hidden="true"><path d="M12 12l24 24" pathLength="1"/><path d="M36 12L12 36" pathLength="1"/></svg>'}
        <div>
          <strong>${titre}</strong>
          ${!reussite && saisie ? `<span class="correction-saisie">Vous avez ${exercice === 'choix' ? 'choisi' : 'écrit'} « ${echapper(saisie)} »</span>` : ''}
          ${note ? `<span class="correction-note">${echapper(note)}</span>` : ''}
        </div>
        <span class="correction-kanji" lang="ja" aria-hidden="true">${echapper(k.k)}</span>
      </div>
      <dl class="correction-details">
        <div><dt>Sens</dt><dd>${echapper(sensAffiche(k))}</dd></div>
        ${k.on.length ? `<div><dt>On</dt><dd lang="ja">${k.on.map(echapper).join('、')}</dd></div>` : ''}
        ${kun.length ? `<div><dt>Kun</dt><dd lang="ja">${kun.map((l) => kunEnHtml(l, echapper)).join('、')}</dd></div>` : ''}
        ${mots.length ? `<div class="correction-mots"><dt>Dans vos mots</dt><dd>${mots.map((m) => `<span class="correction-mot">${japonaisEnLigne(m)} <span class="bilan-fr">${echapper(m.fr[0])}</span></span>`).join('')}</dd></div>` : ''}
      </dl>
      <button type="button" class="bouton bouton-principal" data-suivant>${partie.index < partie.file.length ? 'Suivant' : 'Voir le bilan'}${icone('suivant')}</button>
    </div>`;
  const suivant = feuille.querySelector('[data-suivant]');
  suivant.addEventListener('click', () => afficherQuestion(racine));
  suivant.focus({ preventScroll: true });
}

function afficherBilan(racine) {
  const joues = partie.bons + partie.faux;
  const rates = [...partie.rates.values()].sort((a, b) => b.erreurs - a.erreurs);
  const reglages = partie.reglages;
  partie.terminee = true;
  delete document.body.dataset.jeu;
  racine.querySelector('[data-arreter]').hidden = true;
  racine.querySelector('[data-jauge]').style.width = '100%';
  const feuille = racine.querySelector('[data-feuille]');
  const acquis = partie.reserve.filter((k) => etatKanji(k.k) === 'acquis').length;
  feuille.innerHTML = `
    <div class="bilan">
      <h1>Partie terminée</h1>
      <p class="bilan-score"><span class="bilan-nombre">${partie.bons}</span><span class="bilan-sur">sur ${joues}</span></p>
      <p class="sous-titre">${pluriel(acquis, 'kanji acquis', 'kanjis acquis')} sur ${partie.reserve.length} dans ce choix.</p>
      ${rates.length ? `
        <h2>À retravailler</h2>
        <ul class="kana-rates">${rates.map((r) => `
          <li><span class="kana-rate-glyphe" lang="ja">${echapper(r.kanji.k)}</span><span class="kana-rate-romaji">${echapper(r.kanji.sens[0] || '')}</span><span class="kana-rate-nb">${pluriel(r.erreurs, 'erreur')}</span></li>`).join('')}
        </ul>` : '<p class="bilan-parfait">Aucune erreur.</p>'}
      <div class="actions">
        ${rates.length ? `<button type="button" class="bouton bouton-principal" data-rates>${icone('rejouer')}Rejouer les ratés</button>` : ''}
        <button type="button" class="bouton bouton-secondaire" data-rejouer>Nouvelle partie</button>
        <button type="button" class="bouton bouton-discret" data-tableau>Voir les kanjis</button>
      </div>
    </div>`;
  feuille.querySelector('[data-rates]')?.addEventListener('click', () => {
    lancerJeuKanji({ ...reglages, nombre: 'tous' }, rates.map((r) => r.kanji));
  });
  feuille.querySelector('[data-rejouer]').addEventListener('click', () => { partie = null; naviguer('jeu-kanji'); });
  feuille.querySelector('[data-tableau]').addEventListener('click', () => { partie = null; naviguer('kanji'); });
  (feuille.querySelector('[data-rates]') || feuille.querySelector('[data-rejouer]')).focus();
}
