<?php
declare(strict_types=1);

/**
 * Qui fait la requête ? — comptes Google (Firebase) et Discord, comme Odyvresse.
 *
 * Google : le navigateur se connecte à Firebase Authentication (projet
 * « odyvresse », `signInWithPopup`), puis envoie à chaque appel son jeton
 * d'identité dans l'en-tête `X-Nihonjo-Jeton`. Discord : OAuth2 côté serveur
 * (`ConnexionDiscord`), puis un cookie de session signé (`JetonsSignes`).
 * On s'inscrit (« Créer un compte ») avant de se connecter (`Comptes`).
 * Flux complet : doc_pour_agents/comptes_et_connexion.md.
 *
 * Le jeton Firebase est vérifié SANS bibliothèque (pas de Composer sur l'hébergement) : signature
 * RS256 contre les certificats publics de Google, puis émetteur, audience et
 * dates — ce que fait `verifyIdToken` de firebase-admin côté Deckolector.
 *
 * ⚠️ En-tête maison et pas `Authorization: Bearer` : (1) l'authentification
 * Basic du .htaccess racine utilise déjà `Authorization`, un Bearer la
 * remplacerait et Apache refuserait la requête ; (2) en PHP-CGI (courant sur
 * les mutualisés) Apache retire souvent `Authorization` avant PHP. Un en-tête
 * `X-…` passe partout, et force en plus une vérification CORS préalable.
 */

final class VerificateurJetonFirebase
{
    public const URL_CERTIFICATS = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
    /** Tolérance d'horloge entre l'hébergement et Google, en secondes. */
    private const TOLERANCE = 300;

    /** @var string */
    private $projet;
    /** @var callable(): array<string, string> kid => certificat PEM */
    private $certificats;
    /** @var callable(): int */
    private $maintenant;

    public function __construct(string $projet, callable $certificats, ?callable $maintenant = null)
    {
        $this->projet = $projet;
        $this->certificats = $certificats;
        $this->maintenant = $maintenant ?? function () { return time(); };
    }

    /** @return array<string, mixed> les revendications du jeton (sub, email, name…) */
    public function verifier(string $jeton): array
    {
        $morceaux = explode('.', $jeton);
        if (count($morceaux) !== 3) {
            throw new ErreurApi('Jeton de connexion illisible : reconnectez-vous.', 401);
        }
        [$entete64, $charge64, $signature64] = $morceaux;
        $entete = json_decode(self::base64url($entete64), true);
        $charge = json_decode(self::base64url($charge64), true);
        if (!is_array($entete) || !is_array($charge)) {
            throw new ErreurApi('Jeton de connexion illisible : reconnectez-vous.', 401);
        }
        // ⚠️ Ne jamais croire l'algorithme annoncé par le jeton : seul RS256 est admis
        // (sinon un jeton « alg: none » passerait sans signature).
        if (($entete['alg'] ?? '') !== 'RS256' || !isset($entete['kid'])) {
            throw new ErreurApi('Jeton de connexion refusé (algorithme).', 401);
        }
        $certificats = ($this->certificats)();
        $certificat = $certificats[$entete['kid']] ?? null;
        if ($certificat === null) {
            throw new ErreurApi('Jeton de connexion refusé (certificat inconnu) : reconnectez-vous.', 401);
        }
        $cle = openssl_pkey_get_public($certificat);
        if ($cle === false) {
            throw new RuntimeException('Certificat Google illisible.');
        }
        $valide = openssl_verify($entete64 . '.' . $charge64, self::base64url($signature64), $cle, OPENSSL_ALGO_SHA256);
        if ($valide !== 1) {
            throw new ErreurApi('Jeton de connexion refusé (signature).', 401);
        }

        $t = ($this->maintenant)();
        $attendus = [
            'iss' => 'https://securetoken.google.com/' . $this->projet,
            'aud' => $this->projet,
        ];
        foreach ($attendus as $champ => $valeur) {
            if (($charge[$champ] ?? null) !== $valeur) {
                throw new ErreurApi("Jeton de connexion refusé ($champ).", 401);
            }
        }
        if (!isset($charge['exp']) || (int) $charge['exp'] < $t) {
            throw new ErreurApi('Session expirée : reconnectez-vous.', 401);
        }
        if (!isset($charge['iat']) || (int) $charge['iat'] > $t + self::TOLERANCE
            || (isset($charge['auth_time']) && (int) $charge['auth_time'] > $t + self::TOLERANCE)) {
            throw new ErreurApi('Jeton de connexion refusé (date).', 401);
        }
        if (!isset($charge['sub']) || !is_string($charge['sub']) || $charge['sub'] === '' || strlen($charge['sub']) > 128) {
            throw new ErreurApi('Jeton de connexion refusé (sujet).', 401);
        }
        return $charge;
    }

    public static function base64url(string $texte): string
    {
        $decode = base64_decode(strtr($texte, '-_', '+/') . str_repeat('=', (4 - strlen($texte) % 4) % 4), true);
        return $decode === false ? '' : $decode;
    }

