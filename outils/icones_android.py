"""Fabrique les icônes et l'écran de démarrage de l'application Android
(application_android/res/) à partir de assets/icones/. À relancer si l'icône
change : python3 outils/icones_android.py (Pillow). creer_application_android.bat
recopie ensuite application_android/res/ par-dessus le projet Android.

Tailles : celles du modèle de Capacitor 8 (mipmap 48 à 192 px, premier plan
adaptatif 108 dp, écrans de démarrage portrait et paysage)."""
from pathlib import Path
from PIL import Image, ImageDraw

RACINE = Path(__file__).resolve().parent.parent
ICONES = RACINE / 'assets' / 'icones'
RES = RACINE / 'application_android' / 'res'
FOND_ICONE = '#19233D'   # --encre : le fond de l'icône adaptative
FOND_DEMARRAGE = '#F7F7F2'  # --papier : l'écran de démarrage

DENSITES = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
DEMARRAGE = {
    'drawable': (480, 320),
    'drawable-land-mdpi': (480, 320), 'drawable-land-hdpi': (800, 480), 'drawable-land-xhdpi': (1280, 720),
    'drawable-land-xxhdpi': (1600, 960), 'drawable-land-xxxhdpi': (1920, 1280),
    'drawable-port-mdpi': (320, 480), 'drawable-port-hdpi': (480, 800), 'drawable-port-xhdpi': (720, 1280),
    'drawable-port-xxhdpi': (960, 1600), 'drawable-port-xxxhdpi': (1280, 1920),
}


def enregistrer(image, chemin):
    chemin.parent.mkdir(parents=True, exist_ok=True)
    image.save(chemin, optimize=True)


def principal():
    icone = Image.open(ICONES / 'nihonjo-512.png').convert('RGBA')
    pleine = Image.open(ICONES / 'nihonjo-maskable-512.png').convert('RGBA')
    for nom, d in DENSITES.items():
        cote = round(48 * d)
        enregistrer(icone.resize((cote, cote), Image.LANCZOS), RES / f'mipmap-{nom}' / 'ic_launcher.png')
        rond = pleine.resize((cote, cote), Image.LANCZOS)
        masque = Image.new('L', (cote, cote), 0)
        ImageDraw.Draw(masque).ellipse((0, 0, cote - 1, cote - 1), fill=255)
        rond.putalpha(masque)
        enregistrer(rond, RES / f'mipmap-{nom}' / 'ic_launcher_round.png')
        # Premier plan adaptatif (108 dp) : l'icône « maskable », déjà prévue
        # pour être rognée par le lanceur (zone sûre au centre).
        cote_pp = round(108 * d)
        enregistrer(pleine.resize((cote_pp, cote_pp), Image.LANCZOS), RES / f'mipmap-{nom}' / 'ic_launcher_foreground.png')
    for dossier, (l, h) in DEMARRAGE.items():
        fond = Image.new('RGBA', (l, h), FOND_DEMARRAGE)
        cote = round(min(l, h) * 0.32)
        petit = icone.resize((cote, cote), Image.LANCZOS)
        fond.alpha_composite(petit, ((l - cote) // 2, (h - cote) // 2))
        enregistrer(fond.convert('RGB'), RES / dossier / 'splash.png')
    (RES / 'values').mkdir(parents=True, exist_ok=True)
    (RES / 'values' / 'ic_launcher_background.xml').write_text(
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
        f'    <color name="ic_launcher_background">{FOND_ICONE}</color>\n</resources>\n', encoding='utf-8')
    print(f'Icônes écrites dans {RES}')


if __name__ == '__main__':
    principal()
