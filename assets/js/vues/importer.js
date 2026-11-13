// « Importer des mots » (#/importer, 23/10/2026) : une page qui s'explique
// d'elle-même, en trois étapes.
//   1. Préparer la liste — un texte à donner à une IA (quelques champs à
//      remplir : sujet, nombre, précisions, thème), ou le format à la main ;
//   2. La coller (ou choisir un fichier .json) — lue et vérifiée tout de
//      suite : combien de mots prêts, lesquels sont incomplets et pourquoi,
//      lesquels existent déjà, un aperçu ;
//   3. La ranger — toujours dans « Mes mots » (imposé aussi par le serveur),
//      et dans les chapitres du compte choisis, ou un nouveau chapitre.
// L'envoi passe par `import.mots` (Depot::importerMots).

import { appeler } from '../api.js';
import { donnees, recharger, estAdmin, chapitreMesMots, chapitresDuCompte, cocherSeulement } from '../etat.js';
import { naviguer } from '../routeur.js';
import { choisirFichierTexte, echapper, libelleChapitre, majuscule, normaliser, pluriel, telechargerJson } from '../utils.js';
import { icone } from '../icones.js';
import { segments } from '../composants.js';
import { tenter, toast } from '../ui.js';
import { appliquerProgression, exporterMots, mesMots } from '../echanges.js';

const MAX_MOTS = 5000; // Depot::MAX_LOT
const KANA = /^[぀-ゟ゠-ヿㇰ-ㇿー・〜～\s、。！？!?（）()]+$/u;

// ---------------------------------------------------------------------
// Le texte à donner à une IA
// ---------------------------------------------------------------------

/** Les morceaux du texte : `{ t }` texte fixe, `{ v, vide }` valeur d'un champ (surlignée). */
function morceauxPrompt({ sujet, nombre, precisions, theme }) {
  const champ = (v, vide) => ({ v: String(v || '').trim(), vide });
  return [
    { t: 'Tu es professeur de japonais. Prépare une liste de vocabulaire japonais pour une application de révision.\n\nSujet : ' },
    champ(sujet, '[votre sujet]'),
    { t: '\nNombre de mots : environ ' },
    champ(nombre, '30'),
    ...(String(precisions || '').trim() ? [{ t: '\nPrécisions : ' }, champ(precisions, '')] : []),
    { t: `

Réponds UNIQUEMENT avec du JSON valide, sans aucun texte avant ni après, de cette forme :
{
  "mots": [
    {
      "fr": ["le sens en français"],
      "kanji": ["l'écriture en kanji, s'il y en a une"],
      "kana": ["la lecture en hiragana ou en katakana"],
      "romaji": ["la lecture en rōmaji (Hepburn)"],
      "contexte": "une précision courte, ou une chaîne vide",
      "thematiques": ["` },
    champ(theme, 'un thème'),
    { t: `"]
    }
  ]
}

Règles :
- "fr" est obligatoire, ainsi que "kanji" ou "kana" (au moins l'un des deux).
- Un mot qui ne s'écrit pas en kanji (un nom en katakana, par exemple) : "kanji": [].
- Dans chaque liste, la forme la plus courante en premier ; d'autres variantes seulement si elles sont vraiment usitées.
- "kana" ne contient que des kana (pas de rōmaji, pas de kanji).
- Vérifie chaque lecture ; pas de mot inventé, pas de doublon.

Exemple de deux éléments :
{ "fr": ["chat"], "kanji": ["猫"], "kana": ["ねこ"], "romaji": ["neko"], "contexte": "", "thematiques": ["animal"] }
{ "fr": ["Pikachu"], "kanji": [], "kana": ["ピカチュウ"], "romaji": ["Pikachū"], "contexte": "Pokémon n° 25", "thematiques": ["pokémon"] }` },
  ];
}

export function textePrompt(valeurs) {
  return morceauxPrompt(valeurs).map((m) => ('t' in m ? m.t : (m.v || m.vide))).join('');
}

function htmlPrompt(valeurs) {
  return morceauxPrompt(valeurs).map((m) => ('t' in m
    ? echapper(m.t)
    : `<mark class="${m.v ? '' : 'a-remplir'}">${echapper(m.v || m.vide)}</mark>`)).join('');
}

