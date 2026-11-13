// Pose l'identifiant d'application AdMob dans le manifeste Android
// (12/11/2026). Appelé par creer_application_android.bat, après la création
// du projet Android et à chaque construction :
//
//     node regler_admob.mjs android\app\src\main\AndroidManifest.xml ca-app-pub-XXXX~YYYY
//
// ⚠️ Pourquoi : le greffon des publicités (@capacitor-community/admob)
// embarque le SDK Google Mobile Ads, qui FERME l'application dès son
// ouverture si le manifeste n'a pas de <meta-data
// android:name="com.google.android.gms.ads.APPLICATION_ID">. Le dossier
// android\ est créé une fois par Capacitor puis gardé : on corrige donc le
// manifeste en place, sans rien dupliquer (relancer ne change rien de plus).
// L'identifiant n'est pas un secret (il est lisible dans tout APK).

import { readFileSync, writeFileSync } from 'node:fs';

const [, , chemin, id] = process.argv;
if (!chemin || !/^ca-app-pub-\d+~\d+$/.test(id || '')) {
  console.error(`Identifiant d'application AdMob invalide : « ${id || ''} » (attendu : ca-app-pub-<chiffres>~<chiffres>).`);
  process.exit(1);
}

const texte = readFileSync(chemin, 'utf8');
const ligne = `<meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${id}" />`;
const existante = /<meta-data\s+android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"[^>]*?(\/>|>\s*<\/meta-data>)/;

let nouveau;
if (existante.test(texte)) {
  nouveau = texte.replace(existante, ligne);
} else {
  if (!texte.includes('</application>')) {
    console.error(`${chemin} : pas de </application>, manifeste inattendu.`);
    process.exit(1);
  }
  const fin = texte.includes('\r\n') ? '\r\n' : '\n';
  nouveau = texte.replace('</application>', `    ${ligne}${fin}    </application>`);
}

if (nouveau !== texte) writeFileSync(chemin, nouveau, 'utf8');
console.log(`[OK] AdMob : identifiant d'application ${id}`);
