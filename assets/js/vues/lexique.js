// « Lexique » : tous les mots de la base — chercher, ajouter, corriger,
// supprimer. En v1 seuls les mots ajoutés à la main étaient gérables (ceux
// du cours vivaient en lecture seule dans data_cours.js) ; tous le sont ici.

import { donnees, recharger, retirerMot, preference, ecrirePreference } from '../etat.js';
import { appeler } from '../api.js';
import { optionsChapitres, japonaisEnLigne, segments } from '../composants.js';
import { echapper, libelleChapitre, majuscule, normaliser, pluriel } from '../utils.js';
import { icone } from '../icones.js';
import { confirmer, tenter, toast } from '../ui.js';
import { formulaireMot } from './formulaire_mot.js';

const PAR_PAGE = 100;
const CLE_FILTRES = 'filtres_lexique'; // préférence du compte (dans la base)

export function afficher(racine) {
  const f = { recherche: '', chapitre: '', origine: 'tous', ...preference(CLE_FILTRES, {}) };
  let limite = PAR_PAGE;

  racine.innerHTML = `
    <div class="lexique">
      <header class="entete-vue entete-avec-action">
        <div>
          <h1>Lexique</h1>
          <p class="sous-titre" data-total></p>
        </div>
        <div class="actions">
          <a class="bouton bouton-secondaire" href="#/importer">${icone('importer')}Importer une liste</a>
          <button type="button" class="bouton bouton-principal" data-ajouter>${icone('plus')}Ajouter un mot</button>
        </div>
      </header>
      <div class="feuille">
        <div class="outils-liste">
          <label class="champ-recherche">${icone('recherche')}<input type="search" placeholder="Chercher (français, kana, kanji, rōmaji, thème)" aria-label="Chercher un mot" value="${echapper(f.recherche)}" data-recherche></label>
          <label class="champ champ-en-ligne"><span class="champ-libelle">Chapitre</span>
            <select data-chapitre><option value="">Tous</option>${optionsChapitres(f.chapitre)}</select></label>
          ${segments('origine', [['tous', 'Tous'], ['perso', 'Mes mots'], ['cours', 'Du cours']], f.origine, 'Origine')}
        </div>
        <table class="tableau-mots tableau-lexique">
          <thead><tr><th>Français</th><th>Japonais</th><th>Thèmes</th><th>Chapitres</th><th class="col-actions"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody data-lignes></tbody>
        </table>
        <p class="vide" data-vide hidden></p>
        <div class="suite" data-suite hidden><button type="button" class="bouton bouton-secondaire" data-plus></button></div>
      </div>
    </div>`;

  const corps = racine.querySelector('[data-lignes]');

  const filtrer = () => {
    const q = normaliser(f.recherche);
    return donnees().mots.filter((m) =>
      (!f.chapitre || m.chapitres.includes(f.chapitre)) &&
      (f.origine === 'tous' || m.origine === f.origine) &&
      (!q || [...m.fr, ...m.jp_kana, ...m.jp_kanji, ...m.jp_romaji, ...m.thematiques, m.context].some((v) => normaliser(v).includes(q))))
      // Les derniers ajoutés d'abord : c'est eux qu'on vient corriger.
      .sort((a, b) => b.id - a.id);
  };

  const rendre = () => {
    const tous = filtrer();
    const liste = tous.slice(0, limite);
    racine.querySelector('[data-total]').textContent =
      tous.length === donnees().mots.length ? `${pluriel(tous.length, 'mot')} dans la base.` : `${pluriel(tous.length, 'mot')} sur ${donnees().mots.length.toLocaleString('fr-FR')}.`;
    const vide = racine.querySelector('[data-vide]');
    vide.hidden = tous.length > 0;
    vide.textContent = f.recherche || f.chapitre || f.origine !== 'tous'
      ? 'Aucun mot ne correspond à ces filtres.'
      : 'Le lexique est vide : ajoutez un premier mot.';
    corps.innerHTML = liste.map((m) => `
      <tr data-id="${m.id}">
        <td class="col-fr">${echapper(m.fr.join(', '))}${m.context ? `<span class="contexte">${echapper(m.context)}</span>` : ''}</td>
        <td class="col-jp">${japonaisEnLigne(m)}${m.jp_romaji.length ? `<span class="jp-romaji">${echapper(m.jp_romaji.join(', '))}</span>` : ''}</td>
        <td class="col-themes">${m.thematiques.map((t) => `<span class="etiquette etiquette-lecture">${echapper(majuscule(t))}</span>`).join('')}</td>
        <td class="col-chapitres">${m.chapitres.map((c) => `<span class="etiquette etiquette-lecture">${echapper(libelleChapitre(c))}</span>`).join('')}</td>
        <td class="col-actions">${m.modifiable ? `
          <button type="button" class="bouton-icone" data-modifier aria-label="Modifier « ${echapper(m.fr[0])} »" title="Modifier">${icone('crayon')}</button>
          <button type="button" class="bouton-icone bouton-icone-danger" data-supprimer aria-label="Supprimer « ${echapper(m.fr[0])} »" title="Supprimer">${icone('corbeille')}</button>` : '<span class="mot-du-cours" title="Mot du cours : seul un administrateur le modifie">cours</span>'}
        </td>
      </tr>`).join('');
    const suite = racine.querySelector('[data-suite]');
    suite.hidden = tous.length <= limite;
    racine.querySelector('[data-plus]').textContent = `Afficher ${Math.min(PAR_PAGE, tous.length - limite)} de plus`;
  };

  const majFiltres = () => {
    f.recherche = racine.querySelector('[data-recherche]').value;
    f.chapitre = racine.querySelector('[data-chapitre]').value;
    f.origine = racine.querySelector('input[name="origine"]:checked').value;
    ecrirePreference(CLE_FILTRES, { ...f });
    limite = PAR_PAGE;
    rendre();
  };
  racine.querySelector('[data-recherche]').addEventListener('input', majFiltres);
  racine.querySelector('.outils-liste').addEventListener('change', majFiltres);
  racine.querySelector('[data-plus]').addEventListener('click', () => { limite += PAR_PAGE; rendre(); });

  racine.querySelector('[data-ajouter]').addEventListener('click', async () => {
    const mot = await formulaireMot();
    if (!mot) return;
    toast(`« ${mot.fr[0]} » ajouté.`, 'succes');
    await tenter(recharger); // un chapitre a pu être créé
    rendre();
  });

  corps.addEventListener('click', async (e) => {
    const ligne = e.target.closest('tr');
    if (!ligne) return;
    const mot = donnees().parId.get(Number(ligne.dataset.id));
    if (e.target.closest('[data-modifier]')) {
      const modifie = await formulaireMot(mot);
      if (!modifie) return;
      toast(`« ${modifie.fr[0]} » enregistré.`, 'succes');
      await tenter(recharger);
      rendre();
    } else if (e.target.closest('[data-supprimer]')) {
      const ok = await confirmer('Supprimer ce mot ?',
        `« ${echapper(mot.fr.join(', '))} » sera retiré de tous ses chapitres, avec sa progression.${mot.origine === 'cours' ? ' C’est un mot du cours : il disparaîtra pour <strong>tous les comptes</strong>.' : ''}`,
        { libelleOk: 'Supprimer', danger: true });
      if (!ok) return;
      const fait = await tenter(() => appeler('mot.supprimer', { id: mot.id }), `« ${mot.fr[0]} » supprimé.`);
      if (fait !== undefined) {
        retirerMot(mot.id);
        rendre();
      }
    }
  });

  rendre();
}