    /**
     * Certificats publics de Google, gardés dans un fichier de cache tant que
     * Google l'autorise (en-tête Cache-Control: max-age, quelques heures).
     * Si Google ne répond pas, un cache périmé vaut mieux que personne connecté.
     *
     * @return array<string, string>
     */
    public static function certificatsGoogle(string $cheminCache): array
    {
        $cache = is_file($cheminCache) ? json_decode((string) file_get_contents($cheminCache), true) : null;
        if (is_array($cache) && ($cache['expire'] ?? 0) > time() && !empty($cache['certificats'])) {
            return $cache['certificats'];
        }
        [$corps, $maxAge] = self::telecharger(self::URL_CERTIFICATS);
        $certificats = $corps !== null ? json_decode($corps, true) : null;
        if (is_array($certificats) && $certificats) {
            @file_put_contents($cheminCache, json_encode(['expire' => time() + max(60, $maxAge), 'certificats' => $certificats]), LOCK_EX);
            return $certificats;
        }
        if (is_array($cache) && !empty($cache['certificats'])) {
            return $cache['certificats'];
        }
        throw new RuntimeException("Impossible de joindre Google pour vérifier la connexion (certificats). L'hébergement autorise-t-il les requêtes sortantes ?");
    }

    /** @return array{0: ?string, 1: int} corps, max-age */
    private static function telecharger(string $url): array
    {
        $maxAge = 3600;
        if (function_exists('curl_init')) {
            $c = curl_init($url);
            $entetes = [];
            curl_setopt_array($c, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT => 8,
                CURLOPT_HEADERFUNCTION => function ($c, $ligne) use (&$entetes) { $entetes[] = $ligne; return strlen($ligne); },
            ]);
            $corps = curl_exec($c);
            $code = (int) curl_getinfo($c, CURLINFO_HTTP_CODE);
            curl_close($c);
        } else {
            $contexte = stream_context_create(['http' => ['timeout' => 8]]);
            $corps = @file_get_contents($url, false, $contexte);
            $entetes = isset($http_response_header) ? $http_response_header : [];
            $code = $corps === false ? 0 : 200;
        }
        foreach ($entetes as $ligne) {
            if (preg_match('/^cache-control:.*max-age=(\d+)/i', $ligne, $m)) {
                $maxAge = (int) $m[1];
            }
        }
        return [($corps !== false && $code === 200) ? (string) $corps : null, $maxAge];
    }
}

/**
 * Les comptes Nihonjo (table `utilisateur`) — sur le modèle d'Odyvresse :
 * on **s'inscrit** (« Créer un compte »), puis on **se connecte**. Se
 * connecter avec une identité qui n'a pas encore de compte répond
 * `compte_inexistant` (404) au lieu d'en créer un en silence ; l'interface
 * propose alors de le créer.
 *
 * Une identité = ce que donne le fournisseur : `sub` (uid Firebase, ou
 * « discord:<id> », ou « dev:<adresse> »), `email`, `name`, `picture`,
 * `fournisseur` (google, discord, dev).
 *
 * Règles :
 * - identité connue → son compte (e-mail, nom du fournisseur et photo
 *   rafraîchis ; le **pseudo** choisi par l'utilisateur n'est jamais touché) ;
 * - inconnue, et le compte initial (id 1) pas encore réclamé → la première
 *   identité le réclame (connexion OU inscription) : elle retrouve les
 *   données d'avant les comptes, administratrice. Si `administrateurs` est
 *   renseigné, seule une de ces adresses peut le réclamer ;
 * - inconnue sinon : inscription → nouveau compte « membre »
 *   (administrateur si son adresse est dans `administrateurs`) ;
 *   connexion → `compte_inexistant`.
 *
 * Toutes les requêtes sur les comptes sont ici (pas dans Depot, qui reçoit
 * le compte tout fait). Celles qui comptent les mots d'un compte filtrent
 * explicitement par son id.
 */
final class Comptes
{
    public const LONGUEUR_PSEUDO = 40;
    private const COLONNES = 'id, uid, email, nom, pseudo, photo, fournisseur, role, cree_le, vu_le';

