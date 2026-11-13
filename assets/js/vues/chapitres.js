// « Chapitres » (refait le 23/10/2026) : le gestionnaire des chapitres.
//
// À gauche, la liste : « Mes mots » et les chapitres du compte, puis ceux
// du cours (modifiables par un administrateur ; sinon en lecture, pour y
// PRENDRE des mots). À droite, le chapitre choisi et ses mots :
//   - ajouter des mots d'un autre chapitre (le sien ou du cours), d'une
//     thématique, ou cherchés dans tout le lexique — à la main ou tous d'un coup ;
//   - retirer, copier ou déplacer les mots cochés vers un autre chapitre ;
//   - réviser ce chapitre, le renommer, le supprimer.
//
// Les règles sont au serveur (Depot::ajouterMotsAuChapitre,
// retirerMotsDuChapitre) : un mot du compte ne quitte jamais « Mes mots »,
// un mot du compte n'entre pas dans un chapitre du cours.
// Le chapitre affiché est dans l'ancre (#/chapitres?chapitre=<clé>).

import {
  donnees, recharger, categoriesAvecChapitres, nomsCategories, thematiques, renommerChapitreCoche,
  estAdmin, chapitreMesMots, chapitresDuCompte, cocherSeulement, statut, estAppris,
} from '../etat.js';
import { appeler } from '../api.js';
import { naviguer } from '../routeur.js';
import { barreStatuts, badgeStatut, japonaisEnLigne, segments } from '../composants.js';
import { echapper, libelleChapitre, majuscule, normaliser, pluriel, noteManuel, pageManuelEnClair } from '../utils.js';
import { icone } from '../icones.js';
import { confirmer, dialogue, tenter, toast } from '../ui.js';
import { exporterMots } from '../echanges.js';

const PAR_PAGE = 100;

const estMesMots = (c) => Boolean(c && c.nom === 'mes_mots' && c.origine === 'perso');

function chapitreDemande() {
  const m = /[?&]chapitre=([^&]+)/.exec(location.hash);
  return m ? decodeURIComponent(m[1]) : null;
}

function motsDe(cle) {
  return donnees().mots.filter((m) => m.chapitres.includes(cle));
}

/** Les chapitres où l'on peut ranger des mots (copier, déplacer), sauf `sauf`. */
function destinations(sauf) {
  return [
    ...chapitresDuCompte(),
    ...(estAdmin() ? donnees().chapitres.filter((c) => c.origine === 'cours') : []),
  ].filter((c) => c.id !== sauf);
}

