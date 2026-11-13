// « Gérer les comptes » (#/comptes), administrateur : tous les comptes de
// Nihonjo, ce qu'ils contiennent, quand ils sont venus ; nommer ou retirer
// un administrateur, supprimer un compte (et tout ce qui est à lui).
//
// Le serveur décide (Depot::listerComptes, changerRoleCompte,
// supprimerUnCompte → 403 pour un membre ; 409 s'il ne restait plus
// d'administrateur). Sa propre ligne n'a pas d'action : on se gère dans
// « Mon compte ».

import { appeler } from '../api.js';
import { estAdmin } from '../etat.js';
import { avatar } from '../composants.js';
import { echapper, pluriel } from '../utils.js';
import { icone } from '../icones.js';
import { confirmer, tenter } from '../ui.js';
import { libelleFournisseur, dateLisible } from '../session.js';

export function afficher(racine) {
  if (!estAdmin()) {
    racine.innerHTML = `
      <div class="feuille panne">
        <h1>Réservé aux administrateurs</h1>
        <p>La liste des comptes ne se montre qu'à un administrateur de Nihonjo.</p>
        <a class="bouton bouton-principal" href="#/compte">Voir mon compte</a>
      </div>`;
    return undefined;
  }
  racine.innerHTML = `
    <div class="page-comptes">
      <header class="entete-vue">
        <h1>Comptes</h1>
        <p class="sous-titre">Qui utilise Nihonjo. Chaque compte a ses mots, ses chapitres et sa progression ; le cours est commun. Un administrateur modifie le cours, gère les comptes et la sauvegarde complète.</p>
      </header>
      <p class="discret" data-resume></p>
      <ul class="liste-comptes" data-liste><li class="chargement">Chargement des comptes…</li></ul>
    </div>`;
  const liste = racine.querySelector('[data-liste]');
  let vivant = true;
  let comptes = [];
  let moi = 0;

  const charger = async () => {
    const r = await appeler('comptes.lister');
    if (!vivant) return;
    comptes = r.comptes;
    moi = r.moi;
    rendreListe();
  };

  const rendreListe = () => {
    const admins = comptes.filter((c) => c.role === 'admin').length;
    racine.querySelector('[data-resume]').textContent = `${pluriel(comptes.length, 'compte')}, dont ${pluriel(admins, 'administrateur')}.`;
    liste.innerHTML = comptes.map((c) => ligne(c, c.id === moi)).join('');
  };

  liste.addEventListener('click', async (e) => {
    const bouton = e.target.closest('[data-role], [data-supprimer]');
    if (!bouton) return;
    const c = comptes.find((x) => x.id === Number(bouton.dataset.id));
    if (!c) return;
    if (bouton.dataset.role) {
      const role = bouton.dataset.role;
      const fait = await tenter(
        () => appeler('comptes.role', { id: c.id, role }),
        role === 'admin' ? `${c.nom_affiche} est administrateur.` : `${c.nom_affiche} n'est plus administrateur.`,
      );
      if (fait) await tenter(charger);
      return;
    }
    const ok = await confirmer(
      `Supprimer le compte de ${c.nom_affiche} ?`,
      `Seront effacés pour toujours : ${pluriel(c.contenu.mots, 'mot ajouté', 'mots ajoutés')}, ${pluriel(c.contenu.chapitres, 'chapitre')}, sa progression et ses réglages. Le cours n'est pas touché.<br><br>Son compte ${echapper(libelleFournisseur(c.fournisseur))} reste : la personne pourra recréer un compte Nihonjo, vide.`,
      { libelleOk: 'Supprimer ce compte', danger: true },
    );
    if (!ok) return;
    const fait = await tenter(() => appeler('comptes.supprimer', { id: c.id }), `Compte de ${c.nom_affiche} supprimé.`);
    if (fait) await tenter(charger);
  });

  tenter(charger).then(() => {
    if (vivant && !comptes.length) liste.innerHTML = '<li class="discret">La liste des comptes ne se charge pas.</li>';
  });
  return () => { vivant = false; };
}

function ligne(c, estMoi) {
  const reclame = c.fournisseur !== null;
  const contenu = [
    pluriel(c.contenu.mots, 'mot ajouté', 'mots ajoutés'),
    pluriel(c.contenu.chapitres, 'chapitre'),
    pluriel(c.contenu.acquis, 'acquis', 'acquis'),
  ].join(' · ');
  const dates = [
    c.cree_le ? `créé le ${dateLisible(c.cree_le)}` : '',
    c.vu_le ? `venu le ${dateLisible(c.vu_le, { heure: true })}` : 'jamais venu',
  ].filter(Boolean).join(' · ');
  return `
    <li class="feuille ligne-compte${estMoi ? ' ligne-compte-moi' : ''}">
      ${avatar({ nom: c.nom_affiche, email: c.email, photo: c.photo })}
      <div class="ligne-compte-texte">
        <p class="ligne-compte-nom"><strong>${echapper(c.nom_affiche || 'Sans nom')}</strong>
          ${c.role === 'admin' ? '<span class="badge badge-admin">Administrateur</span>' : ''}
          <span class="badge badge-fournisseur">${reclame ? `Compte ${echapper(libelleFournisseur(c.fournisseur))}` : 'compte initial, pas encore réclamé'}</span>
          ${estMoi ? '<span class="badge badge-non-acquis">vous</span>' : ''}</p>
        ${c.email ? `<p class="discret ligne-compte-email">${echapper(c.email)}</p>` : ''}
        <p class="discret ligne-compte-infos">${echapper(contenu)} — ${echapper(dates)}</p>
      </div>
      <div class="ligne-compte-actions">
        ${estMoi ? `<a class="bouton bouton-discret bouton-petit" href="#/compte">${icone('compte')}Mon compte</a>` : `
          ${c.role === 'admin'
            ? `<button type="button" class="bouton bouton-secondaire bouton-petit" data-role="membre" data-id="${c.id}">Retirer l'administration</button>`
            : `<button type="button" class="bouton bouton-secondaire bouton-petit" data-role="admin" data-id="${c.id}">Nommer administrateur</button>`}
          <button type="button" class="bouton-icone bouton-icone-danger" data-supprimer data-id="${c.id}" aria-label="Supprimer le compte de ${echapper(c.nom_affiche)}" title="Supprimer ce compte">${icone('corbeille')}</button>`}
      </div>
    </li>`;
}