    /**
     * @param array<string, mixed> $identite sub, email, name, picture, fournisseur
     * @param string[] $administrateurs adresses promues administrateur
     * @param bool $creer inscription : crée le compte s'il n'existe pas
     * @param bool|null $nouveau (sortie) le compte vient-il d'être créé ou réclamé ?
     */
    public static function pourIdentite(PDO $pdo, array $identite, array $administrateurs, bool $creer = false, ?bool &$nouveau = null): array
    {
        $nouveau = false;
        $uid = (string) $identite['sub'];
        $email = mb_strtolower(trim((string) ($identite['email'] ?? '')));
        $nom = trim((string) ($identite['name'] ?? ''));
        if ($nom === '') {
            $nom = $email !== '' ? explode('@', $email)[0] : 'Sans nom';
        }
        $nom = mb_substr($nom, 0, 80);
        $photo = self::urlPhoto((string) ($identite['picture'] ?? ''));
        $fournisseur = (string) ($identite['fournisseur'] ?? 'google');
        $admins = array_map(function ($a) { return mb_strtolower(trim((string) $a)); }, $administrateurs);
        $estAdminConfig = $email !== '' && in_array($email, $admins, true);

        $req = $pdo->prepare('SELECT id FROM utilisateur WHERE uid = ?');
        $req->execute([$uid]);
        $id = $req->fetchColumn();
        if ($id !== false) {
            $pdo->prepare("UPDATE utilisateur SET email = ?, nom = ?, photo = ?, fournisseur = ?, vu_le = datetime('now')" . ($estAdminConfig ? ", role = 'admin'" : '') . ' WHERE id = ?')
                ->execute([$email, $nom, $photo, $fournisseur, $id]);
            return self::lire($pdo, (int) $id);
        }

        $pdo->exec('BEGIN IMMEDIATE');
        try {
            // Deux premières requêtes simultanées du même compte : la seconde
            // attend le verrou, puis trouve le compte créé par la première.
            $req->execute([$uid]);
            $deja = $req->fetchColumn();
            if ($deja !== false) {
                $pdo->exec('COMMIT');
                return self::lire($pdo, (int) $deja);
            }
            $initial = $pdo->query('SELECT id FROM utilisateur WHERE id = 1 AND uid IS NULL')->fetchColumn();
            if ($initial !== false && (!$admins || $estAdminConfig)) {
                $pdo->prepare("UPDATE utilisateur SET uid = ?, email = ?, nom = ?, photo = ?, fournisseur = ?, role = 'admin', vu_le = datetime('now') WHERE id = 1")
                    ->execute([$uid, $email, $nom, $photo, $fournisseur]);
                $id = 1;
            } elseif (!$creer) {
                $pdo->exec('COMMIT');
                throw new ErreurApi(
                    ($email !== '' ? "Aucun compte Nihonjo pour $email." : 'Aucun compte Nihonjo pour cette identité.') . ' Créez-le : un clic suffit.',
                    404, 'compte_inexistant', ['email' => $email, 'nom' => $nom, 'fournisseur' => $fournisseur]
                );
            } else {
                $pdo->prepare("INSERT INTO utilisateur (uid, email, nom, photo, fournisseur, role, vu_le) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))")
                    ->execute([$uid, $email, $nom, $photo, $fournisseur, $estAdminConfig ? 'admin' : 'membre']);
                $id = (int) $pdo->lastInsertId();
            }
            $pdo->exec('COMMIT');
        } catch (ErreurApi $e) {
            throw $e;
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            throw $e;
        }
        $nouveau = true;
        return self::lire($pdo, $id);
    }

    /** Seules les adresses https sont gardées (une photo est affichée telle quelle dans <img>). */
    private static function urlPhoto(string $url): string
    {
        return (strpos($url, 'https://') === 0 && strlen($url) <= 500) ? $url : '';
    }

    public static function lire(PDO $pdo, int $id): array
    {
        $req = $pdo->prepare('SELECT ' . self::COLONNES . ' FROM utilisateur WHERE id = ?');
        $req->execute([$id]);
        $compte = $req->fetch();
        if (!$compte) {
            throw new ErreurApi('Ce compte n\'existe plus : reconnectez-vous.', 401);
        }
        return self::formater($compte);
    }

    private static function formater(array $c): array
    {
        $c['id'] = (int) $c['id'];
        $c['pseudo'] = $c['pseudo'] === null ? null : (string) $c['pseudo'];
        // Le nom affiché partout : le pseudo choisi, sinon celui du fournisseur.
        $c['nom_affiche'] = ($c['pseudo'] !== null && $c['pseudo'] !== '') ? $c['pseudo'] : (string) $c['nom'];
        return $c;
    }

    /**
     * Le compte d'une session (Discord), sans fournisseur à consulter : null
     * s'il n'existe plus ou n'est plus le même. ⚠️ L'uid est comparé, pas
     * seulement l'id : SQLite peut redonner l'id d'un compte supprimé à un
     * nouveau compte, et une vieille session ouvrirait alors celui d'un autre.
     */
    public static function deSession(PDO $pdo, int $id, string $uid): ?array
    {
        $req = $pdo->prepare('SELECT id FROM utilisateur WHERE id = ? AND uid = ?');
        $req->execute([$id, $uid]);
        if ($req->fetchColumn() === false) {
            return null;
        }
        $pdo->prepare("UPDATE utilisateur SET vu_le = datetime('now') WHERE id = ?")->execute([$id]);
        return self::lire($pdo, $id);
    }

    /** Pseudo choisi ; vide = revenir au nom du fournisseur. */
    public static function modifierPseudo(PDO $pdo, int $id, string $pseudo): array
    {
        $pseudo = trim((string) preg_replace('/\s+/u', ' ', $pseudo));
        if (preg_match('/[\x00-\x1F\x7F<>]/u', $pseudo)) {
            throw new ErreurApi('Le pseudo contient des caractères non admis.');
        }
        if (mb_strlen($pseudo) > self::LONGUEUR_PSEUDO) {
            throw new ErreurApi('Le pseudo fait ' . self::LONGUEUR_PSEUDO . ' caractères au plus.');
        }
        $pdo->prepare('UPDATE utilisateur SET pseudo = ? WHERE id = ?')->execute([$pseudo === '' ? null : $pseudo, $id]);
        return self::lire($pdo, $id);
    }

