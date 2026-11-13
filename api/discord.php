<?php
declare(strict_types=1);

// Connexion par Discord (OAuth2), les deux étapes qui sont des REDIRECTIONS
// (pas du JSON, d'où un fichier à part d'api/index.php) :
//
//   aller   discord.php?intention=connexion|inscription  → page de Discord
//   retour  discord.php?code=…&state=…  (ou ?error=…)    → l'application
//
// L'adresse de retour à déclarer dans le portail Discord est CE fichier,
// sans paramètre : http://localhost:8080/api/discord.php en local,
// https://nihonjo.odyvresse.com/api/discord.php en ligne.
// Le détail : doc_pour_agents/comptes_et_connexion.md.

require __DIR__ . '/lib/Base.php';
require __DIR__ . '/lib/Depot.php';
require __DIR__ . '/lib/Authentification.php';

ini_set('display_errors', '0');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
// L'adresse de retour porte le code d'autorisation : ne pas le transmettre
// à la page suivante dans l'en-tête Referer.
header('Referrer-Policy: no-referrer');

$config = require __DIR__ . '/config.php';
try {
    if (Authentification::mode($config) !== 'firebase') {
        $vers = Authentification::versConnexion('absent');
    } elseif (isset($_GET['code']) || isset($_GET['error']) || isset($_GET['state'])) {
        $vers = Authentification::retourDiscord(Base::ouvrir($config['chemin_base']), $config, $_GET);
    } else {
        $vers = Authentification::debutDiscord($config, (string) ($_GET['intention'] ?? 'connexion'));
    }
} catch (ErreurApi $e) {
    $vers = Authentification::versConnexion($e->codeErreur === 'discord_absent' ? 'absent' : 'erreur');
} catch (Throwable $e) {
    error_log('[nihonjo] discord.php : ' . $e);
    $vers = Authentification::versConnexion('erreur');
}
header('Location: ' . $vers, true, 302);
