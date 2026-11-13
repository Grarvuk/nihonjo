const pathToView = { '/': 'home', '/kana': 'kana', '/lexique': 'lexique', '/chapitres': 'chapitres', '/donnees': 'data', '/exercice': 'exercise' };
const viewToPath = { home: '/', kana: '/kana', lexique: '/lexique', chapitres: '/chapitres', data: '/donnees', exercise: '/exercice' };

const state = {
  active: pathToView[window.location.pathname] || 'home',
  theme: 'light',
  modal: null,
  answer: null,
  exerciseAnswer: 'とけい',
  exerciseChecked: true,
  toast: null,
  kanaGroup: 'あ行',
  search: ''
};

const navItems = [
  { id: 'home', label: 'Réviser', icon: 'pencil' },
  { id: 'kana', label: 'Kana', icon: 'grid' },
  { id: 'lexique', label: 'Lexique', icon: 'list' },
  { id: 'chapitres', label: 'Chapitres', icon: 'folder' },
  { id: 'data', label: 'Données', icon: 'chart' }
];

const exercises = [
  { id: 'fr-jp', eyebrow: 'Rappel actif', title: 'Français → japonais', description: 'Vous voyez le sens, vous écrivez le mot.', meta: '151 mots', tone: 'indigo', glyph: 'あ', sample: ['eau', 'みず'] },
  { id: 'jp-fr', eyebrow: 'Compréhension', title: 'Japonais → français', description: 'Vous lisez le mot, vous donnez le sens.', meta: '151 mots', tone: 'violet', glyph: '水', sample: ['みず', 'eau'] },
  { id: 'kana-gap', eyebrow: 'Précision', title: 'Mots à trous · kana', description: 'Retrouvez la kana qui manque.', meta: '151 mots', tone: 'mint', glyph: 'み□ず', sample: ['み', 'ず'] },
  { id: 'kanji-gap', eyebrow: 'Lecture', title: 'Mots à trous · kanji', description: 'Choisissez le caractère qui manque.', meta: '151 mots', tone: 'coral', glyph: '学□校', sample: ['学', '校'] },
  { id: 'kanji-meaning', eyebrow: 'Kanji', title: 'Sens des kanjis', description: 'Associez le caractère à son idée.', meta: '84 caractères', tone: 'sun', glyph: '人', sample: ['人', 'personne'] },
  { id: 'writing', eyebrow: 'Mémoire musculaire', title: 'Écriture répétée', description: 'Fixez le geste, un caractère à la fois.', meta: '38 caractères', tone: 'blue', glyph: '書', sample: ['書', 'écrire'] },
  { id: 'pairs', eyebrow: 'Rapidité', title: 'Paires', description: 'Reliez une écriture à son autre forme.', meta: '6 × 3 cartes', tone: 'lavender', glyph: '水', sample: ['水', 'みず'] },
  { id: 'kana-game', eyebrow: 'Kana', title: 'Défi rōmaji', description: 'Écrivez la lecture avant la fin du temps.', meta: '104 kana', tone: 'orange', glyph: 'ね', sample: ['ね', 'ne'] }
];

const vocab = [
  { word: 'こんばんは', reading: 'konbanwa', meaning: 'bonsoir', type: 'Expression', level: 'Acquis', color: 'indigo' },
  { word: '水', reading: 'みず · mizu', meaning: 'eau', type: 'Nom', level: 'À revoir', color: 'mint' },
  { word: '先生', reading: 'せんせい · sensei', meaning: 'professeur', type: 'Nom', level: 'Nouveau', color: 'coral' },
  { word: '食べる', reading: 'たべる · taberu', meaning: 'manger', type: 'Verbe', level: 'À revoir', color: 'sun' },
  { word: '人', reading: 'ひと · hito', meaning: 'personne', type: 'Kanji', level: 'Acquis', color: 'violet' }
];