    /** Ce que la page « Mon compte » montre : le compte et ce qu'il contient. */
    public static function profil(PDO $pdo, int $id): array
    {
        $compte = self::lire($pdo, $id);
        unset($compte['uid']);
        return $compte + ['contenu' => self::contenu($pdo, $id)];
    }

    /** Ce qu'un compte possède — chaque requête filtrée par CE compte. */
    private static function contenu(PDO $pdo, int $id): array
    {
        $un = function (string $sql) use ($pdo, $id): int {
            $req = $pdo->prepare($sql);
            $req->execute([$id]);
            return (int) $req->fetchColumn();
        };
        return [
            'mots'       => $un('SELECT COUNT(*) FROM mot WHERE proprietaire_id = ?'),
            'chapitres'  => $un('SELECT COUNT(*) FROM chapitre WHERE proprietaire_id = ?'),
            'acquis'     => $un("SELECT COUNT(*) FROM progression WHERE utilisateur_id = ? AND statut = 'acquis'"),
            'a_revoir'   => $un("SELECT COUNT(*) FROM progression WHERE utilisateur_id = ? AND statut = 'a revoir'"),
            'en_cours'   => $un("SELECT COUNT(*) FROM progression WHERE utilisateur_id = ? AND statut = 'en cours'"),
            'kana_acquis' => $un('SELECT COUNT(*) FROM kana_progression WHERE utilisateur_id = ? AND nb_reussites > nb_echecs'),
            'kanji_acquis' => $un("SELECT COUNT(*) FROM kanji_progression WHERE utilisateur_id = ? AND statut = 'acquis'"),
        ];
    }

    /** Tous les comptes, pour l'administrateur (« Gérer les comptes »). */
    public static function lister(PDO $pdo): array
    {
        $comptes = [];
        foreach ($pdo->query('SELECT ' . self::COLONNES . ' FROM utilisateur ORDER BY COALESCE(vu_le, cree_le) DESC, id') as $c) {
            $c = self::formater($c);
            unset($c['uid']);
            $c['reclame'] = $c['fournisseur'] !== null;
            $c['contenu'] = self::contenu($pdo, $c['id']);
            $comptes[] = $c;
        }
        return $comptes;
    }

    public static function changerRole(PDO $pdo, int $id, string $role): array
    {
        if (!in_array($role, ['membre', 'admin'], true)) {
            throw new ErreurApi("Rôle inconnu : « $role ».");
        }
        $compte = self::lire($pdo, $id);
        if ($compte['role'] === 'admin' && $role === 'membre') {
            self::exigerAutreAdmin($pdo, $id, 'retirer le rôle d\'administrateur');
        }
        $pdo->prepare('UPDATE utilisateur SET role = ? WHERE id = ?')->execute([$role, $id]);
        return self::lire($pdo, $id);
    }

    /**
     * Supprime un compte et TOUT ce qui lui appartient : ses mots, ses
     * chapitres, sa progression, ses kana, ses réglages (ON DELETE CASCADE
     * sur `utilisateur`, foreign_keys = ON par Base::ouvrir). Le cours et
     * les autres comptes ne sont pas touchés. Le compte Google ou Discord
     * lui-même n'est pas concerné (il sert aussi à Odyvresse).
     */
    public static function supprimer(PDO $pdo, int $id): array
    {
        $compte = self::lire($pdo, $id);
        if ($compte['role'] === 'admin') {
            self::exigerAutreAdmin($pdo, $id, 'supprimer ce compte');
        }
        $contenu = self::contenu($pdo, $id);
        $pdo->prepare('DELETE FROM utilisateur WHERE id = ?')->execute([$id]);
        return ['id' => $id, 'supprime' => $contenu];
    }

    /** Il reste toujours au moins un administrateur. */
    private static function exigerAutreAdmin(PDO $pdo, int $id, string $quoi): void
    {
        $req = $pdo->prepare("SELECT COUNT(*) FROM utilisateur WHERE role = 'admin' AND id <> ?");
        $req->execute([$id]);
        if ((int) $req->fetchColumn() === 0) {
            throw new ErreurApi("Impossible de $quoi : c'est le dernier administrateur. Nommez-en un autre d'abord.", 409, 'dernier_admin');
        }
    }
}

/**
 * Petits jetons signés (HMAC-SHA256) portés par un cookie : la session d'un
 * compte connecté par Discord, et l'aller-retour OAuth2 (état anti-rejeu,
 * identité en attente d'inscription).
 *
 * Pourquoi pas les sessions PHP : sur un mutualisé, leur ramasse-miettes
 * (`session.gc_maxlifetime`, 24 min par défaut, parfois partagé) efface une
 * connexion qu'on voudrait garder des semaines. Un jeton signé ne dépend
 * d'aucun stockage : la clé secrète vit dans `data/` (interdit au web),
 * créée au premier besoin.
 */
