// Jeu d'icônes en SVG, dessiné pour Nihonjo (traits de 1,75 px sur une
// grille de 24). Remplace Font Awesome de la v1 : plus de feuille externe à
// charger, et les icônes prennent la couleur du texte (currentColor).

const TRACES = {
  reviser: '<path d="M4 20c3.2 0 5.3-1.1 6.4-3.2L19 8.2a2.1 2.1 0 0 0-3-3l-8.6 8.6C5.3 14.9 4.2 17 4 20z"/><path d="M14.5 6.7l2.8 2.8"/>',
  liste: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" stroke-width="2.6"/>',
  dossier: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2h7.2a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  donnees: '<path d="M7 4.5v14M3.5 15l3.5 3.5 3.5-3.5M17 19.5v-14M13.5 9l3.5-3.5L20.5 9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  crayon: '<path d="M4 20h4L19.2 8.8a2.1 2.1 0 0 0-3-3L5 17v3z"/><path d="M14.5 7.5l2.9 2.9"/>',
  corbeille: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5"/>',
  clavier: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9" stroke-linecap="round"/>',
  recherche: '<circle cx="11" cy="11" r="6.2"/><path d="M20 20l-4.6-4.6"/>',
  retour: '<path d="M19 12H5.5M11 6l-6 6 6 6"/>',
  suivant: '<path d="M5 12h13.5M13 6l6 6-6 6"/>',
  lune: '<path d="M19.5 14.6A7.8 7.8 0 1 1 9.4 4.5a6.2 6.2 0 0 0 10.1 10.1z"/>',
  soleil: '<circle cx="12" cy="12" r="3.8"/><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4"/>',
  telecharger: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
  envoyer: '<path d="M12 19.5v-11M7.5 13L12 8.5l4.5 4.5M5 4.5h14"/>',
  jouer: '<path d="M8 5.5l10.5 6.5L8 18.5z"/>',
  son: '<path d="M4.5 9.5h3.5l4.5-4v13l-4.5-4H4.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  croix: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  coche: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  oeil: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  rejouer: '<path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9M19.5 4.5V9H15M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15M4.5 19.5V15H9"/>',
  base: '<ellipse cx="12" cy="6" rx="7.5" ry="2.8"/><path d="M4.5 6v12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8V6M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  navigateur: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 9h18M6.5 6.8h.01M9 6.8h.01"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>',
  compte: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-3.9 3.9-6 7.5-6s6.6 2.1 7.5 6"/>',
  // Une case de cahier et sa croix de repère : l'emblème des kana.
  // 木 en trois traits : l'emblème des kanjis.
  kanji: '<path d="M4.5 8.5h15M12 3.5v17M11.5 9.5c-1.6 3.6-4 6.3-7 8M12.5 9.5c1.6 3.6 4 6.3 7 8"/>',
  kana: '<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><path d="M12 3.5v17M3.5 12h17" stroke-dasharray="2 2.2" stroke-width="1.2"/>',
  cadenas: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/>',
  importer: '<path d="M12 3.5v11M7.5 10L12 14.5 16.5 10"/><path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
  copier: '<rect x="8.5" y="8.5" width="11" height="11" rx="1.8"/><path d="M15.5 8.5V6.3a1.8 1.8 0 0 0-1.8-1.8H6.3a1.8 1.8 0 0 0-1.8 1.8v7.4a1.8 1.8 0 0 0 1.8 1.8h2.2"/>',
  deplacer: '<path d="M4 12h14M14 7.5l4.5 4.5-4.5 4.5"/><path d="M4 6.5v11" stroke-dasharray="2 2.4"/>',
  retirer: '<path d="M5.5 12h13"/><circle cx="12" cy="12" r="8.5"/>',
  // Bulle de discussion (bouton Discord) : un dessin générique, pas le logo.
  bulle: '<path d="M4.5 6.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4.5 3.5v-3.5h0a2 2 0 0 1-2-2z"/><path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01" stroke-width="2.4" stroke-linecap="round"/>',
  sortie: '<path d="M14 4.5h3.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H14"/><path d="M10 8l-4 4 4 4M6 12h9.5"/>',
  equipe: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 19.5c.7-3.3 3.1-5.2 6-5.2s5.3 1.9 6 5.2"/><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8M17.5 14.6c1.7.7 3 2.4 3.5 4.9"/>',
  etincelle: '<path d="M12 3.5l1.9 5.2 5.1 1.9-5.1 1.9L12 17.7l-1.9-5.2-5.1-1.9 5.1-1.9z"/><path d="M18.5 16.5v3M17 18h3"/>',
};

export function icone(nom, classe = '') {
  return `<svg class="icone ${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${TRACES[nom] || ''}</svg>`;
}