export function afficher(racine) {
  racine.innerHTML = `
    <div class="gestion-chapitres">
      <header class="entete-vue entete-avec-action">
        <div>
          <h1>Chapitres</h1>
          <p class="sous-titre">Composez vos propres chapitres : prenez des mots partout — dans le cours, dans vos chapitres, par thème — et rangez-les où vous voulez. Un mot peut être dans plusieurs chapitres ; sa progression est la même partout.</p>
        </div>
        <button type="button" class="bouton bouton-principal" data-creer>${icone('plus')}Nouveau chapitre</button>
      </header>
      <div class="gestion-grille">
        <nav class="liste-chapitres" aria-label="Chapitres" data-liste></nav>
        <section class="feuille detail-chapitre" data-detail></section>
      </div>
    </div>`;

  const zoneListe = racine.querySelector('[data-liste]');
  const zoneDetail = racine.querySelector('[data-detail]');
  let cle = null;
  let coches = new Set();
  let recherche = '';
  let limite = PAR_PAGE;

  const choisir = (nouvelle, { defiler = false } = {}) => {
    const tous = donnees().chapitres;
    cle = tous.some((c) => c.id === nouvelle) ? nouvelle : (chapitreMesMots()?.id || tous[0]?.id || null);
    coches = new Set();
    recherche = '';
    limite = PAR_PAGE;
    // Garder le chapitre dans l'ancre SANS déclencher un nouveau rendu de la vue.
    history.replaceState(null, '', `#/chapitres${cle ? `?chapitre=${encodeURIComponent(cle)}` : ''}`);
    rendreListe();
    rendreDetail();
    if (defiler && matchMedia('(max-width: 959px)').matches) zoneDetail.scrollIntoView({ block: 'start' });
  };

  // ----- la liste --------------------------------------------------------
  const item = (c) => {
    const mots = motsDe(c.id);
    return `
      <button type="button" class="item-chapitre${estMesMots(c) ? ' item-mes-mots' : ''}" data-choisir="${echapper(c.id)}"${c.id === cle ? ' aria-current="true"' : ''}>
        <span class="item-ligne"><span class="item-nom">${estMesMots(c) ? icone('cadenas') : ''}${echapper(libelleChapitre(c.id))}</span><span class="item-nb">${mots.length}</span></span>
        ${barreStatuts(mots)}
      </button>`;
  };
  const rendreListe = () => {
    const miens = chapitresDuCompte();
    const cours = categoriesAvecChapitres()
      .map((cat) => ({ ...cat, chapitres: cat.chapitres.filter((c) => c.origine === 'cours') }))
      .filter((cat) => cat.chapitres.length);
    zoneListe.innerHTML = `
      <div class="groupe-liste">
        <h2>Mes chapitres</h2>
        ${miens.map(item).join('')}
      </div>
      ${cours.map((cat) => `
        <div class="groupe-liste">
          <h2>${echapper(cat.nom)} <span class="groupe-note">${estAdmin() ? '(cours)' : '(cours : pour y prendre des mots)'}</span></h2>
          ${noteManuel(cat.chapitres.map((c) => c.id)) ? `<p class="groupe-manuel">${echapper(noteManuel(cat.chapitres.map((c) => c.id)))}</p>` : ''}
          ${cat.chapitres.map(item).join('')}
        </div>`).join('')}`;
  };
  zoneListe.addEventListener('click', (e) => {
    const b = e.target.closest('[data-choisir]');
    if (b) choisir(b.dataset.choisir, { defiler: true });
  });

  // ----- le chapitre choisi ----------------------------------------------
  const motsFiltres = () => {
    const q = normaliser(recherche);
    return motsDe(cle)
      .filter((m) => !q || [...m.fr, ...m.jp_kana, ...m.jp_kanji, ...m.jp_romaji, ...m.thematiques].some((v) => normaliser(v).includes(q)))
      .sort((a, b) => a.fr[0].localeCompare(b.fr[0], 'fr'));
  };

  // Un mot du compte ne sort pas de « Mes mots » (le serveur le garde).
  const protege = (c, m) => estMesMots(c) && m.origine === 'perso';

  const rendreDetail = () => {
    const c = donnees().chapitres.find((x) => x.id === cle);
    if (!c) { zoneDetail.innerHTML = '<p class="vide">Aucun chapitre.</p>'; return; }
    const tous = motsDe(cle);
    const cpt = { acquis: tous.filter(estAppris).length };
    const surTitre = estMesMots(c) ? 'Tous vos mots y sont, toujours'
      : pageManuelEnClair(c.id) ? `${echapper(pageManuelEnClair(c.id))}${c.modifiable ? '' : ' — en lecture, copiez ses mots dans les vôtres'}`
      : c.origine === 'cours' ? (c.modifiable ? `Chapitre du cours, ${echapper(c.categorie)}` : 'Chapitre du cours : en lecture, copiez ses mots dans les vôtres')
        : `Votre chapitre, ${echapper(c.categorie)}`;
    zoneDetail.innerHTML = `
      <div class="detail-tete">
        <div class="detail-titre">
          <p class="detail-sur">${surTitre}</p>
          <h2>${echapper(libelleChapitre(c.id))}</h2>
          <p class="detail-compte">${pluriel(tous.length, 'mot')}, ${cpt.acquis} acquis</p>
          <div class="detail-barre">${barreStatuts(tous, { grande: true })}</div>
        </div>
        <div class="detail-actions">
          <button type="button" class="bouton bouton-secondaire" data-reviser-chapitre${tous.length ? '' : ' disabled'}>${icone('jouer')}Réviser ce chapitre</button>
          <button type="button" class="bouton-icone" data-exporter-chapitre aria-label="Exporter ce chapitre (fichier à réimporter)" title="Exporter ce chapitre (fichier à réimporter)"${tous.length ? '' : ' disabled'}>${icone('telecharger')}</button>
          ${c.modifiable && !estMesMots(c) ? `
            <button type="button" class="bouton-icone" data-renommer aria-label="Renommer ou changer de catégorie" title="Renommer ou changer de catégorie">${icone('crayon')}</button>
            <button type="button" class="bouton-icone bouton-icone-danger" data-supprimer aria-label="Supprimer le chapitre" title="Supprimer le chapitre">${icone('corbeille')}</button>` : ''}
        </div>
      </div>
      ${c.modifiable ? `
        <div class="bloc-ajout">
          <button type="button" class="bouton bouton-principal" data-ajouter-mots>${icone('plus')}Ajouter des mots</button>
          <span class="bloc-ajout-aide">d'un autre chapitre, d'un thème, ou cherchés dans tout le lexique</span>
        </div>` : ''}
      ${tous.length ? `
        <div class="outils-chapitre">
          <label class="champ-recherche">${icone('recherche')}<input type="search" placeholder="Chercher dans ce chapitre" aria-label="Chercher dans ce chapitre" data-recherche value="${echapper(recherche)}"></label>
        </div>
        <div class="barre-lot" data-lot hidden>
          <span class="barre-lot-nb" data-nb-coches></span>
          ${c.modifiable ? `<button type="button" class="bouton bouton-secondaire bouton-petit" data-retirer-lot>${icone('retirer')}Retirer du chapitre</button>` : ''}
          <span class="barre-lot-vers">
            <select data-vers aria-label="Chapitre de destination">
              <option value="">vers…</option>
              ${destinations(c.id).map((d) => `<option value="${echapper(d.id)}">${echapper(libelleChapitre(d.id))}${d.origine === 'cours' ? ' (cours)' : ''}</option>`).join('')}
              <option value="__nouveau">un nouveau chapitre…</option>
            </select>
            <button type="button" class="bouton bouton-secondaire bouton-petit" data-copier-lot>${icone('copier')}Copier</button>
            ${c.modifiable ? `<button type="button" class="bouton bouton-secondaire bouton-petit" data-deplacer-lot>${icone('deplacer')}Déplacer</button>` : ''}
          </span>
        </div>
        <table class="tableau-mots tableau-chapitre">
          <thead><tr>
            <th class="col-case"><input type="checkbox" data-tout aria-label="Tout cocher"></th>
            <th>Français</th><th>Japonais</th><th class="col-etat">État</th><th class="col-actions"><span class="sr-only">Actions</span></th>
          </tr></thead>
          <tbody data-lignes></tbody>
        </table>
        <p class="vide" data-vide-recherche hidden>Aucun mot de ce chapitre ne correspond.</p>
        <div class="suite" data-suite hidden><button type="button" class="bouton bouton-secondaire" data-plus></button></div>
        ${estMesMots(c) ? '<p class="note-chapitre">Les mots que vous avez créés restent toujours ici : pour en retirer un, supprimez-le du Lexique. Les mots du cours que vous y avez rangés, eux, peuvent en sortir.</p>' : ''}`
      : `<div class="etat-vide">
          <p>Ce chapitre est vide.</p>
          ${c.modifiable ? '<p>Ajoutez-y des mots : ceux d’un chapitre du cours, d’un thème, ou cherchés un par un.</p>' : ''}
        </div>`}`;
    rendreLignes();
  };

  const rendreLignes = () => {
    const corps = zoneDetail.querySelector('[data-lignes]');
    if (!corps) return;
    const c = donnees().chapitres.find((x) => x.id === cle);
    const liste = motsFiltres();
    corps.innerHTML = liste.slice(0, limite).map((m) => `
      <tr data-id="${m.id}">
        <td class="col-case"><input type="checkbox" data-coche value="${m.id}"${coches.has(m.id) ? ' checked' : ''} aria-label="Choisir « ${echapper(m.fr[0])} »"></td>
        <td class="col-fr">${echapper(m.fr.join(', '))}${m.origine === 'cours' && c.origine === 'perso' ? '<span class="contexte">du cours</span>' : ''}</td>
        <td class="col-jp">${japonaisEnLigne(m)}</td>
        <td class="col-etat">${badgeStatut(statut(m))}</td>
        <td class="col-actions">${c.modifiable && !protege(c, m)
          ? `<button type="button" class="bouton-icone" data-retirer aria-label="Retirer « ${echapper(m.fr[0])} » du chapitre" title="Retirer du chapitre">${icone('retirer')}</button>`
          : (protege(c, m) ? `<span class="verrou" title="Vos mots restent dans « Mes mots »">${icone('cadenas')}</span>` : '')}</td>
      </tr>`).join('');
    zoneDetail.querySelector('[data-vide-recherche]').hidden = liste.length > 0;
    const suite = zoneDetail.querySelector('[data-suite]');
    suite.hidden = liste.length <= limite;
    zoneDetail.querySelector('[data-plus]').textContent = `Afficher ${Math.min(PAR_PAGE, liste.length - limite)} de plus`;
    majLot();
  };

  // ⚠️ La barre d'actions se met à jour EN PLACE : cocher ne reconstruit rien
  // (CLAUDE.md, règle 6).
  const majLot = () => {
    const lot = zoneDetail.querySelector('[data-lot]');
    if (!lot) return;
    lot.hidden = coches.size === 0;
    zoneDetail.querySelector('[data-nb-coches]').innerHTML = `<b>${coches.size}</b> ${coches.size > 1 ? 'mots choisis' : 'mot choisi'}`;
    const visibles = [...zoneDetail.querySelectorAll('[data-coche]')];
    const tout = zoneDetail.querySelector('[data-tout]');
    tout.checked = visibles.length > 0 && visibles.every((x) => x.checked);
    tout.indeterminate = !tout.checked && visibles.some((x) => x.checked);
  };

  const apres = async (message) => {
    await tenter(recharger);
    if (message) toast(message, 'succes', 5000);
    rendreListe();
    rendreDetail();
  };

  const versChapitre = async () => {
    const choix = zoneDetail.querySelector('[data-vers]').value;
    if (!choix) { toast('Choisissez d’abord le chapitre de destination (« vers… »).', 'erreur'); return null; }
    if (choix !== '__nouveau') return choix;
    const r = await dialogueCreation({ vide: true });
    if (!r) return null;
    await tenter(recharger);
    return r.id;
  };

  const ajouterA = async (cible, ids) => appeler('chapitre.ajouterMots', { id: cible, mots: ids });
  const retirerDe = async (source, ids) => appeler('chapitre.retirerMots', { id: source, mots: ids });

  zoneDetail.addEventListener('input', (e) => {
    if (e.target.matches('[data-recherche]')) {
      recherche = e.target.value;
      limite = PAR_PAGE;
      rendreLignes();
    }
  });

  zoneDetail.addEventListener('change', (e) => {
    if (e.target.matches('[data-coche]')) {
      const id = Number(e.target.value);
      if (e.target.checked) coches.add(id); else coches.delete(id);
      majLot();
    } else if (e.target.matches('[data-tout]')) {
      zoneDetail.querySelectorAll('[data-coche]').forEach((x) => {
        x.checked = e.target.checked;
        if (x.checked) coches.add(Number(x.value)); else coches.delete(Number(x.value));
      });
      majLot();
    }
  });

  zoneDetail.addEventListener('click', async (e) => {
    const c = donnees().chapitres.find((x) => x.id === cle);
    if (!c) return;
    if (e.target.closest('[data-plus]')) { limite += PAR_PAGE; rendreLignes(); return; }

    if (e.target.closest('[data-reviser-chapitre]')) {
      cocherSeulement([c.id]);
      naviguer('reviser');
      return;
    }
    if (e.target.closest('[data-exporter-chapitre]')) {
      exporterMots(motsDe(c.id), `nihonjo_${c.nom}.json`);
      return;
    }
    if (e.target.closest('[data-ajouter-mots]')) {
      const r = await dialogueAjout(c);
      if (r) await apres(messageAjout(r, c));
      return;
    }
    if (e.target.closest('[data-renommer]')) {
      const r = await dialogueModification(c);
      if (r) {
        renommerChapitreCoche(c.id, r.id);
        cle = r.id;
        history.replaceState(null, '', `#/chapitres?chapitre=${encodeURIComponent(cle)}`);
        await apres('Chapitre enregistré.');
      }
      return;
    }
    if (e.target.closest('[data-supprimer]')) {
      const mots = motsDe(c.id);
      const seuls = c.origine === 'cours' ? mots.filter((m) => m.origine === 'cours' && m.chapitres.length === 1).length : 0;
      const ok = await confirmer(`Supprimer « ${libelleChapitre(c.id)} » ?`,
        c.origine === 'cours'
          ? `C’est un chapitre du cours : il disparaîtra pour <strong>tous les comptes</strong>.${seuls ? ` <strong>${pluriel(seuls, 'mot')}</strong> qui n’${seuls > 1 ? 'étaient' : 'était'} que dans ce chapitre ${seuls > 1 ? 'seront supprimés' : 'sera supprimé'}.` : ''}`
          : `Le chapitre disparaît, pas les mots : les vôtres restent dans « Mes mots », ceux du cours dans le cours. ${pluriel(mots.length, 'mot')} ${mots.length > 1 ? 'sont rangés' : 'est rangé'} dedans.`,
        { libelleOk: 'Supprimer le chapitre', danger: true });
      if (!ok) return;
      const r = await tenter(() => appeler('chapitre.supprimer', { id: c.id }));
      if (r) {
        cle = chapitreMesMots()?.id || null;
        await apres(`Chapitre supprimé${r.mots_supprimes ? `, ${pluriel(r.mots_supprimes, 'mot supprimé', 'mots supprimés')}` : ''}.`);
        choisir(cle);
      }
      return;
    }

    const ligne = e.target.closest('[data-retirer]')?.closest('tr');
    if (ligne) {
      const id = Number(ligne.dataset.id);
      const r = await tenter(() => retirerDe(c.id, [id]));
      if (r) {
        coches.delete(id);
        await apres(r.retires ? `« ${donnees().parId.get(id)?.fr[0] ?? 'Le mot'} » retiré du chapitre.` : 'Ce mot reste dans « Mes mots ».');
      }
      return;
    }

    const ids = [...coches];
    if (!ids.length) return;
    if (e.target.closest('[data-retirer-lot]')) {
      const r = await tenter(() => retirerDe(c.id, ids));
      if (r) {
        coches = new Set();
        await apres(`${pluriel(r.retires, 'mot retiré', 'mots retirés')} du chapitre${r.gardes ? ` ; ${pluriel(r.gardes, 'mot à vous reste', 'mots à vous restent')} dans « Mes mots »` : ''}.`);
      }
    } else if (e.target.closest('[data-copier-lot]') || e.target.closest('[data-deplacer-lot]')) {
      const deplacer = Boolean(e.target.closest('[data-deplacer-lot]'));
      const cible = await versChapitre();
      if (!cible) return;
      const r = await tenter(async () => {
        const ajout = await ajouterA(cible, ids);
        const retrait = deplacer ? await retirerDe(c.id, ids) : null;
        return { ajout, retrait };
      });
      if (!r) return;
      coches = new Set();
      const nom = libelleChapitre(cible);
      await apres(`${pluriel(r.ajout.ajoutes, 'mot', 'mots')} ${deplacer ? 'déplacé' : 'copié'}${r.ajout.ajoutes > 1 ? 's' : ''} vers « ${nom} »${r.ajout.deja ? `, ${r.ajout.deja} déjà dedans` : ''}${r.ajout.refuses ? `, ${pluriel(r.ajout.refuses, 'refusé', 'refusés')} (un mot à vous n’entre pas dans le cours)` : ''}${r.retrait?.gardes ? ` ; ${pluriel(r.retrait.gardes, 'mot à vous reste', 'mots à vous restent')} aussi dans « Mes mots »` : ''}.`);
    }
  });

  racine.querySelector('[data-creer]').addEventListener('click', async () => {
    const r = await dialogueCreation();
    if (!r) return;
    await tenter(recharger);
    toast(r.nb_mots ? `Chapitre « ${libelleChapitre(r.id)} » créé, ${pluriel(r.nb_mots, 'mot rangé', 'mots rangés')}.` : `Chapitre « ${libelleChapitre(r.id)} » créé : ajoutez-y des mots.`, 'succes');
    choisir(r.id);
  });

  choisir(chapitreDemande());
}