const kanaGroups = {
  'あ行': ['あ', 'い', 'う', 'え', 'お'],
  'か行': ['か', 'き', 'く', 'け', 'こ'],
  'さ行': ['さ', 'し', 'す', 'せ', 'そ'],
  'た行': ['た', 'ち', 'つ', 'て', 'と'],
  'な行': ['な', 'に', 'ぬ', 'ね', 'の'],
  'は行': ['は', 'ひ', 'ふ', 'へ', 'ほ']
};

const iconPaths = {
  pencil: '<path d="m14.7 6.3 3 3M4 20l4.3-1 9.1-9.1a2.1 2.1 0 0 0-3-3L5.3 16 4 20Z"/><path d="m12 5-1.5-1.5a2 2 0 0 0-2.8 0L4.2 7a2 2 0 0 0 0 2.8L6 11.6"/>',
  grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
  folder: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-9Z"/>',
  chart: '<path d="M4 19V5M4 19h17"/><path d="m7 15 3-4 3 2 5-7"/>',
  moon: '<path d="M20.5 14.4A8.5 8.5 0 0 1 9.6 3.5 8.5 8.5 0 1 0 20.5 14.4Z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  spark: '<path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3L12 3Z"/><path d="m19 16 .5 2.5L22 19l-2.5.5L19 22l-.5-2.5L16 19l2.5-.5L19 16Z"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  settings: '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  chevron: '<path d="m7 10 5 5 5-5"/>',
  timer: '<circle cx="12" cy="13" r="7"/><path d="M12 9v4l2.5 1.5M9 3h6"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
};

