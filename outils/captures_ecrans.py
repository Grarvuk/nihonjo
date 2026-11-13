"""Captures d'écran de Nihonjo pour juger l'interface (skill ux-ui-nihonjo).

Chaque vue demandée, au bureau (1280 px) et au téléphone (390 px), en thème
clair et sombre. « exercice » lance la révision rapide de l'accueil et
capture la question, puis une mauvaise réponse.

Usage : serveur lancé par
    NIHONJO_AUTH=dev NIHONJO_BASE=/tmp/essai.sqlite php -S 127.0.0.1:8770 -t .
puis
    python3 outils/captures_ecrans.py <dossier> [reviser,kana,jeu-kana,exercice,lexique,chapitres,donnees]
Variables : URL (défaut http://127.0.0.1:8770/), NIHONJO_POLICES (dossier
node_modules/@fontsource avec dm-sans, manrope et noto-sans-jp, pour les vraies
polices quand Google Fonts est bloqué), PLEIN=1 (page entière au téléphone).
Ne JAMAIS le lancer sur la base de José : il se connecte en mode dev.
"""
import os, re, sys, pathlib
from playwright.sync_api import sync_playwright
BASE=os.environ.get('URL','http://127.0.0.1:8770/')
OUT=pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
POL=pathlib.Path(os.environ['NIHONJO_POLICES']) if os.environ.get('NIHONJO_POLICES') else None
VUES=sys.argv[2].split(',') if len(sys.argv)>2 else ['reviser','exercice','kana','jeu-kana','lexique','chapitres','donnees']
def css():
    if not POL:
        return ''
    m=[]
    for paquet,poids in (('dm-sans',('400','500','600','700')),('manrope',('600','700','800')),('noto-sans-jp',('400','500','700'))):
        for p in poids:
            c=(POL/paquet/f'{p}.css').read_text()
            m.append(re.sub(r'url\(\./files/([^)]+)\)', lambda x: f'url(https://polices.test/{paquet}/{x.group(1)})', c))
    return '\n'.join(m)
CSS=css()

def route(r):
    u=r.request.url
    if 'fonts.googleapis.com' in u: return r.fulfill(body=CSS, content_type='text/css')
    if u.startswith('https://polices.test/'):
        paquet,f=u[len('https://polices.test/'):].split('/',1)
        return r.fulfill(body=(POL/paquet/'files'/f).read_bytes(), content_type='font/woff2')
    return r.abort()  # polices de repli
with sync_playwright() as p:
    b=p.chromium.launch()
    for nom,vp in (('bureau',{'width':1280,'height':860}),('tel',{'width':390,'height':844})):
        for theme in ('clair','sombre'):
            ctx=b.new_context(viewport=vp, device_scale_factor=1, color_scheme='light' if theme=='clair' else 'dark')
            pg=ctx.new_page(); errs=[]
            pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.route(re.compile(r'^https://(fonts\.googleapis\.com|fonts\.gstatic\.com|polices\.test)/.*'), route)
            pg.goto(BASE); pg.wait_for_timeout(800)
            if pg.locator('[data-form-dev]').count():
                pg.fill('[name=email]','jose@exemple.com'); pg.click('[data-form-dev] button'); pg.wait_for_timeout(1500)
            for v in VUES:
                if v == 'exercice':
                    pg.goto(BASE+'#/reviser'); pg.wait_for_timeout(700); pg.click('[data-rapide]'); pg.wait_for_timeout(700)
                    pg.screenshot(path=str(OUT/f'exercice_{nom}_{theme}.png'))
                    pg.fill('[data-reponse]', 'zzz'); pg.click('[data-valider]'); pg.wait_for_timeout(700)
                    pg.screenshot(path=str(OUT/f'exercice-faux_{nom}_{theme}.png'))
                    continue
                pg.goto(BASE+'#/'+v); pg.wait_for_timeout(900)
                pg.screenshot(path=str(OUT/f'{v}_{nom}_{theme}.png'), full_page=(nom=='bureau' or os.environ.get('PLEIN')=='1'))
            if errs: print(nom,theme,'ERR',[e for e in errs if 'polices' not in e][:5])
            ctx.close()
    b.close()
print('ok')