function messageAjout(r, c) {
  return `${pluriel(r.ajoutes, 'mot ajouté', 'mots ajoutés')} à « ${libelleChapitre(c.id)} »${r.deja ? `, ${r.deja} déjà dedans` : ''}${r.refuses ? `, ${pluriel(r.refuses, 'refusé', 'refusés')} (un mot à vous n’entre pas dans le cours)` : ''}.`;
}

// ---------------------------------------------------------------------
// Ajouter des mots à un chapitre : d'un chapitre, d'un thème, du lexique
// ---------------------------------------------------------------------

const MAX_AFFICHES = 300;

async function dialogueAjout(cible) {
  const { mots, chapitres } = donnees();
  const dedans = new Set(motsDe(cible.id).map((m) => m.id));
  const versLeCours = cible.origine === 'cours';
  // Un mot du compte n'entre pas dans un chapitre du cours (refusé par le serveur) : on ne le propose pas.
  const ajoutable = (m) => !versLeCours || m.origine === 'cours';
  const choisis = new Set();
  let source = 'chapitre';
  const autres = chapitres.filter((c) => c.id !== cible.id);
  let chapSource = autres.find((c) => c.origine === 'cours')?.id || autres[0]?.id || '';
  const themes = thematiques();
  let themeSource = themes[0] || '';
  let q = '';

  const corps = document.createElement('div');
  corps.className = 'formulaire-ajout';
  corps.innerHTML = `
    ${segments('source', [['chapitre', 'D’un chapitre'], ['theme', 'D’un thème'], ['lexique', 'Tout le lexique']], source, 'Prendre les mots')}
    <label class="champ" data-champ-chapitre><span class="champ-libelle">Chapitre</span>
      <select data-chap-source>
        ${[{ nom: 'Mes chapitres', chapitres: autres.filter((c) => c.origine === 'perso') },
          ...categoriesAvecChapitres().map((cat) => ({ nom: cat.nom, chapitres: cat.chapitres.filter((c) => c.origine === 'cours' && c.id !== cible.id) }))]
          .filter((g) => g.chapitres.length)
          .map((g) => `<optgroup label="${echapper(g.nom)}">${g.chapitres.map((c) => `<option value="${echapper(c.id)}"${c.id === chapSource ? ' selected' : ''}>${echapper(libelleChapitre(c.id))}</option>`).join('')}</optgroup>`).join('')}
      </select></label>
    <label class="champ" data-champ-theme hidden><span class="champ-libelle">Thème</span>
      <select data-theme-source>${themes.map((t) => `<option value="${echapper(t)}">${echapper(majuscule(t))}</option>`).join('')}</select></label>
    <label class="champ-recherche champ-recherche-petit">${icone('recherche')}<input type="search" placeholder="Filtrer (français, kana, kanji, rōmaji)" data-filtre aria-label="Filtrer les mots"></label>
    <div class="ajout-tete">
      <label class="ajout-tout"><input type="checkbox" data-tout> <span data-libelle-tout>Tout cocher</span></label>
      <span class="ajout-compte" data-compte aria-live="polite"></span>
    </div>
    <ul class="liste-ajout" data-liste></ul>`;

  const candidats = () => {
    const nq = normaliser(q);
    const base = source === 'chapitre' ? mots.filter((m) => m.chapitres.includes(chapSource))
      : source === 'theme' ? mots.filter((m) => m.thematiques.includes(themeSource))
        : mots;
    return base.filter((m) => !nq || [...m.fr, ...m.jp_kana, ...m.jp_kanji, ...m.jp_romaji].some((v) => normaliser(v).includes(nq)))
      .sort((a, b) => a.fr[0].localeCompare(b.fr[0], 'fr'));
  };
  const libres = (liste) => liste.filter((m) => !dedans.has(m.id) && ajoutable(m));

  let boutonPrincipal = null;
  const majCompte = () => {
    const liste = candidats();
    const l = libres(liste);
    const tout = corps.querySelector('[data-tout]');
    tout.checked = l.length > 0 && l.every((m) => choisis.has(m.id));
    tout.disabled = l.length === 0;
    corps.querySelector('[data-libelle-tout]').textContent = l.length ? `Tout cocher (${l.length})` : 'Tout est déjà dans le chapitre';
    corps.querySelector('[data-compte]').textContent = `${pluriel(choisis.size, 'mot choisi', 'mots choisis')}`;
    if (boutonPrincipal) {
      boutonPrincipal.textContent = choisis.size ? `Ajouter ${pluriel(choisis.size, 'mot')}` : 'Ajouter';
      boutonPrincipal.disabled = choisis.size === 0;
    }
  };
  const rendre = () => {
    const liste = candidats();
    const zone = corps.querySelector('[data-liste]');
    if (!liste.length) {
      zone.innerHTML = `<li class="vide">${source === 'lexique' && !q ? 'Tapez quelques lettres pour chercher.' : 'Aucun mot ici.'}</li>`;
    } else {
      zone.innerHTML = liste.slice(0, MAX_AFFICHES).map((m) => {
        const deja = dedans.has(m.id);
        const interdit = !ajoutable(m);
        return `
          <li${deja || interdit ? ' class="ajout-deja"' : ''}>
            <label><input type="checkbox" data-mot="${m.id}"${choisis.has(m.id) || deja ? ' checked' : ''}${deja || interdit ? ' disabled' : ''}>
              <span class="ajout-fr">${echapper(m.fr.join(', '))}</span>
              <span class="ajout-jp">${japonaisEnLigne(m)}</span>
              ${deja ? '<span class="ajout-note">déjà dedans</span>' : interdit ? '<span class="ajout-note">mot à vous</span>' : ''}
            </label>
          </li>`;
      }).join('') + (liste.length > MAX_AFFICHES ? `<li class="vide">… et ${liste.length - MAX_AFFICHES} autres : « Tout cocher » les prend tous, ou affinez le filtre.</li>` : '');
    }
    majCompte();
  };

  corps.addEventListener('change', (e) => {
    if (e.target.name === 'source') {
      source = e.target.value;
      corps.querySelector('[data-champ-chapitre]').hidden = source !== 'chapitre';
      corps.querySelector('[data-champ-theme]').hidden = source !== 'theme';
      rendre();
    } else if (e.target.matches('[data-chap-source]')) { chapSource = e.target.value; rendre(); }
    else if (e.target.matches('[data-theme-source]')) { themeSource = e.target.value; rendre(); }
    else if (e.target.matches('[data-mot]')) {
      const id = Number(e.target.dataset.mot);
      if (e.target.checked) choisis.add(id); else choisis.delete(id);
      majCompte();
    } else if (e.target.matches('[data-tout]')) {
      // Coche (ou décoche) TOUS les mots de la source filtrée, même ceux au-delà des 300 affichés.
      libres(candidats()).forEach((m) => { if (e.target.checked) choisis.add(m.id); else choisis.delete(m.id); });
      corps.querySelectorAll('[data-mot]:not(:disabled)').forEach((x) => { x.checked = choisis.has(Number(x.dataset.mot)); });
      majCompte();
    }
  });
  const filtre = corps.querySelector('[data-filtre]');
  filtre.addEventListener('input', () => { q = filtre.value; rendre(); });
  filtre.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); }); // Entrée n'ajoute pas

  return dialogue({
    titre: `Ajouter des mots à « ${libelleChapitre(cible.id)} »`,
    corps,
    large: true,
    apresOuverture: (dlg) => {
      boutonPrincipal = dlg.querySelector('.dialogue-pied .bouton-principal');
      rendre();
    },
    actions: [
      { libelle: 'Annuler', valeur: null, genre: 'discret' },
      {
        libelle: 'Ajouter',
        genre: 'principal',
        valider: async () => {
          if (!choisis.size) return false;
          try {
            return await appeler('chapitre.ajouterMots', { id: cible.id, mots: [...choisis] });
          } catch (err) {
            toast(err.message, 'erreur');
            return false;
          }
        },
      },
    ],
  });
}

