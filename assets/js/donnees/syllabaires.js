// Les deux syllabaires (hiragana, katakana) pour la page « Kana » et son jeu.
//
// Une seule source : le hiragana et ses lectures. Le katakana s'en déduit par
// décalage Unicode (U+3041…U+3096 → +0x60), ce qui évite deux tableaux à
// tenir d'accord à la main.
//
// Lectures : la première est l'Hepburn (celle qu'on affiche) ; les suivantes
// sont aussi acceptées dans le jeu (Kunrei, frappe au clavier : si, tu, hu…).

export function versKatakana(texte) {
  return Array.from(texte).map((c) => {
    const code = c.codePointAt(0);
    return code >= 0x3041 && code <= 0x3096 ? String.fromCodePoint(code + 0x60) : c;
  }).join('');
}

/** Le katakana en hiragana (le reste tel quel) : ミズ → みず. */
export function versHiragana(texte) {
  return Array.from(texte).map((c) => {
    const code = c.codePointAt(0);
    return code >= 0x30A1 && code <= 0x30F6 ? String.fromCodePoint(code - 0x60) : c;
  }).join('');
}

/** Une case : hiragana, lectures acceptées (la première est affichée). */
const k = (hira, ...romaji) => ({ hira, kata: versKatakana(hira), romaji });

/** Un groupe = un tableau : en-têtes de colonnes, lignes (identifiant, libellé, cases ; null = case vide). */
export const GROUPES = [
  {
    id: 'base',
    nom: 'Sons de base',
    note: 'Le tableau gojūon : cinq voyelles, puis chaque consonne suivie de ces voyelles.',
    colonnes: ['a', 'i', 'u', 'e', 'o'],
    lignes: [
      { id: 'a', libelle: '—', cases: [k('あ', 'a'), k('い', 'i'), k('う', 'u'), k('え', 'e'), k('お', 'o')] },
      { id: 'k', libelle: 'k', cases: [k('か', 'ka'), k('き', 'ki'), k('く', 'ku'), k('け', 'ke'), k('こ', 'ko')] },
      { id: 's', libelle: 's', cases: [k('さ', 'sa'), k('し', 'shi', 'si'), k('す', 'su'), k('せ', 'se'), k('そ', 'so')] },
      { id: 't', libelle: 't', cases: [k('た', 'ta'), k('ち', 'chi', 'ti'), k('つ', 'tsu', 'tu'), k('て', 'te'), k('と', 'to')] },
      { id: 'n', libelle: 'n', cases: [k('な', 'na'), k('に', 'ni'), k('ぬ', 'nu'), k('ね', 'ne'), k('の', 'no')] },
      { id: 'h', libelle: 'h', cases: [k('は', 'ha'), k('ひ', 'hi'), k('ふ', 'fu', 'hu'), k('へ', 'he'), k('ほ', 'ho')] },
      { id: 'm', libelle: 'm', cases: [k('ま', 'ma'), k('み', 'mi'), k('む', 'mu'), k('め', 'me'), k('も', 'mo')] },
      { id: 'y', libelle: 'y', cases: [k('や', 'ya'), null, k('ゆ', 'yu'), null, k('よ', 'yo')] },
      { id: 'r', libelle: 'r', cases: [k('ら', 'ra'), k('り', 'ri'), k('る', 'ru'), k('れ', 're'), k('ろ', 'ro')] },
      { id: 'w', libelle: 'w', cases: [k('わ', 'wa'), null, null, null, k('を', 'wo', 'o')] },
      { id: 'nn', libelle: 'n', cases: [k('ん', 'n', 'nn'), null, null, null, null] },
    ],
  },
  {
    id: 'voises',
    nom: 'Sons voisés',
    note: 'Le dakuten (゛) voise la consonne : k → g, s → z, t → d, h → b. Le handakuten (゜) change h en p.',
    colonnes: ['a', 'i', 'u', 'e', 'o'],
    lignes: [
      { id: 'g', libelle: 'g', cases: [k('が', 'ga'), k('ぎ', 'gi'), k('ぐ', 'gu'), k('げ', 'ge'), k('ご', 'go')] },
      { id: 'z', libelle: 'z', cases: [k('ざ', 'za'), k('じ', 'ji', 'zi'), k('ず', 'zu'), k('ぜ', 'ze'), k('ぞ', 'zo')] },
      { id: 'd', libelle: 'd', cases: [k('だ', 'da'), k('ぢ', 'ji', 'di', 'dzi'), k('づ', 'zu', 'du', 'dzu'), k('で', 'de'), k('ど', 'do')] },
      { id: 'b', libelle: 'b', cases: [k('ば', 'ba'), k('び', 'bi'), k('ぶ', 'bu'), k('べ', 'be'), k('ぼ', 'bo')] },
      { id: 'p', libelle: 'p', cases: [k('ぱ', 'pa'), k('ぴ', 'pi'), k('ぷ', 'pu'), k('ぺ', 'pe'), k('ぽ', 'po')] },
    ],
  },
  {
    id: 'combinaisons',
    nom: 'Combinaisons',
    note: 'Un caractère en i suivi d’un petit ya, yu ou yo se lit d’un seul son : き + ゃ = kya.',
    colonnes: ['ya', 'yu', 'yo'],
    lignes: [
      { id: 'ky', libelle: 'ky', cases: [k('きゃ', 'kya'), k('きゅ', 'kyu'), k('きょ', 'kyo')] },
      { id: 'sh', libelle: 'sh', cases: [k('しゃ', 'sha', 'sya'), k('しゅ', 'shu', 'syu'), k('しょ', 'sho', 'syo')] },
      { id: 'ch', libelle: 'ch', cases: [k('ちゃ', 'cha', 'tya', 'cya'), k('ちゅ', 'chu', 'tyu', 'cyu'), k('ちょ', 'cho', 'tyo', 'cyo')] },
      { id: 'ny', libelle: 'ny', cases: [k('にゃ', 'nya'), k('にゅ', 'nyu'), k('にょ', 'nyo')] },
      { id: 'hy', libelle: 'hy', cases: [k('ひゃ', 'hya'), k('ひゅ', 'hyu'), k('ひょ', 'hyo')] },
      { id: 'my', libelle: 'my', cases: [k('みゃ', 'mya'), k('みゅ', 'myu'), k('みょ', 'myo')] },
      { id: 'ry', libelle: 'ry', cases: [k('りゃ', 'rya'), k('りゅ', 'ryu'), k('りょ', 'ryo')] },
      { id: 'gy', libelle: 'gy', cases: [k('ぎゃ', 'gya'), k('ぎゅ', 'gyu'), k('ぎょ', 'gyo')] },
      { id: 'j', libelle: 'j', cases: [k('じゃ', 'ja', 'zya', 'jya'), k('じゅ', 'ju', 'zyu', 'jyu'), k('じょ', 'jo', 'zyo', 'jyo')] },
      { id: 'by', libelle: 'by', cases: [k('びゃ', 'bya'), k('びゅ', 'byu'), k('びょ', 'byo')] },
      { id: 'py', libelle: 'py', cases: [k('ぴゃ', 'pya'), k('ぴゅ', 'pyu'), k('ぴょ', 'pyo')] },
    ],
  },
];

