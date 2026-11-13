"""L'application Android, simulée dans Chromium (Playwright).

Ce que l'APK fait, sans Android : le front est servi depuis une AUTRE
origine que l'API (comme dans la WebView de Capacitor), `window.Capacitor`
est présent (isNativePlatform → vrai), et `config_application.js` désigne le
serveur. On vérifie que les appels partent vers le serveur, que le CORS
(api/index.php, origines_application) les laisse passer — lecture ET écriture
(vérification préalable OPTIONS) —, que Discord n'est pas proposé, et qu'une
origine non déclarée est refusée.

Lancer depuis la racine du projet (il démarre lui-même ses deux serveurs) :
    python3 tests/application_simulee.py

La connexion Google native (greffon SocialLogin + Firebase) n'est PAS
couverte : elle exige un téléphone et les serveurs de Google.
"""
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

RACINE = Path(__file__).resolve().parent.parent
PORT_API, PORT_APPLI, PORT_INCONNU = 8766, 8771, 8772
API = f'http://127.0.0.1:{PORT_API}/'
APPLI = f'http://127.0.0.1:{PORT_APPLI}/'
INCONNU = f'http://127.0.0.1:{PORT_INCONNU}/'

echecs = []


def verifier(cond, quoi):
    print(('  ok  ' if cond else 'ÉCHEC ') + quoi)
    if not cond:
        echecs.append(quoi)


def attendre(url):
    for _ in range(50):
        try:
            urllib.request.urlopen(url, timeout=1)
            return
        except Exception:
            time.sleep(0.2)
    raise RuntimeError(f'{url} ne répond pas')


# Le « www » de l'application : la même copie que creer_application_android.bat.
temp = Path(tempfile.mkdtemp(prefix='nihonjo_appli_'))
www = temp / 'www'
www.mkdir()
shutil.copy(RACINE / 'index.html', www)
shutil.copy(RACINE / 'manifest.webmanifest', www)
shutil.copytree(RACINE / 'assets', www / 'assets', ignore=shutil.ignore_patterns('.htaccess'))
(www / 'assets' / 'js' / 'config_application.js').write_text(f"export const SERVEUR_APPLICATION = '{API}';\n", encoding='utf-8')

env = dict(os.environ, NIHONJO_AUTH='dev', NIHONJO_BASE=str(temp / 'essai.sqlite'),
           NIHONJO_ORIGINES_APPLICATION=APPLI.rstrip('/'))
serveurs = [
    subprocess.Popen(['php', '-S', f'127.0.0.1:{PORT_API}', '-t', str(RACINE)], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL),
    subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT_APPLI), '-d', str(www), '-b', '127.0.0.1'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL),
    subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT_INCONNU), '-d', str(www), '-b', '127.0.0.1'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL),
]

# Ce que la WebView de Capacitor injecte (native-bridge.js), en plus simple.
FAUX_CAPACITOR = """
window.__appelsNatifs = [];
window.Capacitor = {
  isNativePlatform: () => true,
  getPlatform: () => 'android',
  nativePromise: (greffon, methode, options) => { window.__appelsNatifs.push([greffon, methode, options]); return Promise.resolve({}); },
};
"""