// ---------------------------------------------------------------------
// Créer, renommer
// ---------------------------------------------------------------------

function listeCategories() {
  return `<datalist id="nihonjo-categories">${nomsCategories().map((n) => `<option value="${echapper(n)}">`).join('')}</datalist>`;
}

/** `vide` : seulement le nom (création depuis « Copier vers… un nouveau chapitre »). */
async function dialogueCreation({ vide = false } = {}) {
  const { chapitres, mots } = donnees();
  const choix = new Set();
  const corps = document.createElement('div');
  corps.className = 'formulaire-chapitre';
  corps.innerHTML = `
    <div class="grille-formulaire">
      <label class="champ"><span class="champ-libelle">Nom</span><input type="text" name="nom" placeholder="animaux sauvages" required></label>
      <label class="champ"><span class="champ-libelle">Catégorie</span><input type="text" name="categorie" list="nihonjo-categories" value="Personnel" placeholder="Personnel"></label>
      ${listeCategories()}
      ${estAdmin() && !vide ? `<label class="interrupteur champ-plein"><input type="checkbox" name="cours"><span class="interrupteur-piste"></span>Chapitre du cours : visible par tous les comptes</label>` : ''}
    </div>
    ${vide ? '' : `
    <h3 class="titre-peupler">Y ranger tout de suite les mots de…</h3>
    <p class="aide-formulaire">Facultatif : vous pourrez aussi en ajouter ensuite, un par un ou par lots. Les mots restent dans leurs autres chapitres.</p>
    <label class="champ-recherche champ-recherche-petit">${icone('recherche')}<input type="search" placeholder="Filtrer les thèmes et chapitres" data-filtre aria-label="Filtrer"></label>
    <div class="groupe-peupler"><h4>Chapitres</h4><div class="puces puces-compactes" data-chapitres>${chapitres.map((c) =>
      `<button type="button" class="puce" aria-pressed="false" data-valeur="chap:${echapper(c.id)}" data-texte="${echapper(libelleChapitre(c.id))}">${echapper(libelleChapitre(c.id))}</button>`).join('')}</div></div>
    <div class="groupe-peupler"><h4>Thèmes</h4><div class="puces puces-compactes" data-themes>${thematiques().map((t) =>
      `<button type="button" class="puce" aria-pressed="false" data-valeur="theme:${echapper(t)}" data-texte="${echapper(t)}">${echapper(majuscule(t))}</button>`).join('')}</div></div>
    <p class="compte-peupler" data-compte aria-live="polite">Aucun mot rangé : le chapitre sera vide.</p>`}`;

  const majCompte = () => {
    const chaps = [...choix].filter((v) => v.startsWith('chap:')).map((v) => v.slice(5));
    const themes = [...choix].filter((v) => v.startsWith('theme:')).map((v) => v.slice(6));
    const n = mots.filter((m) => m.chapitres.some((c) => chaps.includes(c)) || m.thematiques.some((t) => themes.includes(t))).length;
    corps.querySelector('[data-compte]').textContent = n ? `${pluriel(n, 'mot sera rangé', 'mots seront rangés')} dans le nouveau chapitre.` : 'Aucun mot rangé : le chapitre sera vide.';
  };
  if (!vide) {
    corps.addEventListener('click', (e) => {
      const b = e.target.closest('[data-valeur]');
      if (!b) return;
      const v = b.dataset.valeur;
      if (choix.has(v)) choix.delete(v); else choix.add(v);
      b.setAttribute('aria-pressed', String(choix.has(v)));
      majCompte();
    });
    corps.querySelector('[data-filtre]').addEventListener('input', (e) => {
      const fq = normaliser(e.target.value);
      corps.querySelectorAll('[data-texte]').forEach((b) => { b.hidden = fq && !normaliser(b.dataset.texte).includes(fq); });
    });
    corps.querySelector('[data-filtre]').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
  }

  return dialogue({
    titre: 'Nouveau chapitre',
    corps,
    large: !vide,
    apresOuverture: () => corps.querySelector('[name="nom"]').focus(),
    actions: [
      { libelle: 'Annuler', valeur: null, genre: 'discret' },
      {
        libelle: 'Créer le chapitre',
        genre: 'principal',
        valider: async () => {
          const nom = corps.querySelector('[name="nom"]').value.trim();
          if (!nom) { toast('Donnez un nom au chapitre.', 'erreur'); return false; }
          try {
            return await appeler('chapitre.creer', { nom, categorie: corps.querySelector('[name="categorie"]').value.trim(), peupler: [...choix], cours: Boolean(corps.querySelector('[name="cours"]')?.checked) });
          } catch (err) {
            toast(err.message, 'erreur');
            return false;
          }
        },
      },
    ],
  });
}

