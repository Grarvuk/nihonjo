// Composants d'interface communs : messages (toasts), boîtes de dialogue,
// confirmation. Remplacent les alert() / confirm() / prompt() de la v1, qui
// bloquaient la page et ne se mettaient pas en forme.

import { echapper } from './utils.js';
import { icone } from './icones.js';

// ---------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------

export function toast(message, genre = 'info', duree = 4200) {
  let pile = document.getElementById('toasts');
  if (!pile) {
    pile = document.createElement('div');
    pile.id = 'toasts';
    pile.setAttribute('role', 'status');
    pile.setAttribute('aria-live', 'polite');
    document.body.appendChild(pile);
  }
  const t = document.createElement('div');
  t.className = `toast toast-${genre}`;
  t.innerHTML = `${icone(genre === 'erreur' ? 'info' : genre === 'succes' ? 'coche' : 'info')}<span></span>`;
  t.querySelector('span').textContent = message;
  pile.appendChild(t);
  // Trois messages au plus : au-delà, les plus anciens n'apprennent plus rien.
  while (pile.children.length > 3) pile.firstElementChild.remove();
  const retirer = () => {
    t.classList.add('toast-sortie');
    setTimeout(() => t.remove(), 250);
  };
  t.addEventListener('click', retirer);
  setTimeout(retirer, genre === 'erreur' ? duree * 1.8 : duree);
}

/** Exécute une action asynchrone ; affiche son erreur dans un toast plutôt que de la perdre dans la console. */
export async function tenter(action, messageSucces) {
  try {
    const r = await action();
    if (messageSucces) toast(typeof messageSucces === 'function' ? messageSucces(r) : messageSucces, 'succes');
    return r;
  } catch (e) {
    console.error(e);
    toast(e.message || String(e), 'erreur');
    return undefined;
  }
}

// ---------------------------------------------------------------------
// Boîtes de dialogue (élément <dialog> natif)
// ---------------------------------------------------------------------

/**
 * Ouvre une boîte de dialogue et attend le choix.
 *
 * @param {object} o
 * @param {string} o.titre
 * @param {string|Node} o.corps     HTML (déjà échappé !) ou nœud
 * @param {Array<{libelle: string, valeur?: any, genre?: 'principal'|'danger'|'discret', valider?: (dlg: HTMLDialogElement) => any}>} o.actions
 *        `valider` peut renvoyer `false` pour garder la boîte ouverte (saisie invalide) ;
 *        toute autre valeur que `true`/`undefined` devient le résultat.
 * @param {boolean} [o.large]
 * @param {(dlg: HTMLDialogElement) => void} [o.apresOuverture]
 * @returns {Promise<any>} la valeur de l'action, ou null si fermée (Échap, croix)
 */
export function dialogue({ titre, corps, actions = [], large = false, apresOuverture }) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = `dialogue${large ? ' dialogue-large' : ''}`;
    dlg.innerHTML = `
      <form class="dialogue-cadre" novalidate>
        <header class="dialogue-tete">
          <h2>${echapper(titre)}</h2>
          <button type="button" class="bouton-icone" data-fermer aria-label="Fermer">${icone('croix')}</button>
        </header>
        <div class="dialogue-corps"></div>
        <footer class="dialogue-pied"></footer>
      </form>`;
    const zoneCorps = dlg.querySelector('.dialogue-corps');
    if (typeof corps === 'string') zoneCorps.innerHTML = corps;
    else if (corps) zoneCorps.appendChild(corps);

    let resultat = null;
    const fermer = (valeur) => {
      resultat = valeur;
      dlg.close();
    };
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(resultat);
    });
    dlg.querySelector('[data-fermer]').addEventListener('click', () => fermer(null));

    const pied = dlg.querySelector('.dialogue-pied');
    let boutonPrincipal = null;
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `bouton ${a.genre === 'principal' ? 'bouton-principal' : a.genre === 'danger' ? 'bouton-danger' : 'bouton-discret'}`;
      b.textContent = a.libelle;
      b.addEventListener('click', async () => {
        if (!a.valider) return fermer(a.valeur ?? true);
        b.disabled = true;
        try {
          const r = await a.valider(dlg);
          if (r === false) return;
          fermer(r === true || r === undefined ? (a.valeur ?? true) : r);
        } finally {
          b.disabled = false;
        }
      });
      if (a.genre === 'principal' || a.genre === 'danger') boutonPrincipal = b;
      pied.appendChild(b);
    });

    // Entrée dans un champ = l'action principale (pas d'envoi de formulaire).
    dlg.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      boutonPrincipal?.click();
    });

    document.body.appendChild(dlg);
    dlg.showModal();
    apresOuverture?.(dlg);
  });
}

export async function confirmer(titre, message, { libelleOk = 'Confirmer', danger = false } = {}) {
  const r = await dialogue({
    titre,
    corps: `<p class="dialogue-texte">${message}</p>`,
    actions: [
      { libelle: 'Annuler', valeur: false, genre: 'discret' },
      { libelle: libelleOk, valeur: true, genre: danger ? 'danger' : 'principal' },
    ],
  });
  return r === true;
}