/** Toutes les lignes, chacune avec son groupe (pour les puces de sélection du jeu). */
export function toutesLesLignes() {
  return GROUPES.flatMap((g) => g.lignes.map((l) => ({ ...l, groupe: g.id })));
}

/**
 * Les caractères à jouer.
 * @param {string[]} idsLignes lignes retenues (identifiants de GROUPES)
 * @param {'hira'|'kata'|'deux'} alphabet
 * @returns {{ glyphe: string, romaji: string[], alphabet: 'hira'|'kata' }[]}
 */
export function caracteres(idsLignes, alphabet) {
  const retenues = new Set(idsLignes);
  const liste = [];
  toutesLesLignes().filter((l) => retenues.has(l.id)).forEach((l) => l.cases.forEach((c) => {
    if (!c) return;
    if (alphabet !== 'kata') liste.push({ glyphe: c.hira, romaji: c.romaji, alphabet: 'hira' });
    if (alphabet !== 'hira') liste.push({ glyphe: c.kata, romaji: c.romaji, alphabet: 'kata' });
  }));
  return liste;
}

/**
 * Maîtrise d'un caractère d'après ses compteurs (table kana_progression),
 * avec les trois états (et couleurs) des mots :
 *   acquis     : plus de réussites du premier coup que d'échecs ;
 *   a revoir   : autant d'échecs que de réussites, ou plus ;
 *   non acquis : jamais joué.
 * Un caractère trouvé du premier coup est donc acquis — comme un mot juste
 * à la première réponse — et un raté le reste tant qu'il n'est pas
 * retrouvé plus souvent qu'il n'a été manqué.
 */
export function maitrise(stats) {
  if (!stats || stats.nb_reussites + stats.nb_echecs === 0) return 'non acquis';
  return stats.nb_reussites > stats.nb_echecs ? 'acquis' : 'a revoir';
}
