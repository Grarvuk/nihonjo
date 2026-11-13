// « Mon compte » (#/compte), sur le modèle du profil d'Odyvresse : qui je
// suis (photo, nom, adresse, rôle, d'où vient le compte), ce que contient le
// compte, le pseudo à choisir, les données (export, import, sauvegarde), puis
// se déconnecter ou supprimer le compte.
//
// Les chiffres viennent du serveur (`compte.profil`), pas de la copie en
// mémoire : ils comptent ce qui est À ce compte (ses mots, ses chapitres).
// La suppression est faite par le serveur (`compte.supprimer`, ON DELETE
// CASCADE) ; il refuse celle du dernier administrateur.

import { appeler } from '../api.js';
import { modeConnexion } from '../auth.js';
import { estAdmin, majUtilisateur } from '../etat.js';
import { avatar } from '../composants.js';
import { echapper, pluriel } from '../utils.js';
import { icone } from '../icones.js';
import { confirmer, tenter, toast } from '../ui.js';
import { exporterMots, mesMots, ouvrirSauvegarde } from '../echanges.js';
import { terminerSession, libelleFournisseur, dateLisible } from '../session.js';

const LONGUEUR_PSEUDO = 40; // Comptes::LONGUEUR_PSEUDO

export function afficher(racine) {
  racine.innerHTML = '<p class="chargement">Chargement du compte…</p>';
  let vivant = true;
  appeler('compte.profil')
    .then((profil) => { if (vivant) rendre(racine, profil); })
    .catch((e) => {
      if (!vivant) return;
      racine.innerHTML = `<div class="feuille panne"><h1>Compte illisible</h1><p>${echapper(e.message)}</p></div>`;
    });
  return () => { vivant = false; };
}

