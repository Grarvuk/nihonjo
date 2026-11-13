// Petits outils sans état, partagés par toutes les vues.

/**
 * ⚠️ Tout texte venu de la base passe par ici avant un innerHTML : les mots
 * sont saisis à la main ou importés d'un fichier, et un « < » dans un
 * contexte suffirait à casser la page (ou à y injecter du script).
 */
export function echapper(valeur) {
  return String(valeur ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Forme de comparaison d'une réponse. Reprend la v1 (minuscules, accents et
 * ponctuation ignorés, espaces retirés) et ignore en plus apostrophes,
 * guillemets et points d'interrogation : « l’eau » vaut « l'eau » vaut « leau ».
 *
 * NFD décompose aussi les kana voisés (が → か + ゛ U+3099) : sans effet sur la
 * comparaison, puisque les deux côtés passent par la même fonction.
 */
export function normaliser(texte) {
  if (!texte) return '';
  return String(texte)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[.,/#!$%^&*;:{}=\-_`~()?¿'’"«»]/g, '')
    .replace(/\s+/g, '');
}

/**
 * Distance d'édition : insertion, suppression, substitution d'un caractère,
 * et inversion de deux voisins (« chein » → « chien » : une faute, pas deux).
 */
export function distanceEdition(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j++) d[0][j] = j;
  for (let i = 1; i <= x.length; i++) {
    for (let j = 1; j <= y.length; j++) {
      const cout = x[i - 1] === y[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cout);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[x.length][y.length];
}

// L'article ou le pronom de tête qu'on ne demande pas d'écrire : « le chat »,
// « l'eau », « se laver », « à droite » valent « chat », « eau »…
const TETES_FR = /^(?:le|la|les|l['’]|un|une|des|du|de\s+la|de\s+l['’]|se|s['’]|à|au|aux)\s*/i;

/**
 * Les formes acceptables d'un sens français, normalisées : tel quel, sans
 * l'article de tête, sans la précision entre parenthèses (« côté (de) » →
 * « côté »), et chaque morceau d'un « grand / gros ».
 */
export function formesFrancaises(sens) {
  const formes = new Set();
  String(sens).split(/\s*[/;]\s*/).forEach((morceau) => {
    const brut = morceau.toLowerCase().trim();
    const sansParentheses = brut.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    [brut, sansParentheses].forEach((f) => {
      formes.add(normaliser(f));
      formes.add(normaliser(f.replace(TETES_FR, '')));
    });
  });
  formes.delete('');
  return [...formes];
}

/**
 * La saisie française rapprochée des sens attendus (25/10/2026) : rend
 * `{ exact }` si elle en est une forme, `{ proche: sens }` s'il n'y a qu'une
 * faute de frappe (1 lettre dès 5 lettres, 2 dès 10 : « mange » pour
 * « manger »), null sinon. Les mots courts doivent être exacts (« mère » n'est
 * pas « père »).
 */
export function comparerFrancais(saisie, sensAttendus) {
  const formesSaisie = formesFrancaises(saisie);
  let proche = null;
  for (const sens of sensAttendus) {
    const formes = formesFrancaises(sens);
    if (formesSaisie.some((f) => formes.includes(f))) return { exact: true };
    if (proche) continue;
    for (const f of formes) {
      const seuil = f.length >= 10 ? 2 : f.length >= 5 ? 1 : 0;
      if (seuil && formesSaisie.some((s) => distanceEdition(s, f) <= seuil)) { proche = sens; break; }
    }
  }
  return proche ? { proche } : null;
}

/** Une saisie en lettres latines seulement (du rōmaji, là où l'on attend du japonais). */
export function estEnLettresLatines(texte) {
  return /[a-z]/i.test(texte) && !/[぀-ヿ㐀-鿿ｦ-ﾟ]/u.test(texte);
}

/** Mélange de Fisher-Yates. (La v1 triait avec Math.random() - 0.5 : biaisé.) */
export function melanger(liste) {
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

// Les chapitres du MANUEL de japonais (12/11/2026, José) : leurs clés
// restent celles de la v1, d'après la page où commence leur vocabulaire
// (« vocabulaire_p_45 »), mais ils s'affichent « Chapitre 1 », « Chapitre 2 »…
// dans l'ordre des pages. Renommer les clés aurait changé la base en ligne,
// les sélections gardées (préférence `chapitres_coches`) et les fichiers
// échangés : seul l'affichage change. Le rang se calcule sur les chapitres
// du manuel présents (`retenirPagesDuManuel`, à chaque chargement des
// données) : une page ajoutée au cours prend sa place dans la suite.
let pagesDuManuel = [45, 65, 81, 99, 115, 135, 151, 167, 183, 203, 219];

/** La page du manuel d'un chapitre du cours (« vocabulaire_p_81 » → 81), sinon null. */
export function pageDuManuel(cle) {
  const m = /^vocabulaire_p_(\d+)$/.exec(String(cle));
  return m ? Number(m[1]) : null;
}

/** Retient les pages des chapitres du manuel présents (etat.js, au chargement). */
export function retenirPagesDuManuel(cles) {
  const pages = [...new Set(cles.map(pageDuManuel).filter((p) => p !== null))].sort((a, b) => a - b);
  if (pages.length) pagesDuManuel = pages;
}

/**
 * Ce qui dit, là où on choisit les chapitres, d'où viennent ceux du manuel :
 * une phrase si la liste en contient, sinon ''.
 */
export function noteManuel(cles) {
  if (!cles.some((c) => pageDuManuel(c) !== null)) return '';
  const premiere = pagesDuManuel[0];
  const derniere = pagesDuManuel[pagesDuManuel.length - 1];
  return `Les chapitres 1 à ${pagesDuManuel.length} suivent le manuel d’apprentissage du japonais, dans l’ordre de ses pages (de la page ${premiere} à la page ${derniere}).`;
}

/** « Manuel, page 81 » pour un chapitre du manuel (titre d'une puce), sinon ''. */
export function pageManuelEnClair(cle) {
  const p = pageDuManuel(cle);
  return p === null ? '' : `Manuel de japonais, à partir de la page ${p}`;
}

/**
 * Libellé lisible d'un chapitre. L'identifiant reste le nom technique de la
 * v1 (« vocabulaire_p_45 ») ; seul l'affichage change.
 */
export function libelleChapitre(id) {
  const page = pageDuManuel(id);
  if (page !== null) {
    const rang = pagesDuManuel.indexOf(page);
    return rang >= 0 ? `Chapitre ${rang + 1}` : `Page ${page}`;
  }
  const nom = nomDeChapitre(id);
  const texte = nom.replace(/_/g, ' ');
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}

/**
 * Nom technique d'un chapitre depuis sa clé : un chapitre de compte a pour
 * clé « nom@idCompte » (deux comptes peuvent avoir chacun leur « animaux »),
 * un chapitre du cours a pour clé son nom. Les fichiers échangés portent le nom.
 */
export function nomDeChapitre(cle) {
  return String(cle).replace(/@\d+$/, '');
}

export function majuscule(texte) {
  const t = String(texte ?? '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Écriture principale d'un mot : le premier kanji s'il y en a, sinon le premier kana. */
export function ecriturePrincipale(mot) {
  return mot.jp_kanji[0] || mot.jp_kana[0] || '';
}

export function aDesKanjis(mot) {
  return mot.jp_kanji.length > 0;
}

export const LIBELLES_STATUT = {
  'non acquis': 'Nouveau',
  'en cours': 'En cours',
  'a revoir': 'À revoir',
  acquis: 'Acquis',
  'a rafraichir': 'À rafraîchir',
};

/** Classe CSS d'un état : « a revoir » → « a-revoir ». */
export function classeStatut(statut) {
  return String(statut).replace(/\s+/g, '-');
}

export function pluriel(n, singulier, pluriel = `${singulier}s`) {
  return `${n.toLocaleString('fr-FR')} ${n > 1 ? pluriel : singulier}`;
}

export function telechargerJson(nomFichier, objet) {
  const blob = new Blob([JSON.stringify(objet, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Ouvre le sélecteur de fichier et renvoie le JSON lu (ou null si annulé). */
/** Ouvre le choix d'un fichier et renvoie son TEXTE (null si annulé) : la page d'import le vérifie elle-même. */
export function choisirFichierTexte(accept = '.json,application/json') {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const fichier = input.files?.[0];
      if (!fichier) return resolve(null);
      const lecteur = new FileReader();
      lecteur.onload = () => resolve(String(lecteur.result));
      lecteur.onerror = () => reject(new Error(`Lecture de « ${fichier.name} » impossible.`));
      lecteur.readAsText(fichier);
    });
    input.click();
  });
}

export function choisirFichierJson() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', () => {
      const fichier = input.files?.[0];
      if (!fichier) return resolve(null);
      const lecteur = new FileReader();
      lecteur.onload = () => {
        try {
          resolve(JSON.parse(lecteur.result));
        } catch {
          reject(new Error(`« ${fichier.name} » n'est pas un fichier JSON lisible.`));
        }
      };
      lecteur.onerror = () => reject(new Error(`Lecture de « ${fichier.name} » impossible.`));
      lecteur.readAsText(fichier);
    });
    input.click();
  });
}

export function dateDuJour() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Lecture / écriture du localStorage qui ne lève jamais (navigation privée, quota).
 *
 * ⚠️ Depuis le 23/10/2026, AUCUNE donnée ni préférence de l'utilisateur ne va
 * dans le navigateur : utiliser `preference` / `ecrirePreference` (etat.js,
 * rangées dans la base). Restent ici : l'adresse du mode « dev » des essais
 * (auth.js) et la lecture des clés de l'ancienne version (migration_navigateur.js).
 */
export const memoire = {
  lire(cle, defaut) {
    try {
      const v = localStorage.getItem(cle);
      return v === null ? defaut : JSON.parse(v);
    } catch {
      return defaut;
    }
  },
  ecrire(cle, valeur) {
    try {
      localStorage.setItem(cle, JSON.stringify(valeur));
    } catch {
      /* préférence perdue : sans conséquence */
    }
  },
};
