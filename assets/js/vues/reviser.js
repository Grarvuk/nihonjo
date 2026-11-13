// Écran d'accueil « Réviser » (refait le 23/10/2026, skill ux-ui-nihonjo).
// Dans l'ordre où on en a besoin :
//   1. l'accueil : bonjour en japonais, où en est la sélection, et UN bouton
//      qui lance tout de suite une révision (les mots à revoir d'abord) ;
//   2. tous les exercices en cartes, vocabulaire ET alphabets, chacun lancé
//      d'un seul toucher ;
//   3. le mot du jour ;
//   4. le choix des mots (chapitres, thème, état, nombre) — un réglage, donc
//      en dernier.

import {
  donnees, categoriesAvecChapitres, chapitreCoche, cocherChapitres, filtres, ecrireFiltres,
  motsSelectionnes, thematiques, compterStatuts, statut, tirerPrioritaires, preference, ecrirePreference,
  nombreAReviser, motsDesChapitresCoches,
} from '../etat.js';
import { barreStatuts, badgeStatut, segments } from '../composants.js';
import { masu } from '../masu.js';
import { echapper, libelleChapitre, majuscule, pluriel, noteManuel, pageManuelEnClair } from '../utils.js';
import { MODES, GROUPES_MODES, motsPourMode, lancerSession } from './exercice.js';
import { lancerEcriture } from './ecriture.js';
import { lancerPaires, pairesPossibles } from './paires.js';
import { lancerJeuKana, reglagesJeu } from './jeu_kana.js';
import { lancerJeuKanji, reglagesJeuKanji, EXERCICES_KANJI } from './jeu_kanji.js';
import { kanjisDuGroupe, compterKanjis } from '../kanjis.js';
import { caracteres, toutesLesLignes, maitrise } from '../donnees/syllabaires.js';
import { naviguer } from '../routeur.js';
import { icone } from '../icones.js';
import { detecterAnciennesDonnees, migrationDejaFaite } from '../migration_navigateur.js';
import { toast } from '../ui.js';
import { quandVoixPretes } from '../son.js';
import { importerAncienneVersion } from '../echanges.js';

const CLE_DERNIER_MODE = 'dernier_mode'; // préférence du compte (dans la base)

// Ce que promet chaque exercice, en une phrase, pour la carte de l'accueil.
const PROMESSES = {
  'fr-jp': 'Vous voyez le sens, vous écrivez le mot.',
  'jp-fr': 'Vous lisez le mot en kana, vous donnez le sens.',
  dictee: 'Vous entendez le mot, vous l’écrivez.',
  'trous-kana': 'Retrouvez le kana qui manque.',
  'trous-kanji': 'Choisissez le kanji qui manque parmi dix.',
  'lecture-kanji': 'Le mot en kanji, sans lecture : son sens.',
  transcription: 'Un kanji, sa lecture en kana.',
  'choix-lecture': 'Un kanji, quatre lectures qui se ressemblent.',
};

const ALPHABETS = [
  { id: 'hira', nom: 'Hiragana', exemple: 'あい', lecture: 'a i', promesse: 'Écrivez la lecture de chaque caractère.' },
  { id: 'kata', nom: 'Katakana', exemple: 'アイ', lecture: 'a i', promesse: 'Les mêmes sons, l’écriture des mots venus d’ailleurs.' },
  { id: 'deux', nom: 'Les deux mélangés', exemple: 'あア', lecture: 'a a', promesse: 'Hiragana et katakana dans la même partie.' },
];

/** Bonjour selon l'heure, avec sa lecture. */
function salutation(heure = new Date().getHours()) {
  if (heure >= 4 && heure < 11) return { jp: 'おはよう', romaji: 'ohayō', fr: 'Bonjour' };
  if (heure >= 11 && heure < 18) return { jp: 'こんにちは', romaji: 'konnichiwa', fr: 'Bonjour' };
  return { jp: 'こんばんは', romaji: 'konbanwa', fr: 'Bonsoir' };
}

/** Prénom affichable : seulement pour un vrai compte (pas le compte local sans connexion). */
function prenom() {
  const u = donnees().utilisateur;
  if (!u || !u.email || !u.nom) return '';
  const p = String(u.nom).trim().split(/\s+/)[0];
  return p.charAt(0).toUpperCase() + p.slice(1);
}

/** Le même mot toute la journée, différent chaque jour (parmi les mots qui ont un kanji et un kana). */
function motDuJour() {
  const candidats = donnees().mots.filter((m) => m.jp_kanji.length && m.jp_kana.length).sort((a, b) => a.id - b.id);
  if (!candidats.length) return null;
  const jour = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  return candidats[(jour * 7919) % candidats.length];
}

// Les cartes « Kanji » de l'accueil : un exemple, une teinte.
const CARTES_KANJI = [
  { id: 'sens', exemple: '水', fleche: 'eau', teinte: 'violet' },
  { id: 'lecture', exemple: '水', fleche: 'みず', teinte: 'bleu', jp: true },
  { id: 'choix', exemple: '水', fleche: 'eau', teinte: 'soleil', inverse: true },
];