// ---------------------------------------------------------------------
// Lire ce qui est collé : tolérant sur la forme, précis sur les erreurs
// ---------------------------------------------------------------------

function liste(v) {
  if (v === undefined || v === null) return [];
  const brut = Array.isArray(v) ? v : (typeof v === 'string' ? v.split('&&') : [v]);
  return [...new Set(brut.filter((x) => typeof x === 'string' || typeof x === 'number').map((x) => String(x).trim()).filter(Boolean))];
}

function premier(e, ...cles) {
  const cle = cles.find((c) => e[c] !== undefined && e[c] !== null);
  return cle === undefined ? undefined : e[cle];
}

function signature(fr, kana, kanji) {
  const prep = (l, min) => [...l].map((v) => (min ? v.trim().toLowerCase() : v.trim())).sort();
  return JSON.stringify([prep(fr, true), prep(kana, false), prep(kanji, false)]);
}

/**
 * Lit le texte collé (réponse d'IA, fichier) : accepte les « ```json »
 * autour, du texte avant ou après, un tableau seul ou { "mots": [...] },
 * les noms de champs « humains » (kanji, kana, romaji, contexte, themes) et
 * ceux des exports (jp_kanji, jp_kana, jp_romaji, context, thematiques).
 * @returns {{ erreur?: string, mots?: object[], problemes?: {n:number, quoi:string}[], avertissements?: {n:number, quoi:string}[], doublons?: number, deja?: number }}
 */
