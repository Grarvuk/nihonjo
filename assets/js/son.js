// La voix japonaise du navigateur (synthèse vocale, `speechSynthesis`), pour
// écouter un mot et pour la dictée (25/10/2026).
//
// ⚠️ Rien n'est garanti : la liste des voix dépend du système (Windows a
// « Haruka » si la langue japonaise est installée, Android et macOS en ont
// une, un Firefox sous Linux souvent aucune), et elle arrive EN RETARD
// (événement `voiceschanged`) : un premier `getVoices()` peut être vide.
// D'où `quandVoixPretes()` avant de décider qu'il n'y a pas de voix, et un
// repli partout : bouton désactivé avec son explication, dictée indisponible.

const ATTENTE_MAX = 1500; // ms : au-delà, on considère qu'il n'y a pas de voix

/** La voix japonaise du navigateur, ou null. */
export function voixJaponaise() {
  if (!('speechSynthesis' in window)) return null;
  const voix = window.speechSynthesis.getVoices() || [];
  return voix.find((v) => v.lang === 'ja-JP') || voix.find((v) => /^ja\b/i.test(v.lang || '')) || null;
}

export function sonDisponible() {
  return voixJaponaise() !== null;
}

let attente = null;
/** Résout à true dès qu'une voix japonaise est là, à false après ATTENTE_MAX. */
export function quandVoixPretes() {
  if (sonDisponible()) return Promise.resolve(true);
  if (!('speechSynthesis' in window)) return Promise.resolve(false);
  if (!attente) {
    attente = new Promise((resoudre) => {
      const fin = (ok) => {
        window.speechSynthesis.removeEventListener('voiceschanged', verifier);
        attente = null;
        resoudre(ok);
      };
      const verifier = () => { if (sonDisponible()) fin(true); };
      window.speechSynthesis.addEventListener('voiceschanged', verifier);
      setTimeout(() => fin(sonDisponible()), ATTENTE_MAX);
    });
  }
  return attente;
}

export const RAISON_SANS_VOIX = 'Ce navigateur n’a pas de voix japonaise (réglages du système : ajouter la langue japonaise).';

/**
 * Prononce `texte` en japonais. Rend false s'il n'y a pas de voix (rien ne se
 * passe). Le kana se lit plus sûrement que le kanji : passer la lecture.
 */
export function prononcer(texte, { lent = false } = {}) {
  const voix = voixJaponaise();
  if (!voix || !texte) return false;
  const s = window.speechSynthesis;
  s.cancel(); // un deuxième clic recommence au lieu d'empiler
  const phrase = new SpeechSynthesisUtterance(texte);
  phrase.lang = 'ja-JP';
  phrase.voice = voix;
  phrase.rate = lent ? 0.6 : 0.9;
  s.speak(phrase);
  return true;
}