/** Le groupe de kanjis des cartes : ceux des chapitres choisis, sinon la 1re année. */
function groupeKanjiAccueil() {
  return kanjisDuGroupe('choisis').length ? 'choisis' : '1';
}

/**
 * Où j'en suis, en quatre anneaux (le 4e, les kanjis, depuis le 26/10) (maquette de Manus, 25/10) : le vocabulaire
 * DES CHAPITRES COCHÉS (José, 25/10 : ni thème ni état, voir
 * motsDesChapitresCoches) et chaque alphabet (sans chapitres). Redessiné à
 * chaque changement de sélection : ce ne sont pas des boutons (règle n° 6).
 * Le premier <dd> porte le texte « N acquis sur M » (lu par le parcours), le
 * second l'anneau ; la grille les remet dans l'ordre visuel.
 */
function progression() {
  const { kana } = donnees();
  const mots = motsDesChapitresCoches();
  const lignes = toutesLesLignes().map((l) => l.id);
  // `acquis` : tout ce qui est su (acquis + à rafraîchir) ; l'anneau montre
  // à part la part « à rafraîchir », puis en cours, puis à revoir.
  const ligne = (nom, acquis, aRevoir, total, teinte, enCours = 0, aRafraichir = 0) => {
    const part = (x) => (total ? (x / total) * 100 : 0);
    const pctAcquis = Math.round(part(acquis));
    return `
    <div class="progres-ligne">
      <dt>${nom}</dt>
      <dd class="progres-texte"><b>${acquis.toLocaleString('fr-FR')}</b> acquis sur ${total.toLocaleString('fr-FR')}</dd>
      <dd class="anneau anneau-${teinte}" style="--part-acquis:${part(acquis - aRafraichir).toFixed(2)};--part-rafraichir:${part(aRafraichir).toFixed(2)};--part-encours:${part(enCours).toFixed(2)};--part-revoir:${part(aRevoir).toFixed(2)}" aria-hidden="true"><span>${pctAcquis}%</span></dd>
    </div>`;
  };
  const kanaLigne = (alphabet) => {
    const tous = caracteres(lignes, alphabet);
    const n = (etat) => tous.filter((c) => maitrise((kana || {})[c.glyphe]) === etat).length;
    return ligne(alphabet === 'hira' ? 'Hiragana' : 'Katakana', n('acquis'), n('a revoir'), tous.length, alphabet === 'hira' ? 'menthe' : 'corail');
  };
  const c = compterStatuts(mots);
  // Les kanjis des mêmes chapitres (vide : ceux de la 1re année).
  const groupe = groupeKanjiAccueil();
  const kanjis = kanjisDuGroupe(groupe);
  const k = compterKanjis(kanjis);
  return ligne('Mots <small>des chapitres choisis</small>', c.appris, c['a revoir'], mots.length, 'indigo', c['en cours'], c['a rafraichir'])
    + kanaLigne('hira') + kanaLigne('kata')
    + ligne(`Kanjis <small>${groupe === 'choisis' ? 'des chapitres choisis' : 'de 1re année'}</small>`, k.acquis, k['a revoir'], kanjis.length, 'violet', k['en cours']);
}

/**
 * L'exercice que conseille le grand bouton, selon l'état de la sélection
 * (revue du concepteur, 25/10) : on découvre un mot en le reconnaissant
 * (Paires), on retrouve ensuite son sens (Japonais → français), on l'acquiert
 * en le réussissant deux fois de suite (Français → japonais conseillé), et on
 * le rafraîchit quand il a été appris il y a longtemps. Rend
 * { id, mots, raison } ; id vaut 'paires' ou une clé de MODES. `dernier` sert
 * quand rien n'est à faire en priorité.
 */
export function exerciceConseille(choisis, dernier) {
  const de = (s, filtre = () => true) => choisis.filter((m) => statut(m) === s && filtre(m));
  const aRevoir = de('a revoir');
  const aRafraichir = de('a rafraichir');
  const reconnus = de('en cours', (m) => !(m.progression?.serie > 0));
  const enCours = de('en cours', (m) => m.progression?.serie > 0);
  const nouveaux = de('non acquis');
  const ecrire = (mots) => motsPourMode('fr-jp', mots);
  if (ecrire(aRevoir).length) {
    return { id: 'fr-jp', mots: aRevoir, raison: `${pluriel(aRevoir.length, 'mot')} à revoir : les écrire en japonais.` };
  }
  if (ecrire(aRafraichir).length) {
    return { id: 'fr-jp', mots: aRafraichir, raison: `${pluriel(aRafraichir.length, 'mot appris', 'mots appris')} il y a longtemps : les rafraîchir, les plus anciens d’abord.` };
  }
  if (reconnus.length) {
    return { id: 'jp-fr', mots: reconnus, raison: `${pluriel(reconnus.length, 'mot reconnu', 'mots reconnus')} : retrouver leur sens.` };
  }
  if (ecrire(enCours).length) {
    return { id: 'fr-jp', mots: enCours, raison: `${pluriel(enCours.length, 'mot')} en cours : encore une réussite de suite pour les acquérir.` };
  }
  if (nouveaux.length) {
    if (pairesPossibles(nouveaux) >= 2) return { id: 'paires', mots: nouveaux, raison: `${pluriel(nouveaux.length, 'mot nouveau', 'mots nouveaux')} : faire connaissance par les paires.` };
    return { id: 'jp-fr', mots: nouveaux, raison: `${pluriel(nouveaux.length, 'mot nouveau', 'mots nouveaux')} : les découvrir.` };
  }
  return { id: dernier, mots: choisis, raison: 'Rien à rafraîchir aujourd’hui : une révision pour consolider, les plus anciens d’abord.' };
}

