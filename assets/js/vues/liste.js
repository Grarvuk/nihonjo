// « Voir la liste des mots » : les mots de la sélection de « Réviser », pour
// les relire, changer leur état à la main, ou lancer l'exercice d'écriture
// (un mot, ou plusieurs cochés). C'était « Consulter le cours » en v1.

import { motsSelectionnes, statut, majProgression, preference, ecrirePreference } from '../etat.js';
import { appeler } from '../api.js';
import { naviguer } from '../routeur.js';
import { badgeStatut, japonaisEnLigne, titreProgression } from '../composants.js';
import { echapper, normaliser, pluriel } from '../utils.js';
import { icone } from '../icones.js';
import { tenter } from '../ui.js';
import { lancerEcriture } from './ecriture.js';

// Le badge d'état cliquable fait le tour des quatre états (le serveur règle
// les paliers qui vont avec : Depot::champsPourStatut).
// « à rafraîchir » (calculé) → « acquis » : on le marque revu aujourd'hui.
const CYCLE = { 'non acquis': 'en cours', 'en cours': 'acquis', acquis: 'a revoir', 'a revoir': 'non acquis', 'a rafraichir': 'acquis' };
/** Le badge cliquable de la liste ; son titre dit les dates (acquis le…, à rafraîchir le…). */
function badgeCycle(etat, progression) {
  const dates = titreProgression(progression);
  return badgeStatut(etat, { bouton: true, attributs: `data-cycle title="${echapper(dates ? `${dates}. Toucher pour changer l’état` : 'Changer l’état')}"` });
}

const CLE_REGLAGES = 'ecriture'; // préférence du compte (dans la base)

/**
 * Réglages de l'écriture. `difficile` (« de mémoire ») est vrai par défaut
 * depuis le 25/10/2026 : recopier un modèle sous les yeux n'entraîne que la
 * main (revue du concepteur). Un choix enregistré reste respecté.
 */
export function reglagesEcriture() {
  return { repetitions: 3, difficile: true, ...preference(CLE_REGLAGES, {}) };
}

