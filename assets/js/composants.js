// Fragments d'interface réutilisés par plusieurs vues. Les couleurs des cinq
// états (nouveau / en cours / à revoir / acquis / à rafraîchir) sont les mêmes partout : la barre, la
// pastille et le badge se lisent ensemble.

import { LIBELLES_STATUT, classeStatut, echapper, libelleChapitre } from './utils.js';
import { compterStatuts, donnees } from './etat.js';

/** Barre segmentée acquis / à rafraîchir / en cours / à revoir / nouveaux. */
export function barreStatuts(mots, { grande = false } = {}) {
  const c = compterStatuts(mots);
  const total = mots.length || 1;
  const part = (n) => `${((n / total) * 100).toFixed(2)}%`;
  return `<span class="barre-statuts${grande ? ' barre-grande' : ''}" role="img"
      aria-label="${c.acquis} acquis, ${c['a rafraichir']} à rafraîchir, ${c['en cours']} en cours, ${c['a revoir']} à revoir, ${c['non acquis']} nouveaux">
      <i class="seg-acquis" style="width:${part(c.acquis)}"></i><i class="seg-a-rafraichir" style="width:${part(c['a rafraichir'])}"></i><i class="seg-en-cours" style="width:${part(c['en cours'])}"></i><i class="seg-a-revoir" style="width:${part(c['a revoir'])}"></i>
    </span>`;
}

/** Le badge d'un état. `attributs` : du HTML d'attributs déjà sûr (le titre passe par `titreProgression`). */
export function badgeStatut(statut, { bouton = false, attributs = '' } = {}) {
  const balise = bouton ? 'button' : 'span';
  const type = bouton ? ' type="button"' : '';
  return `<${balise}${type} class="badge badge-${classeStatut(statut)}" ${attributs}>${LIBELLES_STATUT[statut]}</${balise}>`;
}

/** Le japonais d'un mot en ligne : écriture principale en grand, lecture en kana dessous si elle diffère. */
export function japonaisEnLigne(mot) {
  const principal = mot.jp_kanji[0] || mot.jp_kana[0] || '';
  const lecture = mot.jp_kanji.length ? mot.jp_kana.join('、') : mot.jp_kana.slice(1).join('、');
  return `<span class="jp-principal" lang="ja">${echapper(principal)}</span>${lecture ? `<span class="jp-lecture" lang="ja">${echapper(lecture)}</span>` : ''}`;
}

/** <option> des chapitres, groupés par catégorie. */
export function optionsChapitres(selectionne = '') {
  const { categories, chapitres } = donnees();
  return categories.map((cat) => {
    const liste = chapitres.filter((c) => c.categorie === cat.nom);
    if (!liste.length) return '';
    return `<optgroup label="${echapper(cat.nom)}">${liste.map((c) =>
      `<option value="${echapper(c.id)}"${c.id === selectionne ? ' selected' : ''}>${echapper(libelleChapitre(c.id))}</option>`).join('')}</optgroup>`;
  }).join('');
}

/** Contrôle segmenté (boutons radio) ; `nom` sert d'attribut name. */
export function segments(nom, options, valeur, libelle) {
  return `<fieldset class="segments">
      <legend>${echapper(libelle)}</legend>
      <div class="segments-rangee">${options.map(([v, l]) => `
        <label><input type="radio" name="${nom}" value="${echapper(v)}"${v === valeur ? ' checked' : ''}><span>${echapper(l)}</span></label>`).join('')}
      </div>
    </fieldset>`;
}

/**
 * L'avatar d'un compte : sa photo (Google, Discord) ou son initiale.
 * `referrerpolicy` : les serveurs de photos n'apprennent pas d'où l'on vient.
 */
export function avatar({ nom = '', email = '', photo = '' } = {}, { grand = false } = {}) {
  const classe = `avatar${grand ? ' avatar-grand' : ''}`;
  if (photo) return `<img class="${classe}" src="${echapper(photo)}" alt="" referrerpolicy="no-referrer">`;
  const initiale = (nom || email || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="${classe}" aria-hidden="true">${echapper(initiale)}</span>`;
}

/** Dates de la progression d'un mot, en clair (titre d'un badge) : acquis le…, à rafraîchir le… */
export function titreProgression(progression) {
  const p = progression || {};
  const date = (j) => new Date(`${j}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const morceaux = [];
  if (p.acquis_le) morceaux.push(`Acquis le ${date(p.acquis_le)}`);
  if (p.valide_le && p.valide_le !== p.acquis_le) morceaux.push(`revu le ${date(p.valide_le)}`);
  if (p.prochaine_revision) morceaux.push(`à rafraîchir à partir du ${date(p.prochaine_revision)}`);
  if (!morceaux.length && p.serie) morceaux.push(`${p.serie} réussite${p.serie > 1 ? 's' : ''} de suite`);
  return morceaux.join(', ');
}