/** La date du jour, en toutes lettres (« dimanche 25 octobre »). */
function dateDuJourEnLettres() {
  return new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Le mot mis en avant dans la carte « Votre priorité » : le premier à revoir, sinon le premier à découvrir. */
function motPrioritaire(mots) {
  const tries = [...mots].sort((a, b) => a.id - b.id);
  return tries.find((m) => statut(m) === 'a revoir') || tries.find((m) => statut(m) === 'a rafraichir')
    || tries.find((m) => statut(m) === 'non acquis') || tries[0] || null;
}

// Le surtitre et la teinte de chaque carte d'exercice (maquette de Manus).
const HABILLAGE = {
  'fr-jp': ['Rappel actif', 'indigo'],
  'jp-fr': ['Compréhension', 'violet'],
  dictee: ['Oreille', 'menthe'],
  'choix-lecture': ['Reconnaissance', 'violet'],
  'trous-kana': ['Précision', 'menthe'],
  'trous-kanji': ['Lecture', 'corail'],
  'lecture-kanji': ['Kanji', 'soleil'],
  transcription: ['Lecture des kanjis', 'bleu'],
};

/** L'exemple d'une carte : le japonais dans des cases, le français en toutes lettres. */
function exempleEnCases(morceaux) {
  return morceaux.map((m, i) => {
    const html = m.lang
      ? masu(m.texte.replace('＿', ' '), { taille: 'petit', trou: m.texte.indexOf('＿') })
      : `<span class="carte-fr">${echapper(m.texte)}</span>`;
    return i === 0 ? html : `${icone('suivant')}${html}`;
  }).join('');
}

export function afficher(racine) {
  const salut = salutation();
  const nom = prenom();
  const mdj = motDuJour();

  racine.innerHTML = `
    <div class="accueil">
      <header class="accueil-bienvenue">
        <span class="surtitre">${echapper(dateDuJourEnLettres())} · <span lang="ja">${salut.jp}</span> ${salut.romaji}</span>
        <h1 id="titre-accueil">${salut.fr}${nom ? ` ${echapper(nom)}` : ''},<br><em>on reprend doucement.</em></h1>
        <p class="accueil-etat" data-etat aria-live="polite"></p>
      </header>

      <section class="carte-priorite" aria-labelledby="titre-priorite">
        <div class="priorite-tete">
          <span class="surtitre surtitre-clair">Votre priorité</span>
          <span class="priorite-etiquette" data-priorite-etiquette></span>
        </div>
        <div class="priorite-corps">
          <div class="priorite-mot" aria-hidden="true">
            <span class="priorite-glyphe" lang="ja" data-priorite-glyphe></span>
            <span class="priorite-lecture" lang="ja" data-priorite-lecture></span>
          </div>
          <div class="priorite-texte">
            <h2 id="titre-priorite">Remettre les mots<br>à portée de mémoire.</h2>
            <p data-priorite-detail></p>
            <div class="accueil-lancer">
              <button type="button" class="bouton bouton-hero" data-rapide>
                ${icone('jouer')}<span class="bouton-hero-texte"><b data-rapide-titre></b><small data-rapide-detail></small></span>
              </button>
              <label class="champ champ-nombre-mots">
                <span class="champ-libelle">Mots à réviser</span>
                <input type="number" min="1" max="999" step="1" inputmode="numeric" value="${nombreAReviser()}" data-nombre-mots>
              </label>
            </div>
          </div>
        </div>
      </section>

      ${mdj ? `
      <aside class="mot-du-jour" aria-labelledby="titre-mdj">
        <span class="sceau" lang="ja" aria-hidden="true">今日</span>
        <h2 id="titre-mdj" class="surtitre">Le mot du jour</h2>
        <div class="mdj-cases">${masu(mdj.jp_kanji[0], { taille: 'grand' })}</div>
        <div class="mdj-reponse" data-mdj-reponse hidden>
          <p class="mdj-lecture" lang="ja">${echapper(mdj.jp_kana.join('、'))}</p>
          <p class="mdj-sens">${echapper(mdj.fr.join(', '))}</p>
          ${badgeStatut(statut(mdj))}
        </div>
        <button type="button" class="bouton-texte" data-mdj>${icone('oeil')}Voir la lecture et le sens</button>
      </aside>` : ''}

      <section class="bande-progres" aria-labelledby="titre-progres">
        <div class="bande-intro">
          <span class="surtitre" id="titre-progres">Votre progression</span>
          <strong>Un peu chaque jour vaut mieux qu'un grand soir.</strong>
        </div>
        <dl class="accueil-progres">${progression()}</dl>
      </section>

      <section class="accueil-exercices" aria-labelledby="titre-exercices">
        <div class="titre-section">
          <div><span class="surtitre">À portée de clic</span><h2 id="titre-exercices">Choisissez votre façon de réviser</h2></div>
          <p class="titre-section-note"><span data-resume></span> <a class="lien" href="#choix" data-vers-choix>Changer</a></p>
        </div>
        <div data-bandeau-migration></div>
        <h3 class="famille">Vocabulaire</h3>
        <div class="cartes" data-modes>
          ${GROUPES_MODES.flatMap((g) => g.modes).map((id) => `
            <button type="button" class="carte-exercice teinte-${(HABILLAGE[id] || ['', 'indigo'])[1]}" data-mode="${id}">
              <span class="carte-exemple">${exempleEnCases(MODES[id].exemple)}</span>
              <span class="carte-fleche" aria-hidden="true">${icone('suivant')}</span>
              <span class="surtitre">${echapper((HABILLAGE[id] || [''])[0])}</span>
              <span class="carte-nom">${echapper(MODES[id].nom)}</span>
              <span class="carte-promesse">${echapper(PROMESSES[id] || MODES[id].consigne)}</span>
              <span class="carte-nb" data-nb></span>
            </button>`).join('')}
          <button type="button" class="carte-exercice teinte-bleu" data-ecriture>
            <span class="carte-exemple">${masu('書', { taille: 'petit' })}${icone('suivant')}<span class="masu-ligne masu-petit" aria-hidden="true"><span class="masu masu-essai masu-faite">○</span><span class="masu masu-essai masu-faite">○</span><span class="masu masu-essai"></span></span></span>
            <span class="carte-fleche" aria-hidden="true">${icone('suivant')}</span>
            <span class="surtitre">Mémoire du geste</span>
            <span class="carte-nom">Écriture</span>
            <span class="carte-promesse">Écrire chaque mot trois fois de suite, sans faute.</span>
            <span class="carte-nb" data-nb></span>
          </button>
          <button type="button" class="carte-exercice teinte-violet" data-paires>
            <span class="carte-exemple"><span class="mini-tuile">eau</span><span class="mini-tuile" lang="ja">水</span><span class="mini-tuile" lang="ja">みず</span><span class="mini-tuile">feu</span></span>
            <span class="carte-fleche" aria-hidden="true">${icone('suivant')}</span>
            <span class="surtitre">Rapidité</span>
            <span class="carte-nom">Paires</span>
            <span class="carte-promesse">Chaque mot est écrit deux fois : glissez-le sur son autre écriture.</span>
            <span class="carte-nb" data-nb></span>
          </button>
        </div>
        <h3 class="famille">Alphabets</h3>
        <div class="cartes cartes-kana" data-alphabets>
          ${ALPHABETS.map((a) => `
            <button type="button" class="carte-exercice teinte-${a.id === 'hira' ? 'menthe' : a.id === 'kata' ? 'corail' : 'soleil'}" data-alphabet="${a.id}">
              <span class="carte-exemple">${masu(a.exemple, { taille: 'petit' })}${icone('suivant')}<span class="carte-fr">${a.lecture}</span></span>
              <span class="carte-fleche" aria-hidden="true">${icone('suivant')}</span>
              <span class="surtitre">Kana</span>
              <span class="carte-nom">${echapper(a.nom)}</span>
              <span class="carte-promesse">${echapper(a.promesse)}</span>
              <span class="carte-nb" data-nb></span>
              <span data-barre-kana></span>
            </button>`).join('')}
          <a class="carte-exercice carte-lien" href="#/kana">
            <span class="carte-exemple carte-exemple-tableau" lang="ja" aria-hidden="true"><span>あ</span><span>い</span><span>う</span><span>か</span><span>き</span><span>く</span></span>
            <span class="carte-nom">Le tableau des kana</span>
            <span class="carte-promesse">Tous les caractères et leur lecture, pour apprendre avant de jouer.</span>
          </a>
        </div>
        <h3 class="famille">Kanji</h3>
        <div class="cartes cartes-kana" data-cartes-kanji>
          ${CARTES_KANJI.map((c) => `
            <button type="button" class="carte-exercice teinte-${c.teinte}" data-kanji-exercice="${c.id}">
              <span class="carte-exemple">${c.inverse ? `<span class="carte-fr">${c.fleche}</span>${icone('suivant')}${masu(c.exemple, { taille: 'petit' })}` : `${masu(c.exemple, { taille: 'petit' })}${icone('suivant')}<span class="carte-fr"${c.jp ? ' lang="ja"' : ''}>${c.fleche}</span>`}</span>
              <span class="carte-fleche" aria-hidden="true">${icone('suivant')}</span>
              <span class="surtitre">Kanji</span>
              <span class="carte-nom">${echapper(EXERCICES_KANJI[c.id].nom)}</span>
              <span class="carte-promesse">${echapper(EXERCICES_KANJI[c.id].promesse)}</span>
              <span class="carte-nb" data-nb></span>
            </button>`).join('')}
          <a class="carte-exercice carte-lien" href="#/kanji">
            <span class="carte-exemple carte-exemple-tableau" lang="ja" aria-hidden="true"><span>日</span><span>本</span><span>人</span><span>山</span><span>川</span><span>木</span></span>
            <span class="carte-nom">Les kanjis</span>
            <span class="carte-promesse">Leur sens, leurs lectures, les mots qui les emploient.</span>
          </a>
        </div>
      </section>

      <section class="accueil-choix" id="choix" aria-labelledby="titre-choix">
        <div class="titre-section">
          <div><span class="surtitre">Votre sélection</span><h2 id="titre-choix">Quels mots réviser&nbsp;?</h2></div>
          <p class="titre-section-note">Touchez un chapitre pour l'ajouter ou le retirer. Ce choix suit votre compte, sur tous vos appareils.</p>
        </div>
        <div class="choix-grille">
          <div class="categories" data-categories></div>
          <div class="feuille panneau-selection" data-selection></div>
        </div>
      </section>
    </div>`;

  const { mots } = donnees();
  const zoneCategories = racine.querySelector('[data-categories]');
  const zoneSelection = racine.querySelector('[data-selection]');
  const zoneModes = racine.querySelector('[data-modes]');
  const boutonRapide = racine.querySelector('[data-rapide]');

  // ----- chapitres -------------------------------------------------------
  const rendreCategories = () => {
    zoneCategories.innerHTML = categoriesAvecChapitres().map((cat) => {
      const ids = cat.chapitres.map((c) => c.id);
      const motsCat = mots.filter((m) => m.chapitres.some((c) => ids.includes(c)));
      return `
        <section class="categorie">
          <div class="categorie-tete">
            <h3>${echapper(cat.nom)}</h3>
            <span class="compte">${pluriel(motsCat.length, 'mot')}</span>
            <span class="categorie-actions">
              <button type="button" class="lien" data-tout="${echapper(cat.nom)}">Tout</button>
              <button type="button" class="lien" data-aucun="${echapper(cat.nom)}">Aucun</button>
            </span>
            ${noteManuel(ids) ? `<p class="categorie-note">${echapper(noteManuel(ids))}</p>` : ''}
          </div>
          <div class="puces puces-chapitres">${cat.chapitres.map((c) => {
            const motsChap = mots.filter((m) => m.chapitres.includes(c.id));
            return `
              <button type="button" class="puce-chapitre" data-chapitre="${echapper(c.id)}" aria-pressed="${chapitreCoche(c.id)}"${pageManuelEnClair(c.id) ? ` title="${echapper(pageManuelEnClair(c.id))}"` : ''}>
                <span class="puce-ligne"><span class="puce-nom">${echapper(libelleChapitre(c.id))}</span><span class="puce-nb">${motsChap.length}</span></span>
                ${barreStatuts(motsChap)}
                ${icone('coche')}
              </button>`;
          }).join('')}</div>
        </section>`;
    }).join('');
  };

  zoneCategories.addEventListener('click', (e) => {
    const puce = e.target.closest('[data-chapitre]');
    if (puce) {
      const coche = puce.getAttribute('aria-pressed') !== 'true';
      puce.setAttribute('aria-pressed', String(coche));
      cocherChapitres([puce.dataset.chapitre], coche);
      return rendreSelection();
    }
    const groupe = e.target.closest('[data-tout], [data-aucun]');
    if (groupe) {
      const nomCat = groupe.dataset.tout ?? groupe.dataset.aucun;
      const cat = categoriesAvecChapitres().find((c) => c.nom === nomCat);
      cocherChapitres(cat.chapitres.map((c) => c.id), groupe.hasAttribute('data-tout'));
      rendreCategories();
      rendreSelection();
    }
    return undefined;
  });

  racine.querySelector('[data-vers-choix]').addEventListener('click', (e) => {
    e.preventDefault(); // l'ancre #choix casserait le routage par #/vue
    racine.querySelector('#choix').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  // ----- résumé de la sélection + filtres --------------------------------
  const f = filtres();
  const themes = thematiques();
  zoneSelection.innerHTML = `
    <div class="selection-total"><span class="selection-nombre" data-nombre></span><span data-libelle-nombre></span></div>
    <div data-barre></div>
    <ul class="legende" data-legende></ul>
    <div class="filtres">
      <label class="champ">
        <span class="champ-libelle">Thème</span>
        <select data-filtre="thematique">
          <option value="tous">Tous les thèmes</option>
          ${themes.map((t) => `<option value="${echapper(t)}"${t === f.thematique ? ' selected' : ''}>${echapper(majuscule(t))}</option>`).join('')}
        </select>
      </label>
      ${segments('statut', [['tous', 'Tous'], ['non acquis', 'Nouveaux'], ['en cours', 'En cours'], ['a revoir', 'À revoir'], ['acquis', 'Acquis'], ['a rafraichir', 'À rafraîchir']], f.statut, 'État')}
    </div>
    <button type="button" class="bouton bouton-secondaire bouton-large" data-liste>${icone('liste')}Voir la liste des mots</button>`;
  // Un thème enregistré qui n'existe plus (mots supprimés) : retour à « tous ».
  if (f.thematique !== 'tous' && !themes.includes(f.thematique)) ecrireFiltres({ ...f, thematique: 'tous' });

  const champNombre = racine.querySelector('[data-nombre-mots]');
  const lireFiltres = () => {
    const n = parseInt(champNombre.value, 10);
    ecrireFiltres({
      thematique: zoneSelection.querySelector('[data-filtre="thematique"]').value,
      statut: zoneSelection.querySelector('input[name="statut"]:checked')?.value || 'tous',
      // Vide pendant la saisie : on garde l'ancien nombre (le champ se remet au blur).
      limite: n > 0 ? String(n) : String(nombreAReviser()),
    });
    rendreSelection();
  };
  zoneSelection.addEventListener('change', lireFiltres);
  champNombre.addEventListener('input', lireFiltres);
  champNombre.addEventListener('change', () => { champNombre.value = nombreAReviser(); });

  // Le nombre de mots à réviser : la révision rapide, chaque carte, l'écriture.
  const limiteChoisie = () => nombreAReviser();
  const dernierMode = () => {
    const id = preference(CLE_DERNIER_MODE, 'jp-fr');
    return MODES[id] ? id : 'jp-fr';
  };

  // ⚠️ Tout ce qui suit MET À JOUR en place, sans reconstruire les boutons :
  // les reconstruire quand le champ « Mots par session » perd le focus
  // (événement change) avalait le clic sur l'exercice (CLAUDE.md, règle 6).
  const rendreSelection = () => {
    const choisis = motsSelectionnes();
    const c = compterStatuts(choisis);
    const nbChapitres = donnees().chapitres.filter((ch) => chapitreCoche(ch.id)).length;

    zoneSelection.querySelector('[data-nombre]').textContent = choisis.length.toLocaleString('fr-FR');
    zoneSelection.querySelector('[data-libelle-nombre]').textContent = choisis.length > 1 ? 'mots sélectionnés' : 'mot sélectionné';
    zoneSelection.querySelector('[data-barre]').innerHTML = barreStatuts(choisis, { grande: true });
    racine.querySelector('.accueil-progres').innerHTML = progression();
    { // les cartes « Kanji » suivent les chapitres choisis (compte mis à jour en place)
      const kanjis = kanjisDuGroupe(groupeKanjiAccueil());
      const nb = `${compterKanjis(kanjis).acquis} acquis sur ${kanjis.length}`;
      racine.querySelectorAll('[data-kanji-exercice] [data-nb]').forEach((n) => { n.textContent = nb; });
    }
    const prio = motPrioritaire(choisis);
    const glyphe = racine.querySelector('[data-priorite-glyphe]');
    glyphe.textContent = prio ? (prio.jp_kanji[0] || prio.jp_kana[0] || '') : '日';
    // La taille suit la longueur : un kanji seul s'affiche en grand, un mot long plus petit.
    glyphe.dataset.longueur = String(Math.min([...glyphe.textContent].length, 4));
    racine.querySelector('[data-priorite-lecture]').textContent = prio ? [prio.jp_kanji.length ? prio.jp_kana[0] : '', prio.fr[0]].filter(Boolean).join(' · ') : '';
    racine.querySelector('[data-priorite-etiquette]').textContent = pluriel(choisis.length, 'mot');
    const conseil = choisis.length ? exerciceConseille(choisis, dernierMode()) : null;
    racine.querySelector('[data-priorite-detail]').textContent = conseil ? conseil.raison : 'Choisissez au moins un chapitre plus bas.';
    zoneSelection.querySelector('[data-legende]').innerHTML = `
      <li><i class="pastille pastille-acquis"></i>Acquis<b>${c.acquis}</b></li>
      <li><i class="pastille pastille-a-rafraichir"></i>À rafraîchir<b>${c['a rafraichir']}</b></li>
      <li><i class="pastille pastille-en-cours"></i>En cours<b>${c['en cours']}</b></li>
      <li><i class="pastille pastille-a-revoir"></i>À revoir<b>${c['a revoir']}</b></li>
      <li><i class="pastille pastille-non-acquis"></i>Nouveaux<b>${c['non acquis']}</b></li>`;

    // En-tête : où j'en suis.
    const etat = racine.querySelector('[data-etat]');
    if (!choisis.length) etat.textContent = 'Aucun mot dans votre sélection : choisissez au moins un chapitre plus bas.';
    else if (!c['a revoir'] && !c['non acquis'] && !c['en cours'] && !c['a rafraichir']) etat.textContent = `Les ${pluriel(choisis.length, 'mot')} de votre sélection sont acquis : de quoi consolider.`;
    else {
      const morceaux = [];
      if (c['a revoir']) morceaux.push(`${pluriel(c['a revoir'], 'mot')} à revoir`);
      if (c['a rafraichir']) morceaux.push(`${c['a rafraichir'].toLocaleString('fr-FR')} à rafraîchir`);
      if (c['en cours']) morceaux.push(`${c['en cours'].toLocaleString('fr-FR')} en cours`);
      if (c['non acquis']) morceaux.push(`${c['non acquis'].toLocaleString('fr-FR')} à découvrir`);
      const fin = morceaux.pop();
      etat.textContent = `${morceaux.length ? `${morceaux.join(', ')} et ${fin}` : fin} dans votre sélection.`;
    }
    racine.querySelector('[data-resume]').textContent = choisis.length
      ? `Sur ${pluriel(choisis.length, 'mot')}, ${pluriel(nbChapitres, 'chapitre')}.`
      : 'Aucun mot sélectionné.';

    // Révision rapide : l'exercice conseillé (exerciceConseille).
    const idRapide = conseil ? conseil.id : dernierMode();
    boutonRapide.dataset.mode = idRapide;
    let nRapide = 0;
    if (idRapide === 'paires') nRapide = pairesPossibles(conseil.mots);
    else if (conseil) nRapide = Math.min(limiteChoisie(), motsPourMode(idRapide, choisis).length);
    boutonRapide.disabled = nRapide === 0;
    boutonRapide.querySelector('[data-rapide-titre]').textContent = !nRapide ? 'Rien à réviser'
      : idRapide === 'paires' ? `Jouer ${pluriel(nRapide, 'paire')}` : `Réviser ${pluriel(nRapide, 'mot')}`;
    boutonRapide.querySelector('[data-rapide-detail]').textContent = nRapide
      ? (idRapide === 'paires' ? 'Paires, les mots nouveaux' : MODES[idRapide].nom)
      : 'Choisissez des chapitres plus bas';

    // Cartes d'exercice.
    const limite = limiteChoisie();
    zoneModes.querySelectorAll('[data-mode]').forEach((b) => {
      const mode = MODES[b.dataset.mode];
      const n = motsPourMode(b.dataset.mode, choisis).length;
      const utilises = Math.min(limite, n);
      b.disabled = n === 0;
      b.classList.toggle('carte-dernier', b.dataset.mode === idRapide);
      b.querySelector('[data-nb]').textContent = n === 0
        ? (mode.disponible && !mode.disponible() ? mode.indisponible : mode.kanjiRequis ? 'aucun mot avec kanji' : 'aucun mot')
        : pluriel(utilises, 'mot');
    });
    const ecriture = zoneModes.querySelector('[data-ecriture]');
    const nEcriture = Math.min(limite, choisis.length);
    ecriture.disabled = nEcriture === 0;
    ecriture.querySelector('[data-nb]').textContent = nEcriture ? pluriel(nEcriture, 'mot') : 'aucun mot';
    const carteP = zoneModes.querySelector('[data-paires]');
    const nPaires = pairesPossibles(choisis);
    carteP.disabled = nPaires < 2;
    carteP.classList.toggle('carte-dernier', idRapide === 'paires');
    carteP.querySelector('[data-nb]').textContent = nPaires < 2 ? 'pas assez de mots' : pluriel(nPaires, 'paire');
  };

  // ----- lancer ----------------------------------------------------------
  boutonRapide.addEventListener('click', () => {
    const choisis = motsSelectionnes();
    const conseil = exerciceConseille(choisis, dernierMode());
    if (conseil.id === 'paires') return lancerPaires(conseil.mots);
    // Les mots du conseil d'abord, puis le reste de la sélection (tirerPrioritaires) pour compléter.
    const n = limiteChoisie();
    const premiers = tirerPrioritaires(motsPourMode(conseil.id, conseil.mots), n);
    const ids = new Set(premiers.map((m) => m.id));
    const complement = tirerPrioritaires(motsPourMode(conseil.id, choisis).filter((m) => !ids.has(m.id)), n - premiers.length);
    const tirage = [...premiers, ...complement];
    if (!tirage.length) return toast('Aucun mot ne correspond à cette sélection.', 'erreur');
    return lancerSession(conseil.id, tirage, 0);
  });

  zoneModes.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b) {
      const choisis = motsPourMode(b.dataset.mode, motsSelectionnes());
      if (!choisis.length) return toast('Aucun mot ne correspond à cette sélection.', 'erreur');
      ecrirePreference(CLE_DERNIER_MODE, b.dataset.mode);
      // Les mots à reprendre et ceux dont la révision est due d'abord.
      return lancerSession(b.dataset.mode, tirerPrioritaires(choisis, limiteChoisie()), 0);
    }
    if (e.target.closest('[data-paires]')) return lancerPaires(motsSelectionnes());
    if (e.target.closest('[data-ecriture]')) {
      const n = limiteChoisie();
      const tirage = tirerPrioritaires(motsSelectionnes(), n);
      if (!tirage.length) return toast('Aucun mot ne correspond à cette sélection.', 'erreur');
      return lancerEcriture(tirage.map((m) => m.id));
    }
    return undefined;
  });

  // Alphabets : compte des caractères acquis, et lancement direct.
  const lignes = toutesLesLignes().map((l) => l.id);
  const kanaStats = donnees().kana || {};
  racine.querySelectorAll('[data-alphabet]').forEach((b) => {
    const tous = caracteres(lignes, b.dataset.alphabet);
    const acquis = tous.filter((c) => maitrise(kanaStats[c.glyphe]) === 'acquis').length;
    const aRevoir = tous.filter((c) => maitrise(kanaStats[c.glyphe]) === 'a revoir').length;
    b.querySelector('[data-nb]').textContent = `${acquis} acquis sur ${tous.length}`;
    const part = (n) => `${((n / tous.length) * 100).toFixed(2)}%`;
    b.querySelector('[data-barre-kana]').innerHTML = `<span class="barre-statuts" aria-hidden="true"><i class="seg-acquis" style="width:${part(acquis)}"></i><i class="seg-a-revoir" style="width:${part(aRevoir)}"></i></span>`;
  });
  racine.querySelector('[data-alphabets]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-alphabet]');
    if (b) lancerJeuKana({ ...reglagesJeu(), alphabet: b.dataset.alphabet });
  });

  // Kanji : le groupe des chapitres choisis (ou la 1re année), lancé d'un toucher
  // (le compte des cartes est tenu par rendreSelection).
  racine.querySelector('[data-cartes-kanji]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-kanji-exercice]');
    if (b) lancerJeuKanji({ ...reglagesJeuKanji(), exercice: b.dataset.kanjiExercice, groupe: groupeKanjiAccueil() });
  });

  racine.querySelector('[data-liste]').addEventListener('click', () => {
    if (!motsSelectionnes().length) return toast('Aucun mot ne correspond à cette sélection.', 'erreur');
    return naviguer('liste');
  });

  // Mot du jour : la lecture et le sens se découvrent d'un toucher.
  const boutonMdj = racine.querySelector('[data-mdj]');
  if (boutonMdj) {
    boutonMdj.addEventListener('click', () => {
      racine.querySelector('[data-mdj-reponse]').hidden = false;
      boutonMdj.remove();
    });
  }

  rendreCategories();
  rendreSelection();
  // La voix japonaise arrive en retard (son.js) : la carte de la dictée se
  // réveille quand elle est là. Mise à jour en place (règle n° 6).
  const accueil = racine.querySelector('.accueil');
  quandVoixPretes().then((ok) => { if (ok && accueil.isConnected) rendreSelection(); });
  afficherBandeauMigration(racine.querySelector('[data-bandeau-migration]'));
}

