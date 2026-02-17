let sessionMots = [];
let indexActuel = 0;
let mode = '';
let dictionnaireComplet = [];
let dernierMotAjoute = null;
let motCompletAttendu = "";
let scoreSession = 0;
let questionsRepondues = 0;

let drillState = {
    mot: null,
    currentSuccess: 0,
    target: 3
};

const db = new Dexie("NihonjoDB");
db.version(1).stores({
    motsPerso: '++id, *thematiques, *chapitres', // On indexe les thèmes et chapitres pour filtrer vite
    progression: 'fr, statut' // Table pour l'état d'apprentissage
});

const hiraganaGrid = [
    "あ", "い", "う", "え", "お",
    "か", "き", "く", "け", "こ",
    "さ", "し", "す", "せ", "そ",
    "た", "ち", "つ", "て", "と",
    "な", "に", "ぬ", "ね", "の",
    "は", "ひ", "ふ", "へ", "ほ",
    "ま", "み", "む", "め", "も",
    "や", null, "ゆ", null, "よ", // Yi et Ye n'existent pas
    "ら", "り", "る", "れ", "ろ",
    "わ", null, null, null, "を", // Wu n'existe pas
    "ん", "〜", "ー", null, null
];

const katakanaGrid = [
    "ア", "イ", "ウ", "エ", "オ",
    "カ", "キ", "ク", "ケ", "コ",
    "サ", "シ", "ス", "セ", "ソ",
    "タ", "チ", "ツ", "テ", "ト",
    "ナ", "ニ", "ヌ", "ネ", "ノ",
    "ハ", "ヒ", "フ", "ヘ", "ホ",
    "マ", "ミ", "ム", "メ", "モ",
    "ヤ", null, "ユ", null, "ヨ",
    "ラ", "リ", "ル", "レ", "ロ",
    "ワ", null, null, null, "ヲ",
    "ン", null, null, null, null
];

const dakutenHira = [
    "が", "ぎ", "ぐ", "げ", "ご",
    "ざ", "じ", "ず", "ぜ", "ぞ",
    "だ", "ぢ", "づ", "で", "ど",
    "ば", "び", "ぶ", "べ", "ぼ",
    "ぱ", "ぴ", "ぷ", "ぺ", "ぽ",
    "っ", "ゃ", "ゅ", "ょ" // On en profite pour ajouter les petits tsu/ya/yu/yo
];

const dakutenKata = [
    "ガ", "ギ", "グ", "ゲ", "ゴ",
    "ザ", "ジ", "ズ", "ゼ", "ゾ",
    "ダ", "ヂ", "ヅ", "デ", "ド",
    "バ", "ビ", "ブ", "ベ", "ボ",
    "パ", "ピ", "プ", "ペ", "ポ",
    "ッ", "ャ", "ュ", "ョ"
];

function obtenirConsigne(modeActuel) {
    const exemples = {
        'fr-jp': "Traduisez le mot français en japonais. <br><i>Exemple : 'Aurore' → あかつき</i>",
        'jp-fr': "Donnez la traduction française du mot japonais. <br><i>Exemple : 'あかつき' → Aurore</i>",
        'trous-kana': "Complétez le caractère manquant en Kanas. <br><i>Exemple : 'あか_き' → つ</i>",
        'trous-kanji': "Trouvez le Kanji manquant. <br><i>Exemple : '暁_' → き (si le mot est composé) ou le caractère lui-même.</i>",
        'lecture-kanji': "Lisez le mot en Kanjis et donnez son sens en français. <br><i>Exemple : '暁' → Aurore</i>",
        'transcription': "Écrivez la lecture exacte de ce mot en Kanas. <br><i>Exemple : '暁' → あかつき</i>"
    };
    return exemples[modeActuel] || "Répondez à la question posée.";
}
// --- INITIALISATION ---
window.onload = async () => {
    // Fusion des deux sources au chargement (Variables issues de data_cours.js et data_perso.js)
    await chargerDonnees();
    dictionnaireComplet = [...dictionnaire_cours];
    
    console.log(`[DEBUG] Dictionnaire chargé : ${dictionnaire_cours.length} cours.`);
    
    initialiserInterface();

    const btnAjout = document.getElementById("btn-ajouter-mot");
    if(btnAjout) {
        btnAjout.addEventListener("click", ajouterMot);
    }
};