function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.spark}</svg>`;
}

function progressRing(value, label, caption, color = 'indigo') {
  const dash = Math.round(value * 2.51);
  return `<div class="ring-wrap"><div class="progress-ring ring-${color}" style="--dash:${dash}"><span>${value}%</span></div><div><strong>${label}</strong><small>${caption}</small></div></div>`;
}

function topbar() {
  return `<header class="topbar">
    <div class="topbar-inner">
      <button class="brand" data-nav="home" aria-label="Retour à l'accueil">
        <span class="brand-mark"><span>日</span><span>本</span><span>語</span></span>
        <span class="brand-word">Nihonjo</span>
      </button>
      <nav class="desktop-nav" aria-label="Navigation principale">
        ${navItems.map(item => `<button class="nav-item ${state.active === item.id || (state.active === 'exercise' && item.id === 'home') ? 'active' : ''}" data-nav="${item.id}">${icon(item.icon)}<span>${item.label}</span></button>`).join('')}
      </nav>
      <div class="topbar-actions">
        <button class="icon-button" data-action="theme" aria-label="Changer le thème">${icon(state.theme === 'light' ? 'moon' : 'sun')}</button>
        <button class="avatar" data-action="profile" aria-label="Ouvrir le profil">J<span></span></button>
      </div>
    </div>
  </header>`;
}

function mobileNav() {
  return `<nav class="mobile-nav" aria-label="Navigation mobile">
    ${navItems.slice(0, 4).map(item => `<button class="mobile-nav-item ${state.active === item.id ? 'active' : ''}" data-nav="${item.id}">${icon(item.icon)}<span>${item.label}</span></button>`).join('')}
    <button class="mobile-nav-item ${state.active === 'data' ? 'active' : ''}" data-nav="data">${icon('chart')}<span>Plus</span></button>
  </nav>`;
}

function sectionHeading(kicker, title, copy = '') {
  return `<div class="section-heading"><div><span class="eyebrow">${kicker}</span><h2>${title}</h2>${copy ? `<p>${copy}</p>` : ''}</div></div>`;
}

function homeView() {
  return `<main class="page-shell home-view">
    <section class="welcome-row reveal">
      <div><span class="eyebrow">Samedi 24 octobre · session 08</span><h1>On reprend doucement,<br><em>mais on reprend.</em></h1><p class="lead">Quelques minutes aujourd'hui suffisent pour garder le japonais près de vous.</p></div>
      <div class="streak-pill"><span class="streak-flame">火</span><div><strong>4 jours</strong><small>de régularité</small></div><span class="streak-arrow">↗</span></div>
    </section>

    <section class="hero-grid reveal delay-1">
      <article class="focus-card">
        <div class="focus-glow"></div><div class="focus-top"><span class="eyebrow light">Votre priorité</span><span class="focus-tag">12 min</span></div>
        <div class="focus-content"><div class="kanji-stack"><span class="kanji-main">水</span><span class="kana-label">みず · mizu</span></div><div class="focus-copy"><h2>Remettre les mots<br>à portée de mémoire.</h2><p>151 mots attendent une petite révision dans <strong>« Le manuel · chap. 04 »</strong>.</p><button class="primary-button light-button" data-action="review">${icon('play')} Réviser maintenant <span>↗</span></button></div></div>
        <div class="focus-foot"><span>${icon('spark')} Recommandé par Nihonjo</span><span>Français → japonais</span></div>
      </article>
      <article class="daily-card">
        <div class="card-topline"><span class="eyebrow">Le mot du jour</span><span class="date-dot">今日</span></div>
        <div class="daily-kanji">人</div><div class="daily-reading">ひと <span>· hito</span></div><strong class="daily-meaning">personne</strong>
        <button class="text-button" data-action="daily">Voir la lecture et le sens ${icon('arrow')}</button>
      </article>
    </section>

    <section class="stats-strip reveal delay-2">
      <div class="stats-intro"><span class="eyebrow">Cette semaine</span><strong>Un peu chaque jour<br>vaut mieux qu'un grand soir.</strong></div>
      ${progressRing(38, 'Mots', 'acquis sur 1 034', 'indigo')}
      ${progressRing(31, 'Hiragana', 'acquis sur 104', 'mint')}
      ${progressRing(18, 'Katakana', 'acquis sur 104', 'coral')}
      <div class="weekly-bars"><div class="bars-head"><span>activité</span><strong>68%</strong></div><div class="bars"><i style="height:34%"></i><i style="height:54%"></i><i style="height:42%"></i><i style="height:70%"></i><i class="today" style="height:86%"></i><i style="height:58%"></i><i style="height:24%"></i></div><div class="bars-labels"><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span><span>D</span></div></div>
    </section>

    <section class="exercise-section reveal delay-3"><div class="section-line"><div><span class="eyebrow">À portée de clic</span><h2>Choisissez votre façon de réviser</h2></div><button class="ghost-button" data-action="all-exercises">Voir tous les exercices ${icon('arrow')}</button></div><div class="exercise-grid">${exercises.slice(0, 8).map((item, index) => exerciseCard(item, index)).join('')}</div></section>

    <section class="bottom-grid reveal delay-4">
      <article class="mini-panel course-panel"><div class="panel-heading"><div><span class="eyebrow">Votre parcours</span><h3>Le manuel, page par page</h3></div><button class="round-arrow" data-action="course" aria-label="Ouvrir le cours">${icon('arrow')}</button></div><div class="course-progress"><div class="book-visual">${icon('book')}<span>04</span></div><div class="course-copy"><strong>Chapitre 04 · La maison</strong><span>p. 74 — 89 · 26 mots</span><div class="mini-progress"><i style="width:56%"></i></div><small>56% du chapitre parcouru</small></div></div></article>
      <article class="mini-panel activity-panel"><div class="panel-heading"><div><span class="eyebrow">Dernière activité</span><h3>Vous êtes lancé·e</h3></div><span class="activity-time">il y a 2 h</span></div><div class="activity-row"><div class="activity-icon indigo-fill">${icon('check')}</div><div><strong>Français → japonais</strong><span>12 bonnes réponses sur 15</span></div><b>+24 XP</b></div><div class="activity-row faded"><div class="activity-icon mint-fill">${icon('spark')}</div><div><strong>Défi rōmaji</strong><span>9 kana reconnus</span></div><b>+12 XP</b></div></article>
    </section>
  </main>`;
}

function exerciseCard(item, index) {
  return `<button class="exercise-card tone-${item.tone} ${index === 0 ? 'selected' : ''}" data-exercise="${item.id}"><div class="exercise-card-top"><span class="exercise-glyph">${item.glyph}</span><span class="exercise-arrow">${icon('arrow')}</span></div><span class="eyebrow">${item.eyebrow}</span><h3>${item.title}</h3><p>${item.description}</p><div class="exercise-meta"><span>${item.meta}</span><span class="mini-arrow">→</span></div></button>`;
}

function pageHeader(title, eyebrow, copy, action = '') {
  return `<section class="page-header reveal"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p class="lead">${copy}</p></div>${action}</section>`;
}

function kanaView() {
  const row = kanaGroups[state.kanaGroup];
  return `<main class="page-shell inner-view"><div class="back-link" data-nav="home">${icon('arrow')} Retour au tableau de bord</div>${pageHeader('Les kana, sans les réciter dans le vide.', 'Point de départ · 208 caractères', 'Choisissez une série, observez les formes, puis faites-les passer dans votre mémoire.', '<button class="primary-button" data-action="kana-game">Lancer le défi rōmaji</button>')}
    <section class="kana-layout reveal delay-1"><article class="kana-card"><div class="section-line"><div><span class="eyebrow">Tableau de référence</span><h2>Hiragana</h2></div><span class="completion-badge">31 / 104 acquis</span></div><div class="kana-tabs">${Object.keys(kanaGroups).map(group => `<button class="kana-tab ${state.kanaGroup === group ? 'active' : ''}" data-kana="${group}">${group}</button>`).join('')}</div><div class="kana-row">${row.map((char, i) => `<button class="kana-tile" data-kana-char="${char}"><strong>${char}</strong><span>${['a','i','u','e','o'][i]}</span></button>`).join('')}</div><div class="kana-hint">${icon('spark')} Astuce : dites le son à voix haute avant de regarder la transcription.</div></article><aside class="kana-game-card"><div class="game-orbit"></div><span class="eyebrow light">Mini-jeu</span><div class="game-char">ね</div><span class="game-romaji">ne</span><h3>Le bon son,<br>au bon moment.</h3><p>10 caractères · 60 secondes</p><button class="light-button primary-button" data-action="kana-game">Commencer ${icon('arrow')}</button></aside></section>
    <section class="reference-row reveal delay-2"><div><span class="eyebrow">Progression</span><h3>Votre alphabet prend forme.</h3></div><div class="reference-metrics"><span><b>31</b><small>hiragana</small></span><span><b>18</b><small>katakana</small></span><span><b>2</b><small>séries parfaites</small></span></div></section>
  </main>`;
}

function lexiqueView() {
  const filtered = vocab.filter(item => `${item.word} ${item.reading} ${item.meaning}`.toLowerCase().includes(state.search.toLowerCase()));
  return `<main class="page-shell inner-view"><div class="back-link" data-nav="home">${icon('arrow')} Retour au tableau de bord</div>${pageHeader('Tout votre japonais, au même endroit.', 'Lexique · 1 034 mots communs', 'Retrouvez un mot, regardez son état, et remettez-le dans une session en un geste.', '<button class="primary-button" data-action="add-word">Ajouter un mot</button>')}
    <section class="lexique-toolbar reveal delay-1"><label class="search-field">${icon('search')}<input data-search type="search" value="${state.search}" placeholder="Rechercher en français, kana ou kanji…" /></label><div class="filter-pills"><button class="filter-pill active">Tous <span>1 034</span></button><button class="filter-pill">À revoir <span>151</span></button><button class="filter-pill">Nouveaux <span>246</span></button></div></section>
    <section class="word-table reveal delay-2"><div class="word-table-head"><span>Mot</span><span>Nature</span><span>État</span><span></span></div>${filtered.map(item => `<button class="word-row" data-action="word" data-word="${item.meaning}"><span class="word-main"><b>${item.word}</b><small>${item.reading}</small></span><span class="type-pill ${item.color}">${item.type}</span><span class="status-text ${item.level.toLowerCase().replace('à revoir','review').replace('acquis','done').replace('nouveau','new')}"><i></i>${item.level}</span><span class="row-arrow">${icon('arrow')}</span></button>`).join('')}</section>
    <div class="table-footer"><span>1–${filtered.length} sur 1 034 mots</span><button class="ghost-button">Charger la suite ${icon('arrow')}</button></div>
  </main>`;
}

function chaptersView() {
  const chapters = [{title:'Le manuel · chap. 04', copy:'La maison et les objets du quotidien', count:'26 mots', progress:'56%', color:'indigo', icon:'家'}, {title:'Mes premiers verbes', copy:'Une sélection pour parler de ses habitudes', count:'42 mots', progress:'32%', color:'mint', icon:'動'}, {title:'À écouter dans les anime', copy:'Expressions repérées en contexte', count:'18 mots', progress:'78%', color:'coral', icon:'音'}];
  return `<main class="page-shell inner-view"><div class="back-link" data-nav="home">${icon('arrow')} Retour au tableau de bord</div>${pageHeader('Des chapitres qui vous ressemblent.', 'Organisation · 3 chapitres personnels', 'Composez vos propres chemins de révision à partir du cours ou de vos mots.', '<button class="primary-button" data-action="new-chapter">Nouveau chapitre</button>')}
    <section class="chapter-layout reveal delay-1"><article class="new-chapter-card" data-action="new-chapter"><div class="plus-orb">${icon('plus')}</div><h3>Créer un nouveau chapitre</h3><p>Un thème, une envie, une étape à préparer.</p><span>Commencer en 30 secondes ${icon('arrow')}</span></article>${chapters.map(chapter => `<article class="chapter-card ${chapter.color}"><div class="chapter-card-top"><span class="chapter-icon">${chapter.icon}</span><span class="chapter-more">•••</span></div><span class="eyebrow">Chapitre personnalisé</span><h3>${chapter.title}</h3><p>${chapter.copy}</p><div class="chapter-meta"><span>${chapter.count}</span><span>${chapter.progress}</span></div><div class="mini-progress"><i style="width:${chapter.progress}"></i></div><button class="chapter-open">Ouvrir ${icon('arrow')}</button></article>`).join('')}</section>
    <section class="import-strip reveal delay-2"><div class="import-icon">${icon('download')}</div><div><span class="eyebrow">Import rapide</span><h3>Vous avez déjà une liste de mots ?</h3><p>Collez une réponse d'IA ou importez un fichier JSON, Nihonjo s'occupe du reste.</p></div><button class="ghost-button" data-action="import">Importer un fichier ${icon('arrow')}</button></section>
  </main>`;
}

function dataView() {
  return `<main class="page-shell inner-view"><div class="back-link" data-nav="home">${icon('arrow')} Retour au tableau de bord</div>${pageHeader('Voir les progrès, pas seulement les scores.', 'Données · votre mémoire en mouvement', 'Une vue simple pour savoir ce qui est solide, ce qui revient bientôt et ce qui mérite votre attention.', '<button class="ghost-button" data-action="settings">Réglages</button>')}
    <section class="data-hero reveal delay-1"><div class="mastery-big"><span class="eyebrow light">Maîtrise globale</span><strong>38<span>%</span></strong><p>+6% depuis le mois dernier</p></div><div class="mastery-bars"><div class="mastery-row"><span><i class="dot indigo-dot"></i>Acquis</span><b>394</b><div><i style="width:38%"></i></div></div><div class="mastery-row"><span><i class="dot coral-dot"></i>À revoir</span><b>151</b><div><i style="width:18%"></i></div></div><div class="mastery-row"><span><i class="dot gray-dot"></i>Nouveau</span><b>489</b><div><i style="width:44%"></i></div></div></div><div class="data-note">${icon('spark')}<span>Votre régularité est votre meilleur multiplicateur.</span></div></section>
    <section class="data-grid reveal delay-2"><article class="data-panel"><div class="panel-heading"><div><span class="eyebrow">Révisions</span><h3>Les 7 derniers jours</h3></div><span class="trend-up">↗ 18%</span></div><div class="large-bars"><i style="height:36%"><span>L</span></i><i style="height:60%"><span>M</span></i><i style="height:48%"><span>M</span></i><i style="height:78%"><span>J</span></i><i style="height:90%" class="today"><span>V</span></i><i style="height:62%"><span>S</span></i><i style="height:28%"><span>D</span></i></div></article><article class="data-panel"><div class="panel-heading"><div><span class="eyebrow">Caractères</span><h3>Kana & kanji</h3></div></div><div class="character-list"><div><span class="character-sample mint-bg">あ</span><span><b>Hiragana</b><small>31 / 104 acquis</small></span><strong>31%</strong></div><div><span class="character-sample coral-bg">カ</span><span><b>Katakana</b><small>18 / 104 acquis</small></span><strong>18%</strong></div><div><span class="character-sample sun-bg">学</span><span><b>Kanji niveau 1</b><small>22 / 80 acquis</small></span><strong>27%</strong></div></div></article></section>
  </main>`;
}

function exerciseView() {
  const keyboard = ['あ','い','う','え','お','か','き','く','け','こ','さ','し','す','せ','そ','た','ち','つ','て','と','な','に','ぬ','ね','の','は','ひ','ふ','へ','ほ','ま','み','む','め','も','や','ゆ','よ','ら','り','る','れ','ろ','わ','を','ん'];
  return `<main class="exercise-shell">
    <aside class="session-rail reveal"><button class="session-back" data-action="back-exercise">${icon('arrow')} Quitter la session</button><div class="session-rail-title"><span class="eyebrow">Session ciblée</span><h1>Français<br>→ japonais</h1><p>Le manuel · chap. 04</p></div><div class="session-progress"><div class="session-progress-head"><span>Progression</span><strong>12 / 21</strong></div><div class="session-track"><i style="width:57%"></i></div><div class="session-steps"><span class="done">${icon('check')}</span><span class="done">${icon('check')}</span><span class="done">${icon('check')}</span><span class="current">4</span><span>5</span><span>6</span><span>…</span></div></div><div class="session-stat"><span class="session-stat-icon">火</span><div><strong>4 jours</strong><small>de régularité</small></div></div><div class="session-rail-foot"><span>${icon('spark')} Chaque rappel compte.</span><button data-action="theme" aria-label="Changer le thème">${icon(state.theme === 'light' ? 'moon' : 'sun')}</button></div></aside>
    <section class="practice-column reveal delay-1"><div class="practice-top"><div><span class="eyebrow">Mot 12 sur 21</span><div class="practice-meta"><span class="new-badge">À revoir</span><span>${icon('timer')} 00:42</span></div></div><button class="practice-close" data-action="back-exercise" aria-label="Fermer">${icon('close')}</button></div><div class="practice-progress"><i style="width:57%"></i></div><article class="practice-card"><div class="practice-prompt"><span class="eyebrow">Écrivez ce mot en japonais · kana, kanji ou rōmaji</span><h2>montre, horloge</h2><p class="practice-hint">Un petit objet qui donne l'heure.</p></div><div class="answer-composer ${state.exerciseChecked ? 'checked' : ''}"><input aria-label="Votre réponse" value="${state.exerciseAnswer}" placeholder="Votre réponse" readonly /><button data-action="play-word" aria-label="Écouter la prononciation">${icon('play')}</button></div><div class="keyboard-switch"><button class="active">ひらがな</button><button>カタカナ</button><button class="keyboard-back" data-action="exercise-clear">${icon('arrow')}</button></div><div class="kana-keyboard">${keyboard.map(key => `<button data-action="exercise-key" data-key="${key}">${key}</button>`).join('')}</div><div class="answer-feedback-panel ${state.exerciseChecked ? 'success' : ''}">${icon(state.exerciseChecked ? 'check' : 'info')}<strong>${state.exerciseChecked ? 'Bonne réponse' : 'Vérifiez votre réponse'}</strong><span>${state.exerciseChecked ? 'とけい · tokei' : 'Le mot est prêt à être validé.'}</span></div><div class="answer-recap"><div><span>Kanji</span><strong>時計</strong></div><div><span>Écrit</span><strong>とけい</strong></div><div><span>Rōmaji</span><strong>tokei</strong></div><div><span>Français</span><strong>montre, horloge</strong></div></div><button class="next-button" data-action="${state.exerciseChecked ? 'exercise-next' : 'exercise-check'}">${state.exerciseChecked ? 'Suivant' : 'Valider ma réponse'} ${icon('arrow')}</button></article></section>
    <aside class="memory-rail reveal delay-2"><div class="memory-card"><span class="memory-symbol">覚</span><span class="eyebrow">Conseil mémoire</span><h3>Le kanji 時計 raconte le temps.</h3><p>時, c'est le temps. 計, c'est mesurer. Ensemble : ce qui mesure le temps.</p><div class="memory-example"><span>時計</span><small>とけい · tokei</small></div></div><div class="memory-card soft"><span class="eyebrow">Dans cette session</span><div class="mini-session-stat"><strong>8</strong><span>bonnes réponses</span></div><div class="mini-session-stat"><strong>3</strong><span>mots à revoir</span></div><button class="text-button" data-action="session-summary">Voir le bilan ${icon('arrow')}</button></div></aside>
  </main>`;
}

function modalView() {
  if (!state.modal) return '';
  if (state.modal === 'review') {
    const answered = state.answer;
    return `<div class="modal-backdrop" data-action="close-modal"><section class="modal-card quiz-modal" data-modal-content onclick="event.stopPropagation()"><div class="modal-top"><span class="eyebrow">Français → japonais · 01 / 15</span><button class="icon-button" data-action="close-modal" aria-label="Fermer">${icon('close')}</button></div><div class="quiz-progress"><i style="width:18%"></i></div><div class="quiz-word">eau</div><p class="quiz-prompt">Écrivez le mot en japonais</p><div class="answer-line ${answered === 'みず' ? 'correct' : ''}"><span>${answered || 'Votre réponse'}</span>${answered ? icon(answered === 'みず' ? 'check' : 'close') : ''}</div><div class="choice-grid">${['みず','みせ','みち'].map(choice => `<button class="choice-button ${answered === choice ? (choice === 'みず' ? 'correct' : 'wrong') : ''}" data-choice="${choice}">${choice}<small>${choice === 'みず' ? 'mizu' : choice === 'みせ' ? 'mise' : 'michi'}</small></button>`).join('')}</div>${answered ? `<div class="answer-feedback ${answered === 'みず' ? 'success' : 'error'}">${icon(answered === 'みず' ? 'spark' : 'info')}<span>${answered === 'みず' ? 'Exact. Votre mémoire fait le lien.' : 'Presque. La bonne réponse était みず.'}</span></div>` : '<p class="quiz-footnote">Pas besoin d’être parfait·e. Le rappel fait le travail.</p>'}<button class="primary-button quiz-next" data-action="${answered ? 'next-question' : 'hint'}">${answered ? 'Mot suivant' : 'Un indice'} ${icon('arrow')}</button></section></div>`;
  }
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal-card small-modal" data-modal-content onclick="event.stopPropagation()"><button class="icon-button modal-close" data-action="close-modal">${icon('close')}</button><span class="eyebrow">Le mot du jour</span><div class="modal-kanji">人</div><h2>ひと · hito</h2><p>Une personne, un être humain. Comme dans <strong>日本人</strong> — une personne japonaise.</p><div class="example-chip">${icon('spark')} 日本人 · にほんじん · nihonjin</div><button class="primary-button" data-action="close-modal">D'accord, je retiens ${icon('check')}</button></section></div>`;
}

