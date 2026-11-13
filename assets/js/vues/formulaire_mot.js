// Boîte de dialogue « Ajouter un mot » / « Modifier le mot ».
// Renvoie le mot enregistré (réponse de l'API), ou null si annulé.

import { appeler } from '../api.js';
import { donnees, thematiques, remplacerMot, chapitreMesMots, chapitresDuCompte } from '../etat.js';
import { creerClavier } from '../clavier.js';
import { dialogue, toast } from '../ui.js';
import { echapper, libelleChapitre, majuscule } from '../utils.js';
import { icone } from '../icones.js';

export async function formulaireMot(mot = null) {
  const { chapitres, categories } = donnees();
  const themes = new Set(mot ? mot.thematiques : []);
  // Les puces portent les CLÉS des chapitres (« mes_mots@3 ») ; un chapitre
  // nouveau part sous son NOM, et le serveur le crée dans le compte.
  //
  // Un mot du compte (nouveau ou à lui) : seuls SES chapitres sont proposés,
  // et « Mes mots » est coché et verrouillé — le serveur l'impose de toute
  // façon (Depot::enregistrerMot), même si on le décoche à la main (F12).
  // Un mot du cours (administrateur) : les chapitres du cours et les siens.
  const motDuCours = Boolean(mot && mot.origine === 'cours');
  const mesMots = chapitreMesMots();
  const cleMesMots = mesMots ? mesMots.id : 'mes_mots';
  // Les chapitres du mot qu'on ne montre pas (ex. un chapitre du cours) restent dans l'envoi.
  const chaps = new Set(mot ? mot.chapitres : [cleMesMots]);
  if (!motDuCours) chaps.add(cleMesMots);
  const proposes = motDuCours
    ? categories.flatMap((cat) => chapitres.filter((c) => c.categorie === cat.nom && c.modifiable)).map((c) => c.id)
    : chapitresDuCompte().map((c) => c.id);
  const joindre = (liste) => (liste || []).join(' && ');

  const corps = document.createElement('div');
  corps.className = 'formulaire-mot';
  corps.innerHTML = `
    <p class="aide-formulaire">Plusieurs variantes dans un champ : séparez-les par <kbd>&amp;&amp;</kbd> (ex. <em>thé &amp;&amp; thé vert</em>). La première est celle posée en question.</p>
    <div class="grille-formulaire">
      <label class="champ champ-plein"><span class="champ-libelle">Français <abbr title="obligatoire">*</abbr></span>
        <input type="text" name="fr" value="${echapper(joindre(mot?.fr))}" placeholder="eau &amp;&amp; flotte" required></label>
      <label class="champ"><span class="champ-libelle">Kana</span>
        <span class="champ-avec-bouton"><input type="text" name="jp_kana" lang="ja" value="${echapper(joindre(mot?.jp_kana))}" placeholder="みず">
        <button type="button" class="bouton-icone" data-clavier-pour="jp_kana" aria-label="Clavier de kana pour le champ Kana">${icone('clavier')}</button></span></label>
      <label class="champ"><span class="champ-libelle">Kanji</span>
        <span class="champ-avec-bouton"><input type="text" name="jp_kanji" lang="ja" value="${echapper(joindre(mot?.jp_kanji))}" placeholder="水">
        <button type="button" class="bouton-icone" data-clavier-pour="jp_kanji" aria-label="Clavier de kana pour le champ Kanji">${icone('clavier')}</button></span></label>
      <div class="champ-plein" data-zone-clavier></div>
      <label class="champ"><span class="champ-libelle">Rōmaji</span>
        <input type="text" name="jp_romaji" value="${echapper(joindre(mot?.jp_romaji))}" placeholder="mizu" autocapitalize="off" spellcheck="false"></label>
      <label class="champ"><span class="champ-libelle">Contexte</span>
        <input type="text" name="context" value="${echapper(mot?.context || '')}" placeholder="boisson, registre familier…"></label>
      <div class="champ champ-plein"><span class="champ-libelle" id="lib-themes">Thèmes</span>
        <div class="etiquettes" data-themes role="group" aria-labelledby="lib-themes">
          <input type="text" list="nihonjo-themes" placeholder="Ajouter un thème" data-nouveau-theme aria-label="Ajouter un thème">
        </div>
        <datalist id="nihonjo-themes">${thematiques().map((t) => `<option value="${echapper(t)}">`).join('')}</datalist>
      </div>
      <div class="champ champ-plein"><span class="champ-libelle" id="lib-chapitres">Chapitres</span>
        ${motDuCours ? '' : '<span class="aide-champ">Vos mots sont toujours dans « Mes mots ». Rangez-le aussi dans vos autres chapitres, si vous voulez.</span>'}
        <div class="puces puces-compactes" data-chapitres role="group" aria-labelledby="lib-chapitres"></div>
        <span class="champ-avec-bouton champ-nouveau-chapitre">
          <input type="text" placeholder="Nouveau chapitre" data-nouveau-chapitre aria-label="Nom d'un nouveau chapitre">
          <button type="button" class="bouton bouton-petit bouton-secondaire" data-ajouter-chapitre>${icone('plus')}Créer</button>
        </span>
      </div>
    </div>`;

  // ----- claviers de kana (un par champ japonais, un seul ouvert) -------
  const zoneClavier = corps.querySelector('[data-zone-clavier]');
  const claviers = {};
  corps.querySelectorAll('[data-clavier-pour]').forEach((b) => {
    const champ = corps.querySelector(`[name="${b.dataset.clavierPour}"]`);
    claviers[b.dataset.clavierPour] = creerClavier(champ, zoneClavier);
    b.addEventListener('click', () => {
      Object.entries(claviers).forEach(([nom, c]) => { if (nom !== b.dataset.clavierPour) c.basculer(false); });
      claviers[b.dataset.clavierPour].basculer();
      champ.focus();
    });
  });

  // ----- thèmes : étiquettes ---------------------------------------------
  const zoneThemes = corps.querySelector('[data-themes]');
  const champTheme = corps.querySelector('[data-nouveau-theme]');
  const rendreThemes = () => {
    zoneThemes.querySelectorAll('.etiquette').forEach((e) => e.remove());
    [...themes].forEach((t) => champTheme.insertAdjacentHTML('beforebegin',
      `<span class="etiquette">${echapper(majuscule(t))}<button type="button" data-retirer-theme="${echapper(t)}" aria-label="Retirer le thème ${echapper(t)}">${icone('croix')}</button></span>`));
  };
  const ajouterTheme = () => {
    champTheme.value.split(/&&|,/).map((t) => t.trim().toLowerCase()).filter(Boolean).forEach((t) => themes.add(t));
    champTheme.value = '';
    rendreThemes();
  };
  champTheme.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      e.stopPropagation();
      ajouterTheme();
    } else if (e.key === 'Backspace' && !champTheme.value && themes.size) {
      themes.delete([...themes].pop());
      rendreThemes();
    }
  });
  champTheme.addEventListener('change', ajouterTheme); // choix dans la liste proposée
  zoneThemes.addEventListener('click', (e) => {
    const b = e.target.closest('[data-retirer-theme]');
    if (b) { themes.delete(b.dataset.retirerTheme); rendreThemes(); }
  });

  // ----- chapitres : puces à cocher --------------------------------------
  const zoneChaps = corps.querySelector('[data-chapitres]');
  const nouveaux = mesMots || motDuCours ? [] : [cleMesMots];
  const rendreChapitres = () => {
    zoneChaps.innerHTML = [...proposes, ...nouveaux].map((id) => (!motDuCours && id === cleMesMots
      ? `<button type="button" class="puce puce-verrouillee" aria-pressed="true" aria-disabled="true" data-verrou title="Tous vos mots y sont, toujours">${icone('cadenas')}${echapper(libelleChapitre(id))}</button>`
      : `<button type="button" class="puce" aria-pressed="${chaps.has(id)}" data-chapitre="${echapper(id)}">${echapper(libelleChapitre(id))}</button>`)).join('');
  };
  zoneChaps.addEventListener('click', (e) => {
    const b = e.target.closest('[data-chapitre]');
    if (!b) return;
    const id = b.dataset.chapitre;
    if (chaps.has(id)) chaps.delete(id);
    else chaps.add(id);
    b.setAttribute('aria-pressed', String(chaps.has(id)));
  });
  const champChap = corps.querySelector('[data-nouveau-chapitre]');
  const ajouterChapitre = () => {
    const nom = champChap.value.trim().replace(/\s+/g, '_');
    if (!nom) return;
    const existant = chapitres.find((c) => c.nom === nom && (motDuCours ? c.modifiable : c.origine === 'perso'));
    if (existant) chaps.add(existant.id);
    else {
      if (!nouveaux.includes(nom)) nouveaux.push(nom);
      chaps.add(nom);
    }
    champChap.value = '';
    rendreChapitres();
  };
  corps.querySelector('[data-ajouter-chapitre]').addEventListener('click', ajouterChapitre);
  champChap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); ajouterChapitre(); }
  });

  rendreThemes();
  rendreChapitres();

  const lire = (nom) => corps.querySelector(`[name="${nom}"]`).value;

  return dialogue({
    titre: mot ? 'Modifier le mot' : 'Ajouter un mot',
    corps,
    large: true,
    apresOuverture: () => corps.querySelector('[name="fr"]').focus(),
    actions: [
      { libelle: 'Annuler', valeur: null, genre: 'discret' },
      {
        libelle: mot ? 'Enregistrer' : 'Ajouter le mot',
        genre: 'principal',
        valider: async () => {
          if (champTheme.value.trim()) ajouterTheme();
          if (!lire('fr').trim()) { toast('Il manque le français.', 'erreur'); return false; }
          if (!lire('jp_kana').trim() && !lire('jp_kanji').trim()) {
            toast('Il faut au moins une écriture japonaise : kana ou kanji.', 'erreur');
            return false;
          }
          try {
            const enregistre = await appeler('mot.enregistrer', {
              id: mot?.id ?? null,
              fr: lire('fr'),
              jp_kana: lire('jp_kana'),
              jp_kanji: lire('jp_kanji'),
              jp_romaji: lire('jp_romaji'),
              context: lire('context'),
              thematiques: [...themes],
              chapitres: motDuCours ? [...chaps] : [...new Set([cleMesMots, ...chaps])],
            });
            remplacerMot(enregistre);
            return enregistre;
          } catch (e) {
            toast(e.message, 'erreur');
            return false;
          }
        },
      },
    ],
  });
}