// Charge les mots de la BDD et fusionne avec les cours
async function chargerDonnees() {
    const persoBDD = await db.motsPerso.toArray();
    // dictionnaire_cours vient toujours de ton fichier JS statique
    dictionnaireComplet = [...dictionnaire_cours, ...persoBDD];
    console.log(`[DB] ${persoBDD.length} mots persos chargés.`);
}

async function initialiserInterface() {
    // --- 0. RÉCUPÉRATION DES DONNÉES DE LA BDD ---
    // On attend que Dexie récupère les mots personnels
    const motsPersoBDD = await db.motsPerso.toArray();
    
    // On met à jour le dictionnaire complet (Fusion statique + BDD)
    dictionnaireComplet = [...dictionnaire_cours, ...motsPersoBDD];

    // --- 1. COLLECTE DYNAMIQUE DES THÉMATIQUES ---
    const themesCours = dictionnaire_cours.flatMap(m => m.thematiques || []);
    const themesPerso = motsPersoBDD.flatMap(m => m.thematiques || []);

    const toutesLesThematiques = [...new Set([...themesCours, ...themesPerso])]
        .filter(t => t && t !== "Sans thématique")
        .sort((a, b) => a.localeCompare(b));

    // --- 2. REMPLISSAGE DU SELECT DE FILTRAGE (Menu principal) ---
    const selectFiltre = document.getElementById('select-thematique');
    if (selectFiltre) {
        selectFiltre.innerHTML = '<option value="tous">Toutes</option>';
        toutesLesThematiques.forEach(t => {
            let opt = document.createElement('option');
            opt.value = t; 
            opt.innerText = t.charAt(0).toUpperCase() + t.slice(1);
            selectFiltre.appendChild(opt);
        });
    }

    // --- 3. REMPLISSAGE DU SELECT D'AJOUT (Formulaire) ---
    const selectAjout = document.getElementById('add-thematique');
    if (selectAjout && selectAjout.tagName === 'SELECT') {
        selectAjout.innerHTML = ''; 
        toutesLesThematiques.forEach(t => {
            let opt = document.createElement('option');
            opt.value = t;
            opt.innerText = t.charAt(0).toUpperCase() + t.slice(1);
            selectAjout.appendChild(opt);
        });
    }

    // --- 4. REMPLISSAGE DE LA DATALIST (Autocomplete) ---
    const datalistAjout = document.getElementById('liste-thematiques-existantes');
    if (datalistAjout) {
        datalistAjout.innerHTML = ''; 
        toutesLesThematiques.forEach(t => {
            let opt = document.createElement('option');
            opt.value = t; 
            datalistAjout.appendChild(opt);
        });
    }

    // --- 5. GESTION DYNAMIQUE DES CHAPITRES ---
    const containerCheck = document.getElementById('checkboxes-chapitres');
    if (containerCheck) {
        containerCheck.innerHTML = "";
        // On se base sur le dictionnaire fusionné incluant la BDD
        const listeChap = [...new Set(dictionnaireComplet.flatMap(m => m.chapitres || []))];
        
        listeChap.forEach(chap => {
            const div = document.createElement('div');
            div.className = 'chapitre-item';
            
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.id = `chap-${chap}`;
            cb.value = chap;
            cb.checked = true; 
            cb.addEventListener('change', sauvegarderEtatsChapitres);

            const lb = document.createElement('label');
            lb.htmlFor = `chap-${chap}`;
            lb.innerText = chap.replace(/_/g, ' ');

            div.appendChild(cb);
            div.appendChild(lb);
            containerCheck.appendChild(div);
        });

        chargerEtatsChapitres();
    }
    
    const inputChap = document.getElementById('add-chapitre');
    if(inputChap) inputChap.value = "extra_chapitre";
}