final class JetonsSignes
{
    /** @var string */
    private $cle;

    public function __construct(string $cle)
    {
        $this->cle = $cle;
    }

    public static function depuisFichier(string $chemin): self
    {
        $cle = is_file($chemin) ? (string) file_get_contents($chemin) : '';
        if (strlen($cle) < 32) {
            $cle = bin2hex(random_bytes(32));
            if (@file_put_contents($chemin, $cle, LOCK_EX) === false) {
                throw new RuntimeException("Impossible d'écrire la clé des sessions : $chemin");
            }
            @chmod($chemin, 0600);
        }
        return new self($cle);
    }

    /** @param array<string, mixed> $charge */
    public function signer(array $charge, int $duree): string
    {
        $charge['exp'] = time() + $duree;
        $corps = rtrim(strtr(base64_encode((string) json_encode($charge, JSON_UNESCAPED_UNICODE)), '+/', '-_'), '=');
        return $corps . '.' . hash_hmac('sha256', $corps, $this->cle);
    }

    /** @return array<string, mixed>|null la charge, si la signature est bonne et la date pas passée */
    public function lire(string $jeton): ?array
    {
        $morceaux = explode('.', $jeton);
        if (count($morceaux) !== 2 || !hash_equals(hash_hmac('sha256', $morceaux[0], $this->cle), $morceaux[1])) {
            return null;
        }
        $charge = json_decode(VerificateurJetonFirebase::base64url($morceaux[0]), true);
        if (!is_array($charge) || (int) ($charge['exp'] ?? 0) < time()) {
            return null;
        }
        return $charge;
    }
}

/** Les cookies de Nihonjo : HttpOnly, SameSite=Lax, Secure en HTTPS. */
final class Cookies
{
    public const SESSION = 'nihonjo_session';     // compte connecté par Discord (30 jours)
    public const DISCORD = 'nihonjo_discord';     // aller-retour OAuth2 (10 minutes)
    public const ATTENTE = 'nihonjo_attente';     // identité Discord sans compte, en attente d'inscription (15 minutes)

    public static function poser(string $nom, string $valeur, int $duree): void
    {
        // Tests en ligne de commande (sortie déjà écrite) : pas d'en-tête
        // possible, seule la copie en mémoire ($_COOKIE) compte.
        if (!headers_sent()) {
            self::envoyer($nom, $valeur, $duree);
        }
        if ($duree > 0) {
            $_COOKIE[$nom] = $valeur;
        } else {
            unset($_COOKIE[$nom]);
        }
    }

