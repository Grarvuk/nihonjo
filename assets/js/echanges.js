// Les échanges par fichier, depuis que l'écran « Données » n'existe plus
// (23/10/2026 : tout vit dans la base, il n'y avait plus rien à « gérer »
// côté navigateur). Chaque fonction est appelée là où on en a besoin :
//   - exporterMots         → page « Importer des mots » (tous mes mots) et
//                            gestionnaire de chapitres (un chapitre) ;
//   - rapprocherProgression / appliquerProgression
//                          → page d'import, qui reconnaît un fichier de
//                            progression de l'ancienne version ;
//   - ouvrirSauvegarde     → menu du compte, administrateur seulement ;
//   - importerAncienneVersion → bandeau de l'accueil, quand ce navigateur
//                            contient encore des données de la v1.

import { appeler } from './api.js';
import { donnees, recharger, estAdmin } from './etat.js';
import { confirmer, dialogue, tenter, toast } from './ui.js';
import { choisirFichierJson, dateDuJour, echapper, nomDeChapitre, normaliser, pluriel, telechargerJson } from './utils.js';
import { icone } from './icones.js';
import { migrer } from './migration_navigateur.js';

/**
 * Télécharge des mots au format d'import de Nihonjo (`nihonjo_mots`), avec
 * leurs chapitres DU COMPTE par leur nom (« animaux », jamais « animaux@3 »)
 * et leur catégorie : le fichier se réimporte dans n'importe quel compte.
 */
export function exporterMots(mots, nomFichier = `nihonjo_mots_${dateDuJour()}.json`) {
  if (!mots.length) {
    toast('Aucun mot à exporter.', 'erreur');
    return false;
  }
  const chapsDuCompte = new Map(donnees().chapitres.filter((c) => c.origine === 'perso').map((c) => [c.id, c]));
  const categories = {};
  mots.forEach((m) => m.chapitres.forEach((cle) => {
    const c = chapsDuCompte.get(cle);
    if (c) categories[c.nom] = c.categorie;
  }));
  telechargerJson(nomFichier, {
    type: 'nihonjo_mots',
    categories_chapitres: categories,
    mots: mots.map(({ fr, jp_romaji, jp_kanji, jp_kana, context, thematiques, chapitres }) => ({
      fr, jp_romaji, jp_kanji, jp_kana, context, thematiques,
      chapitres: chapitres.filter((cle) => chapsDuCompte.has(cle)).map(nomDeChapitre),
    })),
  });
  toast(`${pluriel(mots.length, 'mot exporté', 'mots exportés')}.`, 'succes');
  return true;
}

/** Tous les mots « à moi » : ceux du compte et ceux du cours rangés dans ses chapitres. */
export function mesMots() {
  const { mots, chapitres } = donnees();
  const chapsDuCompte = new Set(chapitres.filter((c) => c.origine === 'perso').map((c) => c.id));
  return mots.filter((m) => m.origine === 'perso' || m.chapitres.some((c) => chapsDuCompte.has(c)));
}

/**
 * Rapproche les entrées d'un fichier de progression de l'ancienne version
 * (`nihonjo_progression`) des mots de la base. La v1 prenait le premier mot
 * partageant UN sens, UN kanji ou UN kana ; on garde ce critère mais on
 * préfère le mot qui partage le plus des trois.
 */
export function rapprocherProgression(entrees) {
  const { mots } = donnees();
  const prep = (l) => new Set((l || []).map(normaliser).filter(Boolean));
  const index = mots.map((m) => ({ m, fr: prep(m.fr), kana: prep(m.jp_kana), kanji: prep(m.jp_kanji) }));
  const commun = (a, b) => [...b].some((v) => a.has(v));
  const elements = [];
  let introuvables = 0;
  for (const e of entrees) {
    if (!e || !['acquis', 'a revoir'].includes(e.etat)) continue;
    const fr = prep(e.fr); const kana = prep(e.jp_kana); const kanji = prep(e.jp_kanji);
    let meilleur = null; let score = 0;
    for (const x of index) {
      const s = (commun(x.fr, fr) ? 1 : 0) + (commun(x.kana, kana) ? 1 : 0) + (commun(x.kanji, kanji) ? 1 : 0);
      if (s > score) { score = s; meilleur = x.m; if (s === 3) break; }
    }
    if (meilleur) elements.push({ mot_id: meilleur.id, statut: e.etat });
    else introuvables++;
  }
  return { elements, introuvables };
}