// --- GESTION DES MOTS PERSOS (BDD) ---
async function ajouterMot() {
    const getVal = (id) => document.getElementById(id).value.trim();
    const fr = getVal('add-fr');
    const kanji = getVal('add-kanji');
    const kana = getVal('add-kana');
    const thSaisie = getVal('add-thematique');

    if (!fr || (!kanji && !kana) || !thSaisie) {
        return alert("Français, Japonais et Thématique requis.");
    }

    const nouveauMot = {
        fr: fr.split(',').map(s => s.trim()).filter(s => s),
        jp_romaji: getVal('add-romaji') ? getVal('add-romaji').split(',').map(s => s.trim()) : [""],
        jp_kanji: kanji ? kanji.split(',').map(s => s.trim()) : [""],
        jp_kana: kana ? kana.split(',').map(s => s.trim()) : [""],
        context: getVal('add-context') || "N/A",
        thematiques: [thSaisie], 
        chapitres: getVal('add-chapitre') ? getVal('add-chapitre').split(',').map(s => s.trim()) : ["extra_chapitre"],
        statut: "non acquis"
    };

    // SAUVEGARDE RÉELLE DANS INDEXEDDB
    await db.motsPerso.add(nouveauMot);
    
    await chargerDonnees(); // Recharge la fusion
    initialiserInterface(); // Update les menus
    
    alert("Mot enregistré en local !");
    
    // Reset champs
    ['add-fr','add-romaji','add-kanji','add-kana','add-context','add-thematique'].forEach(id => {
        document.getElementById(id).value = "";
    });
}

function genererExport() {
    if (!dernierMotAjoute) return alert("Ajoute d'abord un mot pour l'exporter.");

    const modal = document.getElementById('export-modal');
    const output = document.getElementById('json-output');
    
    // On affiche juste l'objet avec une virgule à la fin pour faciliter le copier-coller
    const jsonString = JSON.stringify(dernierMotAjoute, null, 2);
    output.value = jsonString + ",";
    
    modal.classList.remove('hidden');
}

// --- LOGIQUE EXERCICE ---
async function demarrer(type) { // Ajout de async
    mode = type;
    document.getElementById('section-ajout').classList.add('hidden');

    scoreSession = 0;
    questionsRepondues = 0;
    document.getElementById('current-score').innerText = "0";
    document.getElementById('total-questions').innerText = "0";

    const thChoisie = document.getElementById('select-thematique').value;
    const etatFiltre = document.getElementById('filter-etat').value;
    const checkboxes = document.querySelectorAll('#checkboxes-chapitres input:checked');
    const chapitresChoisis = Array.from(checkboxes).map(cb => cb.value);

    // --- FILTRAGE ASYNC ---
    let motsFiltres = [];
    for (const m of dictionnaireComplet) {
        const etatMot = await chargerEtatMot(m.fr[0]); // On attend la réponse de la BDD
        
        const matchThematique = (thChoisie === "tous" || m.thematiques.includes(thChoisie));
        const matchChapitre = m.chapitres.some(c => chapitresChoisis.includes(c));
        const matchEtat = (etatFiltre === "tous" || etatMot === etatFiltre);
        
        if (matchThematique && matchChapitre && matchEtat) {
            motsFiltres.push(m);
        }
    }

    if (mode === 'lecture-kanji' || mode === 'transcription') {
        motsFiltres = motsFiltres.filter(m => m.jp_kanji && m.jp_kanji[0] && m.jp_kanji[0].trim() !== "");
    }

    if (motsFiltres.length === 0) return alert("Aucun mot trouvé.");

    sessionMots = motsFiltres;
    sessionMots.sort(() => Math.random() - 0.5);
    indexActuel = 0;
    
    document.getElementById('menu').classList.add('hidden');
    document.getElementById('exercice').classList.remove('hidden');
    await afficherMot(); // Ajout de await
}