function rendre(racine, { compte, contenu }) {
  const local = modeConnexion() === 'aucune';
  const admin = estAdmin();
  const chiffres = [
    [contenu.mots, 'mot ajouté', 'mots ajoutés'],
    [contenu.chapitres, 'chapitre', 'chapitres'],
    [contenu.acquis, 'mot acquis', 'mots acquis'],
    [contenu.en_cours ?? 0, 'mot en cours', 'mots en cours'],
    [contenu.a_revoir, 'mot à revoir', 'mots à revoir'],
    [contenu.kana_acquis, 'kana acquis', 'kana acquis'],
  ];
  racine.innerHTML = `
    <div class="page-compte">
      <header class="entete-vue">
        <h1>Mon compte</h1>
        <p class="sous-titre">Tout ce qui est à vous est gardé dans ce compte, sur le serveur : rien dans ce navigateur. Vous le retrouvez sur tous vos appareils.</p>
      </header>

      <section class="feuille carte-profil" aria-label="Le compte">
        <div class="profil-identite">
          ${local ? `<span class="avatar avatar-grand">${icone('compte')}</span>` : avatar(compte, { grand: true })}
          <div class="profil-texte">
            <h2 class="profil-nom" data-nom>${echapper(local ? 'Poste local' : compte.nom)}</h2>
            ${compte.email ? `<p class="profil-email">${echapper(compte.email)}</p>` : ''}
            <p class="profil-puces">
              <span class="badge ${compte.role === 'admin' ? 'badge-admin' : 'badge-non-acquis'}">${compte.role === 'admin' ? 'Administrateur' : 'Membre'}</span>
              <span class="badge badge-fournisseur">${local ? 'Sans connexion' : `Compte ${echapper(libelleFournisseur(compte.fournisseur))}`}</span>
            </p>
          </div>
        </div>
        <dl class="profil-chiffres">
          ${chiffres.map(([n, un, plusieurs]) => `<div><dt>${echapper(n > 1 ? plusieurs : un)}</dt><dd>${n.toLocaleString('fr-FR')}</dd></div>`).join('')}
        </dl>
        <p class="discret profil-depuis">${compte.cree_le ? `Compte créé le ${echapper(dateLisible(compte.cree_le))} · ` : ''}n° ${compte.id}</p>
      </section>

      <section class="feuille section-compte">
        <h2>Votre nom dans Nihonjo</h2>
        <form class="form-pseudo" data-form-pseudo>
          <label class="champ"><span class="champ-libelle">Pseudo</span>
            <input type="text" name="pseudo" maxlength="${LONGUEUR_PSEUDO}" autocomplete="nickname" value="${echapper(compte.pseudo || '')}" placeholder="${echapper(compte.nom_fournisseur || 'Votre pseudo')}"></label>
          <button class="bouton bouton-principal" type="submit">Enregistrer le pseudo</button>
        </form>
        <p class="bloc-ajout-aide">${compte.nom_fournisseur ? `Vide : le nom de votre compte ${echapper(libelleFournisseur(compte.fournisseur))}, « ${echapper(compte.nom_fournisseur)} ».` : 'Le nom affiché en haut à droite.'} ${LONGUEUR_PSEUDO} caractères au plus.</p>
      </section>

      <section class="feuille section-compte">
        <h2>Vos données</h2>
        <p class="bloc-ajout-aide">Emportez vos mots dans un fichier (pour les garder, ou les donner à quelqu'un) ; ajoutez-en d'un coup par un fichier.</p>
        <div class="profil-actions">
          <button type="button" class="bouton bouton-secondaire" data-exporter>${icone('telecharger')}Exporter mes mots</button>
          <a class="bouton bouton-secondaire" href="#/importer">${icone('importer')}Importer des mots</a>
          <a class="bouton bouton-secondaire" href="#/chapitres">${icone('dossier')}Gérer mes chapitres</a>
          ${admin ? `<a class="bouton bouton-secondaire" href="#/comptes">${icone('equipe')}Gérer les comptes</a>` : ''}
          ${admin ? `<button type="button" class="bouton bouton-secondaire" data-sauvegarde>${icone('base')}Sauvegarde complète…</button>` : ''}
        </div>
      </section>

      ${local ? `
      <section class="feuille section-compte">
        <h2>Poste local</h2>
        <p class="bloc-ajout-aide">Ce poste fonctionne sans connexion (mode « aucune ») : un seul compte, qui ne se supprime pas. Pour des comptes Google ou Discord, voir <code>docker-compose.yml</code>.</p>
      </section>` : `
      <section class="feuille section-compte zone-danger">
        <h2>Quitter</h2>
        <div class="profil-actions">
          <button type="button" class="bouton bouton-secondaire" data-deconnexion>${icone('sortie')}Se déconnecter</button>
          <button type="button" class="bouton bouton-danger" data-supprimer>${icone('corbeille')}Supprimer mon compte…</button>
        </div>
        <p class="bloc-ajout-aide">Supprimer le compte efface pour toujours vos mots, vos chapitres, votre progression et vos réglages. Le cours n'est pas touché, ni votre compte ${echapper(libelleFournisseur(compte.fournisseur))}. Exportez vos mots avant, si vous voulez les garder.</p>
      </section>`}
    </div>`;

  racine.querySelector('[data-form-pseudo]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const bouton = e.currentTarget.querySelector('button');
    const pseudo = String(new FormData(e.currentTarget).get('pseudo') || '');
    bouton.disabled = true;
    const moi = await tenter(() => appeler('compte.modifier', { pseudo }), (u) => (u.pseudo ? `Vous voilà « ${u.nom} ».` : `Pseudo retiré : « ${u.nom} ».`));
    bouton.disabled = false;
    if (!moi) return;
    majUtilisateur(moi);
    if (!local) racine.querySelector('[data-nom]').textContent = moi.nom;
    window.dispatchEvent(new CustomEvent('nihonjo:compte-modifie'));
  });
  racine.querySelector('[data-exporter]').addEventListener('click', () => exporterMots(mesMots(), 'nihonjo_mes_mots.json'));
  racine.querySelector('[data-sauvegarde]')?.addEventListener('click', () => ouvrirSauvegarde());
  racine.querySelector('[data-deconnexion]')?.addEventListener('click', () => terminerSession());
  racine.querySelector('[data-supprimer]')?.addEventListener('click', async () => {
    const ok = await confirmer(
      'Supprimer votre compte ?',
      `Seront effacés pour toujours : ${pluriel(contenu.mots, 'mot ajouté', 'mots ajoutés')}, ${pluriel(contenu.chapitres, 'chapitre')}, votre progression (${pluriel(contenu.acquis, 'mot acquis', 'mots acquis')}) et vos réglages.<br><br>Le cours reste, et votre compte ${echapper(libelleFournisseur(compte.fournisseur))} aussi : vous pourrez recréer un compte Nihonjo, mais il partira de zéro.`,
      { libelleOk: 'Supprimer mon compte', danger: true },
    );
    if (!ok) return;
    const bilan = await tenter(() => appeler('compte.supprimer', { confirmation: 'supprimer' }));
    if (!bilan) return; // refusé (dernier administrateur…) : le message est affiché
    await terminerSession('Votre compte Nihonjo a été supprimé.');
    toast('Compte supprimé.', 'succes');
  });
}