export function lireListe(texte, themeParDefaut = '') {
  let t = String(texte || '').trim();
  if (!t) return {};
  t = t.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
  const debut = t.search(/[[{]/);
  const fin = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (debut === -1 || fin < debut) return { erreur: 'Aucune liste trouvée : le texte doit contenir du JSON, qui commence par { ou [.' };
  let donneesLues;
  try {
    donneesLues = JSON.parse(t.slice(debut, fin + 1));
  } catch (e) {
    return { erreur: `Ce n'est pas du JSON valide (${e.message}). Souvent : une virgule en trop ou un guillemet manquant. Redemandez à l'IA « uniquement du JSON valide ».` };
  }
  // Les deux autres fichiers de Nihonjo : on les reconnaît au lieu d'y lire des mots.
  if (donneesLues && donneesLues.type === 'nihonjo_progression' && Array.isArray(donneesLues.donnees)) {
    return { progression: donneesLues.donnees };
  }
  if (donneesLues && donneesLues.format === 'nihonjo_sauvegarde') {
    return { erreur: estAdmin()
      ? 'Ce fichier est une sauvegarde complète de la base : elle se restaure depuis le menu du compte (« Sauvegarde complète… »), pas ici.'
      : 'Ce fichier est une sauvegarde complète de la base : seul un administrateur peut la restaurer.' };
  }
  let entrees = Array.isArray(donneesLues) ? donneesLues : null;
  if (!entrees && donneesLues && typeof donneesLues === 'object') {
    entrees = Array.isArray(donneesLues.mots) ? donneesLues.mots
      : Object.values(donneesLues).find((v) => Array.isArray(v) && v.some((x) => x && typeof x === 'object'));
  }
  if (!entrees) return { erreur: 'Le JSON ne contient pas de liste de mots : il faut { "mots": [ … ] }.' };
  if (entrees.length > MAX_MOTS) return { erreur: `${entrees.length.toLocaleString('fr-FR')} mots : c'est plus que les ${MAX_MOTS.toLocaleString('fr-FR')} acceptés d'un coup. Coupez la liste.` };

  const existants = new Set(donnees().mots.map((m) => signature(m.fr, m.jp_kana, m.jp_kanji)));
  const vus = new Set();
  const mots = [];
  const problemes = [];
  const avertissements = [];
  let doublons = 0;
  let deja = 0;
  entrees.forEach((e, i) => {
    const n = i + 1;
    if (!e || typeof e !== 'object' || Array.isArray(e)) { problemes.push({ n, quoi: 'ce n’est pas un mot (un objet { … } attendu)' }); return; }
    const mot = {
      fr: liste(premier(e, 'fr', 'francais', 'français', 'sens')),
      jp_kanji: liste(premier(e, 'jp_kanji', 'kanji')),
      jp_kana: liste(premier(e, 'jp_kana', 'kana', 'hiragana', 'katakana')),
      jp_romaji: liste(premier(e, 'jp_romaji', 'romaji', 'rōmaji')),
      context: String(premier(e, 'context', 'contexte') ?? '').trim(),
      thematiques: liste(premier(e, 'thematiques', 'themes', 'thèmes', 'theme', 'thème')).map((x) => x.toLowerCase()),
      chapitres: liste(e.chapitres),
    };
    if (!mot.fr.length) { problemes.push({ n, quoi: 'il manque le français (« fr »)' }); return; }
    if (!mot.jp_kanji.length && !mot.jp_kana.length) { problemes.push({ n, quoi: `« ${mot.fr[0]} » : il faut des kana ou des kanji` }); return; }
    if (mot.jp_kana.some((k) => !KANA.test(k))) avertissements.push({ n, quoi: `« ${mot.fr[0]} » : le champ kana contient autre chose que des kana (${mot.jp_kana.join(', ')})` });
    if (!mot.thematiques.length && themeParDefaut.trim()) mot.thematiques = [themeParDefaut.trim().toLowerCase()];
    const sig = signature(mot.fr, mot.jp_kana, mot.jp_kanji);
    if (vus.has(sig)) { doublons++; return; }
    vus.add(sig);
    if (existants.has(sig)) deja++;
    mots.push(mot);
  });
  return { mots, problemes, avertissements, doublons, deja };
}

// ---------------------------------------------------------------------
// L'écran
// ---------------------------------------------------------------------

export function afficher(racine) {
  const admin = estAdmin();
  const etat = { cible: 'perso', choisis: new Set(), lu: {}, enCours: false };
  const valeurs = { sujet: '', nombre: '30', precisions: '', theme: '' };

  racine.innerHTML = `
    <div class="importer">
      <a class="lien-retour" href="#/lexique">${icone('retour')}Lexique</a>
      <header class="entete-vue">
        <h1>Importer des mots</h1>
        <p class="sous-titre">Ajoutez d'un coup toute une liste à votre compte : une page de votre manuel, un thème qui vous plaît, les Pokémon de la première génération… Trois étapes, et les mots sont à réviser.</p>
      </header>

      <ol class="etapes-import">
        <li class="feuille etape">
          <h2><span class="etape-numero" aria-hidden="true">1</span>Préparez la liste</h2>
          <p class="etape-aide">Le plus simple : la demander à une IA (ChatGPT, Claude, Gemini…). Remplissez ces champs : le texte se complète. Copiez-le, collez-le dans l'IA, puis revenez à l'étape 2 avec sa réponse.</p>
          <div class="grille-formulaire grille-prompt">
            <label class="champ champ-plein"><span class="champ-libelle">Sujet de la liste</span>
              <input type="text" data-valeur="sujet" placeholder="les 151 Pokémon de la première génération"></label>
            <label class="champ"><span class="champ-libelle">Nombre de mots</span>
              <input type="number" min="1" max="${MAX_MOTS}" inputmode="numeric" data-valeur="nombre" value="30"></label>
            <label class="champ"><span class="champ-libelle">Thème donné à chaque mot</span>
              <input type="text" data-valeur="theme" placeholder="pokémon"></label>
            <label class="champ champ-plein"><span class="champ-libelle">Précisions (facultatif)</span>
              <input type="text" data-valeur="precisions" placeholder="leur nom japonais officiel, et leur numéro dans le contexte"></label>
          </div>
          <div class="prompt-ia">
            <pre class="prompt-texte" data-prompt tabindex="0" aria-label="Texte à donner à l'IA"></pre>
            <button type="button" class="bouton bouton-principal" data-copier>${icone('copier')}Copier le texte pour l'IA</button>
          </div>
          <details class="format-import">
            <summary>Ou écrire la liste soi-même : le format</summary>
            <p>Un fichier (ou un texte) JSON : <code>{ "mots": [ … ] }</code>, un objet par mot.</p>
            <table class="tableau-format">
              <thead><tr><th>champ</th><th>ce qu'il contient</th><th></th></tr></thead>
              <tbody>
                <tr><td><code>fr</code></td><td>le ou les sens en français ; le premier est posé en question</td><td>obligatoire</td></tr>
                <tr><td><code>kanji</code></td><td>l'écriture en kanji (<code>[]</code> s'il n'y en a pas)</td><td rowspan="2">au moins l'un des deux</td></tr>
                <tr><td><code>kana</code></td><td>la lecture en hiragana ou katakana</td></tr>
                <tr><td><code>romaji</code></td><td>la lecture en lettres latines</td><td>facultatif</td></tr>
                <tr><td><code>contexte</code></td><td>une précision (« registre familier »)</td><td>facultatif</td></tr>
                <tr><td><code>thematiques</code></td><td>un ou plusieurs thèmes, pour filtrer</td><td>facultatif</td></tr>
              </tbody>
            </table>
            <p>Chaque champ peut être une liste (<code>["thé", "thé vert"]</code>) ou un simple texte. Les fichiers exportés par Nihonjo (« Exporter mes mots », en bas de cette page, ou « Exporter ce chapitre ») s'importent aussi, avec leurs chapitres. Un fichier de progression de l'ancienne version (« ma_progression_nihonjo_… ») est reconnu : sa progression s'applique à vos mots.</p>
            <button type="button" class="bouton bouton-secondaire bouton-petit" data-modele>${icone('telecharger')}Télécharger un modèle</button>
          </details>
        </li>

        <li class="feuille etape">
          <h2><span class="etape-numero" aria-hidden="true">2</span>Donnez-la à Nihonjo</h2>
          <p class="etape-aide">Collez ici la réponse de l'IA telle quelle (même avec du texte autour), ou choisissez un fichier <code>.json</code>. La liste est vérifiée tout de suite.</p>
          <textarea class="champ-json" data-json rows="7" spellcheck="false" placeholder='{ "mots": [ { "fr": ["chat"], "kanji": ["猫"], "kana": ["ねこ"] } ] }' aria-label="Liste de mots au format JSON"></textarea>
          <div class="actions actions-gauche">
            <button type="button" class="bouton bouton-secondaire" data-fichier>${icone('importer')}Choisir un fichier…</button>
            <button type="button" class="bouton bouton-discret" data-effacer>Effacer</button>
          </div>
          <div class="verdict" data-verdict aria-live="polite"></div>
        </li>

        <li class="feuille etape">
          <h2><span class="etape-numero" aria-hidden="true">3</span>Rangez-les et importez</h2>
          ${admin ? segments('cible', [['perso', 'Dans mon compte'], ['cours', 'Dans le cours (tous les comptes)']], 'perso', 'Où') : ''}
          <p class="etape-aide" data-aide-chapitres></p>
          <div class="puces puces-compactes" data-chapitres role="group" aria-label="Chapitres où ranger les mots"></div>
          <label class="champ champ-nouveau-import"><span class="champ-libelle">Et dans un nouveau chapitre (facultatif)</span>
            <input type="text" data-nouveau placeholder="Pokémon 1G"></label>
          <div class="actions actions-gauche">
            <button type="button" class="bouton bouton-principal bouton-hero" data-importer disabled>${icone('importer')}<span class="bouton-hero-texte"><b data-libelle-importer>Importer</b><small data-detail-importer>Collez d'abord une liste à l'étape 2</small></span></button>
          </div>
          <div data-resultat></div>
        </li>
      </ol>

      <section class="feuille export-mots" aria-labelledby="titre-export">
        <p><strong id="titre-export">Dans l'autre sens.</strong> Téléchargez vos mots — ceux que vous avez ajoutés, et ceux du cours rangés dans vos chapitres — dans ce même format : pour les garder, les donner à quelqu'un, ou les retravailler avec une IA.</p>
        <button type="button" class="bouton bouton-secondaire" data-exporter-mots>${icone('telecharger')}Exporter mes mots</button>
      </section>
    </div>`;

  const $ = (sel) => racine.querySelector(sel);
  const zoneJson = $('[data-json]');

  // ----- étape 1 : le texte pour l'IA ------------------------------------
  const rendrePrompt = () => { $('[data-prompt]').innerHTML = htmlPrompt(valeurs); };
  racine.querySelectorAll('[data-valeur]').forEach((champ) => champ.addEventListener('input', () => {
    valeurs[champ.dataset.valeur] = champ.value;
    rendrePrompt();
    if (champ.dataset.valeur === 'theme') verifier(); // le thème par défaut change l'aperçu
    if (champ.dataset.valeur === 'sujet' && !$('[data-nouveau]').dataset.touche) {
      $('[data-nouveau]').placeholder = champ.value.trim() ? majuscule(champ.value.trim()).slice(0, 60) : 'Pokémon 1G';
    }
  }));
  $('[data-copier]').addEventListener('click', async () => {
    const texte = textePrompt(valeurs);
    try {
      await navigator.clipboard.writeText(texte);
      toast(valeurs.sujet.trim() ? 'Texte copié : collez-le dans l’IA.' : 'Texte copié. Pensez à remplacer « [votre sujet] ».', 'succes');
    } catch {
      // Presse-papiers refusé (page non sécurisée, navigateur ancien) : sélectionner le texte.
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents($('[data-prompt]'));
      sel.removeAllRanges();
      sel.addRange(r);
      toast('Copie automatique impossible : le texte est sélectionné, copiez-le (Ctrl+C).', 'erreur', 6000);
    }
  });
  $('[data-modele]').addEventListener('click', () => telechargerJson('modele_import_nihonjo.json', {
    mots: [
      { fr: ['chat'], kanji: ['猫'], kana: ['ねこ'], romaji: ['neko'], contexte: '', thematiques: ['animal'] },
      { fr: ['Pikachu'], kanji: [], kana: ['ピカチュウ'], romaji: ['Pikachū'], contexte: 'Pokémon n° 25', thematiques: ['pokémon'] },
    ],
  }));

  // ----- étape 2 : lire et vérifier --------------------------------------
  const verifier = () => {
    etat.lu = lireListe(zoneJson.value, valeurs.theme);
    rendreVerdict();
    majBouton();
  };
  const rendreVerdict = () => {
    const v = $('[data-verdict]');
    const { erreur, mots, progression, problemes = [], avertissements = [], doublons = 0, deja = 0 } = etat.lu;
    zoneJson.classList.toggle('champ-faux', Boolean(erreur));
    if (erreur) {
      v.innerHTML = `<p class="verdict-ligne verdict-erreur">${icone('croix')}${echapper(erreur)}</p>`;
      return;
    }
    if (progression) {
      const travailles = progression.filter((e) => e && ['acquis', 'a revoir'].includes(e.etat)).length;
      v.innerHTML = `
        <p class="verdict-ligne verdict-ok">${icone('coche')}<b>Ce fichier est une progression de l'ancienne version</b> : ${pluriel(travailles, 'mot travaillé', 'mots travaillés')}. Elle s'applique aux mots de Nihonjo qui leur correspondent, sans jamais faire reculer un mot (un « acquis » reste acquis).</p>
        <div class="actions actions-gauche"><button type="button" class="bouton bouton-principal" data-appliquer-progression>${icone('coche')}Appliquer à mes mots</button></div>`;
      v.querySelector('[data-appliquer-progression]').addEventListener('click', (e) => {
        e.currentTarget.disabled = true;
        tenter(async () => {
          const r = await appliquerProgression(progression);
          v.innerHTML = `<p class="verdict-ligne verdict-ok">${icone('coche')}<b>Progression appliquée</b> : ${pluriel(r.acquis, 'nouvel acquis', 'nouveaux acquis')}, ${r.a_revoir} « à revoir » en plus${r.introuvables ? `, ${pluriel(r.introuvables, 'mot introuvable', 'mots introuvables')} dans Nihonjo` : ''}.</p>`;
        });
      });
      return;
    }
    if (!mots) { v.innerHTML = ''; return; }
    const lignes = [];
    lignes.push(mots.length
      ? `<p class="verdict-ligne verdict-ok">${icone('coche')}<b>${pluriel(mots.length, 'mot prêt', 'mots prêts')}</b>${deja ? `, dont ${deja} déjà dans Nihonjo (ils seront seulement rangés dans vos chapitres)` : ''}.</p>`
      : '<p class="verdict-ligne verdict-erreur">' + icone('croix') + 'Aucun mot utilisable dans cette liste.</p>');
    if (doublons) lignes.push(`<p class="verdict-ligne">${pluriel(doublons, 'doublon retiré', 'doublons retirés')} (même sens, mêmes kana et kanji).</p>`);
    const detail = (titre, items, classe) => (items.length ? `
      <details class="verdict-detail ${classe}"${items.length <= 3 ? ' open' : ''}><summary>${titre}</summary>
        <ul>${items.slice(0, 20).map((p) => `<li>n° ${p.n} : ${echapper(p.quoi)}</li>`).join('')}${items.length > 20 ? `<li>… et ${items.length - 20} autres</li>` : ''}</ul>
      </details>` : '');
    lignes.push(detail(`${pluriel(problemes.length, 'élément ignoré', 'éléments ignorés')}`, problemes, 'verdict-ignores'));
    lignes.push(detail(`${pluriel(avertissements.length, 'point à vérifier', 'points à vérifier')} (importés quand même)`, avertissements, 'verdict-avertis'));
    if (mots.length) {
      lignes.push(`
        <table class="tableau-apercu">
          <caption>Aperçu</caption>
          <thead><tr><th>Français</th><th>Japonais</th><th>Rōmaji</th><th>Thèmes</th></tr></thead>
          <tbody>${mots.slice(0, 6).map((m) => `
            <tr><td>${echapper(m.fr.join(', '))}${m.context ? `<span class="contexte">${echapper(m.context)}</span>` : ''}</td>
              <td><span class="jp-principal" lang="ja">${echapper(m.jp_kanji[0] || m.jp_kana[0])}</span>${m.jp_kanji.length && m.jp_kana.length ? `<span class="jp-lecture" lang="ja">${echapper(m.jp_kana.join('、'))}</span>` : ''}</td>
              <td>${echapper(m.jp_romaji.join(', '))}</td>
              <td>${m.thematiques.map((t) => `<span class="etiquette etiquette-lecture">${echapper(majuscule(t))}</span>`).join('')}</td></tr>`).join('')}
          </tbody>
        </table>
        ${mots.length > 6 ? `<p class="apercu-suite">… et ${pluriel(mots.length - 6, 'autre mot', 'autres mots')}.</p>` : ''}`);
    }
    v.innerHTML = lignes.join('');
  };
  let delai = null;
  zoneJson.addEventListener('input', () => { clearTimeout(delai); delai = setTimeout(verifier, 250); });
  $('[data-fichier]').addEventListener('click', () => tenter(async () => {
    const texte = await choisirFichierTexte('.json,application/json,text/plain');
    if (texte === null) return;
    zoneJson.value = texte;
    verifier();
  }));
  $('[data-effacer]').addEventListener('click', () => { zoneJson.value = ''; verifier(); zoneJson.focus(); });

  // ----- étape 3 : où ranger, et importer ---------------------------------
  const rendreChapitres = () => {
    const surLeCours = etat.cible === 'cours';
    const mesMots = chapitreMesMots();
    const proposes = surLeCours
      ? donnees().chapitres.filter((c) => c.origine === 'cours')
      : chapitresDuCompte().filter((c) => c !== mesMots);
    $('[data-aide-chapitres]').textContent = surLeCours
      ? 'Les mots iront dans le cours, visibles par tous les comptes. Choisissez au moins un chapitre du cours, ou créez-en un.'
      : 'Ils vont toujours dans « Mes mots ». Rangez-les aussi dans vos autres chapitres, si vous voulez :';
    $('[data-chapitres]').innerHTML = [
      surLeCours ? '' : `<button type="button" class="puce puce-verrouillee" aria-pressed="true" aria-disabled="true" title="Tous vos mots y sont, toujours">${icone('cadenas')}${echapper(libelleChapitre(mesMots ? mesMots.id : 'mes_mots'))}</button>`,
      ...proposes.map((c) => `<button type="button" class="puce" aria-pressed="${etat.choisis.has(c.id)}" data-chapitre="${echapper(c.id)}">${echapper(libelleChapitre(c.id))}</button>`),
    ].join('') || '<span class="discret">Aucun chapitre : donnez un nom ci-dessous pour en créer un.</span>';
  };
  $('[data-chapitres]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-chapitre]');
    if (!b) return;
    const id = b.dataset.chapitre;
    if (etat.choisis.has(id)) etat.choisis.delete(id); else etat.choisis.add(id);
    b.setAttribute('aria-pressed', String(etat.choisis.has(id)));
    majBouton();
  });
  racine.querySelector('.etape [name="cible"]')?.closest('fieldset')?.addEventListener('change', (e) => {
    etat.cible = e.target.value;
    etat.choisis.clear();
    rendreChapitres();
    majBouton();
  });
  $('[data-nouveau]').addEventListener('input', (e) => { e.target.dataset.touche = '1'; majBouton(); });

  const majBouton = () => {
    const b = $('[data-importer]');
    const n = etat.lu.mots?.length || 0;
    const nouveau = $('[data-nouveau]').value.trim();
    const coursSansChapitre = etat.cible === 'cours' && !etat.choisis.size && !nouveau;
    b.disabled = etat.enCours || !n || coursSansChapitre;
    $('[data-libelle-importer]').textContent = n ? `Importer ${pluriel(n, 'mot')}` : 'Importer';
    const ou = etat.cible === 'cours'
      ? [...[...etat.choisis].map(libelleChapitre), ...(nouveau ? [nouveau] : [])]
      : ['Mes mots', ...[...etat.choisis].map(libelleChapitre), ...(nouveau ? [nouveau] : [])];
    $('[data-detail-importer]').textContent = etat.lu.progression ? 'Ce fichier est une progression : appliquez-la à l’étape 2'
      : !n ? 'Collez d’abord une liste à l’étape 2'
      : coursSansChapitre ? 'Choisissez un chapitre du cours'
        : `Dans ${ou.map((x) => `« ${x} »`).join(', ')}`;
  };

  $('[data-importer]').addEventListener('click', async () => {
    const { mots } = etat.lu;
    if (!mots?.length || etat.enCours) return;
    etat.enCours = true;
    majBouton();
    const nouveau = $('[data-nouveau]').value.trim();
    try {
      const r = await appeler('import.mots', {
        mots,
        mode: 'ajouter',
        cible: etat.cible,
        chapitres: [...etat.choisis],
        nouveau_chapitre: nouveau,
      });
      await recharger();
      rendreResultat(r);
      toast(`${pluriel(r.crees + r.fusionnes, 'mot importé', 'mots importés')}.`, 'succes');
    } catch (e) {
      toast(e.message, 'erreur', 7000);
    } finally {
      etat.enCours = false;
      majBouton();
    }
  });

  const rendreResultat = (r) => {
    const chapitreCree = r.chapitre;
    const cleRevision = chapitreCree || (etat.cible === 'cours' ? [...etat.choisis][0] : chapitreMesMots()?.id);
    const zone = $('[data-resultat]');
    zone.innerHTML = `
      <div class="resultat-import">
        <p class="verdict-ligne verdict-ok">${icone('coche')}<b>Import terminé.</b>
          ${pluriel(r.crees, 'nouveau mot', 'nouveaux mots')}, ${pluriel(r.fusionnes, 'déjà présent rangé', 'déjà présents rangés')}${r.ignores ? `, ${pluriel(r.ignores, 'ignoré', 'ignorés')}` : ''}.</p>
        <div class="actions actions-gauche">
          ${cleRevision ? `<button type="button" class="bouton bouton-principal" data-reviser>${icone('jouer')}Réviser ${chapitreCree ? `« ${echapper(libelleChapitre(chapitreCree))} »` : 'ces mots'}</button>` : ''}
          ${cleRevision ? `<button type="button" class="bouton bouton-secondaire" data-gerer>${icone('dossier')}Gérer le chapitre</button>` : ''}
          <button type="button" class="bouton bouton-discret" data-autre>Importer une autre liste</button>
        </div>
      </div>`;
    zone.querySelector('[data-reviser]')?.addEventListener('click', () => { cocherSeulement([cleRevision]); naviguer('reviser'); });
    zone.querySelector('[data-gerer]')?.addEventListener('click', () => { location.hash = `#/chapitres?chapitre=${encodeURIComponent(cleRevision)}`; });
    zone.querySelector('[data-autre]').addEventListener('click', () => {
      zoneJson.value = '';
      $('[data-nouveau]').value = '';
      etat.choisis.clear();
      zone.innerHTML = '';
      verifier();
      rendreChapitres();
      racine.querySelector('.etapes-import').scrollIntoView({ behavior: 'smooth' });
    });
    zone.querySelector('button').focus();
  };

  $('[data-exporter-mots]').addEventListener('click', () => exporterMots(mesMots()));

  rendrePrompt();
  rendreChapitres();
  majBouton();
  // La vérification part 250 ms après la dernière frappe : quitter la page
  // avant ne doit pas la laisser écrire dans l'écran suivant.
  return () => clearTimeout(delai);
}