async function afficherMot() { // Ajout de async
    const m = sessionMots[indexActuel];
    const feedback = document.getElementById('feedback');
    const kanjiProps = document.getElementById('kanji-propositions');

    document.getElementById('consigne-exercice').innerHTML = obtenirConsigne(mode);
    
    feedback.classList.add('hidden');
    document.getElementById('reponse-utilisateur').value = "";
    document.getElementById('info-progress').innerText = `Mot ${indexActuel+1}/${sessionMots.length}`;
    
    let texteQuestion = "";
    const traductionFr = m.fr.join(", ");

    // --- CORRECTION ICI ---
    const etatActuel = await chargerEtatMot(m.fr[0]); // Ajout de await
    const badge = document.getElementById('word-status-badge');
    if (badge) {
        badge.innerText = etatActuel.toUpperCase(); // Maintenant etatActuel est bien un string
        badge.className = `status-badge-small status-${etatActuel.replace(/\s+/g, '-')}`;
    }

    if (mode === 'trous-kana' || mode === 'trous-kanji') {
        let baseJp = (mode === 'trous-kanji' && m.jp_kanji && m.jp_kanji[0] !== "") ? m.jp_kanji[0] : m.jp_kana[0];
        motCompletAttendu = baseJp;
        texteQuestion = genererMotATrous(baseJp);
        
        const aide = m.context ? `[${m.context}] - Traduction : ${traductionFr}` : `Traduction : ${traductionFr}`;
        document.getElementById('contexte-aide').innerText = aide;

        if (mode === 'trous-kanji' && kanjiProps) {
            const indexTrou = texteQuestion.indexOf('_');
            if (indexTrou !== -1) {
                genererPropositionsKanjis(motCompletAttendu[indexTrou]);
            }
        } else if (kanjiProps) {
            kanjiProps.classList.add('hidden');
        }

    } else if (mode === 'lecture-kanji') {
        // --- NOUVEAU MODE : AFFICHAGE KANJI SEUL ---
        texteQuestion = m.jp_kanji[0];
        document.getElementById('contexte-aide').innerText = m.context ? `[${m.context}] - Traduire en français` : "Traduire en français";
        if (kanjiProps) kanjiProps.classList.add('hidden');

    } else if (mode === 'fr-jp') {
        texteQuestion = traductionFr;
        document.getElementById('contexte-aide').innerText = m.context || "";
        if (kanjiProps) kanjiProps.classList.add('hidden');
    } else if (mode === 'transcription') {
        // On affiche UNIQUEMENT le Kanji
        texteQuestion = m.jp_kanji[0];
        document.getElementById('contexte-aide').innerText = m.context ? `[${m.context}] - Écrire la lecture en Kanas` : "Écrire la lecture en Kanas";
        if (kanjiProps) kanjiProps.classList.add('hidden');
    }
    else {
        // Mode Jp -> Fr classique
        texteQuestion = (m.jp_kanji && m.jp_kanji[0]) ? `${m.jp_kanji[0]} (${m.jp_kana[0]})` : m.jp_kana[0];
        document.getElementById('contexte-aide').innerText = m.context || "";
        if (kanjiProps) kanjiProps.classList.add('hidden');
    }

    document.getElementById('mot-a-deviner').innerText = texteQuestion;
    document.getElementById('reponse-utilisateur').focus();
}

function genererMotATrous(mot) {
    if (!mot || mot.length === 0) return "???";
    if (mot.length === 1) return "_"; 
    
    const indexAleatoire = Math.floor(Math.random() * mot.length);
    const tab = mot.split('');
    tab[indexAleatoire] = "_";
    return tab.join('');
}

async function verifierReponse() {
    const feedback = document.getElementById('feedback');
    if (!feedback.classList.contains('hidden')) {
        await prochainMot();
        return;
    }

    const mot = sessionMots[indexActuel];
    const rawRep = document.getElementById('reponse-utilisateur').value.trim();
    const repNormalisee = normaliser(rawRep);
    
    if (rawRep === "") return;

    let estCorrect = false;

    // --- LOGIQUE DE VÉRIFICATION PAR MODE ---
    if (mode === 'transcription') {
        estCorrect = [...mot.jp_kana, ...mot.jp_kanji].some(v => normaliser(v) === repNormalisee);
    } else if (mode.startsWith('trous')) {
        const attenduNormalise = normaliser(motCompletAttendu);
        estCorrect = (repNormalisee === attenduNormalise || motCompletAttendu.includes(rawRep));
    } else if (mode === 'lecture-kanji') {
        estCorrect = mot.fr.some(f => normaliser(f) === repNormalisee);
    } else if (mode === 'fr-jp') {
        estCorrect = [...mot.jp_romaji, ...mot.jp_kana, ...mot.jp_kanji].some(v => normaliser(v) === repNormalisee);
    } else {
        estCorrect = mot.fr.some(f => normaliser(f) === repNormalisee);
    }

    // --- GESTION DU SCORE ---
    questionsRepondues++;
    if (estCorrect) {
        scoreSession++;
    }
    
    // Mise à jour de l'affichage du score
    document.getElementById('current-score').innerText = scoreSession;
    document.getElementById('total-questions').innerText = questionsRepondues;

    // --- SAUVEGARDE DE LA PROGRESSION ---
    const nouvelEtat = estCorrect ? "acquis" : "a revoir";
    await sauvegarderProgression(mot.fr[0], nouvelEtat); // Ajout await

    // --- FEEDBACK VISUEL ---
    const resTexte = document.getElementById('resultat-texte');
    resTexte.innerText = estCorrect ? "✅ Correct !" : "❌ Mauvaise réponse";
    resTexte.style.color = estCorrect ? "#28a745" : "#dc3545";

    document.getElementById('correction-details').innerHTML = `
        <div class="correction-item"><strong>Kanjis :</strong> ${mot.jp_kanji[0] || "---"}</div>
        <div class="correction-item"><strong>Lecture :</strong> ${mot.jp_kana.join(" / ")}</div>
        <div class="correction-item"><strong>Français :</strong> ${mot.fr.join(", ")}</div>
    `;
    
    feedback.classList.remove('hidden');
}

