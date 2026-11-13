// Convertit les données statiques de la v1 (archives/v1/data_cours.js et
// archives/v1/config_chapitres.js) en amorce JSON pour la base SQLite
// (api/amorce/vocabulaire_initial.json).
//
// Pourquoi un script et pas une lecture directe côté PHP : data_cours.js est
// du JavaScript, pas du JSON (commentaires « // page 45 », virgule finale
// avant « ] »). Le faire évaluer par Node dans un bac à sable est la seule
// lecture fidèle ; un nettoyage par expressions régulières en PHP aurait cassé
// au premier « // » glissé dans un champ « context ».
//
// L'amorce n'est lue qu'UNE fois, quand la base est vide (api/lib/Amorcage.php).
// Relancer ce script ne change rien à une base déjà créée.
//
// Usage (depuis la racine du projet) : node outils/convertir_donnees_v1.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');

// `const` au niveau d'un script vm n'est pas posé sur l'objet global : on
// ré-expose explicitement les deux constantes à la fin du code évalué.
const bac = {};
vm.createContext(bac);
vm.runInContext(
  lire('archives/v1/data_cours.js') + '\n' + lire('archives/v1/config_chapitres.js') +
  '\n;globalThis.__mots = dictionnaire_cours; globalThis.__structure = STRUCTURE_CHAPITRES;',
  bac
);

const nettoyer = (liste) => (Array.isArray(liste) ? liste : [liste])
  .map((v) => String(v ?? '').trim())
  .filter((v) => v.length > 0);

const categories = Object.entries(bac.__structure)
  .sort((a, b) => a[1].ordre - b[1].ordre)
  .map(([nom, c]) => ({ nom, ordre: c.ordre }));

const chapitres = [];
for (const [nom, c] of Object.entries(bac.__structure)) {
  for (const item of c.items) chapitres.push({ id: item.id, categorie: nom, ordre: item.ordre });
}
// Le chapitre « personnel » est la destination par défaut des mots ajoutés :
// il doit exister même vide. Ordre 0 : la v1 le plaçait toujours en tête.
const perso = chapitres.find((c) => c.id === 'personnel');
if (perso) perso.ordre = 0;
else chapitres.push({ id: 'personnel', categorie: 'Personnel', ordre: 0 });

const mots = bac.__mots.map((m) => ({
  fr: nettoyer(m.fr),
  jp_romaji: nettoyer(m.jp_romaji),
  jp_kanji: nettoyer(m.jp_kanji),
  jp_kana: nettoyer(m.jp_kana),
  context: String(m.context ?? '').trim(),
  thematiques: nettoyer(m.thematiques),
  chapitres: nettoyer(m.chapitres),
}));

// Un chapitre cité par un mot mais absent de config_chapitres.js : la v1 le
// rangeait dans « Personnel ». Même règle ici.
const connus = new Set(chapitres.map((c) => c.id));
for (const m of mots) for (const c of m.chapitres) {
  if (!connus.has(c)) { chapitres.push({ id: c, categorie: 'Personnel', ordre: 100 }); connus.add(c); }
}

const sortie = {
  version: 1,
  genere_le: new Date().toISOString(),
  source: 'archives/v1/data_cours.js + archives/v1/config_chapitres.js',
  categories,
  chapitres,
  mots,
};
const cible = path.join(racine, 'api/amorce/vocabulaire_initial.json');
fs.writeFileSync(cible, JSON.stringify(sortie, null, 1) + '\n', 'utf8');
console.log(`${mots.length} mots, ${chapitres.length} chapitres, ${categories.length} catégories → ${path.relative(racine, cible)}`);