/** Applique un fichier de progression : jamais de recul (`progression.fusionner`). */
export async function appliquerProgression(entrees) {
  const { elements, introuvables } = rapprocherProgression(entrees);
  const r = elements.length ? await appeler('progression.fusionner', { elements }) : { acquis: 0, a_revoir: 0 };
  await recharger();
  return { ...r, introuvables, reconnus: elements.length };
}

/** Le bandeau de l'accueil : importe dans la base ce que la v1 a laissé dans CE navigateur. */
export async function importerAncienneVersion(anciennes) {
  const bilan = await tenter(() => migrer(anciennes));
  if (bilan) {
    toast(`Ancienne version importée : ${pluriel(bilan.mots.crees, 'mot créé', 'mots créés')}, ${pluriel(bilan.mots.fusionnes, 'déjà présent', 'déjà présents')}, ${pluriel(bilan.progression.acquis, 'acquis', 'acquis')} et ${bilan.progression.a_revoir} « à revoir » repris.`, 'succes', 9000);
  }
  return bilan;
}

/**
 * Sauvegarde complète (administrateur) : toute la base, tous les comptes,
 * pour passer du poste local à l'hébergement, et la restauration qui
 * REMPLACE tout. Avec l'état du serveur, qui n'intéresse que l'administrateur.
 */
export async function ouvrirSauvegarde() {
  if (!estAdmin()) return;
  const corps = document.createElement('div');
  corps.className = 'sauvegarde';
  corps.innerHTML = `
    <p class="dialogue-texte">Toute la base — le cours et <strong>tous les comptes</strong>, leurs mots, chapitres, progression et réglages — dans un seul fichier. C'est le moyen de passer du poste local à l'hébergement, ou de mettre la base à l'abri avant une opération risquée.</p>
    <div class="actions actions-gauche">
      <button type="button" class="bouton bouton-principal" data-sauvegarder>${icone('telecharger')}Télécharger la sauvegarde</button>
      <button type="button" class="bouton bouton-secondaire" data-restaurer>${icone('envoyer')}Restaurer une sauvegarde…</button>
    </div>
    <p class="discret">La restauration <strong>remplace toute la base</strong> : téléchargez d'abord une sauvegarde de l'actuelle.</p>
    <p class="etat-serveur" data-sante>État du serveur…</p>`;
  corps.querySelector('[data-sauvegarder]').addEventListener('click', () => tenter(async () => {
    telechargerJson(`nihonjo_sauvegarde_${dateDuJour()}.json`, await appeler('sauvegarde'));
  }, 'Sauvegarde téléchargée.'));
  corps.querySelector('[data-restaurer]').addEventListener('click', () => tenter(async () => {
    const fichier = await choisirFichierJson();
    if (!fichier) return;
    if (fichier.format !== 'nihonjo_sauvegarde') throw new Error("Ce fichier n'est pas une sauvegarde complète (fichier « nihonjo_sauvegarde_… »).");
    const comptes = Array.isArray(fichier.utilisateurs) ? `, ${pluriel(fichier.utilisateurs.length, 'compte')}` : ', ancienne version sans comptes : les mots iront à votre compte';
    const ok = await confirmer('Remplacer toute la base ?',
      `Toute la base, tous les comptes compris, sera remplacée par la sauvegarde du ${echapper(String(fichier.exporte_le || '').slice(0, 10))} (${pluriel(fichier.mots.length, 'mot')}${comptes}).`,
      { libelleOk: 'Tout remplacer', danger: true });
    if (!ok) return;
    const r = await appeler('restauration', fichier);
    await recharger();
    toast(`Base restaurée : ${pluriel(r.mots, 'mot')}, ${pluriel(r.comptes, 'compte')}.`, 'succes');
  }));
  appeler('sante').then((s) => {
    corps.querySelector('[data-sante]').textContent =
      `Serveur : PHP ${s.php}, SQLite ${s.sqlite}, schéma v${s.version_schema}, ${pluriel(s.nb_mots_du_cours, 'mot')} dans le cours${s.nb_comptes ? `, ${pluriel(s.nb_comptes, 'compte Google', 'comptes Google')}` : ''}.`;
  }).catch(() => { corps.querySelector('[data-sante]').textContent = ''; });
  await dialogue({ titre: 'Sauvegarde complète', corps, actions: [{ libelle: 'Fermer', genre: 'discret' }] });
}