async function prochainMot() { // Ajout async
    indexActuel++;
    indexActuel < sessionMots.length ? await afficherMot() : retourMenu();
}

// --- UTILITAIRES ---
function toggleAjout() { document.getElementById('section-ajout').classList.toggle('hidden'); }
// Modifier toggleClavier pour appeler la version par défaut
function toggleClavier() { 
    const container = document.getElementById('keyboard-container');
    container.classList.toggle('hidden'); 
    if(!document.getElementById('keyboard-grid').innerHTML) genererClavier('hira'); 
}

function genererClavier(type = 'hira') { 
    const gridContainer = document.getElementById('keyboard-grid');
    const accentContainer = document.getElementById('keyboard-accents');
    
    gridContainer.innerHTML = ""; 
    accentContainer.innerHTML = ""; 
    
    const principale = (type === 'hira') ? hiraganaGrid : katakanaGrid;
    const accents = (type === 'hira') ? dakutenHira : dakutenKata;
    
    // Grille principale (A-I-U-E-O)
    principale.forEach(char => {
        gridContainer.appendChild(creerToucheClavier(char));
    });

    // Grille des accents
    accents.forEach(char => {
        accentContainer.appendChild(creerToucheClavier(char));
    });
}

// Fonction utilitaire pour éviter la répétition de code
function creerToucheClavier(char) {
    const b = document.createElement('button');
    if (char) {
        b.className = 'key';
        b.innerText = char;
        b.onclick = () => { 
            const input = document.getElementById('reponse-utilisateur');
            input.value += char; 
            input.focus();
        };
    } else {
        b.className = 'key key-empty';
        b.disabled = true;
    }
    return b;
}

function copierPressePapier() { document.getElementById('json-output').select(); document.execCommand('copy'); alert("Copié !"); }
async function passerMot() {
    const feedback = document.getElementById('feedback');
        if (!feedback.classList.contains('hidden')) {
            await prochainMot();
            return;
        }

    // --- MISE À JOUR DU SCORE ---
    questionsRepondues++; // On augmente le total de questions posées
    // Le scoreSession n'augmente pas ici
    
    // Mise à jour de l'affichage HTML
    document.getElementById('total-questions').innerText = questionsRepondues;

    const mot = sessionMots[indexActuel];
    const resTexte = document.getElementById('resultat-texte');
    
    // Marquer le mot comme "à revoir" car il a été passé
    sauvegarderProgression(mot.fr[0], "a revoir");

    resTexte.innerText = "❌ Mot passé";
    resTexte.style.color = "#dc3545";

    document.getElementById('correction-details').innerHTML = `
        <div class="correction-item"><strong>Kanjis :</strong> ${mot.jp_kanji[0] || "---"}</div>
        <div class="correction-item"><strong>Lecture :</strong> ${mot.jp_kana.join(" / ")}</div>
        <div class="correction-item"><strong>Français :</strong> ${mot.fr.join(", ")}</div>
    `;

    await sauvegarderProgression(mot.fr[0], "a revoir"); // Ajout await
    
    feedback.classList.remove('hidden');
}
function retourMenu() { location.reload(); }

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !document.getElementById('exercice').classList.contains('hidden')) {
        document.getElementById('feedback').classList.contains('hidden') ? verifierReponse() : prochainMot();
    }
});

function normaliser(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .trim()
        .normalize("NFD") // Sépare les accents des lettres
        .replace(/[\u0300-\u036f]/g, "") // Supprime les accents (ex: é -> e)
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") // Supprime la ponctuation
        .replace(/\s+/g, ""); // Supprime TOUS les espaces
}

function modifierTousChapitres(etat) {
    document.querySelectorAll('#checkboxes-chapitres input').forEach(c => {
        c.checked = etat;
    });
    // On sauvegarde le nouvel état global
    sauvegarderEtatsChapitres();
}