    private static function envoyer(string $nom, string $valeur, int $duree): void
    {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        setcookie($nom, $valeur, [
            'expires'  => $duree > 0 ? time() + $duree : time() - 3600,
            'path'     => '/',
            'secure'   => $https,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    public static function effacer(string $nom): void
    {
        if (isset($_COOKIE[$nom])) {
            self::poser($nom, '', 0);
        }
    }

    public static function lire(string $nom): string
    {
        return (string) ($_COOKIE[$nom] ?? '');
    }
}

/**
 * Connexion par Discord (OAuth2, « authorization code »), comme Odyvresse
 * (deckolector : passport-discord, droits `identify email`). Active seulement
 * si `discord.client_id` et `discord.client_secret` sont renseignés
 * (`api/config.local.php` en ligne, `.env` lu par Docker en local).
 *
 * Les deux étapes passent par `api/discord.php` (des redirections, pas du
 * JSON) : aller `discord.php?intention=…` → page Discord, avec un `state`
 * signé gardé dans un cookie ; retour `discord.php?code=…&state=…` → échange
 * du code contre un jeton d'accès → profil `/users/@me` → identité
 * « discord:<id> ».
 *
 * ⚠️ L'adresse de retour est un FICHIER sans paramètre (`…/api/discord.php`)
 * parce que Discord compare l'adresse de retour octet pour octet à celles
 * déclarées dans le portail développeur : une adresse à `?action=` est une
 * source d'erreurs « Invalid OAuth2 redirect_uri ».
 */
final class ConnexionDiscord
{
    public const URL_AUTORISATION = 'https://discord.com/oauth2/authorize';
    public const URL_JETON = 'https://discord.com/api/oauth2/token';
    public const URL_PROFIL = 'https://discord.com/api/users/@me';

    /** @var string */
    private $clientId;
    /** @var string */
    private $secret;
    /** @var string */
    private $retour;
    /** @var callable(string, string, array, ?string): array{0:int, 1:string} méthode, url, en-têtes, corps → [code HTTP, corps] */
    private $http;

    public function __construct(string $clientId, string $secret, string $retour, ?callable $http = null)
    {
        $this->clientId = $clientId;
        $this->secret = $secret;
        $this->retour = $retour;
        $this->http = $http ?? [self::class, 'requete'];
    }

    public static function configuree(array $config): bool
    {
        return trim((string) ($config['discord']['client_id'] ?? '')) !== '' && trim((string) ($config['discord']['client_secret'] ?? '')) !== '';
    }

    public static function depuisConfig(array $config, ?callable $http = null): self
    {
        if (!self::configuree($config)) {
            throw new ErreurApi("La connexion Discord n'est pas configurée sur ce serveur.", 404, 'discord_absent');
        }
        $retour = trim((string) ($config['discord']['retour'] ?? ''));
        return new self(trim((string) $config['discord']['client_id']), trim((string) $config['discord']['client_secret']), $retour !== '' ? $retour : self::retourParDefaut(), $http);
    }

    /**
     * L'adresse de retour déduite de la requête : <origine>/api/discord.php
     * (http://localhost:8080/api/discord.php en local,
     * https://nihonjo.odyvresse.com/api/discord.php en ligne) — à déclarer
     * telle quelle dans le portail Discord (OAuth2 → Redirects).
     */
    public static function retourParDefaut(): string
    {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $hote = (string) ($_SERVER['HTTP_HOST'] ?? 'localhost');
        $dossier = rtrim(str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/api/discord.php'))), '/');
        return ($https ? 'https' : 'http') . '://' . $hote . $dossier . '/discord.php';
    }

    public function urlAutorisation(string $etat): string
    {
        return self::URL_AUTORISATION . '?' . http_build_query([
            'response_type' => 'code',
            'client_id'     => $this->clientId,
            'scope'         => 'identify email',
            'redirect_uri'  => $this->retour,
            'state'         => $etat,
            'prompt'        => 'none',
        ], '', '&', PHP_QUERY_RFC3986);
    }

    /** @return array<string, mixed> l'identité (sub, email, name, picture, fournisseur) */
    public function identite(string $code): array
    {
        [$statut, $corps] = ($this->http)('POST', self::URL_JETON, ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json'], http_build_query([
            'grant_type'    => 'authorization_code',
            'code'          => $code,
            'redirect_uri'  => $this->retour,
            'client_id'     => $this->clientId,
            'client_secret' => $this->secret,
        ]));
        $jeton = json_decode($corps, true);
        if ($statut !== 200 || !is_array($jeton) || empty($jeton['access_token'])) {
            throw new RuntimeException("Discord a refusé le code de connexion (HTTP $statut).");
        }
        [$statut, $corps] = ($this->http)('GET', self::URL_PROFIL, ['Authorization: Bearer ' . $jeton['access_token'], 'Accept: application/json'], null);
        $profil = json_decode($corps, true);
        if ($statut !== 200 || !is_array($profil) || empty($profil['id'])) {
            throw new RuntimeException("Profil Discord illisible (HTTP $statut).");
        }
        $id = (string) $profil['id'];
        return [
            'sub'         => 'discord:' . $id,
            // Une adresse non vérifiée chez Discord n'est pas gardée : elle
            // pourrait être celle d'un autre (et donner un rôle d'administrateur).
            'email'       => !empty($profil['verified']) ? (string) ($profil['email'] ?? '') : '',
            'name'        => (string) ($profil['global_name'] ?? '') !== '' ? (string) $profil['global_name'] : (string) ($profil['username'] ?? ''),
            'picture'     => !empty($profil['avatar']) ? 'https://cdn.discordapp.com/avatars/' . rawurlencode($id) . '/' . rawurlencode((string) $profil['avatar']) . '.png?size=128' : '',
            'fournisseur' => 'discord',
        ];
    }

    /** @return array{0:int, 1:string} */
    private static function requete(string $methode, string $url, array $entetes, ?string $corps): array
    {
        if (function_exists('curl_init')) {
            $c = curl_init($url);
            curl_setopt_array($c, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_TIMEOUT        => 10,
                CURLOPT_HTTPHEADER     => $entetes,
                CURLOPT_CUSTOMREQUEST  => $methode,
            ]);
            if ($corps !== null) {
                curl_setopt($c, CURLOPT_POSTFIELDS, $corps);
            }
            $reponse = curl_exec($c);
            $code = (int) curl_getinfo($c, CURLINFO_HTTP_CODE);
            curl_close($c);
            return [$code, $reponse === false ? '' : (string) $reponse];
        }
        $contexte = stream_context_create(['http' => [
            'method' => $methode, 'header' => implode("\r\n", $entetes), 'content' => (string) $corps,
            'timeout' => 10, 'ignore_errors' => true,
        ]]);
        $reponse = @file_get_contents($url, false, $contexte);
        $code = 0;
        foreach (isset($http_response_header) ? $http_response_header : [] as $ligne) {
            if (preg_match('#^HTTP/\S+\s+(\d{3})#', $ligne, $m)) {
                $code = (int) $m[1];
            }
        }
        return [$code, $reponse === false ? '' : (string) $reponse];
    }
}

/** Choisit le mode d'authentification et identifie le compte de la requête. */
final class Authentification
{
    /** Durée de la session d'un compte connecté par Discord. */
    public const DUREE_SESSION = 30 * 86400;

