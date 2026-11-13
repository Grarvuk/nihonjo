"""Parcours complet de Nihonjo dans un vrai navigateur (Playwright) : connexion,
chaque écran, chaque exercice, le jeu des kana, deux comptes séparés, la
reprise des données v1. Échoue sur toute vérification ratée ET sur toute
erreur de la console.

⚠️ Le parcours ÉCRIT dans la base et suppose une base NEUVE (amorce seule),
servie en mode de connexion « dev » (une adresse suffit, sans Google). Ne
jamais le lancer contre la vraie base :

    NIHONJO_AUTH=dev NIHONJO_BASE=/tmp/nihonjo_essai.sqlite php -S 127.0.0.1:8765 -t .
    python3 tests/parcours_navigateur.py

Variables : NIHONJO_URL (défaut http://127.0.0.1:8765/), NIHONJO_CAPTURES
(dossier où écrire des captures PNG ; aucune sinon), NIHONJO_POLICES (dossier
node_modules/@fontsource contenant dm-sans, manrope et noto-sans-jp : vraies
polices sur les captures ; sinon polices de repli).
Prérequis : pip install playwright && playwright install chromium.
"""
import json, os, pathlib, re, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get('NIHONJO_URL', 'http://127.0.0.1:8765/')
CAPTURES = pathlib.Path(os.environ['NIHONJO_CAPTURES']) if os.environ.get('NIHONJO_CAPTURES') else None
POLICES = pathlib.Path(os.environ['NIHONJO_POLICES']) if os.environ.get('NIHONJO_POLICES') else None
if CAPTURES:
    CAPTURES.mkdir(parents=True, exist_ok=True)

journal = []
echecs = []


def css_polices():
    if not POLICES:
        return ''
    morceaux = []
    for paquet, poids in (('dm-sans', ('400', '500', '600', '700')), ('manrope', ('600', '700', '800')), ('noto-sans-jp', ('400', '500', '700'))):
        for p in poids:
            css = (POLICES / paquet / f'{p}.css').read_text()
            morceaux.append(re.sub(r'url\(\./files/([^)]+)\)', lambda m: f'url(https://polices.test/{paquet}/{m.group(1)})', css))
    return '\n'.join(morceaux)


CSS = css_polices()


def brancher(page):
    page.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, content_type='text/css', body=CSS))
    page.route('https://fonts.gstatic.com/**', lambda r: r.fulfill(status=204, body=''))
    if POLICES:
        def fichier(route):
            paquet, nom = route.request.url.split('https://polices.test/')[1].split('/', 1)
            route.fulfill(status=200, content_type='font/woff2', body=(POLICES / paquet / 'files' / nom).read_bytes())
        page.route('https://polices.test/**', fichier)
    page.on('console', lambda m: journal.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: journal.append(f'[pageerror] {e}'))


def capture(page, nom):
    if CAPTURES:
        page.wait_for_timeout(900)
        page.screenshot(path=str(CAPTURES / f'{nom}.png'))


def verifier(cond, quoi):
    print(('  ok  ' if cond else 'ÉCHEC ') + quoi)
    if not cond:
        echecs.append(quoi)


def connecter(page, email):
    """« Créer un compte » avec cette adresse : crée le compte, ou connecte s'il existe déjà."""
    page.goto(BASE)
    page.wait_for_selector('[data-form-dev]')
    page.fill('[name=email]', email)
    page.click('[data-form-dev] [data-intention="inscription"]')
    page.wait_for_selector('.puce-chapitre')
    page.wait_for_function("document.body.dataset.vue === 'reviser'")


def oublier_refus(depuis, *codes):
    """Un refus VOULU du serveur (404 « compte_inexistant », 403, 409) : Chrome
    l'écrit dans la console ; il ne doit pas faire échouer le parcours."""
    journal[depuis:] = [l for l in journal[depuis:] if not any(f'status of {c}' in l for c in codes)]


def lire_brut(page, action):
    """Un GET direct à l'API ; rend la réponse entière ({ok, erreur, donnees})."""
    return page.evaluate("""(action) => fetch('api/index.php?action=' + action, { headers: { 'X-Nihonjo-Dev-Email': JSON.parse(localStorage.getItem('nihonjo_dev_email')) } })
        .then((r) => r.json())""", action)


def api(page, action='donnees'):
    return page.evaluate("""(action) => fetch('api/index.php?action=' + action, { headers: { 'X-Nihonjo-Dev-Email': JSON.parse(localStorage.getItem('nihonjo_dev_email')) } })
        .then((r) => r.json()).then((j) => j.donnees)""", action)


def ecrire(page, action, corps):
    """Un POST direct à l'API, comme le ferait quelqu'un qui contourne l'interface (F12)."""
    return page.evaluate("""([action, corps]) => fetch('api/index.php?action=' + action, { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Nihonjo-Dev-Email': JSON.parse(localStorage.getItem('nihonjo_dev_email')) },
        body: JSON.stringify(corps) }).then((r) => r.json())""", [action, corps])


def mots(page):
    return api(page)['mots']


def nombre(texte):
    return int(re.sub(r'\D', '', texte))


def mot_affiche(page, liste, mode):
    """Retrouve le mot posé à l'écran (pour répondre juste)."""
    if mode == 'fr-jp':
        q = page.inner_text('.question-fr').strip()
        return next(m for m in liste if ', '.join(m['fr']) == q)
    sens = page.inner_text('.aide-sens').strip()
    cases = page.eval_on_selector_all('.question .masu', 'els => els.map(e => e.classList.contains("masu-trou") ? null : e.textContent)')
    for m in liste:
        if ', '.join(m['fr']) != sens:
            continue
        if mode == 'trous-kana':
            base = m['jp_kana'][0]
        else:  # trous-kanji : la première écriture qui contient un kanji
            base = next((k for k in m['jp_kanji'] if re.search(r'[\u3400-\u9fff]', k)), '')
        if not base:
            continue
        if len(base) == len(cases) and all(c is None or c == b for c, b in zip(cases, base)):
            return m, base[cases.index(None)]
    raise RuntimeError('mot à trou introuvable')


def demarrer(page, mode, limite='4'):
    page.goto(BASE + '#/reviser')
    page.wait_for_selector('.puce-chapitre')
    page.fill('[data-nombre-mots]', limite)
    page.click(f'[data-mode="{mode}"]')
    page.wait_for_selector('[data-reponse]')


