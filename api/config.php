<?php
declare(strict_types=1);

// Réglages de l'API. Pour les changer sur UNE machine sans toucher au dépôt,
// créer api/config.local.php (ignoré par git) qui renvoie un tableau partiel :
//
//   <?php return ['chemin_base' => '/home/<compte>/nihonjo_donnees/nihonjo.sqlite'];
//
// La variable d'environnement NIHONJO_BASE l'emporte sur les deux (tests).

$config = [
    // ⚠️ Ce fichier EST la base de production une fois l'application en
    // ligne. Un envoi FTP du dossier complet depuis le poste l'écraserait
    // avec la base locale : exclure data/ des envois (doc_pour_agents/deploiement.md).
    'chemin_base'   => __DIR__ . '/../data/nihonjo.sqlite',
    'chemin_amorce' => __DIR__ . '/amorce/vocabulaire_initial.json',

    // Connexion : « firebase » (comptes Google, comme Odyvresse) ou « aucune »
    // (un seul compte, sans connexion : poste local hors ligne). Les tests
    // automatiques utilisent NIHONJO_AUTH=dev (voir api/lib/Authentification.php).
    'authentification' => 'firebase',

    // Configuration WEB du projet Firebase d'Odyvresse — la même que
    // odyvresse/src/environnements/environnement.prod.ts. Ces valeurs sont
    // PUBLIQUES par conception (elles partent dans chaque navigateur) : ce
    // n'est pas un secret. Ce qui protège, c'est la liste des « domaines
    // autorisés » de la console Firebase, où nihonjo.odyvresse.com doit figurer.
    'firebase' => [
        'apiKey'     => 'AIzaSyAnCl1oyCMrSyio6MAz8muZXI3JqYXlvyA',
        'authDomain' => 'odyvresse.firebaseapp.com',
        'projectId'  => 'odyvresse',
        'appId'      => '1:31939934404:web:40060ec14cd17dc8dab191',
    ],

    // Adresses e-mail promues administrateur à la connexion (modifier le
    // cours, sauvegarder / restaurer toute la base). Vide : seul le premier
    // compte connecté l'est. À renseigner dans api/config.local.php.
    'administrateurs' => [],

    // Cache des certificats publics de Google (vérification des jetons).
    // null : à côté de la base (calculé plus bas).
    'chemin_certificats' => null,

    // Clé qui signe les cookies de session (comptes Discord) et l'aller-retour
    // OAuth2. Créée au premier besoin ; null : à côté de la base. La perdre
    // déconnecte les comptes Discord, rien de plus.
    'chemin_secret' => null,

    // Connexion par Discord (OAuth2), comme Odyvresse : le bouton n'apparaît
    // que si client_id ET client_secret sont renseignés.
    // - client_id : l'application Discord d'Odyvresse (public, comme la
    //   configuration Firebase ; voir deckolector/doc_pour_agents/).
    // - client_secret : ⚠️ SECRET. Jamais dans ce fichier ni dans git : dans
    //   api/config.local.php en ligne ('discord' => ['client_secret' => '…']),
    //   dans le fichier .env (NIHONJO_DISCORD_CLIENT_SECRET=…) avec Docker.
    // - retour : vide = <origine>/api/discord.php, déduit de la requête. Cette
    //   adresse doit être déclarée dans le portail Discord (OAuth2 → Redirects).
    // L'application Android (application_android/, Capacitor) : son front est
    // DANS l'APK, servi sous cette origine (`server.hostname` de
    // capacitor.config.json, comme Odyvresse : « odyvresse.com »), et appelle
    // l'API d'ici. Seules ces origines reçoivent les en-têtes CORS
    // (api/index.php), sans cookie (pas d'Access-Control-Allow-Credentials).
    // NIHONJO_ORIGINES_APPLICATION (liste séparée par des virgules) remplace
    // la liste : tests.
    'origines_application' => ['https://odyvresse.com'],

    'discord' => [
        'client_id'     => (string) (getenv('NIHONJO_DISCORD_CLIENT_ID') ?: '1509628157962227893'),
        'client_secret' => (string) (getenv('NIHONJO_DISCORD_CLIENT_SECRET') ?: ''),
        'retour'        => (string) (getenv('NIHONJO_DISCORD_RETOUR') ?: ''),
    ],
];

if (is_file(__DIR__ . '/config.local.php')) {
    $local = require __DIR__ . '/config.local.php';
    if (is_array($local)) {
        // Fusion au premier niveau, sauf « discord » : un config.local.php qui
        // ne donne que le secret garde le client_id ci-dessus.
        $discord = $config['discord'];
        $config = array_merge($config, $local);
        if (isset($local['discord']) && is_array($local['discord'])) {
            $config['discord'] = array_merge($discord, $local['discord']);
        }
    }
}

$origines = getenv('NIHONJO_ORIGINES_APPLICATION');
if (is_string($origines) && $origines !== '') {
    $config['origines_application'] = array_values(array_filter(array_map('trim', explode(',', $origines))));
}

$depuisEnv = getenv('NIHONJO_BASE');
if (is_string($depuisEnv) && $depuisEnv !== '') {
    $config['chemin_base'] = $depuisEnv;
}

if (empty($config['chemin_certificats'])) {
    $config['chemin_certificats'] = dirname($config['chemin_base']) . '/certificats_firebase.json';
}
if (empty($config['chemin_secret'])) {
    $config['chemin_secret'] = dirname($config['chemin_base']) . '/secret_sessions.key';
}

return $config;
