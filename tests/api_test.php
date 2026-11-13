<?php
declare(strict_types=1);

// Essais de l'API (Depot par compte, comptes, jetons Firebase, routeur), sur
// des bases jetables.
// Usage, depuis la racine du projet :   php tests/api_test.php
// Dans Docker :   docker compose exec nihonjo-app php tests/api_test.php
// Aucune dépendance : ni PHPUnit, ni Composer. Sortie : une ligne par essai,
// code de retour 1 au premier échec.

require __DIR__ . '/../api/lib/Base.php';
require __DIR__ . '/../api/lib/Depot.php';
require __DIR__ . '/../api/lib/Amorcage.php';
require __DIR__ . '/../api/lib/Authentification.php';
require __DIR__ . '/../api/lib/Api.php';

$AMORCE = __DIR__ . '/../api/amorce/vocabulaire_initial.json';
$nbEssais = 0;

function cheminJetable(): string
{
    $chemin = sys_get_temp_dir() . '/nihonjo_test_' . bin2hex(random_bytes(4)) . '.sqlite';
    register_shutdown_function(function () use ($chemin) { @unlink($chemin); });
    return $chemin;
}

function baseNeuve(): PDO
{
    global $AMORCE;
    $pdo = Base::ouvrir(cheminJetable());
    Amorcage::siBaseVide($pdo, $AMORCE);
    return $pdo;
}

/** L'identité Google (Firebase) de cette adresse, telle que la donne un jeton vérifié. */
function identite(string $email, array $plus = []): array
{
    return $plus + ['sub' => 'uid-' . $email, 'email' => $email, 'name' => explode('@', $email)[0], 'fournisseur' => 'google'];
}

/** Le Depot du compte de cette adresse (inscrit au besoin : « Créer un compte » puis connexion). */
function compte(PDO $pdo, string $email, array $admins = []): Depot
{
    return new Depot($pdo, Comptes::pourIdentite($pdo, identite($email), $admins, true));
}

function essai(string $nom, callable $f): void
{
    global $nbEssais;
    try {
        $f();
        $nbEssais++;
        echo "  ok  $nom\n";
    } catch (Throwable $e) {
        echo "ÉCHEC  $nom\n      " . get_class($e) . ' : ' . $e->getMessage() . "\n      " . $e->getFile() . ':' . $e->getLine() . "\n";
        exit(1);
    }
}

function egal($attendu, $obtenu, string $quoi = ''): void
{
    if ($attendu !== $obtenu) {
        throw new RuntimeException(($quoi ? "$quoi : " : '') . 'attendu ' . json_encode($attendu, JSON_UNESCAPED_UNICODE) . ', obtenu ' . json_encode($obtenu, JSON_UNESCAPED_UNICODE));
    }
}

function leve(callable $f, string $fragment, ?int $code = null): void
{
    try {
        $f();
    } catch (ErreurApi $e) {
        if (strpos($e->getMessage(), $fragment) === false) {
            throw new RuntimeException('ErreurApi levée, mais message inattendu : ' . $e->getMessage());
        }
        if ($code !== null && $e->statutHttp !== $code) {
            throw new RuntimeException("ErreurApi levée, mais code {$e->statutHttp} au lieu de $code");
        }
        return;
    }
    throw new RuntimeException("Aucune ErreurApi levée (attendu : « $fragment »)");
}

function motParFr(Depot $d, string $fr): array
{
    foreach ($d->toutesLesDonnees()['mots'] as $m) {
        if (in_array($fr, $m['fr'], true)) {
            return $m;
        }
    }
    throw new RuntimeException("Mot « $fr » introuvable");
}

function chapitre(Depot $d, string $nom): ?array
{
    foreach ($d->toutesLesDonnees()['chapitres'] as $c) {
        if ($c['nom'] === $nom) {
            return $c;
        }
    }
    return null;
}

