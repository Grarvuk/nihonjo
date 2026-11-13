<?php
declare(strict_types=1);

// Point d'entrée unique de l'API Nihonjo : api/index.php?action=<nom>.
// Les actions sont listées dans api/lib/Api.php ; la doc est
// doc_pour_agents/api.md, la connexion doc_pour_agents/comptes_et_connexion.md.

require __DIR__ . '/lib/Base.php';
require __DIR__ . '/lib/Depot.php';
require __DIR__ . '/lib/Amorcage.php';
require __DIR__ . '/lib/Authentification.php';
require __DIR__ . '/lib/Api.php';

// Un avertissement PHP affiché au milieu de la réponse la rendrait illisible
// (JSON invalide) : les erreurs vont au journal, jamais dans la page.
ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function nihonjo_repondre(int $statut, array $charge): void
{
    http_response_code($statut);
    echo json_encode($charge, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
}

/**
 * CORS pour l'application Android (25/10/2026) : son front est servi par la
 * WebView sous une AUTRE origine (`origines_application`, api/config.php).
 * Rien pour les autres origines. Jamais Access-Control-Allow-Credentials : le
 * navigateur n'envoie alors ni ne laisse lire une requête avec cookie (la
 * session Discord) — l'application s'identifie par l'en-tête du jeton.
 * Renvoie vrai si la requête était la vérification préalable (OPTIONS) : elle
 * est servie, il n'y a rien d'autre à faire.
 */
function nihonjo_cors(array $config, string $methode): bool
{
    $origine = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origine === '' || !in_array($origine, (array) ($config['origines_application'] ?? []), true)) {
        return false;
    }
    header('Access-Control-Allow-Origin: ' . $origine);
    header('Vary: Origin');
    if ($methode !== 'OPTIONS') {
        return false;
    }
    $entetes = ['Content-Type', 'X-Nihonjo-Jeton'];
    if (getenv('NIHONJO_AUTH') === 'dev') {
        $entetes[] = 'X-Nihonjo-Dev-Email'; // tests seulement (règle n° 10)
    }
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: ' . implode(', ', $entetes));
    header('Access-Control-Max-Age: 600');
    http_response_code(204);
    return true;
}

try {
    $config = require __DIR__ . '/config.php';
    $methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = (string) ($_GET['action'] ?? '');
    $corps = [];

    if (nihonjo_cors($config, $methode)) {
        exit;
    }

    if ($methode === 'POST') {
        // ⚠️ Garde contre les requêtes forgées depuis un autre site : un
        // formulaire HTML ne peut pas envoyer « application/json » sans
        // déclencher une vérification préalable (CORS) que cette API ne
        // satisfait que pour l'origine de l'application Android
        // (nihonjo_cors), et jamais avec cookie. (Le jeton de connexion, lui,
        // voyage dans un en-tête que seul notre code ajoute.)
        $type = $_SERVER['CONTENT_TYPE'] ?? ($_SERVER['HTTP_CONTENT_TYPE'] ?? '');
        if (stripos($type, 'application/json') !== 0) {
            throw new ErreurApi('Les écritures doivent être envoyées en JSON (Content-Type: application/json).', 415);
        }
        $brut = (string) file_get_contents('php://input');
        $corps = $brut === '' ? [] : json_decode($brut, true);
        if (!is_array($corps)) {
            throw new ErreurApi('Corps de requête JSON illisible.');
        }
    }

    $pdo = Base::ouvrir($config['chemin_base']);
    Amorcage::siBaseVide($pdo, $config['chemin_amorce']);
    $modeAuth = Authentification::mode($config);

    // Les actions qui se passent de compte. (Les deux étapes de Discord, des
    // redirections, sont dans api/discord.php.)
    switch ($action) {
        // L'interface la lit AVANT la connexion, pour savoir comment se
        // connecter (mode, configuration web de Firebase, fournisseurs).
        case 'sante':
            $sante = (new Depot($pdo, ['id' => 0, 'role' => 'membre']))->sante($config['chemin_base']);
            $sante['auth'] = Authentification::pourInterface($config, $modeAuth);
            nihonjo_repondre(200, ['ok' => true, 'donnees' => $sante]);
            exit;
        // « Créer un compte » : l'identité de la requête (jeton Google,
        // identité Discord en attente, adresse du mode dev) devient un compte.
        case 'compte.creer':
            if ($methode !== 'POST') {
                throw new ErreurApi("L'action « compte.creer » s'appelle en POST.", 405);
            }
            $inscription = Authentification::inscrire($pdo, $config, $modeAuth);
            nihonjo_repondre(200, ['ok' => true, 'donnees' => [
                'utilisateur' => (new Depot($pdo, $inscription['compte']))->moi(),
                'nouveau'     => $inscription['nouveau'],
            ]]);
            exit;
        // Ferme la session Discord (cookie) ; celle de Google se ferme dans
        // le navigateur (Firebase). Toujours un succès.
        case 'deconnexion':
            if ($methode !== 'POST') {
                throw new ErreurApi("L'action « deconnexion » s'appelle en POST.", 405);
            }
            Authentification::deconnecter();
            nihonjo_repondre(200, ['ok' => true, 'donnees' => null]);
            exit;
        // Y a-t-il une session ? Sonde du démarrage (une session Discord est
        // un cookie HttpOnly, invisible au code du navigateur). Répond 200
        // dans les deux cas : un 401 attendu salirait la console.
        case 'session':
            try {
                $connecte = Authentification::utilisateur($pdo, $config, $modeAuth);
                $session = ['connecte' => true, 'utilisateur' => (new Depot($pdo, $connecte))->moi()];
            } catch (ErreurApi $e) {
                if ($e->statutHttp !== 401) {
                    throw $e;
                }
                $session = ['connecte' => false];
            }
            nihonjo_repondre(200, ['ok' => true, 'donnees' => $session]);
            exit;
        case 'discord.attente':
            nihonjo_repondre(200, ['ok' => true, 'donnees' => Authentification::attenteDiscord($config)]);
            exit;
    }

    $compte = Authentification::utilisateur($pdo, $config, $modeAuth);
    $api = new Api(new Depot($pdo, $compte), $modeAuth);
    $resultat = $api->traiter($methode, $action, $corps);
    nihonjo_repondre(200, ['ok' => true, 'donnees' => $resultat]);
} catch (ErreurApi $e) {
    $charge = ['ok' => false, 'erreur' => $e->getMessage()];
    if ($e->codeErreur !== null) {
        $charge['code'] = $e->codeErreur;
    }
    if ($e->details) {
        $charge['details'] = $e->details;
    }
    nihonjo_repondre($e->statutHttp, $charge);
} catch (Throwable $e) {
    error_log('[nihonjo] ' . $e);
    // Le message réel aide plus qu'il n'expose (pas de secret dans ces
    // messages) ; il est aussi écrit dans le journal d'erreurs PHP.
    nihonjo_repondre(500, ['ok' => false, 'erreur' => 'Erreur du serveur : ' . $e->getMessage()]);
}
