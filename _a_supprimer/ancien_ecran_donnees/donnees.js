// « Données » : sauvegarde complète, progression, lexique perso, reprise de
// l'ancienne version, état du serveur.
//
// Les formats de fichier de la v1 restent lisibles (progression
// « nihonjo_progression », export de mots en tableau) : un fichier exporté
// avant la migration s'importe ici.

import { appeler } from '../api.js';
import { donnees, recharger, statut, estAdmin } from '../etat.js';
import { confirmer, tenter, toast } from '../ui.js';
import { choisirFichierJson, dateDuJour, echapper, normaliser, nomDeChapitre, pluriel, telechargerJson } from '../utils.js';
import { icone } from '../icones.js';
import { detecterAnciennesDonnees, migrationDejaFaite, migrer } from '../migration_navigateur.js';

export function afficher(racine) {
  racine.innerHTML = `
    <div class="donnees">
      <header class="entete-vue">
        <h1>Données</h1>
        <p class="sous-titre">Vos mots, vos chapitres, votre progression et vos réglages vivent dans la base, rattachés à votre compte : rien n'est gardé dans ce navigateur. Ces fichiers servent à les sauvegarder ou à les échanger.</p>
      </header>
      <div class="grille-donnees">
        <section class="feuille bloc-donnees"${estAdmin() ? '' : ' hidden'}>
          <h2>${icone('base')}Sauvegarde complète</h2>
          <p>Toute la base — le cours et <strong>tous les comptes</strong> — dans un seul fichier, pour passer du poste local à l'hébergement. La restauration <strong>remplace</strong> tout. Réservé aux administrateurs.</p>
          <div class="actions">
            <button type="button" class="bouton bouton-principal" data-sauvegarder>${icone('telecharger')}Télécharger</button>
            <button type="button" class="bouton bouton-secondaire" data-restaurer>${icone('envoyer')}Restaurer…</button>
          </div>
        </section>
        <section class="feuille bloc-donnees">
          <h2>${icone('reviser')}Progression</h2>
          <p>Vos états « acquis » et « à revoir ». L'import ne fait jamais reculer un mot : un « acquis » reste acquis.</p>
          <div class="actions">
            <button type="button" class="bouton bouton-secondaire" data-exporter-progression>${icone('telecharger')}Exporter</button>
            <button type="button" class="bouton bouton-secondaire" data-importer-progression>${icone('envoyer')}Importer…</button>
          </div>
        </section>
        <section class="feuille bloc-donnees">
          <h2>${icone('liste')}Mes mots</h2>
          <p>Les mots que vous avez ajoutés, et ceux du cours rangés dans vos chapitres. Pour en ajouter toute une liste (un fichier, la réponse d'une IA), passez par la page d'import : elle explique tout et vérifie la liste avant.</p>
          <div class="actions">
            <button type="button" class="bouton bouton-secondaire" data-exporter-mots>${icone('telecharger')}Exporter</button>
            <a class="bouton bouton-secondaire" href="#/importer">${icone('importer')}Importer une liste</a>
          </div>
        </section>
        <section class="feuille bloc-donnees" data-bloc-migration>
          <h2>${icone('navigateur')}Ancienne version</h2>
          <p data-etat-migration>Recherche des données de l'ancienne version dans ce navigateur…</p>
          <div class="actions" data-actions-migration></div>
        </section>
      </div>
      <p class="etat-serveur" data-sante></p>
    </div>`;

  const sur = (attr, action) => racine.querySelector(`[${attr}]`).addEventListener('click', action);

  // ----- sauvegarde complète ---------------------------------------------
  sur('data-sauvegarder', () => tenter(async () => {
    telechargerJson(`nihonjo_sauvegarde_${dateDuJour()}.json`, await appeler('sauvegarde'));
  }, 'Sauvegarde téléchargée.'));

  sur('data-restaurer', () => tenter(async () => {
    const fichier = await choisirFichierJson();
    if (!fichier) return;
    if (fichier.format !== 'nihonjo_sauvegarde') throw new Error("Ce fichier n'est pas une sauvegarde complète (fichier « nihonjo_sauvegarde_… »).");
    const comptes = Array.isArray(fichier.utilisateurs) ? `, ${pluriel(fichier.utilisateurs.length, 'compte')}` : ', ancienne version sans comptes : vos mots iront à votre compte';
    const ok = await confirmer('Remplacer toute la base ?',
      `Toute la base, tous les comptes compris, sera remplacée par la sauvegarde du ${echapper(String(fichier.exporte_le || '').slice(0, 10))} (${pluriel(fichier.mots.length, 'mot')}${comptes}). Pensez à télécharger une sauvegarde de l'actuelle d'abord.`,
      { libelleOk: 'Tout remplacer', danger: true });
    if (!ok) return;
    const r = await appeler('restauration', fichier);
    await recharger();
    toast(`Base restaurée : ${pluriel(r.mots, 'mot')}, ${pluriel(r.comptes, 'compte')}.`, 'succes');
  }));

  // ----- progression -----------------------------------------------------
  sur('data-exporter-progression', () => {
    const travailles = donnees().mots.filter((m) => statut(m) !== 'non acquis');
    if (!travailles.length) return toast('Aucun mot travaillé pour le moment : rien à exporter.', 'erreur');
    // Format de la v1 (type « nihonjo_progression »), lisible par les deux versions.
    telechargerJson(`ma_progression_nihonjo_${dateDuJour()}.json`, {
      type: 'nihonjo_progression',
      donnees: travailles.map((m) => ({ etat: statut(m), fr: m.fr, jp_romaji: m.jp_romaji, jp_kanji: m.jp_kanji, jp_kana: m.jp_kana })),
      count: travailles.length,
    });
    toast(`Progression exportée : ${pluriel(travailles.length, 'mot')}.`, 'succes');
  });

  sur('data-importer-progression', () => tenter(async () => {
    const fichier = await choisirFichierJson();
    if (!fichier) return;
    if (fichier.type !== 'nihonjo_progression' || !Array.isArray(fichier.donnees)) {
      throw new Error("Ce fichier n'est pas un export de progression (fichier « ma_progression_nihonjo_… »).");
    }
    const { elements, introuvables } = rapprocherProgression(fichier.donnees);
    const r = elements.length ? await appeler('progression.fusionner', { elements }) : { acquis: 0, a_revoir: 0 };
    await recharger();
    toast(`Progression importée : ${pluriel(r.acquis, 'nouvel acquis', 'nouveaux acquis')}, ${r.a_revoir} « à revoir » en plus${introuvables ? `, ${pluriel(introuvables, 'mot introuvable', 'mots introuvables')} dans la base` : ''}.`, 'succes', 7000);
  }));

  // ----- mots ajoutés ----------------------------------------------------
  sur('data-exporter-mots', () => {
    const { mots, chapitres } = donnees();
    const chapsPerso = new Set(chapitres.filter((c) => c.origine === 'perso').map((c) => c.id));
    const aExporter = mots.filter((m) => m.origine === 'perso' || m.chapitres.some((c) => chapsPerso.has(c)));
    if (!aExporter.length) return toast('Aucun mot ajouté ni rangé dans un chapitre perso : rien à exporter.', 'erreur');
    // Les fichiers portent les NOMS des chapitres, pas leurs clés de compte
    // (« animaux », pas « animaux@3 ») : ils s'importent dans n'importe quel compte.
    const categories = {};
    chapitres.filter((c) => chapsPerso.has(c.id)).forEach((c) => { categories[c.nom] = c.categorie; });
    telechargerJson(`nihonjo_mots_${dateDuJour()}.json`, {
      type: 'nihonjo_mots',
      categories_chapitres: categories,
      mots: aExporter.map(({ fr, jp_romaji, jp_kanji, jp_kana, context, thematiques, chapitres: c }) => ({ fr, jp_romaji, jp_kanji, jp_kana, context, thematiques, chapitres: c.map(nomDeChapitre) })),
    });
    toast(`${pluriel(aExporter.length, 'mot exporté', 'mots exportés')}.`, 'succes');
  });

  // ----- ancienne version ------------------------------------------------
  rendreMigration(racine);

  // ----- serveur ---------------------------------------------------------
  appeler('sante').then((s) => {
    racine.querySelector('[data-sante]').textContent =
      `Serveur : PHP ${s.php}, SQLite ${s.sqlite}, schéma v${s.version_schema}, ${pluriel(s.nb_mots_du_cours, 'mot')} dans le cours, ${pluriel(s.nb_comptes, 'compte')}.`;
  }).catch(() => {});
}