try:
    attendre(API + 'api/index.php?action=sante')
    attendre(APPLI + 'index.html')
    attendre(INCONNU + 'index.html')
    with sync_playwright() as p:
        nav = p.chromium.launch()

        print('Application (origine déclarée)')
        ctx = nav.new_context(viewport={'width': 390, 'height': 844})
        ctx.add_init_script(FAUX_CAPACITOR)
        page = ctx.new_page()
        requetes, erreurs = [], []
        page.on('request', lambda r: requetes.append((r.method, r.url)))
        page.on('console', lambda m: erreurs.append(m.text) if m.type == 'error' else None)
        page.goto(APPLI + 'index.html')
        page.wait_for_selector('[data-form-dev]')
        verifier(any(u.startswith(API + 'api/index.php?action=sante') for _, u in requetes), 'sante : appelé sur le SERVEUR, pas sur l’origine de l’application')
        # Un serveur qui propose Discord (mode dev : il ne le propose jamais,
        # d'où la réponse de `sante` fabriquée ici).
        fournisseurs = page.evaluate("""import('./assets/js/auth.js').then(async (m) => {
            await m.initialiserConnexion({ auth: { mode: 'dev', fournisseurs: { google: true, discord: true } } });
            return m.fournisseursDisponibles();
        })""")
        verifier(fournisseurs['google'] and not fournisseurs['discord'], 'Discord proposé par le serveur, mais pas dans l’application')
        page.fill('[name=email]', 'appli@exemple.fr')
        page.click('[data-intention="inscription"]')
        page.wait_for_selector('.puce-chapitre')
        verifier(page.inner_text('[data-nombre]').strip() != '', 'compte créé et données chargées à travers le CORS (en-tête de connexion)')
        avant = len([r for r in requetes if r[0] == 'OPTIONS'])
        page.fill('[data-nombre-mots]', '7')
        page.wait_for_timeout(800)
        prefs = page.evaluate(f"""fetch('{API}api/index.php?action=donnees', {{ headers: {{ 'X-Nihonjo-Dev-Email': 'appli@exemple.fr' }} }}).then((r) => r.json())""")
        verifier(prefs['donnees']['preferences'].get('filtres', {}).get('limite') == '7', 'écriture (POST JSON, vérification préalable OPTIONS) : la préférence est enregistrée')
        verifier(all(u.startswith(API) for m, u in requetes if 'api/index.php' in u), 'aucun appel à l’API sur l’origine de l’application')
        verifier(not [e for e in erreurs if 'CORS' in e or 'Failed to fetch' in e], 'console : aucune erreur CORS')
        page.click('[data-mode="jp-fr"]')
        page.wait_for_selector('[data-reponse]')
        page.fill('[data-reponse]', 'zzz-faux'); page.keyboard.press('Enter')
        page.wait_for_selector('.correction')
        verifier(True, 'un exercice se joue (progression.resultat en POST)')
        ctx.close()

        print('Connexion Google native (greffon et Firebase simulés)')
        ctx = nav.new_context()
        ctx.add_init_script(FAUX_CAPACITOR.replace("return Promise.resolve({});",
            "return Promise.resolve(methode === 'login' ? { provider: 'google', result: { responseType: 'online', idToken: 'jeton-google-natif' } } : {});"))
        # Le SDK Firebase (gstatic) remplacé par un module minimal qui note ses appels.
        ctx.route('https://www.gstatic.com/firebasejs/**/firebase-app.js', lambda r: r.fulfill(
            body='export const initializeApp = (c) => ({ c });', content_type='text/javascript'))
        ctx.route('https://www.gstatic.com/firebasejs/**/firebase-auth.js', lambda r: r.fulfill(content_type='text/javascript', body='''
            window.__firebase = [];
            const auth = { currentUser: null };
            export const getAuth = () => auth;
            export const getRedirectResult = async () => null;
            export const onAuthStateChanged = (a, f) => { setTimeout(() => f(a.currentUser)); return () => {}; };
            export class GoogleAuthProvider { static credential(jeton) { return { jeton }; } setCustomParameters() {} }
            export const signInWithCredential = async (a, cred) => { window.__firebase.push(['signInWithCredential', cred.jeton]);
                a.currentUser = { email: 'g@x.fr', getIdToken: async () => 'jeton-firebase' }; return {}; };
            export const signInWithPopup = async () => { window.__firebase.push(['signInWithPopup']); };
            export const signOut = async (a) => { window.__firebase.push(['signOut']); a.currentUser = null; };
        '''))
        page = ctx.new_page()
        page.goto(APPLI + 'manifest.webmanifest')  # une page de la bonne origine, sans démarrer l'application
        r = page.evaluate("""import('./assets/js/auth.js').then(async (m) => {
            await m.initialiserConnexion({ auth: { mode: 'firebase', firebase: { apiKey: 'x' }, fournisseurs: { google: true, discord: true } } });
            const ok = await m.seConnecterGoogle();
            const entete = await m.enteteConnexion();
            await m.seDeconnecter();
            return { ok, entete, natifs: window.__appelsNatifs, firebase: window.__firebase };
        })""")
        natifs = [[g, m] for g, m, _ in r['natifs']]
        verifier(r['ok'] and natifs[:2] == [['SocialLogin', 'initialize'], ['SocialLogin', 'login']], 'Google dans l’application : sélecteur natif (initialize puis login), pas de fenêtre')
        verifier(r['natifs'][0][2]['google']['webClientId'].startswith('31939934404-') and 'scopes' not in r['natifs'][1][2]['options'],
                 'identifiant client « Web » du projet, et jamais de `scopes`')
        verifier(['signInWithCredential', 'jeton-google-natif'] in r['firebase'] and ['signInWithPopup'] not in r['firebase'],
                 'le jeton natif devient une session Firebase (signInWithCredential)')
        verifier(r['entete'] == {'X-Nihonjo-Jeton': 'jeton-firebase'}, 'les appels portent ensuite le jeton Firebase, comme sur le site')
        verifier(natifs[-1] == ['SocialLogin', 'logout'], 'se déconnecter ferme aussi la session Google d’Android')
        ctx.close()

        print('Origine non déclarée')
        ctx = nav.new_context()
        ctx.add_init_script(FAUX_CAPACITOR)
        page = ctx.new_page()
        page.goto(INCONNU + 'index.html')
        page.wait_for_selector('text=ne répond pas', timeout=15000)
        verifier(True, 'une autre origine n’obtient pas de réponse lisible (pas d’en-tête CORS)')
        ctx.close()
        nav.close()
finally:
    for s in serveurs:
        s.terminate()
    shutil.rmtree(temp, ignore_errors=True)

print()
print('ÉCHECS : ' + (', '.join(echecs) if echecs else 'aucun'))
sys.exit(1 if echecs else 0)