function genererPropositionsKanjis(kanjiCorrect) {
    const container = document.getElementById('kanji-propositions');
    if (!container) return;
    
    container.innerHTML = "";
    container.classList.remove('hidden');
    document.getElementById('keyboard-container').classList.add('hidden');

    // 1. On prépare les faux Kanjis (on en prend 5)
    let fauxKanjis = dictionnaireKanjis
        .filter(k => k.kanji !== kanjiCorrect)
        .sort(() => Math.random() - 0.5)
        .slice(0, 5)
        .map(k => k.kanji);

    // 2. On prépare 2 Hiraganas au hasard (en ignorant les null)
    let fauxHira = hiraganaGrid
        .filter(h => h !== null && h !== kanjiCorrect)
        .sort(() => Math.random() - 0.5)
        .slice(0, 2);

    // 3. On prépare 2 Katakanas au hasard (en ignorant les null)
    let fauxKata = katakanaGrid
        .filter(k => k !== null && k !== kanjiCorrect)
        .sort(() => Math.random() - 0.5)
        .slice(0, 2);

    // 4. On fusionne tout avec le caractère correct (Total 10)
    let propositions = [...fauxKanjis, ...fauxHira, ...fauxKata, kanjiCorrect];
    
    // 5. Mélange final
    propositions.sort(() => Math.random() - 0.5);

    // 6. Création des tuiles
    propositions.forEach(char => {
        const btn = document.createElement('button');
        btn.className = 'kanji-tile';
        btn.innerText = char;
        btn.onclick = () => {
            document.getElementById('reponse-utilisateur').value = char;
            verifierReponse(); 
        };
        container.appendChild(btn);
    });
}

// Sauvegarde l'état des checkbox dans le localStorage
function sauvegarderEtatsChapitres() {
    const etats = {};
    const checkboxes = document.querySelectorAll('#checkboxes-chapitres input[type="checkbox"]');
    checkboxes.forEach(cb => {
        etats[cb.value] = cb.checked;
    });
    localStorage.setItem('nihonjo_chapitres', JSON.stringify(etats));
}

// Charge les états sauvegardés
function chargerEtatsChapitres() {
    const saved = localStorage.getItem('nihonjo_chapitres');
    if (!saved) return;

    const etats = JSON.parse(saved);
    const checkboxes = document.querySelectorAll('#checkboxes-chapitres input[type="checkbox"]');
    checkboxes.forEach(cb => {
        if (etats.hasOwnProperty(cb.value)) {
            cb.checked = etats[cb.value];
        }
    });
}

// --- PROGRESSION (BDD remplace LocalStorage) ---
async function sauvegarderProgression(motFr, nouvelEtat) {
    // .put() fait un update si existe, sinon un add
    await db.progression.put({ fr: motFr, statut: nouvelEtat });
}

async function chargerEtatMot(motFr) {
    const res = await db.progression.get(motFr);
    return res ? res.statut : "non acquis";
}

