"""Fabrique assets/js/donnees/kanjis.js : les kanjis de la page « Kanji » et
de son jeu (26/10/2026).

Quels kanjis :
  - ceux des trois premières années de l'école japonaise (grades 1 à 3 de
    KANJIDIC2 : 440) — l'ordre de la liste de la v1 (assets/js/donnees/
    liste_kanjis.js : un, deux, trois…), complété au besoin ;
  - plus ceux du vocabulaire du cours (api/amorce/vocabulaire_initial.json)
    et de la liste v1 qui n'y sont pas : le groupe « plus loin », dans
    l'ordre où le manuel les fait rencontrer.

Pour chacun : le sens (celui de la liste v1 s'il existe, relu à l'époque en
français ; sinon les premiers sens français de KANJIDIC2), les sens acceptés
en réponse, les lectures on et kun, le nombre de traits.

Les lectures, traits et sens complémentaires viennent de KANJIDIC2
(© Electronic Dictionary Research and Development Group, licence CC BY-SA
4.0, https://www.edrdg.org/edrdg/licence.html), par sa conversion JSON du
paquet npm « kanjidic2-json ». Le paquet n'est PAS une dépendance du projet :
on le télécharge le temps de régénérer.

    mkdir -p /tmp/kd && cd /tmp/kd && npm pack kanjidic2-json && tar xzf kanjidic2-json-*.tgz
    python3 outils/generer_kanjis.py /tmp/kd/package/KANJIS.json

Ne modifier kanjis.js qu'en relançant ce script (après avoir changé la liste
v1 ou ce script) : une correction à la main serait perdue au prochain tour.
"""
import json
import re
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / 'assets' / 'js' / 'donnees' / 'kanjis.js'
KANJI = re.compile(r'[一-鿿]')


def liste_v1():
    """Les entrées de la v1, dans leur ordre : [(kanji, sens)]. Premier vu gardé."""
    texte = (RACINE / 'assets' / 'js' / 'donnees' / 'liste_kanjis.js').read_text(encoding='utf-8')
    vus, sortie = set(), []
    for k, sens in re.findall(r'kanji: "(.)",[^}]*?sens: "([^"]*)"', texte):
        if k not in vus:
            vus.add(k)
            sortie.append((k, sens))
    return sortie


def kanjis_du_cours():
    """Les kanjis du vocabulaire du cours, dans l'ordre des chapitres (pages du manuel)."""
    amorce = json.loads((RACINE / 'api' / 'amorce' / 'vocabulaire_initial.json').read_text(encoding='utf-8'))
    ordre = {c['id']: c.get('ordre', 0) for c in amorce['chapitres']}
    mots = sorted(enumerate(amorce['mots']), key=lambda im: (min((ordre.get(c, 9999) for c in im[1].get('chapitres', [])), default=9999), im[0]))
    vus, sortie = set(), []
    for _, m in mots:
        for ecrit in m.get('jp_kanji', []):
            for c in ecrit:
                if KANJI.match(c) and c not in vus:
                    vus.add(c)
                    sortie.append(c)
    return sortie


def sens_v1(texte):
    return [s.strip() for s in texte.split('/') if s.strip()]


# Les rares kanjis du cours que KANJIDIC2 ne traduit pas en français (il
# donnerait l'anglais).
SENS_MANQUANTS = {
    '椅': ['chaise'], '醤': ['sauce', 'pâte fermentée'], '箸': ['baguettes'], '兎': ['lapin', 'lièvre'],
    '芥': ['moutarde', 'poussière'], '喉': ['gorge', 'voix'], '痒': ['démanger', 'qui gratte'],
}


def propre(sens):
    """« recevoir (un coup) » → « recevoir » : la précision reste hors de la réponse attendue."""
    return re.sub(r'\s*\([^)]*\)', '', sens).strip()


def main(chemin_kanjidic):
    kd = {k['literal']: k for k in json.loads(Path(chemin_kanjidic).read_text(encoding='utf-8'))}
    v1 = liste_v1()
    sens_de_v1 = dict(v1)

    ordre = []  # (kanji, niveau)
    places = set()
    for niveau in (1, 2, 3):
        for k, _ in v1:
            if kd.get(k, {}).get('grade') == niveau and k not in places:
                ordre.append((k, niveau)); places.add(k)
        for k, e in sorted(kd.items(), key=lambda ke: ke[1].get('freq') or 9999):
            if e.get('grade') == niveau and k not in places:
                ordre.append((k, niveau)); places.add(k)
    for k in kanjis_du_cours() + [k for k, _ in v1]:
        if k not in places and k in kd:
            ordre.append((k, 0)); places.add(k)

    entrees = []
    for k, niveau in ordre:
        e = kd[k]
        lectures = e.get('readings', {})
        fr = e.get('meanings', {}).get('fr') or SENS_MANQUANTS.get(k) or e.get('meanings', {}).get('en') or []
        fr = [propre(s) for s in fr if not re.search(r'radical|kokuji|^\(', s)]
        fr = [s for s in fr if s]
        # Minuscule en tête (règle des textes affichés), sauf les noms propres
        # que KANJIDIC2 écrit avec une majuscule (Japon, Asie…).
        noms_propres = {s.lower() for s in fr if s[:1].isupper()}
        sens = sens_v1(sens_de_v1[k]) if k in sens_de_v1 else fr[:3]
        sens = [s if s.lower() in noms_propres else s[:1].lower() + s[1:] for s in sens]
        acceptes = [s for s in fr if s.lower() not in {x.lower() for x in sens}]
        entrees.append({
            'k': k,
            'n': niveau,
            't': (e.get('strokeCounts') or [0])[0],
            'sens': sens,
            'aussi': acceptes,
            'on': lectures.get('ja_on', []),
            'kun': lectures.get('ja_kun', []),
        })

    lignes = ',\n'.join('  ' + json.dumps(x, ensure_ascii=False, separators=(',', ':')) for x in entrees)
    SORTIE.write_text(f"""// FICHIER FABRIQUÉ par outils/generer_kanjis.py — ne pas le corriger à la main
// (relancer le script ; son en-tête dit comment).
//
// Les kanjis de la page « Kanji » et de son jeu : ceux des trois premières
// années de l'école japonaise (n = 1, 2, 3), puis ceux du vocabulaire du cours
// qui n'en sont pas (n = 0, « plus loin »), dans l'ordre du manuel.
// k : le caractère · t : nombre de traits · sens : le sens affiché (liste v1,
// sinon KANJIDIC2) · aussi : d'autres sens acceptés en réponse · on : lectures
// on (katakana) · kun : lectures kun (hiragana ; « . » sépare le radical de la
// terminaison écrite en kana — い.きる = 生きる —, « - » marque un préfixe ou
// un suffixe).
//
// Lectures, traits et sens complémentaires : KANJIDIC2, © Electronic
// Dictionary Research and Development Group, licence CC BY-SA 4.0
// (https://www.edrdg.org/edrdg/licence.html). Ce fichier, qui en dérive, est
// sous la même licence.

export const KANJIS = [
{lignes},
];
""", encoding='utf-8')
    from collections import Counter
    print(f'{len(entrees)} kanjis → {SORTIE.relative_to(RACINE)}', dict(Counter(x["n"] for x in entrees)))


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '/tmp/kd/package/KANJIS.json')