async function dialogueModification(chap) {
  const corps = document.createElement('div');
  corps.innerHTML = `
    <div class="grille-formulaire">
      <label class="champ"><span class="champ-libelle">Nom</span><input type="text" name="nom" value="${echapper(chap.nom.replace(/_/g, ' '))}"></label>
      <label class="champ"><span class="champ-libelle">Catégorie</span><input type="text" name="categorie" list="nihonjo-categories" value="${echapper(chap.categorie)}"></label>
      ${listeCategories()}
    </div>
    <p class="aide-formulaire">La catégorie range le chapitre sur l'écran Réviser. Nom technique actuel : <code>${echapper(chap.nom)}</code> (les espaces deviennent « _ »).</p>`;
  return dialogue({
    titre: `Modifier « ${libelleChapitre(chap.id)} »`,
    corps,
    apresOuverture: () => corps.querySelector('[name="nom"]').select(),
    actions: [
      { libelle: 'Annuler', valeur: null, genre: 'discret' },
      {
        libelle: 'Enregistrer',
        genre: 'principal',
        valider: async () => {
          try {
            return await appeler('chapitre.modifier', {
              id: chap.id,
              nom: corps.querySelector('[name="nom"]').value,
              categorie: corps.querySelector('[name="categorie"]').value,
            });
          } catch (err) {
            toast(err.message, 'erreur');
            return false;
          }
        },
      },
    ],
  });
}