async function rendreMigration(racine) {
  const etat = racine.querySelector('[data-etat-migration]');
  const actions = racine.querySelector('[data-actions-migration]');
  const faite = migrationDejaFaite();
  const anciennes = await detecterAnciennesDonnees();
  if (!anciennes) {
    etat.textContent = faite
      ? `Reprise faite le ${new Date(faite.le).toLocaleDateString('fr-FR')}.`
      : "Aucune donnée de l'ancienne version dans ce navigateur. Si vous l'utilisiez ailleurs (autre navigateur, téléphone), ouvrez cette page là-bas.";
    return;
  }
  const travailles = anciennes.progression.filter((p) => p.statut && p.statut !== 'non acquis').length;
  etat.innerHTML = `${faite ? `<strong>Déjà importées le ${new Date(faite.le).toLocaleDateString('fr-FR')}.</strong> ` : ''}Ce navigateur contient ${pluriel(anciennes.motsPerso.length, 'mot ajouté', 'mots ajoutés')}, ${pluriel(travailles, 'mot travaillé', 'mots travaillés')} et ${pluriel(anciennes.chapitresPerso.length, 'chapitre perso', 'chapitres perso')} de l'ancienne version. Elles ne sont pas effacées par l'import.`;
  actions.innerHTML = `<button type="button" class="bouton ${faite ? 'bouton-secondaire' : 'bouton-principal'}" data-migrer>${icone('envoyer')}${faite ? 'Importer à nouveau' : 'Importer dans la base'}</button>`;
  actions.querySelector('[data-migrer]').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    const bilan = await tenter(() => migrer(anciennes));
    if (bilan) {
      toast(`Ancienne version importée : ${pluriel(bilan.mots.crees, 'mot créé', 'mots créés')}, ${pluriel(bilan.mots.fusionnes, 'déjà présent', 'déjà présents')}, ${pluriel(bilan.progression.acquis, 'acquis', 'acquis')} et ${bilan.progression.a_revoir} « à revoir » repris.`, 'succes', 9000);
    }
    rendreMigration(racine);
  });
}

/**
 * Rapproche les entrées d'un fichier de progression v1 des mots de la base.
 * La v1 prenait le premier mot partageant UN sens, UN kanji ou UN kana ; on
 * garde ce critère mais on préfère le mot qui partage le plus des trois.
 */
function rapprocherProgression(entrees) {
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