/**
 * Données de l'ancienne version trouvées dans CE navigateur et pas encore
 * importées : on le dit, et le bouton les importe sur place (l'écran
 * « Données », qui le faisait avant, n'existe plus).
 */
async function afficherBandeauMigration(zone) {
  if (migrationDejaFaite()) return;
  const anciennes = await detecterAnciennesDonnees();
  if (!anciennes || (!anciennes.motsPerso.length && !anciennes.progression.length && !anciennes.chapitresPerso.length)) return;
  const travailles = anciennes.progression.filter((p) => p.statut && p.statut !== 'non acquis').length;
  zone.innerHTML = `
    <div class="bandeau">
      ${icone('navigateur')}
      <p>Ce navigateur contient des données de l'ancienne version : ${pluriel(anciennes.motsPerso.length, 'mot ajouté', 'mots ajoutés')} et ${pluriel(travailles, 'mot travaillé', 'mots travaillés')}. Importez-les dans la base pour les retrouver sur tous vos appareils.</p>
      <button type="button" class="bouton bouton-principal" data-importer-v1>${icone('envoyer')}Importer dans la base</button>
    </div>`;
  const bouton = zone.querySelector('[data-importer-v1]');
  bouton.addEventListener('click', async () => {
    bouton.disabled = true; // (pas e.currentTarget : il vaut null après un await)
    const bilan = await importerAncienneVersion(anciennes);
    // Réussi : l'accueil se redessine avec les mots repris (le bandeau ne revient
    // pas, la reprise est notée dans les préférences du compte).
    if (bilan) naviguer('reviser');
    else bouton.disabled = false;
  });
}