function toastView() {
  return state.toast ? `<div class="toast" role="status">${icon('check')} ${state.toast}</div>` : '';
}

function render() {
  const views = { home: homeView, kana: kanaView, lexique: lexiqueView, chapitres: chaptersView, data: dataView, exercise: exerciseView };
  document.body.dataset.theme = state.theme;
  document.querySelector('#app').innerHTML = `${topbar()}${(views[state.active] || homeView)()}${mobileNav()}${modalView()}${toastView()}`;
  bindEvents();
}

function showToast(message) {
  state.toast = message;
  render();
  window.setTimeout(() => { state.toast = null; render(); }, 2400);
}

function bindEvents() {
  document.querySelectorAll('[data-nav]').forEach(button => button.addEventListener('click', () => {
    state.active = button.dataset.nav;
    window.history.pushState({}, '', viewToPath[state.active] || '/');
    state.answer = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    render();
  }));
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'theme') { state.theme = state.theme === 'light' ? 'dark' : 'light'; render(); }
    if (action === 'review') { state.active = 'exercise'; state.modal = null; window.history.pushState({}, '', viewToPath.exercise); render(); }
    if (action === 'daily') { state.modal = 'daily'; render(); }
    if (action === 'close-modal') { state.modal = null; state.answer = null; render(); }
    if (action === 'next-question') { state.answer = null; showToast('Bonne énergie. Le prochain mot arrive.'); }
    if (action === 'hint') { showToast('Indice : le mot commence par み.'); }
    if (action === 'all-exercises') { showToast('Vous êtes déjà sur votre sélection du jour.'); }
    if (action === 'profile') { showToast('Profil de José · synchronisé'); }
    if (action === 'course') { showToast('Le cours commun sera bientôt relié à Firebase.'); }
    if (action === 'add-word') { showToast('Le formulaire d’ajout est prêt à être branché.'); }
    if (action === 'word') { showToast(`« ${button.dataset.word} » ajouté à votre prochaine session.`); }
    if (action === 'new-chapter') { showToast('Créateur de chapitre · choisissez un nom et une source.'); }
    if (action === 'import') { showToast('Import JSON · glissez un fichier ou collez une réponse IA.'); }
    if (action === 'settings') { showToast('Vos préférences sont stockées avec votre compte.'); }
    if (action === 'kana-game') { state.modal = 'review'; state.answer = null; render(); showToast('Défi rōmaji lancé.'); }
    if (action === 'back-exercise') { state.active = 'home'; state.exerciseAnswer = 'とけい'; state.exerciseChecked = true; window.history.pushState({}, '', viewToPath.home); render(); }
    if (action === 'exercise-key' && !state.exerciseChecked) { state.exerciseAnswer += button.dataset.key; render(); }
    if (action === 'exercise-clear') { state.exerciseAnswer = ''; state.exerciseChecked = false; render(); }
    if (action === 'exercise-check') { state.exerciseChecked = state.exerciseAnswer === 'とけい' || state.exerciseAnswer === '時計'; render(); }
    if (action === 'exercise-next') { state.exerciseAnswer = ''; state.exerciseChecked = false; showToast('Mot suivant · on garde le rythme.'); }
    if (action === 'play-word') { showToast('Prononciation : とけい · tokei'); }
    if (action === 'session-summary') { showToast('8 bonnes réponses · 3 mots à revoir.'); }
  }));
  document.querySelectorAll('[data-exercise]').forEach(button => button.addEventListener('click', () => { state.active = 'exercise'; state.modal = null; state.exerciseAnswer = 'とけい'; state.exerciseChecked = true; window.history.pushState({}, '', viewToPath.exercise); render(); }));
  document.querySelectorAll('[data-choice]').forEach(button => button.addEventListener('click', () => { state.answer = button.dataset.choice; render(); }));
  document.querySelectorAll('[data-kana]').forEach(button => button.addEventListener('click', () => { state.kanaGroup = button.dataset.kana; render(); }));
  const search = document.querySelector('[data-search]');
  if (search) search.addEventListener('input', event => { state.search = event.target.value; const rows = document.querySelector('.word-table'); if (rows) { const matches = vocab.filter(item => `${item.word} ${item.reading} ${item.meaning}`.toLowerCase().includes(state.search.toLowerCase())); rows.innerHTML = `<div class="word-table-head"><span>Mot</span><span>Nature</span><span>État</span><span></span></div>${matches.map(item => `<button class="word-row" data-action="word" data-word="${item.meaning}"><span class="word-main"><b>${item.word}</b><small>${item.reading}</small></span><span class="type-pill ${item.color}">${item.type}</span><span class="status-text">${item.level}</span><span class="row-arrow">${icon('arrow')}</span></button>`).join('')}`; bindEvents(); } });
}

window.addEventListener('popstate', () => {
  state.active = pathToView[window.location.pathname] || 'home';
  render();
});

render();