export function afficher(racine) {
  const mots = motsSelectionnes();
  const coches = new Set();
  const r = reglagesEcriture();

  racine.innerHTML = `
    <div class="liste">
      <div class="barre-vue">
        <button type="button" class="bouton bouton-discret" data-retour>${icone('retour')}Chapitres</button>
      </div>
      <header class="entete-vue">
        <h1>Liste des mots</h1>
        <p class="sous-titre">${pluriel(mots.length, 'mot')} dans la sélection. Cliquez sur un état pour le changer.</p>
      </header>
      <div class="feuille">
        <div class="outils-liste">
          <label class="champ-recherche">${icone('recherche')}<input type="search" placeholder="Chercher (français, kana, kanji, rōmaji)" aria-label="Chercher un mot" data-recherche></label>
          <div class="reglages-ecriture">
            <label class="champ champ-en-ligne"><span class="champ-libelle">Répétitions</span><input type="number" min="1" max="10" value="${r.repetitions}" data-repetitions></label>
            <label class="interrupteur" title="Le modèle japonais disparaît dès la première lettre tapée (ou après quelques secondes), et ne revient qu'après une erreur.">
              <input type="checkbox" data-difficile${r.difficile ? ' checked' : ''}><span class="interrupteur-piste"></span>De mémoire
            </label>
          </div>
        </div>
        <div class="barre-selection" data-barre-selection hidden>
          <span data-nb-coches></span>
          <button type="button" class="bouton bouton-principal" data-ecrire-coches>${icone('crayon')}Écrire ces mots</button>
          <button type="button" class="lien" data-decocher>Tout décocher</button>
        </div>
        <table class="tableau-mots">
          <thead><tr>
            <th class="col-case"><input type="checkbox" data-tout aria-label="Tout cocher"></th>
            <th>Français</th><th>Japonais</th><th>État</th><th class="col-actions"><span class="sr-only">Actions</span></th>
          </tr></thead>
          <tbody data-lignes></tbody>
        </table>
        <p class="vide" data-vide hidden>Aucun mot ne correspond à cette recherche.</p>
      </div>
    </div>`;

  const corps = racine.querySelector('[data-lignes]');
  const champRecherche = racine.querySelector('[data-recherche]');

  const visibles = () => {
    const q = normaliser(champRecherche.value);
    if (!q) return mots;
    return mots.filter((m) => [...m.fr, ...m.jp_kana, ...m.jp_kanji, ...m.jp_romaji].some((v) => normaliser(v).includes(q)));
  };

  const rendreLignes = () => {
    const liste = visibles();
    racine.querySelector('[data-vide]').hidden = liste.length > 0;
    corps.innerHTML = liste.map((m) => `
      <tr data-id="${m.id}">
        <td class="col-case"><input type="checkbox" data-coche${coches.has(m.id) ? ' checked' : ''} aria-label="Cocher « ${echapper(m.fr[0])} »"></td>
        <td class="col-fr">${echapper(m.fr.join(', '))}${m.context ? `<span class="contexte">${echapper(m.context)}</span>` : ''}</td>
        <td class="col-jp">${japonaisEnLigne(m)}</td>
        <td class="col-etat">${badgeCycle(statut(m), m.progression)}</td>
        <td class="col-actions"><button type="button" class="bouton bouton-petit bouton-secondaire" data-ecrire>${icone('crayon')}Écrire</button></td>
      </tr>`).join('');
  };

  const majSelection = () => {
    const barre = racine.querySelector('[data-barre-selection]');
    barre.hidden = coches.size === 0;
    racine.querySelector('[data-nb-coches]').textContent = `${pluriel(coches.size, 'mot coché', 'mots cochés')}`;
    const tout = racine.querySelector('[data-tout]');
    const liste = visibles();
    tout.checked = liste.length > 0 && liste.every((m) => coches.has(m.id));
    tout.indeterminate = !tout.checked && liste.some((m) => coches.has(m.id));
  };

  const sauverReglages = () => ecrirePreference(CLE_REGLAGES, {
    repetitions: Math.min(10, Math.max(1, parseInt(racine.querySelector('[data-repetitions]').value, 10) || 3)),
    difficile: racine.querySelector('[data-difficile]').checked,
  });
  racine.querySelector('[data-repetitions]').addEventListener('change', sauverReglages);
  racine.querySelector('[data-difficile]').addEventListener('change', sauverReglages);

  champRecherche.addEventListener('input', () => { rendreLignes(); majSelection(); });
  racine.querySelector('[data-retour]').addEventListener('click', () => naviguer('reviser'));
  racine.querySelector('[data-tout]').addEventListener('change', (e) => {
    visibles().forEach((m) => (e.target.checked ? coches.add(m.id) : coches.delete(m.id)));
    rendreLignes();
    majSelection();
  });
  racine.querySelector('[data-decocher]').addEventListener('click', () => {
    coches.clear();
    rendreLignes();
    majSelection();
  });
  racine.querySelector('[data-ecrire-coches]').addEventListener('click', () => {
    sauverReglages();
    // Dans l'ordre de la liste, pas dans l'ordre des clics.
    lancerEcriture(mots.filter((m) => coches.has(m.id)).map((m) => m.id));
  });

  corps.addEventListener('change', (e) => {
    if (!e.target.matches('[data-coche]')) return;
    const id = Number(e.target.closest('tr').dataset.id);
    if (e.target.checked) coches.add(id);
    else coches.delete(id);
    majSelection();
  });
  corps.addEventListener('click', async (e) => {
    const ligne = e.target.closest('tr');
    if (!ligne) return;
    const id = Number(ligne.dataset.id);
    if (e.target.closest('[data-ecrire]')) {
      sauverReglages();
      lancerEcriture([id]);
      return;
    }
    const badge = e.target.closest('[data-cycle]');
    if (badge) {
      const mot = mots.find((m) => m.id === id);
      const suivant = CYCLE[statut(mot)];
      badge.disabled = true;
      const progression = await tenter(() => appeler('progression.definir', { mot_id: id, statut: suivant }));
      if (progression) {
        majProgression(id, progression);
        badge.outerHTML = badgeCycle(progression.statut, progression);
      } else badge.disabled = false;
    }
  });

  rendreLignes();
  majSelection();
}