    /**
     * `firebase` (défaut : comptes Google par Firebase, et Discord s'il est
     * configuré), `aucune` (un seul compte, le compte initial : poste sans
     * réseau) ou `dev` (tests automatiques).
     *
     * ⚠️ `dev` ne s'active QUE par la variable d'environnement NIHONJO_AUTH :
     * il croit l'adresse envoyée par le client. Aucun fichier de l'hébergement
     * ne peut donc l'allumer par mégarde.
     */
    public static function mode(array $config): string
    {
        $env = getenv('NIHONJO_AUTH');
        if ($env === 'dev' || $env === 'aucune') {
            return $env;
        }
        $mode = (string) ($config['authentification'] ?? 'firebase');
        return in_array($mode, ['firebase', 'aucune'], true) ? $mode : 'firebase';
    }

    /** Ce que l'écran de connexion doit proposer (action publique `sante`). */
    public static function pourInterface(array $config, string $mode): array
    {
        return [
            'mode'         => $mode,
            'firebase'     => $mode === 'firebase' ? $config['firebase'] : null,
            'fournisseurs' => [
                'google'  => $mode === 'firebase',
                'discord' => $mode === 'firebase' && ConnexionDiscord::configuree($config),
            ],
        ];
    }

    public static function jetons(array $config): JetonsSignes
    {
        return JetonsSignes::depuisFichier((string) $config['chemin_secret']);
    }

    /**
     * Le compte de la requête. Connexion seulement : une identité sans compte
     * → `compte_inexistant` (404) ; l'inscription passe par `inscrire`.
     */
    public static function utilisateur(PDO $pdo, array $config, string $mode): array
    {
        if ($mode === 'aucune') {
            return Comptes::lire($pdo, 1);
        }
        $identite = self::identiteDeLaRequete($config, $mode, false);
        if ($identite !== null) {
            return Comptes::pourIdentite($pdo, $identite, $config['administrateurs'] ?? []);
        }
        // Compte connecté par Discord : un cookie de session signé.
        if ($mode === 'firebase' && Cookies::lire(Cookies::SESSION) !== '') {
            $charge = self::jetons($config)->lire(Cookies::lire(Cookies::SESSION));
            if ($charge !== null && ($charge['t'] ?? '') === 'session' && isset($charge['c'], $charge['u'])) {
                $compte = Comptes::deSession($pdo, (int) $charge['c'], (string) $charge['u']);
                if ($compte !== null) {
                    return $compte;
                }
            }
            Cookies::effacer(Cookies::SESSION);
        }
        throw new ErreurApi('Connexion requise.', 401);
    }

    /**
     * Inscription (`compte.creer`) : l'identité de la requête — jeton
     * Firebase, adresse du mode dev, ou identité Discord en attente — devient
     * un compte (ou retrouve le sien s'il existait déjà).
     * @return array{compte: array, nouveau: bool}
     */
    public static function inscrire(PDO $pdo, array $config, string $mode): array
    {
        if ($mode === 'aucune') {
            return ['compte' => Comptes::lire($pdo, 1), 'nouveau' => false];
        }
        $identite = self::identiteDeLaRequete($config, $mode, true);
        if ($identite === null) {
            throw new ErreurApi('Connectez-vous à Google ou à Discord avant de créer le compte.', 401);
        }
        $nouveau = false;
        $compte = Comptes::pourIdentite($pdo, $identite, $config['administrateurs'] ?? [], true, $nouveau);
        if (($identite['fournisseur'] ?? '') === 'discord') {
            self::ouvrirSession($config, $compte);
            Cookies::effacer(Cookies::ATTENTE);
        }
        return ['compte' => $compte, 'nouveau' => $nouveau];
    }

    /** @return array<string, mixed>|null */
    private static function identiteDeLaRequete(array $config, string $mode, bool $avecAttente): ?array
    {
        if ($mode === 'dev') {
            $email = trim((string) ($_SERVER['HTTP_X_NIHONJO_DEV_EMAIL'] ?? ''));
            if ($email === '') {
                throw new ErreurApi('Connexion requise.', 401);
            }
            return ['sub' => 'dev:' . $email, 'email' => $email, 'name' => explode('@', $email)[0], 'fournisseur' => 'dev'];
        }
        $jeton = trim((string) ($_SERVER['HTTP_X_NIHONJO_JETON'] ?? ''));
        if ($jeton !== '') {
            $projet = (string) ($config['firebase']['projectId'] ?? '');
            if ($projet === '') {
                throw new RuntimeException("Firebase n'est pas configuré (api/config.php, clé firebase.projectId).");
            }
            $cache = (string) $config['chemin_certificats'];
            $verificateur = new VerificateurJetonFirebase($projet, function () use ($cache) {
                return VerificateurJetonFirebase::certificatsGoogle($cache);
            });
            return ['fournisseur' => 'google'] + $verificateur->verifier($jeton);
        }
        if ($avecAttente && Cookies::lire(Cookies::ATTENTE) !== '') {
            $charge = self::jetons($config)->lire(Cookies::lire(Cookies::ATTENTE));
            if ($charge !== null && ($charge['t'] ?? '') === 'attente' && is_array($charge['identite'] ?? null)) {
                return $charge['identite'];
            }
        }
        return null;
    }