echo "Amorçage et schéma\n";
essai('base neuve : dernier schéma, tout le vocabulaire en cours (la migration 3 ne bloque pas l’amorce), aucun compte réclamé', function () {
    $pdo = baseNeuve();
    $amorce = json_decode(file_get_contents($GLOBALS['AMORCE']), true);
    egal(Base::versionCible(), Base::versionSchema($pdo), 'version du schéma');
    egal(7, Base::versionCible(), 'version cible');
    egal(count($amorce['mots']), (int) $pdo->query('SELECT COUNT(*) FROM mot WHERE proprietaire_id IS NULL')->fetchColumn(), 'mots du cours');
    egal(0, (int) $pdo->query("SELECT COUNT(*) FROM chapitre WHERE nom IN ('personnel', 'mes_mots')")->fetchColumn(), 'ni « personnel » ni « Mes mots » dans le cours');
    egal([null, 'admin'], $pdo->query('SELECT uid, role FROM utilisateur WHERE id = 1')->fetch(PDO::FETCH_NUM), 'compte initial');
});
essai("l'amorçage ne se rejoue pas sur une base remplie", function () {
    $pdo = baseNeuve();
    egal(false, Amorcage::siBaseVide($pdo, $GLOBALS['AMORCE']));
});
essai('migration v1 → v2 : les données perso vont au compte initial, la progression le suit', function () {
    $chemin = cheminJetable();
    $pdo = new PDO('sqlite:' . $chemin, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $migrations = (new ReflectionClassConstant('Base', 'MIGRATIONS'))->getValue();
    $pdo->exec($migrations[1]);
    $pdo->exec('PRAGMA user_version = 1');
    $pdo->exec("INSERT INTO categorie (id, nom, ordre) VALUES (1, 'Vocabulaire', 1), (4, 'Personnel', 4)");
    $pdo->exec("INSERT INTO chapitre (id, categorie_id, ordre, origine) VALUES ('vocabulaire_p_45', 1, 10, 'cours'), ('personnel', 4, 0, 'perso'), ('mes_lieux', 4, 10, 'perso')");
    $pdo->exec("INSERT INTO mot (id, fr, jp_kana, origine) VALUES (1, '[\"ici\"]', '[\"ここ\"]', 'cours'), (2, '[\"axolotl\"]', '[\"ウーパールーパー\"]', 'perso')");
    $pdo->exec("INSERT INTO mot_chapitre VALUES (1, 'vocabulaire_p_45'), (1, 'mes_lieux'), (2, 'personnel')");
    $pdo->exec("INSERT INTO progression (mot_id, statut, nb_reussites) VALUES (1, 'acquis', 3)");
    $pdo = null;

    $pdo = Base::ouvrir($chemin);
    egal(Base::versionCible(), Base::versionSchema($pdo));
    $jose = compte($pdo, 'jose@exemple.fr'); // première connexion : réclame le compte initial
    $moi = $jose->moi();
    egal([1, 'jose', 'jose@exemple.fr', 'admin', 'google'], [$moi['id'], $moi['nom'], $moi['email'], $moi['role'], $moi['fournisseur']]);
    $ici = motParFr($jose, 'ici');
    egal(['vocabulaire_p_45', 'mes_lieux@1'], $ici['chapitres'], 'chapitres de « ici »');
    egal(['acquis', 3], [$ici['progression']['statut'], $ici['progression']['nb_reussites']]);
    egal(['mes_mots@1'], motParFr($jose, 'axolotl')['chapitres'], '« personnel » devenu « Mes mots »');
    $autre = compte($pdo, 'autre@exemple.fr');
    egal('non acquis', motParFr($autre, 'ici')['progression']['statut'], 'progression propre à chaque compte');
    egal(['vocabulaire_p_45'], motParFr($autre, 'ici')['chapitres'], 'les chapitres de José ne se voient pas');
});

essai('migration v2 → v3 : « personnel@1 » devient « mes_mots@1 », liaisons gardées, tous les mots du compte y entrent', function () {
    $chemin = cheminJetable();
    $pdo = new PDO('sqlite:' . $chemin, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $migrations = (new ReflectionClassConstant('Base', 'MIGRATIONS'))->getValue();
    $pdo->exec($migrations[1]);
    $pdo->exec($migrations[2]);
    $pdo->exec('PRAGMA user_version = 2');
    $pdo->exec("INSERT INTO categorie (id, nom, ordre) VALUES (1, 'Vocabulaire', 1), (4, 'Personnel', 4)");
    $pdo->exec("INSERT INTO utilisateur (id, uid, email, nom, role) VALUES (2, 'u2', 'b@x.fr', 'b', 'membre')");
    $pdo->exec("INSERT INTO chapitre (id, nom, categorie_id, ordre, origine, proprietaire_id) VALUES ('vocabulaire_p_45', 'vocabulaire_p_45', 1, 10, 'cours', NULL), ('personnel@1', 'personnel', 4, 0, 'perso', 1), ('animaux@1', 'animaux', 4, 10, 'perso', 1)");
    $pdo->exec("INSERT INTO mot (id, fr, jp_kana, origine, proprietaire_id) VALUES (1, '[\"ici\"]', '[\"ここ\"]', 'cours', NULL), (2, '[\"axolotl\"]', '[\"ウーパールーパー\"]', 'perso', 1), (3, '[\"chat\"]', '[\"ねこ\"]', 'perso', 1)");
    $pdo->exec("INSERT INTO mot_chapitre VALUES (1, 'vocabulaire_p_45'), (1, 'personnel@1'), (2, 'personnel@1'), (3, 'animaux@1')");
    $pdo = null;

    $pdo = Base::ouvrir($chemin);
    egal(Base::versionCible(), Base::versionSchema($pdo));
    egal(0, (int) $pdo->query("SELECT COUNT(*) FROM chapitre WHERE nom = 'personnel'")->fetchColumn(), 'plus de « personnel »');
    $liens = $pdo->query("SELECT mot_id FROM mot_chapitre WHERE chapitre_id = 'mes_mots@1' ORDER BY mot_id")->fetchAll(PDO::FETCH_COLUMN);
    egal([1, 2, 3], array_map('intval', $liens), 'mot du cours rangé gardé, mots du compte tous dedans');
    egal(1, (int) $pdo->query("SELECT COUNT(*) FROM chapitre WHERE id = 'mes_mots@2'")->fetchColumn(), 'un compte sans « personnel » reçoit son « Mes mots »');
});

echo "Comptes\n";
essai('premier connecté = administrateur ; les suivants membres ; même uid = même compte', function () {
    $pdo = baseNeuve();
    egal('admin', compte($pdo, 'a@x.fr')->moi()['role']);
    egal('membre', compte($pdo, 'b@x.fr')->moi()['role']);
    egal(2, compte($pdo, 'b@x.fr')->moi()['id'], 'reconnexion');
});
essai('liste « administrateurs » : seule une de ces adresses réclame le compte initial', function () {
    $pdo = baseNeuve();
    $intrus = compte($pdo, 'intrus@x.fr', ['jose@x.fr']);
    egal(['membre', 2], [$intrus->moi()['role'], $intrus->moi()['id']]);
    $jose = compte($pdo, 'JOSE@x.fr', ['jose@x.fr']);
    egal(['admin', 1], [$jose->moi()['role'], $jose->moi()['id']]);
});

essai('migration v3 → v4 : le fournisseur se déduit de l’uid, pseudo vide, photo vide', function () {
    $chemin = cheminJetable();
    $pdo = new PDO('sqlite:' . $chemin, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $migrations = (new ReflectionClassConstant('Base', 'MIGRATIONS'))->getValue();
    foreach ([1, 2, 3] as $n) {
        $pdo->exec($migrations[$n]);
    }
    $pdo->exec('PRAGMA user_version = 3');
    $pdo->exec("INSERT INTO utilisateur (id, uid, email, nom, role) VALUES (2, 'abcGoogle', 'g@x.fr', 'g', 'membre'), (3, 'discord:42', '', 'd', 'membre'), (4, 'dev:t@x.fr', 't@x.fr', 't', 'membre')");
    $pdo = null;
    $pdo = Base::ouvrir($chemin);
    $lignes = $pdo->query('SELECT id, fournisseur, pseudo, photo FROM utilisateur ORDER BY id')->fetchAll(PDO::FETCH_NUM);
    egal([[1, null, null, ''], [2, 'google', null, ''], [3, 'discord', null, ''], [4, 'dev', null, '']], array_map(function ($l) { $l[0] = (int) $l[0]; return $l; }, $lignes));
});
essai('migrations v4 → v6 : les acquis le restent, acquis à leur dernière révision, « à rafraîchir » 7 jours après', function () {
    $chemin = cheminJetable();
    $pdo = new PDO('sqlite:' . $chemin, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $migrations = (new ReflectionClassConstant('Base', 'MIGRATIONS'))->getValue();
    foreach ([1, 2, 3, 4] as $n) {
        $pdo->exec($migrations[$n]);
    }
    $pdo->exec('PRAGMA user_version = 4');
    $pdo->exec("INSERT INTO mot (id, fr, jp_romaji, jp_kanji, jp_kana, contexte, origine) VALUES (1, '[\"a\"]', '[]', '[]', '[\"あ\"]', '', 'cours'), (2, '[\"b\"]', '[]', '[]', '[\"い\"]', '', 'cours')");
    $pdo->exec("INSERT INTO progression (utilisateur_id, mot_id, statut, nb_reussites, nb_echecs, derniere_revision) VALUES (1, 1, 'acquis', 4, 1, '2026-10-20 08:00:00'), (1, 2, 'a revoir', 0, 2, '2026-10-21 08:00:00')");
    $pdo = null;
    $pdo = Base::ouvrir($chemin);
    $l = $pdo->query('SELECT mot_id, statut, nb_reussites, serie, acquis_le, valide_le, rafraichissements, prochaine_revision FROM progression ORDER BY mot_id')->fetchAll(PDO::FETCH_NUM);
    egal([['1', 'acquis', '4', '2', '2026-10-20', '2026-10-20', '0', '2026-10-27'], ['2', 'a revoir', '0', '0', '', '', '0', '']],
        array_map(function ($x) { return array_map('strval', $x); }, $l));
    $pdo->exec("UPDATE progression SET statut = 'en cours' WHERE mot_id = 2");
});
essai('migration v5 → v6 : un « en cours » de deux jours sans production garde une réussite d’avance', function () {
    $chemin = cheminJetable();
    $pdo = new PDO('sqlite:' . $chemin, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $migrations = (new ReflectionClassConstant('Base', 'MIGRATIONS'))->getValue();
    foreach ([1, 2, 3, 4, 5] as $n) {
        $pdo->exec($migrations[$n]);
    }
    $pdo->exec('PRAGMA user_version = 5');
    $pdo->exec("INSERT INTO mot (id, fr, jp_romaji, jp_kanji, jp_kana, contexte, origine) VALUES (1, '[\"a\"]', '[]', '[]', '[\"あ\"]', '', 'cours'), (2, '[\"b\"]', '[]', '[]', '[\"い\"]', '', 'cours')");
    $pdo->exec("INSERT INTO progression (utilisateur_id, mot_id, statut, jours_reussis, dernier_jour_reussi, production, prochaine_revision) VALUES (1, 1, 'acquis', 3, '2026-10-22', 1, '2026-10-29'), (1, 2, 'en cours', 2, '2026-10-24', 0, '2026-10-25')");
    $pdo = null;
    $pdo = Base::ouvrir($chemin);
    $l = $pdo->query('SELECT statut, serie, acquis_le, prochaine_revision FROM progression ORDER BY mot_id')->fetchAll(PDO::FETCH_NUM);
    egal([['acquis', '3', '2026-10-22', '2026-10-29'], ['en cours', '1', '', '']], array_map(function ($x) { return array_map('strval', $x); }, $l));
});
essai('connexion sans compte → « compte_inexistant » (404, détails) ; inscription → membre ; s’inscrire deux fois = se connecter', function () {
    $pdo = baseNeuve();
    compte($pdo, 'jose@x.fr'); // réclame le compte initial
    $e = null;
    try { Comptes::pourIdentite($pdo, identite('marie@x.fr', ['name' => 'Marie']), []); } catch (ErreurApi $x) { $e = $x; }
    egal([404, 'compte_inexistant'], [$e ? $e->statutHttp : null, $e ? $e->codeErreur : null]);
    egal(['email' => 'marie@x.fr', 'nom' => 'Marie', 'fournisseur' => 'google'], $e->details);
    egal(1, (int) $pdo->query('SELECT COUNT(*) FROM utilisateur')->fetchColumn(), 'rien de créé par une simple connexion');
    $nouveau = null;
    $marie = Comptes::pourIdentite($pdo, identite('marie@x.fr', ['name' => 'Marie']), [], true, $nouveau);
    egal([2, 'membre', true], [$marie['id'], $marie['role'], $nouveau]);
    Comptes::pourIdentite($pdo, identite('marie@x.fr'), [], true, $nouveau);
    egal(false, $nouveau, 'déjà inscrite : simple connexion');
    egal(2, Comptes::pourIdentite($pdo, identite('marie@x.fr'), [])['id'], 'connexion ensuite');
});
essai('le compte initial est réclamé par la première identité, connexion comme inscription', function () {
    $pdo = baseNeuve();
    $nouveau = null;
    $c = Comptes::pourIdentite($pdo, identite('jose@x.fr'), [], false, $nouveau);
    egal([1, 'admin', true, 'google'], [$c['id'], $c['role'], $nouveau, $c['fournisseur']]);
});
essai('pseudo : choisi, affiché ; vide = nom du fournisseur ; jamais écrasé par la reconnexion ; borné', function () {
    $pdo = baseNeuve();
    $d = compte($pdo, 'jose@x.fr');
    egal('Sensei', $d->modifierPseudo('  Sensei  ')['nom']);
    $d = compte($pdo, 'jose@x.fr'); // reconnexion : le nom Google revient, pas le pseudo
    egal(['Sensei', 'jose', 'Sensei'], [$d->moi()['nom'], $d->moi()['nom_fournisseur'], $d->moi()['pseudo']]);
    egal(['jose', null], [$d->modifierPseudo('')['nom'], $d->moi()['pseudo']]);
    leve(function () use ($d) { $d->modifierPseudo(str_repeat('é', Comptes::LONGUEUR_PSEUDO + 1)); }, 'caractères au plus');
    leve(function () use ($d) { $d->modifierPseudo('<b>moi</b>'); }, 'non admis');
});
essai('photo : seules les adresses https sont gardées ; jamais d’uid dans moi()', function () {
    $pdo = baseNeuve();
    egal('https://exemple.fr/a.png', (new Depot($pdo, Comptes::pourIdentite($pdo, identite('a@x.fr', ['picture' => 'https://exemple.fr/a.png']), [], true)))->moi()['photo']);
    $d = new Depot($pdo, Comptes::pourIdentite($pdo, identite('b@x.fr', ['picture' => 'javascript:alert(1)']), [], true));
    egal('', $d->moi()['photo']);
    egal(false, array_key_exists('uid', $d->moi()));
});
essai('suppression d’un compte : ses mots, chapitres, progression, kana et réglages partent ; le cours et les autres restent', function () {
    $pdo = baseNeuve();
    $a = compte($pdo, 'a@x.fr');
    $b = compte($pdo, 'b@x.fr');
    $b->enregistrerMot(['fr' => 'platypus', 'jp_kana' => 'カモノハシ', 'chapitres' => ['animaux']]);
    $b->definirStatut(motParFr($b, 'ici')['id'], 'acquis');
    $b->enregistrerKana('か', true);
    $b->enregistrerKanji('水', 'sens', true);
    $b->ecrirePreference('theme', 'sombre');
    $a->enregistrerMot(['fr' => 'tanuki', 'jp_kana' => 'たぬき']);
    $coursAvant = (int) $pdo->query('SELECT COUNT(*) FROM mot WHERE proprietaire_id IS NULL')->fetchColumn();
    $profil = $b->profil();
    egal([1, 2, 1, 1], [$profil['contenu']['mots'], $profil['contenu']['chapitres'], $profil['contenu']['acquis'], $profil['contenu']['kana_acquis']], 'contenu avant');
    $bilan = $b->supprimerMonCompte();
    egal(1, $bilan['supprime']['mots']);
    foreach (['mot WHERE proprietaire_id = 2', 'chapitre WHERE proprietaire_id = 2', 'progression WHERE utilisateur_id = 2', 'kana_progression WHERE utilisateur_id = 2', 'kanji_progression WHERE utilisateur_id = 2', 'preference WHERE utilisateur_id = 2', 'utilisateur WHERE id = 2'] as $quoi) {
        egal(0, (int) $pdo->query("SELECT COUNT(*) FROM $quoi")->fetchColumn(), $quoi);
    }
    egal($coursAvant, (int) $pdo->query('SELECT COUNT(*) FROM mot WHERE proprietaire_id IS NULL')->fetchColumn(), 'le cours');
    egal('tanuki', motParFr($a, 'tanuki')['fr'][0], 'les mots de l’autre compte');
});
essai('administration : liste et rôles réservés ; le dernier administrateur ne se rétrograde ni ne se supprime ; pas soi-même par l’écran d’administration', function () {
    $pdo = baseNeuve();
    $a = compte($pdo, 'a@x.fr');
    $b = compte($pdo, 'b@x.fr');
    leve(function () use ($b) { $b->listerComptes(); }, 'Réservé', 403);
    leve(function () use ($b) { $b->changerRoleCompte(1, 'membre'); }, 'Réservé', 403);
    leve(function () use ($b) { $b->supprimerUnCompte(1); }, 'Réservé', 403);
    $liste = $a->listerComptes();
    egal([2, 1], [count($liste['comptes']), $liste['moi']]);
    egal(false, array_key_exists('uid', $liste['comptes'][0]), 'pas d’uid dans la liste');
    leve(function () use ($a) { $a->changerRoleCompte(1, 'membre'); }, 'dernier administrateur', 409);
    leve(function () use ($a) { $a->supprimerMonCompte(); }, 'dernier administrateur', 409);
    leve(function () use ($a) { $a->supprimerUnCompte(1); }, 'Mon compte');
    egal('admin', $a->changerRoleCompte(2, 'admin')['role']);
    leve(function () use ($a) { $a->changerRoleCompte(2, 'roi'); }, 'Rôle inconnu');
    egal('membre', $a->changerRoleCompte(1, 'membre')['role'], 'un autre administrateur existe');
    egal(['id' => 1], array_intersect_key(compte($pdo, 'b@x.fr')->supprimerUnCompte(1), ['id' => 0]));
});

echo "Mots\n";
essai('création : « && » découpe, vides retirés, chapitre « Mes mots » du compte, thème par défaut', function () {
    $pdo = baseNeuve();
    compte($pdo, 'a@x.fr');
    $b = compte($pdo, 'b@x.fr');
    $m = $b->enregistrerMot(['fr' => ' platypus &&  && ornithorynque ', 'jp_kana' => 'カモノハシ', 'jp_kanji' => '', 'context' => 'N/A']);
    egal(['platypus', 'ornithorynque'], $m['fr']);
    egal([], $m['jp_kanji']);
    egal('', $m['context'], '« N/A » de la v1');
    egal(['mes_mots@2'], $m['chapitres']);
    egal(['indéterminé'], $m['thematiques']);
    egal([true, 'perso'], [$m['modifiable'], $m['origine']]);
});
essai('isolement : les mots et chapitres d’un compte sont invisibles aux autres', function () {
    $pdo = baseNeuve();
    $a = compte($pdo, 'a@x.fr');
    $b = compte($pdo, 'b@x.fr');
    $m = $b->enregistrerMot(['fr' => 'platypus', 'jp_kana' => 'カモノハシ', 'chapitres' => ['animaux']]);
    egal(count($a->toutesLesDonnees()['mots']) + 1, count($b->toutesLesDonnees()['mots']));
    egal(null, chapitre($a, 'animaux'));
    leve(function () use ($a, $m) { $a->lireMot($m['id']); }, "n'existe pas", 404);
    leve(function () use ($a, $m) { $a->supprimerMot($m['id']); }, "n'existe pas", 404);
    // deux comptes peuvent avoir chacun leur « animaux »
    $a->enregistrerMot(['fr' => 'axolotl', 'jp_kana' => 'ウーパールーパー', 'chapitres' => ['animaux']]);
    egal(['animaux@1', 'animaux@2'], [chapitre($a, 'animaux')['id'], chapitre($b, 'animaux')['id']]);
});
essai('un membre ne modifie pas le cours ; l’administrateur oui', function () {
    $pdo = baseNeuve();
    $admin = compte($pdo, 'a@x.fr');
    $membre = compte($pdo, 'b@x.fr');
    $ici = motParFr($membre, 'ici');
    egal(false, $ici['modifiable']);
    leve(function () use ($membre, $ici) { $membre->enregistrerMot(['id' => $ici['id'], 'fr' => 'là', 'jp_kana' => 'ここ']); }, 'appartient au cours', 403);
    leve(function () use ($membre, $ici) { $membre->supprimerMot($ici['id']); }, 'appartient au cours', 403);
    $m = $admin->enregistrerMot(['id' => $ici['id'], 'fr' => ['ici', 'à cet endroit'], 'jp_kana' => $ici['jp_kana'], 'chapitres' => $ici['chapitres'], 'thematiques' => $ici['thematiques']]);
    egal(['ici', 'à cet endroit'], $m['fr']);
    egal('cours', $m['origine']);
    egal(['ici', 'à cet endroit'], motParFr($membre, 'ici')['fr'], 'la correction profite à tous');
});
essai('l’administrateur qui corrige un mot du cours ne détache pas les chapitres des autres', function () {
    $pdo = baseNeuve();
    $admin = compte($pdo, 'a@x.fr');
    $membre = compte($pdo, 'b@x.fr');
    $membre->creerChapitre('mes lieux', '', ['theme:lieu']);
    $ici = motParFr($admin, 'ici');
    $admin->enregistrerMot(['id' => $ici['id'], 'fr' => $ici['fr'], 'jp_kana' => $ici['jp_kana'], 'chapitres' => $ici['chapitres'], 'thematiques' => $ici['thematiques']]);
    egal(true, in_array('mes_lieux@2', motParFr($membre, 'ici')['chapitres'], true));
});
essai('création refusée sans français ou sans japonais', function () {
    $d = compte(baseNeuve(), 'a@x.fr');
    leve(function () use ($d) { $d->enregistrerMot(['jp_kana' => 'ねこ']); }, 'français');
    leve(function () use ($d) { $d->enregistrerMot(['fr' => 'chat', 'jp_romaji' => 'neko']); }, 'kana ou kanji');
    leve(function () use ($d) { $d->enregistrerMot(['fr' => 'chat', 'jp_kana' => 'ねこ', 'chapitres' => ['a@b']]); }, '@');
});
essai('suppression : la progression part avec le mot', function () {
    $pdo = baseNeuve();
    $d = compte($pdo, 'a@x.fr');
    $m = $d->enregistrerMot(['fr' => 'platypus', 'jp_kana' => 'カモノハシ']);
    $d->enregistrerResultat($m['id'], true);
    $d->supprimerMot($m['id']);
    egal(0, (int) $pdo->query('SELECT COUNT(*) FROM progression WHERE mot_id = ' . $m['id'])->fetchColumn());
    egal(0, (int) $pdo->query('SELECT COUNT(*) FROM mot_chapitre WHERE mot_id = ' . $m['id'])->fetchColumn());
});

echo "Progression\n";
essai('résultat : une réussite → en cours, échec → à revoir, compteurs cumulés, par compte', function () {
    $pdo = baseNeuve();
    $a = compte($pdo, 'a@x.fr');
    $b = compte($pdo, 'b@x.fr');
    $id = motParFr($a, 'ici')['id'];
    $a->fixerJour('2026-10-25');
    $p = $a->enregistrerResultat($id, true, 'production');
    egal(['en cours', 1, 0, 1, true, null], [$p['statut'], $p['nb_reussites'], $p['nb_echecs'], $p['serie'], $p['production'], $p['acquis_le']]);
    $p = $a->enregistrerResultat($id, false, 'rappel');
    egal(['a revoir', 1, 1, 0, false], [$p['statut'], $p['nb_reussites'], $p['nb_echecs'], $p['serie'], $p['production']]);
    egal('non acquis', $b->lireMot($id)['progression']['statut'], 'l’autre compte n’est pas touché');
    leve(function () use ($a, $id) { $a->enregistrerResultat($id, true, 'devinette'); }, 'Niveau');
});
essai('paliers : acquis = deux réussites de suite (même jour possible) ; la reconnaissance ne compte pas ; un échec casse la série', function () {
    $d = compte(baseNeuve(), 'a@x.fr');
    $id = motParFr($d, 'ici')['id'];
    $d->fixerJour('2026-10-25');
    egal('en cours', $d->enregistrerResultat($id, true)['statut'], 'paires (sans niveau) : en cours');
    $p = $d->enregistrerResultat($id, true, 'reconnaissance');
    egal([0, 'en cours'], [$p['serie'], $p['statut']], 'la reconnaissance ne compte pas dans la série');
    $d->enregistrerResultat($id, true, 'rappel');
    $d->enregistrerResultat($id, false, 'rappel');
    $p = $d->enregistrerResultat($id, true, 'rappel');
    egal(['en cours', 1], [$p['statut'], $p['serie']], 'un échec entre deux réussites : la série repart');
    $d->enregistrerResultat($id, true, 'reconnaissance'); // ne casse pas la série non plus
    $p = $d->enregistrerResultat($id, true, 'rappel');
    egal(['acquis', 2, '2026-10-25', '2026-10-25', '2026-11-01'], [$p['statut'], $p['serie'], $p['acquis_le'], $p['valide_le'], $p['prochaine_revision']],
        'deux de suite, le même jour, sans production : acquis le 25, à rafraîchir dans 7 jours');
});
essai('autre alphabet (ミズ pour みず) : une réussite qui casse la série, jamais acquis ; un acquis le reste', function () {
    $d = compte(baseNeuve(), 'a@x.fr');
    $id = motParFr($d, 'ici')['id'];
    $d->fixerJour('2026-10-26');
    $d->enregistrerResultat($id, true, 'production');
    $p = $d->enregistrerResultat($id, true, 'production', true);
    egal(['en cours', 0, 2, 0], [$p['statut'], $p['serie'], $p['nb_reussites'], $p['nb_echecs']], 'réussite comptée, série remise à zéro');
    $p = $d->enregistrerResultat($id, true, 'production', true);
    egal(['en cours', 0], [$p['statut'], $p['serie']], 'deux fois dans l’autre alphabet : toujours pas acquis');
    $d->enregistrerResultat($id, true, 'production');
    $p = $d->enregistrerResultat($id, true, 'production');
    egal('acquis', $p['statut'], 'deux de suite dans le bon alphabet : acquis');
    $p = $d->enregistrerResultat($id, true, 'production', true);
    egal(['acquis', '2026-10-26'], [$p['statut'], $p['valide_le']], 'un acquis reste acquis');
});
essai('« à rafraîchir » : un acquis dont la date est passée ; réussi, il s’éloigne (7, 15, 30…) ; raté, il retombe', function () {
    $d = compte(baseNeuve(), 'a@x.fr');
    $id = motParFr($d, 'ici')['id'];
    $d->fixerJour('2026-10-01');
    $d->enregistrerResultat($id, true, 'rappel');
    $d->enregistrerResultat($id, true, 'production');
    $d->fixerJour('2026-10-07');
    egal('acquis', $d->lireMot($id)['progression']['statut'], 'avant 7 jours : acquis');
    $d->fixerJour('2026-10-08');
    egal('a rafraichir', $d->lireMot($id)['progression']['statut'], 'le 7e jour : à rafraîchir (calculé)');
    egal('a rafraichir', $d->enregistrerResultat($id, true, 'reconnaissance')['statut'], 'reconnu parmi des tuiles : toujours à rafraîchir');
    $p = $d->enregistrerResultat($id, true, 'rappel');
    egal(['acquis', 1, '2026-10-08', '2026-10-23', '2026-10-01'], [$p['statut'], $p['rafraichissements'], $p['valide_le'], $p['prochaine_revision'], $p['acquis_le']],
        'rafraîchi : 15 jours, date d’acquisition gardée');
    $d->fixerJour('2026-10-10');
    $p = $d->enregistrerResultat($id, true, 'rappel');
    egal([1, '2026-10-25'], [$p['rafraichissements'], $p['prochaine_revision']], 'réussi avant l’heure : revalidé, même délai');
    $d->fixerJour('2026-10-30');
    $p = $d->enregistrerResultat($id, false, 'production');
    egal(['a revoir', null, 0, null], [$p['statut'], $p['acquis_le'], $p['rafraichissements'], $p['prochaine_revision']], 'raté : à revoir, tout recommence');
    leve(function () use ($d, $id) { $d->definirStatut($id, 'a rafraichir'); }, 'État inconnu');
});
essai('fusion : « acquis » l’emporte, « à revoir » ne remplace que « non acquis »', function () {
    $d = compte(baseNeuve(), 'a@x.fr');
    $a = motParFr($d, 'ici')['id'];
    $b = motParFr($d, 'là')['id'];
    $c = motParFr($d, 'là-bas')['id'];
    $d->enregistrerResultat($b, true);
    $d->enregistrerResultat($c, false);
    $compte = $d->fusionnerStatuts([
        ['mot_id' => $a, 'statut' => 'a revoir'],
        ['mot_id' => $b, 'statut' => 'a revoir'],
        ['mot_id' => $c, 'statut' => 'acquis'],
        ['mot_id' => 999999, 'statut' => 'acquis'],
    ]);
    egal(['acquis' => 1, 'en_cours' => 0, 'a_revoir' => 1, 'inchanges' => 2], $compte);
    egal(['a revoir', 'en cours', 'acquis'], [$d->lireMot($a)['progression']['statut'], $d->lireMot($b)['progression']['statut'], $d->lireMot($c)['progression']['statut']]);
});
essai('état manuel : refuse un état inconnu', function () {
    $d = compte(baseNeuve(), 'a@x.fr');
    $id = motParFr($d, 'ici')['id'];
    egal('acquis', $d->definirStatut($id, 'acquis')['statut']);
    leve(function () use ($d, $id) { $d->definirStatut($id, 'su'); }, 'État inconnu');
});
essai('kana : compteurs par compte et par caractère ; refuse ce qui n’est pas un kana', function () {
    $pdo = baseNeuve();
    $a = compte($pdo, 'a@x.fr');
    $b = compte($pdo, 'b@x.fr');
    $a->enregistrerKana('か', true);
    $r = $a->enregistrerKana('か', false);
    egal([1, 1], [$r['nb_reussites'], $r['nb_echecs']]);
    $a->enregistrerKana('キャ', true);
    egal(['か', 'キャ'], array_keys($a->toutesLesDonnees()['kana']));
    egal([], $b->toutesLesDonnees()['kana']);
    leve(function () use ($a) { $a->enregistrerKana('水', true); }, "n'est pas un kana");
    leve(function () use ($a) { $a->enregistrerKana('', true); }, "n'est pas un kana");
});

essai('kanjis : acquis = sens ET lecture réussis deux fois de suite ; le choix ne compte pas ; un échec ne casse que sa facette', function () {
    $pdo = baseNeuve();
    $a = compte($pdo, 'a@x.fr');
    $b = compte($pdo, 'b@x.fr');
    $a->fixerJour('2026-10-26');
    egal('en cours', $a->enregistrerKanji('水', 'choix', true)['statut'], 'choix : en cours');
    $a->enregistrerKanji('水', 'sens', true);
    $r = $a->enregistrerKanji('水', 'sens', true);
    egal(['en cours', 2, 0], [$r['statut'], $r['serie_sens'], $r['serie_lecture']], 'le sens seul ne suffit pas');
    $a->enregistrerKanji('水', 'lecture', true);
    $r = $a->enregistrerKanji('水', 'lecture', false);
    egal(['a revoir', 2, 0, null], [$r['statut'], $r['serie_sens'], $r['serie_lecture'], $r['acquis_le']], 'échec de lecture : la série de sens reste');
    $a->enregistrerKanji('水', 'choix', true);
    $a->enregistrerKanji('水', 'lecture', true);
    $r = $a->enregistrerKanji('水', 'lecture', true);
    egal(['acquis', '2026-10-26', 7, 1], [$r['statut'], $r['acquis_le'], $r['nb_reussites'], $r['nb_echecs']], 'les deux séries à deux : acquis');
    egal('acquis', $a->enregistrerKanji('水', 'choix', true)['statut'], 'un choix ne fait pas redescendre');
    egal(['水'], array_keys((array) $a->toutesLesDonnees()['kanji']));
    egal([], (array) $b->toutesLesDonnees()['kanji'], 'par compte');
    leve(function () use ($a) { $a->enregistrerKanji('か', 'sens', true); }, "n'est pas un kanji");
    leve(function () use ($a) { $a->enregistrerKanji('水木', 'sens', true); }, "n'est pas un kanji");
    leve(function () use ($a) { $a->enregistrerKanji('水', 'dessin', true); }, 'inconnu');
});

echo "Chapitres\n";
essai('création peuplée : les mots sont RATTACHÉS (pas copiés), chapitre du compte', function () {
    $pdo = baseNeuve();
    $d = compte($pdo, 'a@x.fr');
    $avant = (int) $pdo->query('SELECT COUNT(*) FROM mot')->fetchColumn();
    $r = $d->creerChapitre('révision lieux', 'Mes révisions', ['theme:lieu', 'chap:mois']);
    egal('révision_lieux@1', $r['id']);
    egal($avant, (int) $pdo->query('SELECT COUNT(*) FROM mot')->fetchColumn(), 'aucun mot créé');
    $ici = motParFr($d, 'ici');
    egal(true, in_array('révision_lieux@1', $ici['chapitres'], true) && in_array('vocabulaire_p_45', $ici['chapitres'], true));
    leve(function () use ($d) { $d->creerChapitre('révision_lieux', '', []); }, 'existe déjà', 409);
    leve(function () use ($d) { $d->creerChapitre('mois', '', []); }, 'existe déjà', 409);
});
essai('chapitre du cours : administrateur seulement', function () {
    $pdo = baseNeuve();
    $admin = compte($pdo, 'a@x.fr');
    $membre = compte($pdo, 'b@x.fr');
    leve(function () use ($membre) { $membre->creerChapitre('page 237', 'Vocabulaire', [], true); }, 'Réservé', 403);
    egal('page_237', $admin->creerChapitre('page 237', 'Vocabulaire', [], true)['id']);
    egal(['cours', false], [chapitre($membre, 'page_237')['origine'], chapitre($membre, 'page_237')['modifiable']]);
    leve(function () use ($membre) { $membre->supprimerChapitre('page_237'); }, 'appartient au cours', 403);
});
essai('renommage : les mots suivent (ON UPDATE CASCADE), la clé garde le compte', function () {
    $d = compte(baseNeuve(), 'a@x.fr');
    $nb = $d->creerChapitre('a', 'Personnel', ['chap:mois'])['nb_mots'];
    egal(['id' => 'les_mois@1'], $d->modifierChapitre('a@1', 'les mois', 'Temps & Nombres'));
    $c = chapitre($d, 'les_mois');
    egal([$nb, 'Temps & Nombres'], [$c['nb_mots'], $c['categorie']]);
    $d->enregistrerMot(['fr' => 'platypus', 'jp_kana' => 'カモノハシ']);
    leve(function () use ($d) { $d->modifierChapitre('mes_mots@1', 'autre', null); }, 'ne se renomme pas');
    leve(function () use ($d) { $d->supprimerChapitre('mes_mots@1'); }, 'ne se supprime pas');
    leve(function () use ($d) { $d->creerChapitre('Mes mots', 'Personnel', []); }, 'existe déjà', 409);
});
essai('suppression d’un chapitre du compte : aucun mot ne disparaît (ses mots restent dans « Mes mots »)', function () {
    $pdo = baseNeuve();
    $d = compte($pdo, 'a@x.fr');
    $d->creerChapitre('liste', 'Personnel', ['chap:mois']);
    $seul = $d->enregistrerMot(['fr' => 'platypus', 'jp_kana' => 'カモノハシ', 'chapitres' => ['liste']]);
    egal(['mots_supprimes' => 0, 'mots_detaches' => 13], $d->supprimerChapitre('liste@1'));
    egal(['mes_mots@1'], $d->lireMot($seul['id'])['chapitres'], 'le mot est resté dans « Mes mots »');
    egal(12, count(array_filter($d->toutesLesDonnees()['mots'], function ($m) { return in_array('mois', $m['chapitres'], true); })), 'les mois du cours restent');
});

echo "Import\n";
essai('import v1 : format brut ([""], « statut ») accepté, copies du cours fusionnées', function () {
    $pdo = baseNeuve();
    $d = compte($pdo, 'a@x.fr');
    $avant = (int) $pdo->query('SELECT COUNT(*) FROM mot')->fetchColumn();
    $r = $d->importerMots([
        ['fr' => ['ici'], 'jp_romaji' => ['koko'], 'jp_kanji' => [''], 'jp_kana' => ['ここ'], 'context' => '', 'thematiques' => ['lieu', 'nouveau thème'], 'chapitres' => ['mes_lieux', 'vocabulaire_p_45'], 'statut' => 'non acquis'],
        ['fr' => ['ornithorynque'], 'jp_romaji' => ['kamonohashi'], 'jp_kanji' => [''], 'jp_kana' => ['カモノハシ'], 'context' => 'N/A', 'thematiques' => ['animal'], 'chapitres' => ['mes_animaux@7']],
        ['fr' => [''], 'jp_kana' => ['ねこ']],
        'pas un objet',
    ], 'ajouter', ['mes_lieux' => 'Mes révisions']);
    egal(['crees' => 1, 'fusionnes' => 1, 'ignores' => 2, 'chapitre' => null], $r);
    egal($avant + 1, (int) $pdo->query('SELECT COUNT(*) FROM mot')->fetchColumn());
    $ici = motParFr($d, 'ici');
    egal(true, in_array('mes_lieux@1', $ici['chapitres'], true));
    egal(false, in_array('nouveau thème', $ici['thematiques'], true), 'pas de thème ajouté à un mot du cours');
    egal('Mes révisions', chapitre($d, 'mes_lieux')['categorie']);
    egal(['mes_animaux@1', 'mes_mots@1'], motParFr($d, 'ornithorynque')['chapitres'], 'le suffixe d’un autre compte est retiré ; « Mes mots » imposé');
});
essai('import par un membre : ne touche pas au cours', function () {
    $pdo = baseNeuve();
    compte($pdo, 'a@x.fr');
    $membre = compte($pdo, 'b@x.fr');
    $membre->importerMots([['fr' => 'ici', 'jp_kana' => 'ここ', 'chapitres' => ['mois']]], 'ajouter');
    egal(0, (int) $pdo->query("SELECT COUNT(*) FROM mot_chapitre mc JOIN mot m ON m.id = mc.mot_id WHERE mc.chapitre_id = 'mois' AND m.fr = '[\"ici\"]'")->fetchColumn());
    leve(function () use ($membre) { $membre->importerMots([['fr' => 'gare', 'jp_kana' => 'えき']], 'ajouter', [], 'cours'); }, 'Réservé', 403);
});
essai('import dans le cours (administrateur) : visible par tous les comptes', function () {
    $pdo = baseNeuve();
    $admin = compte($pdo, 'a@x.fr');
    $membre = compte($pdo, 'b@x.fr');
    $r = $admin->importerMots([['fr' => 'téléphérique', 'jp_kana' => 'ロープウェー', 'chapitres' => ['vocabulaire_p_237']]], 'ajouter', ['vocabulaire_p_237' => 'Vocabulaire'], 'cours');
    egal(1, $r['crees']);
    $gare = motParFr($membre, 'téléphérique');
    egal(['cours', ['vocabulaire_p_237']], [$gare['origine'], $gare['chapitres']]);
    leve(function () use ($admin) { $admin->importerMots([], 'ecraser', [], 'cours'); }, 'Écraser');
});
essai('import « écraser » : vide les mots du compte, garde le cours et les autres comptes', function () {
    $pdo = baseNeuve();
    $a = compte($pdo, 'a@x.fr');
    $b = compte($pdo, 'b@x.fr');
    $b->enregistrerMot(['fr' => 'mot de b', 'jp_kana' => 'び']);
    $a->importerMots([['fr' => 'ornithorynque', 'jp_kana' => 'カモノハシ'], ['fr' => 'ici', 'jp_kana' => 'ここ', 'chapitres' => ['perso2']]], 'ajouter');
    egal(['crees' => 1, 'fusionnes' => 0, 'ignores' => 0, 'chapitre' => null], $a->importerMots([['fr' => 'axolotl', 'jp_kana' => 'ウーパールーパー']], 'ecraser'));
    egal(1, (int) $pdo->query('SELECT COUNT(*) FROM mot WHERE proprietaire_id = 1')->fetchColumn());
    egal(1, (int) $pdo->query('SELECT COUNT(*) FROM mot WHERE proprietaire_id = 2')->fetchColumn(), 'b intact');
    egal(false, in_array('perso2@1', motParFr($a, 'ici')['chapitres'], true));
});

echo "Mes mots, gestion des chapitres, préférences\n";
essai('« Mes mots » imposé : un mot du compte y reste même si le navigateur l’omet (F12)', function () {
    $pdo = baseNeuve();
    $d = compte($pdo, 'a@x.fr');
    $m = $d->enregistrerMot(['fr' => 'platypus', 'jp_kana' => 'カモノハシ', 'chapitres' => ['animaux']]);
    egal(['animaux@1', 'mes_mots@1'], $m['chapitres']);
    $m = $d->enregistrerMot(['id' => $m['id'], 'fr' => 'platypus', 'jp_kana' => 'カモノハシ', 'chapitres' => ['animaux@1']]);
    egal(['animaux@1', 'mes_mots@1'], $m['chapitres'], 'modification sans « Mes mots » : il revient');
    $cours = motParFr($d, 'ici');
    $d->enregistrerMot(['id' => $cours['id'], 'fr' => $cours['fr'], 'jp_kana' => $cours['jp_kana'], 'chapitres' => $cours['chapitres']]);
    egal(false, in_array('mes_mots@1', motParFr($d, 'ici')['chapitres'], true), 'un mot du cours n’est pas forcé dans « Mes mots »');
    egal('mes_mots@1', $d->cleMesMots());
    egal(['id' => 'mes_mots@1', 'nom' => 'mes_mots', 'ordre' => 0, 'origine' => 'perso', 'categorie' => 'Personnel', 'modifiable' => true],
        array_diff_key(chapitre($d, 'mes_mots'), ['nb_mots' => 0]), 'chaque compte a son « Mes mots »');
});
essai('import vers des chapitres choisis + un nouveau chapitre ; « Mes mots » toujours ; cibles d’autrui refusées', function () {
    $pdo = baseNeuve();
    $a = compte($pdo, 'a@x.fr');
    $b = compte($pdo, 'b@x.fr');
    $b->creerChapitre('animaux', 'Personnel', []);
    $r = $b->importerMots([
        ['fr' => 'Bulbizarre', 'kana' => 'フシギダネ', 'romaji' => ['Fushigidane'], 'kanji' => [], 'contexte' => 'n° 1', 'themes' => ['pokémon']],
        ['fr' => ['ici'], 'jp_kana' => ['ここ']],
    ], 'ajouter', [], 'perso', ['animaux@2'], 'Pokémon 1G');
    egal(['crees' => 1, 'fusionnes' => 1, 'ignores' => 0, 'chapitre' => 'Pokémon_1G@2'], $r);
    $bulbi = motParFr($b, 'Bulbizarre');
    egal([['フシギダネ'], ['Fushigidane'], 'n° 1', ['pokémon']], [$bulbi['jp_kana'], $bulbi['jp_romaji'], $bulbi['context'], $bulbi['thematiques']], 'noms « humains » compris');
    $chaps = $bulbi['chapitres'];
    sort($chaps);
    egal(['Pokémon_1G@2', 'animaux@2', 'mes_mots@2'], $chaps);
    egal(true, in_array('Pokémon_1G@2', motParFr($b, 'ici')['chapitres'], true), 'un mot du cours déjà présent est rangé aussi');
    leve(function () use ($b) { $b->importerMots([['fr' => 'x', 'jp_kana' => 'え']], 'ajouter', [], 'perso', ['vocabulaire_p_45']); }, 'vos chapitres', 403);
    leve(function () use ($b) { $b->importerMots([['fr' => 'x', 'jp_kana' => 'え']], 'ajouter', [], 'perso', ['mes_mots@1']); }, "n'existe pas", 404);
    egal('mes_mots@2', $b->importerMots([['fr' => 'y', 'jp_kana' => 'わ']], 'ajouter', [], 'perso', [], 'Mes mots')['chapitre'], '« Mes mots » tapé comme nouveau chapitre = le sien');
    $r = $a->importerMots([['fr' => 'monorail', 'jp_kana' => 'モノレール'], ['fr' => 'funiculaire', 'jp_kana' => 'ケーブルカー']], 'ajouter', [], 'cours', [], 'page 237');
    egal(['page_237'], motParFr($b, 'funiculaire')['chapitres'], 'import dans le cours, nouveau chapitre du cours');
    egal(0, $a->importerMots([['fr' => 'orphelin', 'jp_kana' => 'ん']], 'ajouter', [], 'cours')['crees'], 'sur le cours, un mot sans chapitre est ignoré');
});
essai('gestion : ajouter et retirer des mots d’un chapitre ; un mot du compte ne quitte pas « Mes mots »', function () {
    $pdo = baseNeuve();
    $a = compte($pdo, 'a@x.fr');
    $b = compte($pdo, 'b@x.fr');
    $b->creerChapitre('revoir', 'Personnel', []);
    $mien = $b->enregistrerMot(['fr' => 'platypus', 'jp_kana' => 'カモノハシ']);
    $deA = $a->enregistrerMot(['fr' => 'secret', 'jp_kana' => 'ひみつ']);
    $mois = array_values(array_map(function ($m) { return $m['id']; }, array_filter($b->toutesLesDonnees()['mots'], function ($m) { return in_array('mois', $m['chapitres'], true); })));
    $r = $b->ajouterMotsAuChapitre('revoir@2', array_merge($mois, [$mien['id'], $deA['id'], $mois[0]]));
    egal(['ajoutes' => 13, 'deja' => 0, 'refuses' => 1], $r, 'les 12 mois + le mien ; le mot de a est invisible');
    egal(['ajoutes' => 0, 'deja' => 13, 'refuses' => 0], $b->ajouterMotsAuChapitre('revoir@2', array_merge($mois, [$mien['id']])), 'rien en double');
    egal(['retires' => 12, 'gardes' => 0], $b->retirerMotsDuChapitre('revoir@2', $mois));
    egal(['mes_mots@2', 'revoir@2'], $b->lireMot($mien['id'])['chapitres']);
    egal(['retires' => 0, 'gardes' => 1], $b->retirerMotsDuChapitre('mes_mots@2', [$mien['id']]), 'gardé dans « Mes mots »');
    $b->ajouterMotsAuChapitre('mes_mots@2', [$mois[0]]);
    egal(['retires' => 1, 'gardes' => 0], $b->retirerMotsDuChapitre('mes_mots@2', [$mois[0]]), 'un mot du cours, lui, en sort');
    leve(function () use ($b, $mois) { $b->ajouterMotsAuChapitre('mois', $mois); }, 'appartient au cours', 403);
    leve(function () use ($b, $mois) { $b->ajouterMotsAuChapitre('mes_mots@1', $mois); }, "n'existe pas", 404);
    egal(['ajoutes' => 0, 'deja' => 0, 'refuses' => 1], $a->ajouterMotsAuChapitre('mois', [$deA['id']]), 'un mot du compte n’entre pas dans un chapitre du cours');
    leve(function () use ($b) { $b->ajouterMotsAuChapitre('revoir@2', range(1, Depot::MAX_LOT + 1)); }, 'Trop de mots');
});
essai('préférences : par compte, liste blanche, taille bornée, null efface', function () {
    $pdo = baseNeuve();
    $a = compte($pdo, 'a@x.fr');
    $b = compte($pdo, 'b@x.fr');
    $a->ecrirePreference('chapitres_coches', ['vocabulaire_p_45' => false]);
    $a->ecrirePreference('theme', 'sombre');
    $a->ecrirePreference('theme', 'clair');
    egal(['chapitres_coches' => ['vocabulaire_p_45' => false], 'theme' => 'clair'], (array) $a->toutesLesDonnees()['preferences']);
    egal('{}', json_encode($b->toutesLesDonnees()['preferences']), 'rien chez b, et un objet JSON vide');
    leve(function () use ($a) { $a->ecrirePreference('nimporte', 1); }, 'Préférence inconnue');
    leve(function () use ($a) { $a->ecrirePreference('filtres', str_repeat('x', Depot::TAILLE_MAX_PREFERENCE)); }, 'trop volumineuse');
    $a->ecrirePreference('theme', null);
    egal(['chapitres_coches'], array_keys((array) $a->toutesLesDonnees()['preferences']));
});

echo "Sauvegarde\n";
essai('sauvegarde → restauration (v2) : identique, comptes compris ; administrateur seulement', function () {
    $pdo = baseNeuve();
    $a = compte($pdo, 'a@x.fr');
    $b = compte($pdo, 'b@x.fr');
    $b->enregistrerMot(['fr' => 'platypus', 'jp_kana' => 'カモノハシ', 'chapitres' => ['animaux']]);
    $a->enregistrerResultat(motParFr($a, 'ici')['id'], false);
    $a->enregistrerKana('か', true);
    $a->enregistrerKanji('日', 'lecture', true);
    $a->creerChapitre('révision', 'Mes révisions', ['chap:mois']);
    leve(function () use ($b) { $b->sauvegarde(); }, 'Réservé', 403);
    $s = json_decode(json_encode($a->sauvegarde(), JSON_UNESCAPED_UNICODE), true);
    $pdo2 = baseNeuve();
    $a2 = compte($pdo2, 'a@x.fr');
    egal(2, $a2->restaurer($s)['comptes']);
    // Comparé en JSON : `preferences` est un objet, et deux objets ne sont jamais ===.
    $a->ecrirePreference('theme', 'sombre');
    $s = json_decode(json_encode($a->sauvegarde(), JSON_UNESCAPED_UNICODE), true);
    $a2->restaurer($s);
    egal(json_encode($a->toutesLesDonnees()), json_encode(compte($pdo2, 'a@x.fr')->toutesLesDonnees()), 'compte a (préférences comprises)');
    egal(json_encode($b->toutesLesDonnees()), json_encode(compte($pdo2, 'b@x.fr')->toutesLesDonnees()), 'compte b');
    leve(function () use ($a2) { $a2->restaurer(['format' => 'autre']); }, 'sauvegarde complète');
});
essai('restauration d’une sauvegarde v1 (un seul utilisateur) : le perso va au compte qui restaure', function () {
    $pdo = baseNeuve();
    $a = compte($pdo, 'a@x.fr');
    $v1 = [
        'format' => 'nihonjo_sauvegarde', 'version_schema' => 1,
        'categories' => [['nom' => 'Vocabulaire', 'ordre' => 1], ['nom' => 'Personnel', 'ordre' => 4]],
        'chapitres' => [['id' => 'vocabulaire_p_45', 'categorie' => 'Vocabulaire', 'ordre' => 10, 'origine' => 'cours'], ['id' => 'personnel', 'categorie' => 'Personnel', 'ordre' => 0, 'origine' => 'perso']],
        'mots' => [
            ['id' => 1, 'fr' => ['ici'], 'jp_kana' => ['ここ'], 'origine' => 'cours', 'chapitres' => ['vocabulaire_p_45'], 'thematiques' => ['lieu'], 'progression' => ['statut' => 'acquis', 'nb_reussites' => 2, 'nb_echecs' => 0]],
            ['id' => 2, 'fr' => ['axolotl'], 'jp_kana' => ['ウーパールーパー'], 'origine' => 'perso', 'chapitres' => ['personnel'], 'thematiques' => ['animal']],
        ],
    ];
    egal(['mots' => 2, 'comptes' => 1], $a->restaurer($v1));
    $a = compte($pdo, 'a@x.fr');
    egal(['mes_mots@1'], motParFr($a, 'axolotl')['chapitres'], '« personnel » d’une vieille sauvegarde devenu « Mes mots » au chargement');
    egal('acquis', motParFr($a, 'ici')['progression']['statut']);
    $pi = motParFr($a, 'ici')['progression'];
    egal([2, true], [$pi['serie'], $pi['production']], 'sauvegarde sans paliers : un acquis garde ses paliers');
    egal(true, $pi['acquis_le'] !== null && $pi['prochaine_revision'] !== null, 'sauvegarde sans paliers : une date d’acquisition et de rafraîchissement');
    egal(true, motParFr($a, 'ici')['modifiable'], 'toujours administrateur');
});

echo "Jetons Firebase\n";
// Une paire de clés et un certificat faits ici jouent le rôle de ceux de Google.
$cle = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
$csr = openssl_csr_new(['commonName' => 'essai'], $cle, ['digest_alg' => 'sha256']);
openssl_x509_export(openssl_csr_sign($csr, null, $cle, 1, ['digest_alg' => 'sha256']), $CERT);
$MAINTENANT = 1_800_000_000;
function jeton(array $charge, array $entete = []): string
{
    global $cle;
    $b64 = function (string $s) { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); };
    $tete = $b64(json_encode($entete + ['alg' => 'RS256', 'kid' => 'k1', 'typ' => 'JWT']));
    $corps = $b64(json_encode($charge));
    openssl_sign("$tete.$corps", $signature, $cle, OPENSSL_ALGO_SHA256);
    return "$tete.$corps." . $b64($signature);
}
function verificateur(): VerificateurJetonFirebase
{
    global $CERT, $MAINTENANT;
    return new VerificateurJetonFirebase('odyvresse', function () use ($CERT) { return ['k1' => $CERT]; }, function () use ($MAINTENANT) { return $MAINTENANT; });
}
function chargeValide(array $plus = []): array
{
    global $MAINTENANT;
    return $plus + ['iss' => 'https://securetoken.google.com/odyvresse', 'aud' => 'odyvresse', 'sub' => 'uid123',
        'iat' => $MAINTENANT - 60, 'auth_time' => $MAINTENANT - 60, 'exp' => $MAINTENANT + 3000, 'email' => 'jose@x.fr', 'name' => 'José'];
}
essai('jeton valide : revendications rendues', function () {
    $r = verificateur()->verifier(jeton(chargeValide()));
    egal(['uid123', 'jose@x.fr'], [$r['sub'], $r['email']]);
});
essai('jetons refusés : expiré, autre projet, autre émetteur, alg none, signature altérée, kid inconnu, illisible', function () {
    global $MAINTENANT;
    $v = verificateur();
    leve(function () use ($v, $MAINTENANT) { $v->verifier(jeton(chargeValide(['exp' => $MAINTENANT - 1]))); }, 'expirée', 401);
    leve(function () use ($v) { $v->verifier(jeton(chargeValide(['aud' => 'autre']))); }, 'aud', 401);
    leve(function () use ($v) { $v->verifier(jeton(chargeValide(['iss' => 'https://securetoken.google.com/autre']))); }, 'iss', 401);
    leve(function () use ($v) { $v->verifier(jeton(chargeValide(), ['alg' => 'none'])); }, 'algorithme', 401);
    leve(function () use ($v) { $v->verifier(jeton(chargeValide(), ['kid' => 'k9'])); }, 'certificat inconnu', 401);
    leve(function () use ($v, $MAINTENANT) { $v->verifier(jeton(chargeValide(['iat' => $MAINTENANT + 3600]))); }, 'date', 401);
    $j = explode('.', jeton(chargeValide()));
    $j[1] = rtrim(strtr(base64_encode(json_encode(chargeValide(['sub' => 'pirate']))), '+/', '-_'), '=');
    leve(function () use ($v, $j) { $v->verifier(implode('.', $j)); }, 'signature', 401);
    leve(function () use ($v) { $v->verifier('pas-un-jeton'); }, 'illisible', 401);
});

echo "Sessions et Discord\n";
function configEssai(PDO $pdo = null): array
{
    return [
        'chemin_secret' => cheminJetable() . '.key', 'administrateurs' => [],
        'firebase' => ['projectId' => 'odyvresse'],
        'discord' => ['client_id' => '123', 'client_secret' => 'secret-essai', 'retour' => 'http://localhost:8080/api/discord.php'],
    ];
}
/** Un faux Discord : répond au code « bon-code » ; garde la trace des requêtes. */
function fauxDiscord(array $profil, array &$traces = null): callable
{
    $traces = [];
    return function (string $methode, string $url, array $entetes, ?string $corps) use ($profil, &$traces) {
        $traces[] = [$methode, $url, $corps];
        if ($url === ConnexionDiscord::URL_JETON) {
            parse_str((string) $corps, $p);
            return ($p['code'] ?? '') === 'bon-code' && ($p['client_secret'] ?? '') === 'secret-essai'
                ? [200, json_encode(['access_token' => 'acces', 'token_type' => 'Bearer'])] : [400, '{"error":"invalid_grant"}'];
        }
        return in_array('Authorization: Bearer acces', $entetes, true) ? [200, json_encode($profil)] : [401, '{}'];
    };
}
/** Simule l'aller (debut) puis le retour de Discord ; rend l'adresse finale. */
function allerRetourDiscord(PDO $pdo, array $config, string $intention, array $profil, string $code = 'bon-code'): string
{
    $_SERVER['SCRIPT_NAME'] = '/api/discord.php';
    $url = Authentification::debutDiscord($config, $intention);
    parse_str((string) parse_url($url, PHP_URL_QUERY), $q);
    egal(['code', '123', 'identify email', 'http://localhost:8080/api/discord.php'], [$q['response_type'], $q['client_id'], $q['scope'], $q['redirect_uri']]);
    return Authentification::retourDiscord($pdo, $config, ['code' => $code, 'state' => $q['state']], fauxDiscord($profil));
}
$PROFIL_DISCORD = ['id' => '987', 'username' => 'kitsune', 'global_name' => 'Kitsune', 'email' => 'k@x.fr', 'verified' => true, 'avatar' => 'abc'];

essai('jetons signés : charge rendue ; signature altérée, autre clé, date passée refusées', function () {
    $j = new JetonsSignes(str_repeat('a', 64));
    $jeton = $j->signer(['t' => 'session', 'c' => 3], 60);
    egal(3, $j->lire($jeton)['c']);
    egal(null, (new JetonsSignes(str_repeat('b', 64)))->lire($jeton), 'autre clé');
    [$corps, $sig] = explode('.', $jeton);
    $faux = rtrim(strtr(base64_encode(json_encode(['t' => 'session', 'c' => 1, 'exp' => time() + 60])), '+/', '-_'), '=');
    egal(null, $j->lire("$faux.$sig"), 'charge changée');
    egal(null, $j->lire($j->signer(['c' => 3], -1)), 'expiré');
    egal(null, $j->lire('nimporte'), 'illisible');
    $chemin = cheminJetable() . '.key';
    JetonsSignes::depuisFichier($chemin);
    egal(64, strlen((string) file_get_contents($chemin)), 'clé créée au premier besoin');
    @unlink($chemin);
});
essai('Discord, inscription : identité « discord:<id> », compte créé, session ouverte, puis déconnexion', function () use ($PROFIL_DISCORD) {
    $pdo = baseNeuve();
    compte($pdo, 'jose@x.fr');
    $config = configEssai();
    $_COOKIE = [];
    $traces = null;
    $vers = allerRetourDiscord($pdo, $config, 'inscription', $PROFIL_DISCORD);
    egal('/#/reviser?bienvenue=1', $vers);
    $c = $pdo->query("SELECT id, uid, email, nom, fournisseur, photo FROM utilisateur WHERE uid = 'discord:987'")->fetch();
    egal([2, 'k@x.fr', 'Kitsune', 'discord', 'https://cdn.discordapp.com/avatars/987/abc.png?size=128'], [(int) $c['id'], $c['email'], $c['nom'], $c['fournisseur'], $c['photo']]);
    egal(true, isset($_COOKIE[Cookies::SESSION]), 'session posée');
    egal(false, isset($_COOKIE[Cookies::DISCORD]), 'aller-retour effacé');
    egal(2, Authentification::utilisateur($pdo, $config, 'firebase')['id'], 'la session ouvre le compte');
    Authentification::deconnecter();
    leve(function () use ($pdo, $config) { Authentification::utilisateur($pdo, $config, 'firebase'); }, 'Connexion requise', 401);
});
essai('Discord, connexion sans compte : « inexistant », identité en attente, puis « Créer le compte »', function () use ($PROFIL_DISCORD) {
    $pdo = baseNeuve();
    compte($pdo, 'jose@x.fr');
    $config = configEssai();
    $_COOKIE = [];
    egal('/#/connexion?discord=inexistant', allerRetourDiscord($pdo, $config, 'connexion', $PROFIL_DISCORD));
    egal(1, (int) $pdo->query('SELECT COUNT(*) FROM utilisateur')->fetchColumn(), 'rien de créé');
    egal(['nom' => 'Kitsune', 'email' => 'k@x.fr'], array_intersect_key(Authentification::attenteDiscord($config), ['nom' => 0, 'email' => 0]));
    $r = Authentification::inscrire($pdo, $config, 'firebase');
    egal([2, true, 'discord'], [$r['compte']['id'], $r['nouveau'], $r['compte']['fournisseur']]);
    egal(null, Authentification::attenteDiscord($config), 'attente effacée');
    egal(2, Authentification::utilisateur($pdo, $config, 'firebase')['id']);
    egal('/#/reviser', allerRetourDiscord($pdo, $config, 'connexion', $PROFIL_DISCORD), 'connexion suivante');
});
essai('Discord : e-mail non vérifié ignoré (pas de rôle d’administrateur volé) ; état falsifié, refus, mauvais code', function () use ($PROFIL_DISCORD) {
    $pdo = baseNeuve();
    compte($pdo, 'jose@x.fr');
    $config = configEssai();
    $config['administrateurs'] = ['jose@x.fr'];
    $_COOKIE = [];
    allerRetourDiscord($pdo, $config, 'inscription', ['email' => 'jose@x.fr', 'verified' => false] + $PROFIL_DISCORD);
    egal(['', 'membre'], $pdo->query("SELECT email, role FROM utilisateur WHERE uid = 'discord:987'")->fetch(PDO::FETCH_NUM));
    $_SERVER['SCRIPT_NAME'] = '/api/discord.php';
    Authentification::debutDiscord($config, 'connexion');
    egal('/#/connexion?discord=expire', Authentification::retourDiscord($pdo, $config, ['code' => 'bon-code', 'state' => 'faux'], fauxDiscord($PROFIL_DISCORD)));
    egal('/#/connexion?discord=expire', Authentification::retourDiscord($pdo, $config, ['code' => 'bon-code', 'state' => 'x'], fauxDiscord($PROFIL_DISCORD)), 'sans aller (cookie consommé)');
    Authentification::debutDiscord($config, 'connexion');
    egal('/#/connexion?discord=refuse', Authentification::retourDiscord($pdo, $config, ['error' => 'access_denied'], fauxDiscord($PROFIL_DISCORD)));
    $journal = ini_set('error_log', '/dev/null'); // l'échec est journalisé : pas dans la sortie des essais
    egal('/#/connexion?discord=erreur', allerRetourDiscord($pdo, $config, 'connexion', $PROFIL_DISCORD, 'mauvais-code'));
    ini_set('error_log', (string) $journal);
    $_SERVER['SCRIPT_NAME'] = '/nihonjo/api/discord.php';
    egal('/nihonjo/', Authentification::racine(), 'application dans un sous-dossier');
    $_SERVER['SCRIPT_NAME'] = '/api/discord.php';
});
essai('session Discord : un compte supprimé dont l’id est redonné à un autre n’est pas ouvert', function () use ($PROFIL_DISCORD) {
    $pdo = baseNeuve();
    compte($pdo, 'jose@x.fr');
    $config = configEssai();
    $_COOKIE = [];
    allerRetourDiscord($pdo, $config, 'inscription', $PROFIL_DISCORD);
    $session = $_COOKIE[Cookies::SESSION];
    Comptes::supprimer($pdo, 2);
    egal(2, Comptes::pourIdentite($pdo, identite('marie@x.fr'), [], true)['id'], 'id redonné');
    $_COOKIE = [Cookies::SESSION => $session];
    leve(function () use ($pdo, $config) { Authentification::utilisateur($pdo, $config, 'firebase'); }, 'Connexion requise', 401);
    egal(false, isset($_COOKIE[Cookies::SESSION]), 'session périmée effacée');
});
essai('Discord sans secret : pas de bouton, « discord_absent » ; fournisseurs annoncés par « sante »', function () {
    $config = configEssai();
    egal(['google' => true, 'discord' => true], Authentification::pourInterface($config, 'firebase')['fournisseurs']);
    $config['discord']['client_secret'] = '';
    egal(['google' => true, 'discord' => false], Authentification::pourInterface($config, 'firebase')['fournisseurs']);
    egal(['google' => false, 'discord' => false], Authentification::pourInterface(configEssai(), 'dev')['fournisseurs']);
    leve(function () use ($config) { Authentification::debutDiscord($config, 'connexion'); }, 'pas configurée', 404);
});
essai('mode dev : connexion sans compte → compte_inexistant, « compte.creer » l’inscrit', function () {
    $pdo = baseNeuve();
    $config = configEssai();
    $_COOKIE = [];
    $_SERVER['HTTP_X_NIHONJO_DEV_EMAIL'] = 'premier@x.fr';
    egal(1, Authentification::utilisateur($pdo, $config, 'dev')['id'], 'compte initial réclamé');
    $_SERVER['HTTP_X_NIHONJO_DEV_EMAIL'] = 'second@x.fr';
    leve(function () use ($pdo, $config) { Authentification::utilisateur($pdo, $config, 'dev'); }, 'Aucun compte', 404);
    $r = Authentification::inscrire($pdo, $config, 'dev');
    egal([2, true, 'dev'], [$r['compte']['id'], $r['nouveau'], $r['compte']['fournisseur']]);
    unset($_SERVER['HTTP_X_NIHONJO_DEV_EMAIL']);
    leve(function () use ($pdo, $config) { Authentification::inscrire($pdo, $config, 'dev'); }, 'Connexion requise', 401);
});

echo "Routeur\n";
essai('action inconnue → 404, mauvais verbe → 405, paramètre manquant → 400', function () {
    $api = new Api(compte(baseNeuve(), 'a@x.fr'));
    foreach ([['GET', 'nimporte', 404], ['GET', 'mot.supprimer', 405], ['POST', 'mot.supprimer', 400]] as [$verbe, $action, $code]) {
        try { $api->traiter($verbe, $action, []); throw new RuntimeException('pas levé'); } catch (ErreurApi $e) { egal($code, $e->statutHttp, $action); }
    }
});
essai('routeur : les actions du gestionnaire, de l’import et des préférences', function () {
    $pdo = baseNeuve();
    $api = new Api(compte($pdo, 'a@x.fr'));
    egal(['cle' => 'theme'], $api->traiter('POST', 'preference.ecrire', ['cle' => 'theme', 'valeur' => 'sombre']));
    $r = $api->traiter('POST', 'import.mots', ['mots' => [['fr' => 'Pikachu', 'kana' => 'x', 'jp_kana' => ['ピカチュウ']]], 'chapitres' => [], 'nouveau_chapitre' => 'pokémon']);
    egal('pokémon@1', $r['chapitre']);
    $id = motParFr(compte($pdo, 'a@x.fr'), 'Pikachu')['id'];
    egal(['retires' => 1, 'gardes' => 0], $api->traiter('POST', 'chapitre.retirerMots', ['id' => 'pokémon@1', 'mots' => [$id]]));
    egal(['ajoutes' => 1, 'deja' => 0, 'refuses' => 0], $api->traiter('POST', 'chapitre.ajouterMots', ['id' => 'pokémon@1', 'mots' => [$id]]));
});
essai('routeur : « Mon compte » (profil, pseudo, suppression confirmée) ; refus sur un poste sans connexion', function () {
    $pdo = baseNeuve();
    compte($pdo, 'a@x.fr');
    $api = new Api(compte($pdo, 'b@x.fr'));
    egal('b@x.fr', $api->traiter('GET', 'compte.profil', [])['compte']['email']);
    egal('Bee', $api->traiter('POST', 'compte.modifier', ['pseudo' => 'Bee'])['nom']);
    leve(function () use ($api) { $api->traiter('POST', 'compte.supprimer', []); }, 'non confirmée');
    egal(2, $api->traiter('POST', 'compte.supprimer', ['confirmation' => 'supprimer'])['id']);
    $local = new Api(new Depot($pdo, Comptes::lire($pdo, 1)), 'aucune');
    leve(function () use ($local) { $local->traiter('POST', 'compte.supprimer', ['confirmation' => 'supprimer']); }, 'poste local');
    egal(1, count($local->traiter('GET', 'comptes.lister', [])['comptes']));
});
essai('mode « dev » : seulement par la variable d’environnement', function () {
    putenv('NIHONJO_AUTH');
    egal('firebase', Authentification::mode(['authentification' => 'dev']));
    egal('aucune', Authentification::mode(['authentification' => 'aucune']));
    putenv('NIHONJO_AUTH=dev');
    egal('dev', Authentification::mode([]));
    putenv('NIHONJO_AUTH=aucune');
    egal('aucune', Authentification::mode(['authentification' => 'firebase']));
    putenv('NIHONJO_AUTH=nimporte');
    egal('firebase', Authentification::mode([]));
    putenv('NIHONJO_AUTH');
});

echo "\n$nbEssais essais réussis.\n";