with sync_playwright() as p:
    nav = p.chromium.launch()
    ctx = nav.new_context(viewport={'width': 1320, 'height': 900}, accept_downloads=True)
    page = ctx.new_page()
    brancher(page)

    # --- Connexion ------------------------------------------------------------
    print('Connexion')
    page.goto(BASE)
    page.wait_for_selector('.feuille-connexion')
    verifier(not page.is_visible('.navigation'), 'avant connexion : écran de connexion, sans navigation')
    capture(page, '00_connexion')
    connecter(page, 'jose@exemple.fr')
    moi = api(page, 'moi')
    verifier(moi['role'] == 'admin' and moi['id'] == 1, 'premier compte connecté : administrateur (compte initial)')
    verifier(page.query_selector('.menu-compte .avatar') is not None, 'menu du compte dans l’en-tête')
    tous = mots(page)
    print(f'      {len(tous)} mots visibles')

    # --- Réviser : sélection --------------------------------------------------
    print('Réviser')
    total = nombre(page.inner_text('[data-nombre]'))
    page.click('[data-aucun="Vocabulaire"]')
    apres = nombre(page.inner_text('[data-nombre]'))
    verifier(apres == total - 692, f'« Aucun » sur Vocabulaire retire 692 mots ({total} → {apres})')
    page.click('[data-chapitre="vocabulaire_p_45"]')
    verifier(nombre(page.inner_text('[data-nombre]')) == apres + 80, 'un clic sur Chapitre 1 (page 45) le rajoute (80 mots)')
    verifier([page.inner_text(f'[data-chapitre="vocabulaire_p_{p}"] .puce-nom') for p in (45, 81, 219)] == ['Chapitre 1', 'Chapitre 3', 'Chapitre 11'],
             'les chapitres du manuel : « Chapitre N » dans l’ordre des pages')
    verifier('manuel d’apprentissage du japonais' in page.inner_text('.categorie-note') and 'page 45' in page.get_attribute('[data-chapitre="vocabulaire_p_45"]', 'title'),
             'd’où ils viennent : la note sous la catégorie, la page au survol')
    page.reload(); page.wait_for_selector('.puce-chapitre')
    verifier(page.get_attribute('[data-chapitre="vocabulaire_p_45"]', 'aria-pressed') == 'true' and page.get_attribute('[data-chapitre="vocabulaire_p_65"]', 'aria-pressed') == 'false', 'la sélection et la connexion survivent au rechargement')
    autre = nav.new_context(viewport={'width': 1320, 'height': 900})
    p2 = autre.new_page(); brancher(p2)
    connecter(p2, 'jose@exemple.fr')
    verifier(p2.get_attribute('[data-chapitre="vocabulaire_p_65"]', 'aria-pressed') == 'false', 'la sélection suit le compte : même choix sur un autre appareil')
    p2.evaluate("localStorage.setItem('nihonjo_kana_alphabet', JSON.stringify('kata'))")  # comme une version d'avant le 23/10
    p2.reload(); p2.wait_for_selector('.puce-chapitre')
    p2.wait_for_timeout(700)
    verifier(p2.evaluate("Object.keys(localStorage)") == ['nihonjo_dev_email'] and api(p2)['preferences'].get('kana_alphabet') == 'kata',
             'ancienne préférence du navigateur reprise dans le compte, puis effacée du navigateur')
    ecrire(p2, 'preference.ecrire', {'cle': 'kana_alphabet', 'valeur': None})  # sinon la page Kana s'ouvrirait en katakana
    autre.close()
    page.click('[data-tout="Vocabulaire"]')
    capture(page, '01_reviser')

    # --- Accueil : tous les exercices à un toucher ----------------------------
    print('Accueil')
    verifier(page.input_value('[data-nombre-mots]') == '20' and page.inner_text('[data-mode="jp-fr"] [data-nb]') == '20 mots',
             'champ « Mots à réviser » : 20 par défaut, les cartes le suivent')
    verifier(page.inner_text('[data-rapide-titre]') == 'Jouer 9 paires' and 'paires' in page.inner_text('[data-priorite-detail]')
             and 'carte-dernier' in page.get_attribute('[data-paires]', 'class'),
             'tout est nouveau : le grand bouton conseille les Paires, et dit pourquoi')
    page.fill('[data-nombre-mots]', '7')
    verifier(page.inner_text('[data-mode="jp-fr"] [data-nb]') == '7 mots',
             '7 mots à réviser : les cartes suivent')
    page.fill('[data-nombre-mots]', '20')
    total_voc = lambda: nombre(page.inner_text('.accueil-progres .progres-ligne:first-child dd').split('sur')[1])
    avant_voc = total_voc()
    page.click('[data-aucun="Vocabulaire"]')
    apres_voc = total_voc()
    page.click('[data-tout="Vocabulaire"]')
    verifier(apres_voc == avant_voc - 692 and total_voc() == avant_voc, f'barre « Vocabulaire » : suit les chapitres cochés ({avant_voc} → {apres_voc} → {total_voc()})')
    verifier(len(page.query_selector_all('.carte-exercice[data-mode]')) == 8 and page.query_selector('[data-ecriture]') is not None
             and len(page.query_selector_all('[data-alphabet]')) == 3, 'accueil : 8 exercices de vocabulaire, l’écriture, 3 jeux de kana')
    verifier(page.is_disabled('[data-mode="dictee"]') and page.inner_text('[data-mode="dictee"] [data-nb]') == 'pas de voix japonaise',
             'sans voix japonaise (Chromium de test) : la dictée est grisée et dit pourquoi')
    verifier('acquis sur 1' in page.inner_text('.accueil-progres'), 'progression d’ensemble affichée')
    if page.query_selector('[data-mdj]'):
        page.click('[data-mdj]')
        verifier(page.is_visible('[data-mdj-reponse]'), 'mot du jour : la lecture se découvre')
    page.click('[data-alphabet="kata"]')
    page.wait_for_selector('.question-kana .masu')
    g = page.inner_text('.question-kana .masu').strip()
    verifier('\u30a0' <= g[0] <= '\u30ff', f'carte Katakana : une partie démarre en katakana ({g})')
    page.click('[data-arreter]')
    page.goto(BASE + '#/reviser'); page.wait_for_selector('[data-ecriture]')
    page.click('[data-ecriture]')
    page.wait_for_selector('[data-saisie]')
    verifier('sur 20' in page.inner_text('.exercice-position'), 'carte Écriture : les 20 mots à réviser')
    # Paires : 18 tuiles, un faux glisser, puis tout apparier (glisser et toucher).
    page.goto(BASE + '#/reviser'); page.wait_for_selector('[data-paires]')
    verifier(page.inner_text('[data-paires] [data-nb]') == '9 paires', 'carte Paires : 9 paires')
    page.click('[data-paires]')
    page.wait_for_selector('[data-tuile]')
    textes = page.eval_on_selector_all('[data-tuile]', 'els => els.map(e => e.textContent.trim())')
    verifier(len(textes) == 18 and len(set(textes)) == 18, 'paires : 18 tuiles, aucun texte en double')
    ids = page.eval_on_selector_all('[data-tuile]', 'els => els.map(e => Number(e.dataset.mot))')
    duos = [(mid, *[i for i, x in enumerate(ids) if x == mid]) for mid in dict.fromkeys(ids)]
    duos = [d for d in duos if len(d) == 3]
    verifier(len(duos) == 9, 'paires : chaque mot apparaît sous deux écritures')

    def glisser_tuile(i, j):
        r1 = page.locator(f'[data-tuile="{i}"]').bounding_box(); r2 = page.locator(f'[data-tuile="{j}"]').bounding_box()
        page.mouse.move(r1['x'] + r1['width'] / 2, r1['y'] + r1['height'] / 2); page.mouse.down()
        page.mouse.move(r1['x'] + r1['width'] / 2 + 15, r1['y'] + r1['height'] / 2, steps=3)
        page.mouse.move(r2['x'] + r2['width'] / 2, r2['y'] + r2['height'] / 2, steps=8); page.mouse.up()

    glisser_tuile(duos[0][1], duos[1][1])
    verifier(page.inner_text('[data-erreurs]') == '1' and page.inner_text('[data-trouvees]') == '0', 'paires : un mauvais glisser compte une erreur')
    def vers_corbeille(i):
        r1 = page.locator(f'[data-tuile="{i}"]').bounding_box(); r2 = page.locator('[data-corbeille]').bounding_box()
        page.mouse.move(r1['x'] + r1['width'] / 2, r1['y'] + r1['height'] / 2); page.mouse.down()
        page.mouse.move(r1['x'] + r1['width'] / 2 + 15, r1['y'] + r1['height'] / 2, steps=3)
        page.mouse.move(r2['x'] + r2['width'] / 2, r2['y'] + r2['height'] / 2, steps=8); page.mouse.up()

    for k, (_, i, j) in enumerate(duos):
        if k == len(duos) - 1:
            vers_corbeille(i)  # « je ne connais pas ce mot » : il part avec son autre écriture
            verifier(page.is_disabled(f'[data-tuile="{j}"]') and 'tuile-ecartee' in page.get_attribute(f'[data-tuile="{j}"]', 'class'),
                     'paires : un mot glissé dans la corbeille part avec son autre écriture')
        elif k % 2:
            page.click(f'[data-tuile="{i}"]'); page.click(f'[data-tuile="{j}"]')
        else:
            glisser_tuile(i, j)
    page.wait_for_selector('.bilan')
    verifier(page.inner_text('.bilan-nombre') == '6' and 'mot écarté' in page.inner_text('.bilan'),
             'paires : bilan, 6 sur 9 sans erreur (deux mots du faux glisser, un écarté)')
    statuts = {x['id']: x['progression']['statut'] for x in mots(page)}
    verifier(statuts[duos[0][0]] == 'a revoir' and statuts[duos[2][0]] == 'en cours' and statuts[duos[-1][0]] == 'a revoir',
             'paires : progression enregistrée (raté → à revoir, juste → en cours, pas plus : écarté → à revoir)')
    capture(page, '02_paires_bilan')
    page.click('[data-accueil]')

    page.goto(BASE + '#/reviser'); page.wait_for_selector('[data-rapide]')
    verifier(page.inner_text('[data-rapide-detail]') == 'Français → japonais' and 'à revoir' in page.inner_text('[data-priorite-detail]'),
             'après les paires : des mots à reprendre, le grand bouton conseille de les écrire en japonais')
    page.click('[data-rapide]')
    page.wait_for_selector('[data-reponse]')
    verifier(page.inner_text('.exercice-position').startswith('Mot 1 sur 20'), 'grand bouton : une session de 20 mots démarre')
    poses = []
    for _ in range(3):
        poses.append(page.inner_text('.question-fr').strip())
        page.click('[data-passer]'); page.click('[data-suivant]')
    a_reprendre = {', '.join(x['fr']) for x in mots(page) if x['id'] in (duos[0][0], duos[1][0], duos[-1][0])}
    verifier(set(poses) == a_reprendre, f'grand bouton : les mots à reprendre passent en premier ({poses})')
    page.click('[data-arreter]'); page.wait_for_selector('.bilan')

    # --- Exercice fr-jp -------------------------------------------------------
    print('Exercice Français → japonais')
    demarrer(page, 'fr-jp')
    m = mot_affiche(page, tous, 'fr-jp')
    if m['jp_romaji']:
        page.fill('[data-reponse]', m['jp_romaji'][0])
        page.keyboard.press('Enter')
        verifier(page.query_selector('.correction') is None and 'rōmaji' in page.inner_text('[data-message-saisie]'),
                 'du rōmaji en réponse : pas corrigé, on demande des kana')
    page.fill('[data-reponse]', m['jp_kana'][0] if m['jp_kana'] else m['jp_kanji'][0])
    page.keyboard.press('Enter')
    page.wait_for_selector('.correction-bonne')
    verifier(True, 'bonne réponse reconnue (Entrée)')
    verifier(page.is_disabled('[data-ecouter]'), 'sans voix japonaise : le bouton « Écouter » est grisé')
    page.keyboard.press('Enter')
    page.wait_for_selector('.correction', state='detached')
    verifier(page.inner_text('.exercice-position').startswith('Mot 2 sur 4'), 'Entrée passe au mot suivant (une seule fois)')
    page.fill('[data-reponse]', 'ぬぬぬ')
    page.click('[data-valider]')
    page.wait_for_selector('.correction-fausse')
    verifier('ぬぬぬ' in page.inner_text('.correction-saisie'), 'mauvaise réponse : la saisie est rappelée')
    capture(page, '03_exo_faux')
    page.click('[data-suivant]')
    page.click('[data-passer]')
    page.wait_for_selector('.correction-fausse')
    verifier('Mot passé' in page.inner_text('.correction-tete'), 'passer = mot passé')
    page.click('[data-suivant]')
    page.click('[data-arreter]')
    page.wait_for_selector('.bilan')
    verifier(page.inner_text('.bilan-nombre') == '1' and len(page.query_selector_all('.bilan-erreurs li')) == 2, 'bilan : 1 bonne réponse, 2 erreurs')
    p_m = next(x for x in mots(page) if x['id'] == m['id'])['progression']
    verifier(p_m['statut'] == 'en cours' and p_m['serie'] == 1 and p_m['production'], 'une réussite : « en cours », pas encore acquis')
    p_m = ecrire(page, 'progression.resultat', {'mot_id': m['id'], 'reussite': True, 'niveau': 'rappel'})['donnees']
    verifier(p_m['statut'] == 'acquis' and p_m['serie'] == 2 and p_m['acquis_le'] and p_m['prochaine_revision'] > p_m['acquis_le'],
             f'deux réussites de suite : acquis le {p_m["acquis_le"]}, à rafraîchir à partir du {p_m["prochaine_revision"]}')
    page.click('[data-refaire]')
    page.wait_for_selector('[data-reponse]')
    verifier(page.inner_text('.exercice-position') == 'Mot 1 sur 2', '« Refaire les erreurs » relance sur les 2 erreurs')

    # --- Mots à trous et autres modes -----------------------------------------
    print('Mots à trous, autres modes')
    demarrer(page, 'trous-kana')
    m, manquant = mot_affiche(page, tous, 'trous-kana')
    page.fill('[data-reponse]', manquant)
    page.keyboard.press('Enter')
    page.wait_for_selector('.correction')
    verifier(page.query_selector('.correction-bonne') is not None, f'le kana manquant « {manquant} » est accepté')
    demarrer(page, 'trous-kanji')
    verifier(len(page.query_selector_all('[data-tuile]')) == 10, '10 tuiles proposées')
    m, manquant = mot_affiche(page, tous, 'trous-kanji')
    page.click(f'[data-tuile="{manquant}"]')
    page.wait_for_selector('.correction-bonne')
    verifier(page.query_selector('.tuile-bonne') is not None, 'tuile juste : validée et marquée')
    capture(page, '06_trous_kanji')
    for mode in ('jp-fr', 'lecture-kanji', 'transcription'):
        demarrer(page, mode)
        verifier(page.query_selector('.question .masu') is not None, f'{mode} : question en cases')
    page.click('[data-clavier]')
    page.click('.touche[data-car="み"]')
    page.click('.touche[data-car="ず"]')
    page.click('[data-effacer]')
    verifier(page.input_value('[data-reponse]') == 'み', 'clavier de kana : écrit et efface dans le champ')

    # --- Corrections (revue du 25/10) : homonymes, fautes de frappe, trous ----
    print('Corrections, choix de lecture, dictée')
    juge = page.evaluate('''async () => {
        const ex = await import('./assets/js/vues/exercice.js');
        const { donnees } = await import('./assets/js/etat.js');
        const mots = donnees().mots;
        const norm = (t) => t.toLowerCase().trim();
        const parSens = new Map();
        mots.forEach((m) => { const k = norm(m.fr[0] || ''); if (!parSens.has(k)) parSens.set(k, []); parSens.get(k).push(m); });
        const duo = [...parSens.values()].find((l) => l.length > 1 && l[0].jp_kana[0] && l[1].jp_kana[0] && l[0].jp_kana[0] !== l[1].jp_kana[0]);
        const homo = ex.juger(ex.MODES['fr-jp'], duo[0], {}, duo[1].jp_kana[0]);
        const long = mots.find((m) => m.fr[0].length >= 6 && /^[a-zà-ÿ]+$/.test(m.fr[0]));
        const typo = ex.juger(ex.MODES['jp-fr'], long, {}, long.fr[0].slice(0, -1));
        const court = mots.find((m) => m.fr[0].length === 3 && /^[a-z]+$/.test(m.fr[0]));
        const courtFaux = ex.juger(ex.MODES['jp-fr'], court, {}, court.fr[0].slice(0, -1) + 'q');
        const article = ex.juger(ex.MODES['lecture-kanji'], long, {}, 'le ' + long.fr[0]);
        const verbe = mots.find((m) => m.jp_kanji.some((k) => /[㐀-鿿][぀-ゟ]/.test(k)));
        const mode = ex.MODES['trous-kanji'];
        const trous = Array.from({ length: 12 }, () => mode.preparer(verbe)).every((q) => /[㐀-鿿]/.test(q.manquant));
        const q = mode.preparer(verbe);
        const tuiles = mode.tuiles(verbe, q);
        const choix = mots.find((m) => m.jp_kanji.length && m.jp_kana.length);
        const lectures = ex.MODES['choix-lecture'].tuiles(choix);
        return { homo, typo, courtFaux, article, trous, tuiles, manquant: q.manquant, lectures, juste: choix.jp_kana[0] };
    }''')
    verifier(juge['homo']['reussite'] and 'même sens' in juge['homo']['note'], 'Français → japonais : un autre mot du même sens est juste (et on le dit)')
    verifier(juge['typo']['reussite'] and 'faute' in juge['typo']['note'], 'Japonais → français : une lettre de moins est acceptée, avec la bonne orthographe')
    verifier(not juge['courtFaux']['reussite'], 'un mot court doit être exact (pas de tolérance sous 5 lettres)')
    verifier(juge['article']['reussite'] and 'note' not in juge['article'], 'l’article de tête ne compte pas (« le … »)')
    verifier(juge['trous'] and len(juge['tuiles']) == 10 and juge['manquant'] in juge['tuiles']
             and all(re.match(r'[㐀-鿿]', t) for t in juge['tuiles']), 'mots à trous (kanji) : le trou tombe sur un kanji, dix tuiles toutes en kanji')
    verifier(len(juge['lectures']) == 4 and juge['juste'] in juge['lectures'] and len(set(juge['lectures'])) == 4, 'choix de lecture : quatre lectures, dont la bonne')

    page.goto(BASE + '#/reviser'); page.wait_for_selector('[data-mode="choix-lecture"]')
    page.fill('[data-nombre-mots]', '4')
    page.click('[data-mode="choix-lecture"]')
    page.wait_for_selector('[data-tuile]')
    verifier(len(page.query_selector_all('[data-tuile]')) == 4 and page.query_selector('[data-reponse]') is None, 'choix de lecture : quatre tuiles, pas de champ')
    kanji = ''.join(page.eval_on_selector_all('.question .masu', 'els => els.map(e => e.textContent)'))
    mc = next(x for x in tous if x['jp_kanji'] and x['jp_kanji'][0] == kanji)
    juste = next(t for t in page.eval_on_selector_all('[data-tuile]', 'els => els.map(e => e.dataset.tuile)') if t in mc['jp_kana'])
    page.click(f'[data-tuile="{juste}"]')
    page.wait_for_selector('.correction-bonne')
    verifier(next(x for x in mots(page) if x['id'] == mc['id'])['progression']['statut'] == 'en cours', 'choix de lecture réussi : en cours (reconnaissance)')
    capture(page, '07_choix_lecture')

    # La dictée, avec une voix japonaise simulée (Chromium de test n'en a pas).
    ctx_voix = nav.new_context(viewport={'width': 1320, 'height': 900})
    ctx_voix.add_init_script('''
        window.__dit = [];
        const voix = [{ lang: 'ja-JP', name: 'Essai' }];
        Object.defineProperty(window, 'speechSynthesis', { value: {
            getVoices: () => voix, speak: (u) => window.__dit.push(u.text), cancel: () => {},
            addEventListener: () => {}, removeEventListener: () => {} } });
        window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
    ''')
    pv = ctx_voix.new_page(); brancher(pv)
    connecter(pv, 'jose@exemple.fr')
    pv.fill('[data-nombre-mots]', '3')
    verifier(not pv.is_disabled('[data-mode="dictee"]'), 'avec une voix japonaise : la dictée s’ouvre')
    pv.click('[data-mode="dictee"]')
    pv.wait_for_selector('[data-ecouter-question]')
    pv.wait_for_function('window.__dit.length > 0')
    dit = pv.evaluate('window.__dit[0]')
    md = next(x for x in tous if dit in x['jp_kana'])
    pv.fill('[data-reponse]', dit); pv.keyboard.press('Enter')
    pv.wait_for_selector('.correction-bonne')
    pv.click('[data-ecouter]')
    verifier(pv.evaluate('window.__dit.length') >= 2, f'dictée : le mot est dit (« {dit} »), écrit juste, réécouté depuis la correction')
    capture(pv, '08_dictee')
    ctx_voix.close()

    # --- Liste et écriture ----------------------------------------------------
    print('Liste et écriture')
    page.goto(BASE + '#/reviser'); page.wait_for_selector('[data-liste]')
    page.click('[data-liste]')
    page.wait_for_selector('[data-lignes] tr')
    page.fill('[data-recherche]', 'eau')
    lignes = page.query_selector_all('[data-lignes] tr')
    id1 = int(lignes[0].get_attribute('data-id'))
    avant = lignes[0].query_selector('[data-cycle]').inner_text()
    lignes[0].query_selector('[data-cycle]').click()
    page.wait_for_timeout(400)
    verifier(avant != page.query_selector(f'tr[data-id="{id1}"] [data-cycle]').inner_text(), 'clic sur l’état : il change')
    verifier(page.is_checked('[data-difficile]'), 'écriture : « De mémoire » coché par défaut')
    page.query_selector_all('[data-coche]')[0].check()
    page.query_selector_all('[data-coche]')[1].check()
    page.fill('[data-repetitions]', '2')
    page.dispatch_event('[data-repetitions]', 'change')
    page.click('[data-ecrire-coches]')
    page.wait_for_selector('[data-saisie]')
    fr = page.inner_text('.question-fr')
    rep = next(((x['jp_kana'] or x['jp_kanji'])[0] for x in tous if ', '.join(x['fr']) == fr))
    verifier(not page.query_selector('.modele-cache'), 'écriture de mémoire : le modèle se montre d’abord')
    page.wait_for_selector('.modele-cache', timeout=6000)
    verifier(True, 'écriture de mémoire : le modèle disparaît après quelques secondes')
    page.fill('[data-saisie]', rep); page.keyboard.press('Enter')
    page.fill('[data-saisie]', 'faux'); page.keyboard.press('Enter')
    verifier(len(page.query_selector_all('.masu-faite')) == 0, 'écriture : une erreur remet à zéro')
    for _ in range(2):
        page.fill('[data-saisie]', rep); page.keyboard.press('Enter')
    page.wait_for_selector('text=Mot 2 sur 2', timeout=3000)
    verifier(True, 'écriture : mot validé, passage au suivant')

    # --- Lexique ---------------------------------------------------------------
    print('Lexique')
    page.goto(BASE + '#/lexique'); page.wait_for_selector('[data-lignes] tr')
    page.click('[data-ajouter]')
    page.wait_for_selector('dialog [name="fr"]')
    page.fill('dialog [name="fr"]', 'ornithorynque && platypus')
    page.click('dialog [data-clavier-pour="jp_kana"]')
    page.click('dialog [data-jeu="kata"]')
    for c in 'カモノハシ':
        page.click(f'dialog .touche[data-car="{c}"]')
    verifier(page.input_value('dialog [name="jp_kana"]') == 'カモノハシ', 'formulaire : le clavier écrit dans le champ Kana')
    verifier(page.query_selector('dialog .puce-verrouillee:has-text("Mes mots")') is not None, 'formulaire : « Mes mots » coché et verrouillé')
    page.fill('dialog [data-nouveau-theme]', 'animal')
    page.keyboard.press('Enter')
    page.fill('dialog [data-nouveau-chapitre]', 'animaux bizarres')
    page.click('dialog [data-ajouter-chapitre]')
    capture(page, '14_formulaire_mot')
    page.click('dialog .bouton-principal')
    page.wait_for_selector('dialog', state='detached')
    page.wait_for_selector('[data-lignes] tr:first-child:has-text("ornithorynque")', timeout=5000)
    nouveau = next(x for x in mots(page) if x['fr'][0] == 'ornithorynque')
    verifier(set(nouveau['chapitres']) == {'mes_mots@1', 'animaux_bizarres@1'} and nouveau['origine'] == 'perso', 'mot du compte, dans « Mes mots » et « animaux bizarres »')
    r = ecrire(page, 'mot.enregistrer', {'id': nouveau['id'], 'fr': nouveau['fr'], 'jp_kana': nouveau['jp_kana'], 'chapitres': ['animaux_bizarres@1']})
    verifier('mes_mots@1' in r['donnees']['chapitres'], '« Mes mots » imposé par le serveur, même décoché à la main (F12)')
    page.click('[data-lignes] tr:first-child [data-modifier]')
    page.fill('dialog [name="context"]', 'mammifère qui pond')
    page.click('dialog .bouton-principal')
    page.wait_for_selector('[data-lignes] tr:first-child:has-text("mammifère qui pond")', timeout=5000)
    verifier(True, 'modification enregistrée')
    verifier(page.query_selector('.mot-du-cours') is None, 'administrateur : les mots du cours sont modifiables')

    # --- Chapitres : le gestionnaire ---------------------------------------------
    print('Chapitres')
    page.goto(BASE + '#/chapitres'); page.wait_for_selector('.item-chapitre')
    verifier(page.get_attribute('.item-mes-mots', 'aria-current') == 'true' and page.query_selector('[data-renommer]') is None,
             '« Mes mots » choisi d’abord, ni renommable ni supprimable')
    verifier(page.query_selector('tr:has-text("ornithorynque") .verrou') is not None and page.query_selector('tr:has-text("ornithorynque") [data-retirer]') is None,
             'un mot à moi ne peut pas sortir de « Mes mots »')
    page.click('[data-creer]')
    page.fill('dialog [name="nom"]', 'au restaurant')
    page.fill('dialog [name="categorie"]', 'Mes révisions')
    page.click('dialog [data-valeur="theme:nourriture"]')
    page.click('dialog [data-valeur="theme:boisson"]')
    verifier('rangé' in page.inner_text('dialog [data-compte]'), 'aperçu du nombre de mots rangés')
    page.click('dialog .bouton-principal')
    page.wait_for_selector('.detail-tete h2:has-text("Au restaurant")')
    n0 = nombre(page.inner_text('.detail-compte').split(',')[0])
    page.click('[data-renommer]')
    page.fill('dialog [name="nom"]', 'restaurant et boissons')
    page.click('dialog .bouton-principal')
    page.wait_for_selector('.detail-tete h2:has-text("Restaurant et boissons")')
    verifier('restaurant_et_boissons%401' in page.url, 'création puis renommage ; le chapitre est dans l’adresse')
    page.click('[data-ajouter-mots]')
    page.wait_for_selector('dialog [data-chap-source]')
    page.select_option('dialog [data-chap-source]', 'mois')
    page.check('dialog [data-tout]')
    verifier(page.inner_text('dialog .dialogue-pied .bouton-principal') == 'Ajouter 12 mots', 'ajout : tout un chapitre du cours d’un coup')
    page.click('dialog .dialogue-pied .bouton-principal')
    page.wait_for_selector('dialog', state='detached')
    page.wait_for_function(f"document.querySelector('.detail-compte').textContent.startsWith('{n0 + 12} mots')")
    page.click('[data-ajouter-mots]')
    page.click('dialog label:has-text("D’un thème")')
    page.select_option('dialog [data-theme-source]', 'animal')
    page.click('dialog .liste-ajout li:not(.ajout-deja) input[data-mot]')
    page.click('dialog .dialogue-pied .bouton-principal')
    page.wait_for_selector('dialog', state='detached')
    page.wait_for_function(f"document.querySelector('.detail-compte').textContent.startsWith('{n0 + 13} mots')")
    verifier(True, 'ajout : un mot choisi à la main dans une thématique')
    capture(page, '17_chapitres')
    janvier = next(x['id'] for x in mots(page) if x['fr'][0] == 'Janvier')
    fevrier = next(x['id'] for x in mots(page) if x['fr'][0] == 'Février')
    page.fill('[data-recherche]', 'vrier')
    page.check(f'[data-coche][value="{fevrier}"]')
    page.fill('[data-recherche]', 'Janvier')
    page.check(f'[data-coche][value="{janvier}"]')
    verifier('2 mots choisis' in page.inner_text('[data-lot]'), 'barre d’actions : 2 mots choisis, même à travers deux recherches')
    page.select_option('[data-vers]', 'animaux_bizarres@1')
    page.click('[data-copier-lot]')
    page.wait_for_selector('.toast-succes:has-text("copiés")')
    m = {x['id']: x['chapitres'] for x in mots(page)}
    verifier('animaux_bizarres@1' in m[janvier] and 'restaurant_et_boissons@1' in m[janvier], 'copier : le mot est dans les deux chapitres')
    page.fill('[data-recherche]', '')
    page.check(f'[data-coche][value="{fevrier}"]')
    page.select_option('[data-vers]', 'mes_mots@1')
    page.click('[data-deplacer-lot]')
    page.wait_for_selector('.toast-succes:has-text("déplacé")')
    m = {x['id']: x['chapitres'] for x in mots(page)}
    verifier('mes_mots@1' in m[fevrier] and 'restaurant_et_boissons@1' not in m[fevrier], 'déplacer : il quitte ce chapitre pour l’autre')
    page.click(f'tr[data-id="{janvier}"] [data-retirer]')
    page.wait_for_selector('.toast-succes:has-text("retiré du chapitre")')
    verifier('restaurant_et_boissons@1' not in {x['id']: x['chapitres'] for x in mots(page)}[janvier], 'retirer un mot d’un toucher')
    page.click('[data-reviser-chapitre]')
    page.wait_for_selector('[data-rapide]')
    coches = page.eval_on_selector_all('.puce-chapitre[aria-pressed="true"]', 'els => els.map(e => e.dataset.chapitre)')
    verifier(coches == ['restaurant_et_boissons@1'], f'« Réviser ce chapitre » : l’accueil ne garde que lui ({coches})')
    ecrire(page, 'preference.ecrire', {'cle': 'chapitres_coches', 'valeur': None})
    page.goto(BASE + '#/chapitres?chapitre=animaux_bizarres%401'); page.wait_for_selector('.detail-tete h2:has-text("Animaux bizarres")')
    page.click('[data-supprimer]')
    page.click('dialog .bouton-danger')
    page.wait_for_selector('.item-chapitre[data-choisir="animaux_bizarres@1"]', state='detached')
    verifier(any(x['fr'][0] == 'ornithorynque' for x in mots(page)), 'chapitre supprimé, le mot reste dans « Mes mots »')

    # --- Importer des mots -----------------------------------------------------
    print('Importer')
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    page.goto(BASE + '#/lexique'); page.wait_for_selector('[data-lignes] tr')
    page.click('#vue a[href="#/importer"]')
    page.wait_for_selector('[data-prompt]')
    page.fill('[data-valeur="sujet"]', 'les Pokémon de la première génération')
    page.fill('[data-valeur="theme"]', 'pokémon')
    verifier('les Pokémon de la première génération' in page.inner_text('[data-prompt]'), 'le texte pour l’IA se complète avec le sujet')
    page.click('[data-copier]')
    page.wait_for_timeout(200)
    verifier('Sujet : les Pokémon de la première génération' in page.evaluate('navigator.clipboard.readText()'), 'texte pour l’IA copié dans le presse-papiers')
    with page.expect_download() as dl:
        page.click('.format-import summary'); page.click('[data-modele]')
    verifier(len(json.load(open(dl.value.path()))['mots']) == 2, 'modèle téléchargeable')
    reponse_ia = 'Voici la liste :\n```json\n' + json.dumps({'mots': [
        {'fr': ['Bulbizarre'], 'kanji': [], 'kana': ['フシギダネ'], 'romaji': ['Fushigidane'], 'contexte': 'n° 1', 'thematiques': ['pokémon']},
        {'fr': 'Salamèche', 'kanji': [], 'kana': 'ヒトカゲ', 'romaji': 'Hitokage'},
        {'fr': ['chat'], 'kanji': ['猫'], 'kana': ['ねこ'], 'romaji': ['neko']},
        {'kana': ['ピカチュウ']},
    ]}, ensure_ascii=False) + '\n```\nBonne révision !'
    page.fill('[data-json]', reponse_ia)
    page.wait_for_selector('.verdict-ok')
    verdict = page.inner_text('[data-verdict]')
    verifier('3 mots prêts' in verdict and 'déjà dans Nihonjo' in verdict and '1 élément ignoré' in verdict, 'collage d’une réponse d’IA (avec du texte autour) : lue, vérifiée, aperçue')
    verifier(page.query_selector('[data-chapitres] .puce-verrouillee:has-text("Mes mots")') is not None, 'import : « Mes mots » verrouillé')
    page.click('[data-chapitres] [data-chapitre="restaurant_et_boissons@1"]')
    page.fill('[data-nouveau]', 'Pokémon 1G')
    verifier('« Pokémon 1G »' in page.inner_text('[data-importer]') and page.inner_text('[data-libelle-importer]') == 'Importer 3 mots', 'le bouton dit combien et où')
    capture(page, '18_importer')
    page.click('[data-importer]')
    page.wait_for_selector('.resultat-import')
    bulbi = next(x for x in mots(page) if x['fr'] == ['Bulbizarre'])
    verifier(set(bulbi['chapitres']) == {'mes_mots@1', 'Pokémon_1G@1', 'restaurant_et_boissons@1'} and bulbi['thematiques'] == ['pokémon'], 'importé dans « Mes mots », le nouveau chapitre et le chapitre choisi')
    sala = next(x for x in mots(page) if x['fr'] == ['Salamèche'])
    verifier(sala['thematiques'] == ['pokémon'] and sala['jp_kana'] == ['ヒトカゲ'], 'textes simples acceptés ; thème donné à l’étape 1 quand il manque')
    r = ecrire(page, 'import.mots', {'mots': [{'fr': ['Carapuce'], 'kana': ['ゼニガメ']}], 'chapitres': ['Pokémon_1G@1']})
    verifier('mes_mots@1' in next(x for x in mots(page) if x['fr'] == ['Carapuce'])['chapitres'], 'import direct sans « Mes mots » (F12) : il y va quand même')
    page.click('[data-gerer]')
    page.wait_for_selector('.detail-tete h2:has-text("Pokémon 1G")')
    verifier(True, '« Gérer le chapitre » ouvre le gestionnaire sur le nouveau chapitre')

    # --- Kana : tableau ------------------------------------------------------
    print('Kana')
    page.goto(BASE + '#/kana'); page.wait_for_selector('.tableau-kana')
    verifier(len(page.query_selector_all('.tableau-kana')) == 3, 'trois tableaux : base, voisés, combinaisons')
    verifier(page.query_selector('.tableau-kana .glyphe[lang="ja"]').inner_text() == 'あ', 'hiragana par défaut')
    page.click('.barre-kana label:has-text("Katakana")')
    verifier(page.query_selector('.tableau-kana .glyphe').inner_text() == 'ア', 'bascule en katakana')
    page.click('.barre-kana label:has-text("Les deux")')
    verifier(len(page.query_selector('.tableau-kana tbody tr').query_selector_all('td:nth-of-type(1) .glyphe')) == 2, '« Les deux » : hiragana et katakana côte à côte')
    page.click('.barre-kana label:has-text("Hiragana")')
    capture(page, '30_kana')

    # --- Kana : le jeu ---------------------------------------------------------
    lectures = page.evaluate("""() => import('./assets/js/donnees/syllabaires.js').then((m) => {
        const tout = m.caracteres(m.toutesLesLignes().map((l) => l.id), 'deux');
        return Object.fromEntries(tout.map((c) => [c.glyphe, c.romaji[0]]));
    })""")
    page.click('[data-ligne="k"]')
    page.wait_for_selector('[data-romaji]')
    verifier('sur 5' in page.inner_text('.exercice-position'), 'ligne « k » : une partie de 5 caractères')
    glyphe = page.inner_text('.question .masu')
    for _ in range(3):
        page.fill('[data-romaji]', 'xx'); page.keyboard.press('Enter')
    verifier('essais' in page.inner_text('[data-aide]') and page.input_value('[data-romaji]') == 'xx', 'trois erreurs : on peut encore essayer')
    capture(page, '31_jeu_erreur')
    page.fill('[data-romaji]', lectures[glyphe].upper()); page.keyboard.press('Enter')
    page.wait_for_selector('.kana-trouve')
    verifier(True, f'« {glyphe} » trouvé au 4e essai (majuscules acceptées)')
    page.wait_for_selector('.kana-trouve', state='detached')
    glyphe2 = page.inner_text('.question .masu')
    page.click('[data-reveler]')
    verifier(lectures[glyphe2] in page.inner_text('[data-aide]'), '« Je ne sais pas » montre la lecture')
    page.fill('[data-romaji]', lectures[glyphe2]); page.keyboard.press('Enter')
    page.wait_for_selector('.kana-trouve')
    joues = 2
    while True:
        page.wait_for_selector('[data-romaji]:not([disabled]), .bilan')
        if page.query_selector('.bilan'):
            break
        g = page.inner_text('.question .masu')
        page.fill('[data-romaji]', lectures[g]); page.keyboard.press('Enter')
        page.wait_for_selector('.kana-trouve')
        joues += 1
    verifier(joues == 7, f'les 2 ratés reviennent une fois : {joues} caractères joués')
    verifier(page.inner_text('.bilan-nombre') == '5' and len(page.query_selector_all('.kana-rates li')) == 2, 'bilan : 5 du premier coup, 2 à retravailler')
    capture(page, '32_jeu_bilan')
    stats = api(page)['kana']
    verifier(stats.get(glyphe, {}).get('nb_echecs') == 1 and stats.get(glyphe, {}).get('nb_reussites') == 1, f'en base : « {glyphe} » 1 échec puis 1 réussite')
    page.click('[data-tableau]')
    page.wait_for_selector('.tableau-kana')
    verifier(page.query_selector(f'.glyphe.etat-a-revoir:text-is("{glyphe}")') is not None, 'le tableau montre « à revoir » pour le raté')
    # Le sens inverse : la lecture s'affiche, on écrit le caractère.
    page.goto(BASE + '#/jeu-kana'); page.wait_for_selector('[data-commencer]')
    page.click('.reglages-jeu label:has-text("Écrire")')
    page.click('[data-commencer]')
    page.wait_for_selector('.question-romaji')
    lu = page.inner_text('.question-romaji').strip()
    en_kata = 'katakana' in page.inner_text('.consigne')
    cible_g = next(g for g, r in lectures.items() if r == lu and (('\u30a0' <= g[0] <= '\u30ff') == en_kata))
    verifier(page.is_visible('.clavier'), 'jeu des kana, sens « écrire » : le clavier de kana est ouvert')
    page.fill('[data-romaji]', 'ぬ' if cible_g != 'ぬ' else 'ね'); page.keyboard.press('Enter')
    verifier('essai' in page.inner_text('[data-aide]').lower() or 'pas ça' in page.inner_text('[data-aide]'), 'sens « écrire » : un mauvais caractère est refusé')
    page.fill('[data-romaji]', cible_g); page.keyboard.press('Enter')
    page.wait_for_selector('.kana-trouve')
    verifier(cible_g in page.inner_text('.kana-trouve'), f'sens « écrire » : « {lu} » → « {cible_g} » trouvé')
    page.click('[data-arreter]'); page.wait_for_selector('.bilan')
    page.click('[data-rejouer]'); page.wait_for_selector('[data-commencer]')
    page.click('.reglages-jeu label:has-text("Lire")')

    # --- Autre alphabet (26/10) : juste, mais jamais « acquis » ---------------
    print('Autre alphabet')
    demarrer(page, 'trous-kana', '12')
    liste = mots(page)
    for _ in range(12):  # un trou sur un kana qui a un double (pas « ー »)
        m, manquant = mot_affiche(page, liste, 'trous-kana')
        if re.search(r'[\u3041-\u3096\u30a1-\u30f6]', manquant):
            break
        page.click('[data-passer]'); page.click('[data-suivant]'); page.wait_for_selector('[data-reponse]')
    autre = ''.join(chr(ord(c) + 0x60) if '\u3041' <= c <= '\u3096' else chr(ord(c) - 0x60) if '\u30a1' <= c <= '\u30f6' else c for c in manquant)
    page.fill('[data-reponse]', autre); page.keyboard.press('Enter')
    page.wait_for_selector('.correction')
    verifier('autre alphabet' in page.inner_text('.correction strong'), f'« {autre} » pour « {manquant} » : juste, dans l’autre alphabet')
    page.wait_for_timeout(400)
    prog = next(x for x in mots(page) if x['id'] == m['id'])['progression']
    verifier(prog['statut'] == 'en cours' and prog['serie'] == 0, 'autre alphabet : en cours, série à zéro (jamais acquis ainsi)')

    # --- Kanji (26/10) : la page, la fiche, le jeu ----------------------------
    print('Kanji')
    page.goto(BASE + '#/kanji'); page.wait_for_selector('.grille-kanji')
    verifier(page.query_selector('[data-onglet="kanji"][aria-current="page"]') is not None, 'onglet « Kanji » éclairé')
    verifier(len(page.query_selector_all('.case-kanji')) > 50, 'groupe « Mes chapitres » : les kanjis des mots des chapitres choisis')
    page.click('.barre-kana label:has-text("1re année")')
    verifier(len(page.query_selector_all('.case-kanji')) == 80, '1re année : 80 kanjis')
    capture(page, 'kanji_page')
    page.click('.case-kanji[data-kanji="水"]'); page.wait_for_selector('.fiche-kanji')
    fiche = page.inner_text('.fiche-kanji')
    verifier('スイ' in fiche and 'みず' in fiche and 'eau' in fiche, 'fiche de 水 : sens, on, kun')
    verifier('Dans vos mots' in fiche, 'fiche : les mots qui emploient le kanji')
    capture(page, 'kanji_fiche')
    page.click('dialog button:has-text("S’entraîner")')
    page.wait_for_selector('.jeu-kanji [data-reponse]')
    verifier('Kanji 1 sur 2' in page.inner_text('.exercice-position'), 'un kanji depuis sa fiche : son sens ET sa lecture')
    page.fill('[data-reponse]', 'eau'); page.keyboard.press('Enter')
    page.wait_for_selector('.correction-bonne')
    page.click('[data-suivant]'); page.wait_for_selector('[data-reponse][lang="ja"]')
    page.fill('[data-reponse]', 'mizu'); page.keyboard.press('Enter')
    verifier('rōmaji' in page.inner_text('[data-message-saisie]'), 'lecture : le rōmaji est refusé, sans compter')
    page.fill('[data-reponse]', 'スイ'); page.keyboard.press('Enter')
    page.wait_for_selector('.correction-bonne')
    capture(page, 'kanji_correction')
    page.click('[data-suivant]'); page.wait_for_selector('.bilan')
    page.wait_for_timeout(400)
    k = api(page)['kanji']['水']
    verifier((k['statut'], k['serie_sens'], k['serie_lecture']) == ('en cours', 1, 1), 'progression de 水 : en cours, une réussite de sens et une de lecture')
    page.click('[data-rejouer]'); page.wait_for_selector('[data-commencer]')
    page.click('.reglages-jeu label:has-text("Reconnaître")')
    page.click('.reglages-jeu label:has-text("1re année")')
    page.click('.reglages-jeu label:has-text("10")')
    page.click('[data-commencer]'); page.wait_for_selector('.tuiles-kanji')
    def bon_kanji():
        sens = page.inner_text('.question-fr').strip()
        tuiles = page.eval_on_selector_all('[data-tuile]', 'els => els.map((e) => e.dataset.tuile)')
        sensDe = page.evaluate("(t) => import('./assets/js/kanjis.js').then((m) => t.map((k) => m.sensAffiche(m.PAR_KANJI.get(k))))", tuiles)
        return tuiles[sensDe.index(sens)], [x for x in tuiles if x != tuiles[sensDe.index(sens)]][0]
    bon, faux = bon_kanji()
    page.click(f'[data-tuile="{bon}"]'); page.wait_for_selector('.correction-bonne')
    page.click('[data-suivant]'); page.wait_for_selector('.tuiles-kanji [data-tuile]:not([disabled])')
    bon2, faux2 = bon_kanji()
    page.click(f'[data-tuile="{faux2}"]'); page.wait_for_selector('.correction-fausse')
    verifier(page.query_selector(f'.tuile-bonne[data-tuile="{bon2}"]') is not None, 'reconnaître : le bon kanji est montré après une erreur')
    page.click('[data-suivant]'); page.click('[data-arreter]'); page.wait_for_selector('.bilan')
    verifier(bon2 in page.inner_text('.kana-rates'), 'bilan : le kanji raté est à retravailler')
    page.wait_for_timeout(400)
    ks = api(page)['kanji']
    verifier(ks[bon]['statut'] == 'en cours' and ks[bon]['serie_sens'] == (1 if bon == '水' else 0) and ks[bon2]['statut'] == 'a revoir', f'reconnaître : en cours sans série ; raté : à revoir ({ks[bon]}, {ks[bon2]})')
    page.goto(BASE + '#/reviser'); page.wait_for_selector('[data-kanji-exercice]')
    verifier(len(page.query_selector_all('.progres-ligne')) == 4, 'accueil : quatre anneaux, dont les kanjis')
    verifier('acquis sur' in page.inner_text('[data-kanji-exercice="sens"] [data-nb]'), 'accueil : les cartes « Kanji » comptent les acquis')

    # --- Fichiers (l'écran « Données » n'existe plus, 23/10) -------------------
    print('Fichiers et sauvegarde')
    verifier(page.query_selector('[data-onglet="donnees"]') is None, 'plus d’onglet « Données »')
    page.goto(BASE + '#/donnees'); page.wait_for_selector('[data-rapide]')
    verifier(page.evaluate('document.body.dataset.vue') == 'reviser', 'un ancien lien #/donnees retombe sur l’accueil')
    page.goto(BASE + '#/importer'); page.wait_for_selector('[data-exporter-mots]')
    with page.expect_download() as dl:
        page.click('[data-exporter-mots]')
    export = json.load(open(dl.value.path()))
    verifier(export['type'] == 'nihonjo_mots' and all('@' not in c for x in export['mots'] for c in x['chapitres']), 'page d’import : « Exporter mes mots », noms de chapitres sans clé de compte')
    # Un fichier de progression de l'ancienne version est reconnu, pas lu comme des mots.
    nb_mots_avant = len(mots(page))
    cible = next(x for x in mots(page) if x['progression']['statut'] == 'non acquis' and x['jp_kana'])
    page.fill('[data-json]', json.dumps({'type': 'nihonjo_progression', 'donnees': [{'etat': 'acquis', 'fr': cible['fr'], 'jp_kana': cible['jp_kana'], 'jp_kanji': cible['jp_kanji'], 'jp_romaji': cible['jp_romaji']}], 'count': 1}))
    page.wait_for_selector('[data-appliquer-progression]')
    verifier(page.is_disabled('[data-importer]'), 'fichier de progression reconnu : l’import de mots reste fermé')
    page.click('[data-appliquer-progression]')
    page.wait_for_selector('.verdict-ok:has-text("Progression appliquée")')
    apres_prog = mots(page)
    verifier(len(apres_prog) == nb_mots_avant and next(x for x in apres_prog if x['id'] == cible['id'])['progression']['statut'] == 'acquis', 'progression de l’ancienne version appliquée, aucun mot créé')
    page.fill('[data-json]', json.dumps({'format': 'nihonjo_sauvegarde', 'mots': []}))
    page.wait_for_selector('.verdict-erreur:has-text("sauvegarde complète")')
    verifier(True, 'une sauvegarde complète collée ici est reconnue et renvoyée au menu du compte')
    page.fill('[data-json]', '')
    page.goto(BASE + '#/chapitres?chapitre=mes_mots@1'); page.wait_for_selector('[data-exporter-chapitre]')
    with page.expect_download() as dl:
        page.click('[data-exporter-chapitre]')
    verifier(json.load(open(dl.value.path()))['type'] == 'nihonjo_mots', 'gestionnaire : « Exporter ce chapitre »')
    page.click('.menu-compte summary')
    page.click('[data-sauvegarde-complete]')
    page.wait_for_selector('dialog [data-sante]')
    page.wait_for_function("document.querySelector('dialog [data-sante]').textContent.includes('compte')")
    verifier(True, 'menu du compte → Sauvegarde complète : état du serveur affiché')
    with page.expect_download() as dl:
        page.click('dialog [data-sauvegarder]')
    sauvegarde = json.load(open(dl.value.path()))
    verifier(sauvegarde['format'] == 'nihonjo_sauvegarde' and len(sauvegarde['utilisateurs']) == 1, 'sauvegarde complète (administrateur), comptes compris')
    capture(page, '18_sauvegarde')
    page.click('dialog [data-fermer]')

    # --- Reprise de la v1 (IndexedDB simulée, comme Dexie l'aurait laissée) --
    print('Reprise de la v1')
    page.evaluate("""() => new Promise((ok, ko) => {
        const req = indexedDB.open('NihonjoDB', 10);
        req.onupgradeneeded = () => {
            req.result.createObjectStore('motsPerso', { keyPath: 'id', autoIncrement: true });
            req.result.createObjectStore('progression', { keyPath: 'fr' });
        };
        req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(['motsPerso', 'progression'], 'readwrite');
            tx.objectStore('motsPerso').add({ fr: ['axolotl'], jp_romaji: ['uupaaruupaa'], jp_kanji: [''], jp_kana: ['ウーパールーパー'], context: 'N/A', thematiques: ['animal'], chapitres: ['bestiaire'], statut: 'non acquis' });
            tx.objectStore('motsPerso').add({ fr: ['ici'], jp_romaji: ['koko'], jp_kanji: [''], jp_kana: ['ここ'], context: 'lieu proche du locuteur', thematiques: ['lieu', 'direction'], chapitres: ['mes_lieux'], statut: 'non acquis' });
            tx.objectStore('progression').put({ fr: 'axolotl', statut: 'acquis' });
            tx.objectStore('progression').put({ fr: 'là-bas', statut: 'a revoir' });
            tx.oncomplete = () => { db.close(); ok(); };
            tx.onerror = () => ko(tx.error);
        };
        req.onerror = () => ko(req.error);
    })""")
    page.evaluate("""() => {
        localStorage.setItem('nihonjo_custom_chapters', JSON.stringify(['bestiaire', 'mes_lieux', 'chapitre_vide']));
        localStorage.setItem('nihonjo_chap_categories', JSON.stringify({ bestiaire: 'Animaux', chapitre_vide: 'Animaux' }));
    }""")
    page.goto(BASE + '#/reviser'); page.wait_for_selector('.puce-chapitre')
    page.wait_for_selector('.bandeau', timeout=3000)
    verifier('2 mots ajoutés' in page.inner_text('.bandeau'), 'bandeau : anciennes données détectées')
    nb_avant = len(mots(page))
    page.click('[data-importer-v1]')
    page.wait_for_selector('.toast-succes:has-text("Ancienne version importée")', timeout=8000)
    apres = mots(page)
    verifier(len(apres) == nb_avant + 1, f'reprise : 1 mot créé, la copie de « ici » fusionnée ({nb_avant} → {len(apres)})')
    ici = next(x for x in apres if x['fr'] == ['ici'])
    verifier('mes_lieux@1' in ici['chapitres'], '« ici » rangé dans mes_lieux (chapitre du compte)')
    axo = next(x for x in apres if x['fr'] == ['axolotl'])
    verifier(axo['progression']['statut'] == 'acquis' and axo['context'] == '', 'axolotl : acquis, « N/A » nettoyé')
    vide = next((c for c in api(page)['chapitres'] if c['nom'] == 'chapitre_vide'), None)
    verifier(vide is not None and vide['categorie'] == 'Animaux', 'chapitre vide de la v1 recréé dans sa catégorie')
    ctx.close()

    # --- Un second compte ------------------------------------------------------
    print('Second compte')
    ctx = nav.new_context(viewport={'width': 1320, 'height': 900})
    page = ctx.new_page(); brancher(page)
    connecter(page, 'invite@exemple.fr')
    verifier(api(page, 'moi')['role'] == 'membre', 'second compte : membre')
    siens = mots(page)
    verifier(not any(x['fr'][0] in ('ornithorynque', 'axolotl') for x in siens), 'il ne voit pas les mots de José')
    verifier(all(x['progression']['statut'] == 'non acquis' for x in siens), 'sa progression part de zéro')
    page.goto(BASE + '#/lexique'); page.wait_for_selector('[data-lignes] tr')
    verifier(page.query_selector('[data-lignes] [data-modifier]') is None and page.query_selector('.mot-du-cours') is not None, 'mots du cours en lecture seule')
    page.click('[data-ajouter]')
    page.fill('dialog [name="fr"]', 'mon mot à moi')
    page.fill('dialog [name="jp_kana"]', 'わたしの')
    page.click('dialog .bouton-principal')
    page.wait_for_selector('[data-lignes] tr:first-child:has-text("mon mot à moi")', timeout=5000)
    verifier(next(x for x in mots(page) if x['fr'][0] == 'mon mot à moi')['chapitres'] == ['mes_mots@2'], 'son mot va dans SON « Mes mots »')
    page.goto(BASE + '#/chapitres?chapitre=mois'); page.wait_for_selector('.detail-tete h2:has-text("Mois")')
    verifier(page.query_selector('[data-ajouter-mots]') is None and page.query_selector('[data-copier-lot]') is not None, 'chapitre du cours : en lecture pour un membre, mais on peut copier ses mots')
    page.check('.tableau-chapitre [data-tout]')
    page.select_option('[data-vers]', 'mes_mots@2')
    page.click('[data-copier-lot]')
    page.wait_for_selector('.toast-succes:has-text("copiés")')
    verifier(sum(1 for x in mots(page) if 'mes_mots@2' in x['chapitres']) == 13, 'il range les 12 mois du cours dans son « Mes mots »')
    page.click('.menu-compte summary')
    verifier(page.query_selector('[data-sauvegarde-complete]') is None, 'pas de sauvegarde complète pour un membre')
    restes = page.evaluate('Object.keys(localStorage)')
    verifier(restes == ['nihonjo_dev_email'], f'rien de l’utilisateur dans le navigateur : seule l’adresse du mode d’essai reste ({restes})')
    page.click('[data-deconnexion]')
    page.wait_for_selector('.feuille-connexion')
    verifier(True, 'déconnexion : retour à l’écran de connexion')
    ctx.close()

    # --- Comptes : inscription, « Mon compte », administration, suppression ----
    print('Comptes')
    ctx = nav.new_context(viewport={'width': 1320, 'height': 900})
    page = ctx.new_page(); brancher(page)
    page.goto(BASE); page.wait_for_selector('[data-form-dev]')
    verifier(page.query_selector('[data-intention="connexion"]') is not None and page.query_selector('[data-intention="inscription"]') is not None,
             'écran de connexion : « Se connecter » et « Créer un compte »')
    avant = len(journal)
    page.fill('[name=email]', 'nouvelle@exemple.fr')
    page.click('[data-intention="connexion"]')
    page.wait_for_selector('[data-creer-compte]')
    oublier_refus(avant, 404)
    verifier('Pas encore de compte' in page.inner_text('.feuille-connexion') and 'nouvelle@exemple.fr' in page.inner_text('.feuille-connexion'),
             'se connecter sans compte : « Pas encore de compte Nihonjo », avec l’adresse')
    capture(page, '05_compte_inexistant')
    page.click('[data-creer-compte]')
    page.wait_for_selector('.puce-chapitre')
    verifier(page.query_selector('.toast-succes:has-text("Bienvenue")') is not None, '« Créer mon compte » : compte créé, accueil, message de bienvenue')
    page.goto(BASE + '#/compte'); page.wait_for_selector('.carte-profil')
    verifier(page.inner_text('[data-nom]') == 'nouvelle' and 'Membre' in page.inner_text('.profil-puces'), 'Mon compte : nom, rôle')
    page.fill('[name="pseudo"]', 'Nouvelle Élève')
    page.click('[data-form-pseudo] button')
    page.wait_for_function("document.querySelector('[data-nom]').textContent === 'Nouvelle Élève'")
    verifier(page.get_attribute('.menu-compte summary', 'title') == 'Nouvelle Élève' and api(page, 'moi')['pseudo'] == 'Nouvelle Élève',
             'pseudo : enregistré, affiché dans l’en-tête')
    capture(page, '06_mon_compte')
    page.goto(BASE + '#/comptes'); page.wait_for_selector('.panne')
    verifier('Réservé' in page.inner_text('.panne'), 'Gérer les comptes : réservé à un administrateur')
    avant = len(journal)
    verifier(not lire_brut(page, 'comptes.lister')['ok'], 'et le serveur refuse aussi (même en appelant l’API directement)')
    oublier_refus(avant, 403)
    page.goto(BASE + '#/compte'); page.wait_for_selector('[data-supprimer]')
    page.click('[data-supprimer]')
    page.wait_for_selector('dialog .bouton-danger')
    page.click('dialog .bouton-danger')
    page.wait_for_selector('.feuille-connexion .connexion-message')
    verifier('supprimé' in page.inner_text('.connexion-message'), 'suppression du compte : retour à l’écran de connexion')
    ctx.close()

    ctx = nav.new_context(viewport={'width': 1320, 'height': 900})
    page = ctx.new_page(); brancher(page)
    connecter(page, 'jose@exemple.fr')
    page.click('.menu-compte summary')
    verifier(page.query_selector('.menu-compte a[href="#/compte"]') is not None and page.query_selector('.menu-compte a[href="#/comptes"]') is not None,
             'menu du compte : « Mon compte » et « Gérer les comptes » (administrateur)')
    page.click('.menu-compte a[href="#/comptes"]')
    page.wait_for_selector('.ligne-compte')
    noms = page.eval_on_selector_all('.ligne-compte-nom strong', 'l => l.map((e) => e.textContent)')
    verifier('Nouvelle Élève' not in noms and 'jose' in noms and 'invite' in noms, f'liste des comptes : le compte supprimé n’y est plus ({noms})')
    verifier(page.query_selector('.ligne-compte-moi [data-supprimer]') is None, 'sa propre ligne : pas de suppression ici')
    ligne_invite = '.ligne-compte:has(strong:text-is("invite"))'
    page.click(f'{ligne_invite} [data-role="admin"]')
    page.wait_for_selector(f'{ligne_invite} .badge-admin')
    verifier(True, 'nommer administrateur')
    capture(page, '07_comptes')
    page.click(f'{ligne_invite} [data-role="membre"]')
    page.wait_for_selector(f'{ligne_invite} [data-role="admin"]')
    verifier(page.query_selector(f'{ligne_invite} .badge-admin') is None, 'retirer l’administration')
    avant = len(journal)
    verifier(not ecrire(page, 'comptes.role', {'id': 1, 'role': 'membre'})['ok'], 'le dernier administrateur ne se retire pas son rôle')
    oublier_refus(avant, 409)
    ctx.close()

    # --- Téléphone ---------------------------------------------------------------
    print('Téléphone')
    ctx = nav.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    page = ctx.new_page(); brancher(page)
    page.goto(BASE); page.wait_for_selector('.feuille-connexion')
    capture(page, '19_mobile_connexion')
    connecter(page, 'jose@exemple.fr')
    verifier(abs(page.eval_on_selector('.navigation', 'e => e.getBoundingClientRect().bottom') - 844) < 2, 'navigation (4 onglets) collée en bas')
    capture(page, '20_mobile_reviser')
    page.goto(BASE + '#/compte'); page.wait_for_selector('.carte-profil')
    verifier(page.evaluate('document.documentElement.scrollWidth') <= 390, 'Mon compte tient dans le téléphone (pas de défilement horizontal)')
    capture(page, '21_mobile_compte')
    page.goto(BASE + '#/kana'); page.wait_for_selector('.tableau-kana')
    capture(page, '33_mobile_kana')
    page.goto(BASE + '#/jeu-kana'); page.wait_for_selector('[data-commencer]')
    verifier(page.is_visible('.navigation'), 'réglages du jeu : navigation visible')
    page.click('[data-commencer]'); page.wait_for_selector('[data-romaji]')
    verifier(not page.is_visible('.navigation'), 'partie en cours : navigation masquée')
    capture(page, '34_mobile_jeu')
    page.click('[data-arreter]')
    page.wait_for_selector('[data-commencer]')
    verifier(page.is_visible('.navigation'), 'arrêt avant le premier caractère : retour aux réglages, navigation revenue')
    ctx.close()

    # --- Tableau noir ------------------------------------------------------------
    ctx = nav.new_context(viewport={'width': 1320, 'height': 900}, color_scheme='dark')
    page = ctx.new_page(); brancher(page)
    connecter(page, 'jose@exemple.fr')
    page.goto(BASE + '#/kana'); page.wait_for_selector('.tableau-kana')
    capture(page, '35_sombre_kana')
    ctx.close()
    nav.close()

print()
print('Console :', '\n'.join(journal) if journal else 'propre')
print('ÉCHECS :', echecs if echecs else 'aucun')
sys.exit(1 if echecs or journal else 0)