    /** @param array $compte le compte (id et uid) */
    public static function ouvrirSession(array $config, array $compte): void
    {
        $charge = ['t' => 'session', 'c' => (int) $compte['id'], 'u' => (string) $compte['uid']];
        Cookies::poser(Cookies::SESSION, self::jetons($config)->signer($charge, self::DUREE_SESSION), self::DUREE_SESSION);
    }

    /** `deconnexion` : la session Discord (le navigateur ferme lui-même celle de Firebase). */
    public static function deconnecter(): void
    {
        Cookies::effacer(Cookies::SESSION);
        Cookies::effacer(Cookies::ATTENTE);
    }

    // ----- Discord : l'aller et le retour (api/discord.php, des redirections) -----

    /** La racine de l'application (« / » ou « /nihonjo/ »), d'après le script appelé dans api/. */
    public static function racine(): string
    {
        return rtrim(str_replace('\\', '/', dirname(dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/api/index.php')))), '/') . '/';
    }

    /** L'adresse de l'écran de connexion avec une raison (un code, jamais une donnée personnelle). */
    public static function versConnexion(string $raison): string
    {
        return self::racine() . '#/connexion?discord=' . rawurlencode($raison);
    }

    /** Aller : `discord.php?intention=connexion|inscription` → adresse de la page Discord. */
    public static function debutDiscord(array $config, string $intention, ?callable $http = null): string
    {
        $discord = ConnexionDiscord::depuisConfig($config, $http);
        $etat = bin2hex(random_bytes(16));
        $intention = $intention === 'inscription' ? 'inscription' : 'connexion';
        Cookies::poser(Cookies::DISCORD, self::jetons($config)->signer(['t' => 'discord', 'etat' => $etat, 'intention' => $intention], 600), 600);
        return $discord->urlAutorisation($etat);
    }

    /**
     * Retour : `discord.php?code=…&state=…` → l'adresse de l'application où revenir :
     * `#/reviser` connecté, ou `#/connexion?discord=<raison>` sinon
     * (refuse, inexistant, expire, erreur). Les raisons sont des codes, jamais
     * une donnée personnelle dans l'adresse.
     */
    public static function retourDiscord(PDO $pdo, array $config, array $get, ?callable $http = null): string
    {
        $vers = function (string $raison): string { return self::versConnexion($raison); };
        $aller = self::jetons($config)->lire(Cookies::lire(Cookies::DISCORD));
        Cookies::effacer(Cookies::DISCORD);
        if (isset($get['error'])) {
            return $vers('refuse');
        }
        if ($aller === null || ($aller['t'] ?? '') !== 'discord' || !hash_equals((string) $aller['etat'], (string) ($get['state'] ?? ''))) {
            return $vers('expire');
        }
        try {
            $identite = ConnexionDiscord::depuisConfig($config, $http)->identite((string) ($get['code'] ?? ''));
            $nouveau = false;
            $compte = Comptes::pourIdentite($pdo, $identite, $config['administrateurs'] ?? [], $aller['intention'] === 'inscription', $nouveau);
        } catch (ErreurApi $e) {
            if ($e->codeErreur === 'compte_inexistant' && isset($identite)) {
                Cookies::poser(Cookies::ATTENTE, self::jetons($config)->signer(['t' => 'attente', 'identite' => $identite], 900), 900);
                return $vers('inexistant');
            }
            error_log('[nihonjo] retour Discord : ' . $e->getMessage());
            return $vers('erreur');
        } catch (Throwable $e) {
            error_log('[nihonjo] retour Discord : ' . $e);
            return $vers('erreur');
        }
        self::ouvrirSession($config, $compte);
        Cookies::effacer(Cookies::ATTENTE);
        return self::racine() . ($nouveau ? '#/reviser?bienvenue=1' : '#/reviser');
    }

    /**
     * `discord.attente` : l'identité Discord en attente d'inscription (nom,
     * photo), pour que l'écran « Créer le compte » dise de qui il s'agit. Le
     * cookie est HttpOnly : le navigateur ne peut pas la lire lui-même.
     */
    public static function attenteDiscord(array $config): ?array
    {
        if (Cookies::lire(Cookies::ATTENTE) === '') {
            return null;
        }
        $charge = self::jetons($config)->lire(Cookies::lire(Cookies::ATTENTE));
        if ($charge === null || ($charge['t'] ?? '') !== 'attente' || !is_array($charge['identite'] ?? null)) {
            return null;
        }
        $i = $charge['identite'];
        return ['nom' => (string) ($i['name'] ?? ''), 'email' => (string) ($i['email'] ?? ''), 'photo' => (string) ($i['picture'] ?? ''), 'fournisseur' => 'discord'];
    }
}