// --- COURS & EXERCICES (Mis à jour pour être Async) ---
async function demarrerCours() {
    const thChoisie = document.getElementById('select-thematique').value;
    const etatFiltre = document.getElementById('filter-etat').value;
    const checkboxes = document.querySelectorAll('#checkboxes-chapitres input:checked');
    const chapitresChoisis = Array.from(checkboxes).map(cb => cb.value);

    const motsFiltres = [];
    for (const m of dictionnaireComplet) {
        const etatMot = await chargerEtatMot(m.fr[0]);
        const matchThematique = (thChoisie === "tous" || m.thematiques.includes(thChoisie));
        const matchChapitre = m.chapitres.some(c => chapitresChoisis.includes(c));
        const matchEtat = (etatFiltre === "tous" || etatMot === etatFiltre);
        if (matchThematique && matchChapitre && matchEtat) {
            motsFiltres.push({...m, currentStatus: etatMot});
        }
    }

    if (motsFiltres.length === 0) return alert("Aucun mot trouvé.");

    document.getElementById('menu').classList.add('hidden');
    document.getElementById('section-cours').classList.remove('hidden');

    const container = document.getElementById('liste-mots-cours');
    let html = `<table class="cours-table">
        <thead>
            <tr>
                <th>Français</th>
                <th>Japonais</th>
                <th>État</th>
                <th>Action</th> </tr>
        </thead>
        <tbody>`;

    motsFiltres.forEach(m => {
        const jpDisplay = (m.jp_kanji && m.jp_kanji[0]) 
            ? `<span class="kanji-main">${m.jp_kanji[0]}</span><br><small>${m.jp_kana.join(', ')}</small>` 
            : `<span class="kanji-main">${m.jp_kana[0]}</span>`;
        
        const badgeClass = `status-${m.currentStatus.replace(/\s+/g, '-')}`;
        const motSafe = m.fr[0].replace(/'/g, "\\'");

        html += `<tr>
            <td class="col-fr">${m.fr.join(', ')}</td>
            <td class="col-jp">${jpDisplay}</td>
            <td><span class="status-badge-small ${badgeClass}">${m.currentStatus}</span></td>
            <td>
                <button class="btn-primary btn-small" onclick="lancerDrill('${motSafe}')" style="background-color: #4a90e2;">
                    <i class="fa-solid fa-pen-nib"></i> S'entraîner sur ce mot
                </button>
            </td>
        </tr>`;
    });
    container.innerHTML = html + "</tbody></table>";
}

// 2. Fonctions du Drill
function lancerDrill(motFr) {
    const motObj = dictionnaireComplet.find(m => m.fr[0] === motFr);
    if (!motObj) return;

    drillState.mot = motObj;
    drillState.currentSuccess = 0;
    drillState.target = parseInt(document.getElementById('drill-reps').value) || 3;
    // On stocke l'état du mode difficile
    drillState.blindMode = document.getElementById('drill-blind-mode').checked;

    document.getElementById('drill-mot-fr').innerText = motObj.fr.join(', ');
    
    const aideElement = document.getElementById('drill-aide-jp');
    aideElement.innerText = `${motObj.jp_kanji[0] || ""} (${motObj.jp_kana[0]})`.replace('()', '');
    aideElement.style.visibility = "visible"; // Toujours visible au début

    updateDrillUI();
    document.getElementById('section-cours').classList.add('hidden');
    document.getElementById('section-ecriture').classList.remove('hidden');
    
    const input = document.getElementById('drill-input');
    input.value = "";
    input.classList.remove('drill-input-error', 'drill-input-success');
    input.focus();
}

function updateDrillUI() {
    document.getElementById('drill-counter-text').innerText = `${drillState.currentSuccess} / ${drillState.target}`;
    const dotsContainer = document.getElementById('drill-dots');
    dotsContainer.innerHTML = "";
    for (let i = 0; i < drillState.target; i++) {
        const dot = document.createElement('div');
        dot.className = i < drillState.currentSuccess ? 'dot active' : 'dot';
        dotsContainer.appendChild(dot);
    }
}

document.getElementById('drill-input').addEventListener('input', function(e) {
    if (drillState.blindMode && this.value.length > 0) {
        document.getElementById('drill-aide-jp').style.visibility = "hidden";
    }
});

document.getElementById('drill-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        const val = normaliser(this.value);
        const m = drillState.mot;
        const possibleAnswers = [...m.jp_kana, ...m.jp_kanji, ...m.jp_romaji].map(a => normaliser(a));

        if (possibleAnswers.includes(val)) {
            drillState.currentSuccess++;
            this.value = "";
            this.classList.add('drill-input-success');
            
            // En mode difficile, on laisse caché pour la répétition suivante
            if (drillState.blindMode) {
                document.getElementById('drill-aide-jp').style.visibility = "hidden";
            }

            setTimeout(() => this.classList.remove('drill-input-success'), 400);
            updateDrillUI();

            if (drillState.currentSuccess >= drillState.target) {
                document.getElementById('drill-feedback-msg').innerText = "✨ Mot validé !";
                // On réaffiche quand même pour la satisfaction finale
                document.getElementById('drill-aide-jp').style.visibility = "visible"; 
                setTimeout(fermerDrill, 1000);
            }
        } else {
            drillState.currentSuccess = 0;
            this.classList.add('drill-input-error');
            
            // ERREUR : On réaffiche l'aide pour que l'utilisateur puisse mémoriser
            document.getElementById('drill-aide-jp').style.visibility = "visible";
            document.getElementById('drill-feedback-msg').innerText = "❌ Erreur ! On recommence.";
            
            setTimeout(() => {
                this.classList.remove('drill-input-error');
                updateDrillUI();
            }, 500);
        }
    }
});

function fermerDrill() {
    document.getElementById('section-ecriture').classList.add('hidden');
    document.getElementById('section-cours').classList.remove('hidden');
    document.getElementById('drill-feedback-msg').innerText = "";
}