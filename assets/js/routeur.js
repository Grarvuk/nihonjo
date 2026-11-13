// Navigation par l'ancre de l'URL (#/reviser, #/lexique…) : le bouton
// « précédent » du navigateur marche, et rien ne recharge la page.
// (La v1 revenait au menu par location.reload(), qui perdait tout l'état.)

export function naviguer(vue) {
  const cible = `#/${vue}`;
  if (location.hash === cible) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = cible;
}

export function vueDemandee() {
  return location.hash.replace(/^#\/?/, '').split('?')[0] || 'reviser';
}
