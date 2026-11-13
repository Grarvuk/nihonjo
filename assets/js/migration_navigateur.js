// Reprise des données que la v1 gardait DANS LE NAVIGATEUR :
//   - IndexedDB « NihonjoDB » (ouverte par Dexie) : tables `motsPerso`
//     (mots ajoutés à la main, et COPIES de mots du cours faites en peuplant
//     un chapitre) et `progression` ({ fr, statut }, indexée par le texte
//     français — fr[0] du mot) ;
//   - localStorage : `nihonjo_custom_chapters` (chapitres créés, même vides)
//     et `nihonjo_chap_categories` ({ chapitre: catégorie }).
//
// Ces données n'existent que dans le navigateur où la v1 a servi, à
// l'adresse où elle a servi (même origine). On les LIT sans jamais les
// effacer : si la reprise se passe mal, rien n'est perdu.

import { appeler } from './api.js';
import { donnees, recharger, preference, ecrirePreference } from './etat.js';
import { memoire } from './utils.js';

const NOM_BASE_V1 = 'NihonjoDB';
// Le bilan de la reprise est une préférence du COMPTE (dans la base) ; les
// données v1, elles, ne se lisent que dans le navigateur où elles sont.
const CLE_FAITE = 'migration_v1';

/** Lit une table entière, ou [] si elle n'existe pas. */
function lireTable(base, nom) {
  return new Promise((resolve) => {
    if (!base.objectStoreNames.contains(nom)) return resolve([]);
    const req = base.transaction(nom, 'readonly').objectStore(nom).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  });
}

/**
 * Ouvre la base de la v1 sans la créer si elle n'existe pas.
 * ⚠️ indexedDB.open() CRÉE une base absente : on intercepte la création
 * (oldVersion 0) et on l'annule, sinon chaque visite laisserait une base vide
 * « NihonjoDB » que la détection prendrait ensuite pour la vraie.
 */
function ouvrirBaseV1() {
  return new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve(null);
    let req;
    try {
      req = indexedDB.open(NOM_BASE_V1);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = (e) => {
      if (e.oldVersion === 0) req.transaction.abort();
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

/** Ce que la v1 a laissé dans ce navigateur, ou null s'il n'y a rien. */
export async function detecterAnciennesDonnees() {
  const base = await ouvrirBaseV1();
  let motsPerso = [];
  let progression = [];
  if (base) {
    [motsPerso, progression] = await Promise.all([lireTable(base, 'motsPerso'), lireTable(base, 'progression')]);
    base.close();
  }
  const chapitresPerso = memoire.lire('nihonjo_custom_chapters', []);
  const categories = memoire.lire('nihonjo_chap_categories', {});
  if (!motsPerso.length && !progression.length && !chapitresPerso.length) return null;
  return {
    motsPerso,
    progression,
    chapitresPerso: Array.isArray(chapitresPerso) ? chapitresPerso : [],
    categories: categories && typeof categories === 'object' ? categories : {},
  };
}

export function migrationDejaFaite() {
  return preference(CLE_FAITE, null);
}

/**
 * Envoie les anciennes données dans la base. Les copies de mots du cours
 * (fabriquées par la v1 en peuplant un chapitre) sont FUSIONNÉES avec le mot
 * d'origine côté serveur (Depot::importerMots) : pas de doublon.
 */
export async function migrer(anciennes) {
  // 1. Les mots, avec la catégorie de leurs chapitres.
  const mots = anciennes.motsPerso.map(({ id, ...reste }) => reste);
  const import_ = await appeler('import.mots', { mots, mode: 'ajouter', categories_chapitres: anciennes.categories });

  // 2. Les chapitres créés restés vides (ceux qui ont des mots existent déjà).
  await recharger();
  const existants = new Set(donnees().chapitres.map((c) => c.nom));
  let chapitresCrees = 0;
  for (const nom of anciennes.chapitresPerso) {
    const id = String(nom).trim().replace(/\s+/g, '_');
    if (!id || existants.has(id)) continue;
    try {
      await appeler('chapitre.creer', { nom: id, categorie: anciennes.categories[nom] || 'Personnel', peupler: [] });
      chapitresCrees++;
    } catch { /* déjà là : sans conséquence */ }
  }

  // 3. La progression : la v1 l'indexait par texte français. On la rattache
  //    aux mots dont c'est le premier sens, à défaut à ceux qui l'ont parmi
  //    leurs sens — comme la v1, qui partageait l'état entre homonymes.
  await recharger();
  const elements = progressionVersMots(anciennes.progression);
  const progression = elements.length ? await appeler('progression.fusionner', { elements }) : { acquis: 0, a_revoir: 0, inchanges: 0 };

  await recharger();
  const bilan = { le: new Date().toISOString(), mots: import_, chapitres_crees: chapitresCrees, progression };
  ecrirePreference(CLE_FAITE, bilan);
  return bilan;
}

export function progressionVersMots(entrees) {
  const { mots } = donnees();
  const parPremierSens = new Map();
  mots.forEach((m) => {
    const cle = m.fr[0];
    if (!parPremierSens.has(cle)) parPremierSens.set(cle, []);
    parPremierSens.get(cle).push(m);
  });
  const elements = [];
  for (const p of entrees) {
    if (!p || !p.fr || !p.statut || p.statut === 'non acquis') continue;
    const trouves = parPremierSens.get(p.fr) || mots.filter((m) => m.fr.includes(p.fr));
    trouves.forEach((m) => elements.push({ mot_id: m.id, statut: p.statut }));
  }
  return elements;
}
