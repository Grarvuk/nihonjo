<?php
declare(strict_types=1);

/**
 * Erreur destinée à l'utilisateur : son message est affiché tel quel dans
 * l'interface (toast). Toute autre exception est une panne (HTTP 500).
 */
final class ErreurApi extends RuntimeException
{
    /** @var int */
    public $statutHttp;
    /** @var string|null code lisible par l'interface (ex. « compte_inexistant ») */
    public $codeErreur;
    /** @var array<string, mixed> précisions pour l'interface (jamais de secret) */
    public $details;

    public function __construct(string $message, int $statutHttp = 400, ?string $codeErreur = null, array $details = [])
    {
        parent::__construct($message);
        $this->statutHttp = $statutHttp;
        $this->codeErreur = $codeErreur;
        $this->details = $details;
    }
}

/**
 * Toutes les lectures et écritures du vocabulaire, POUR UN COMPTE. Aucune
 * requête SQL ailleurs (sauf l'identification des comptes, dans
 * Authentification.php, et l'amorce).
 *
 * Ce que voit le compte U :
 *   - les mots du cours (`proprietaire_id IS NULL`) et ses mots à lui ;
 *   - les chapitres du cours et ses chapitres à lui ;
 *   - SA progression.
 * Ce qu'il peut modifier : ce qui est à lui ; le cours seulement s'il est
 * administrateur.
 *
 * ⚠️ Toute nouvelle requête qui lit `mot`, `chapitre`, `mot_chapitre` ou
 * `progression` doit porter le filtre du compte (VISIBLE_MOT,
 * VISIBLE_CHAPITRE, `utilisateur_id = :u`). Un oubli ne lève aucune erreur :
 * il montre les mots d'un autre.
 *
 * Syntaxe volontairement compatible PHP 7.4 (pas de match, pas de types
 * union, pas de propriétés readonly) : la version de PHP de l'hébergement
 * OVH n'a pas été relevée (voir carnet_agent/en_suspens.md).
 */
final class Depot
{
    public const STATUTS = ['non acquis', 'en cours', 'a revoir', 'acquis'];
    /**
     * Ce que demande l'exercice (`progression.resultat`, champ `niveau`) :
     * reconnaître parmi des propositions, retrouver le sens, écrire le japonais.
     */
    public const NIVEAUX = ['reconnaissance', 'rappel', 'production'];
    /** Réussites de suite (rappel ou production) pour qu'un mot soit « acquis » (José, 25/10 au soir). */
    public const SERIE_POUR_ACQUIS = 2;
    /**
     * L'état CALCULÉ (jamais écrit en base) d'un mot acquis dont la date
     * `prochaine_revision` est arrivée : appris il y a longtemps, à revoir
     * pour qu'il tienne. Renvoyé dans `progression.statut` par lireMots.
     */
    public const ETAT_A_RAFRAICHIR = 'a rafraichir';
    /**
     * Les curseurs de « à rafraîchir » : jours entre la dernière validation
     * d'un mot acquis et son retour, selon le nombre de fois qu'il a déjà été
     * rafraîchi avec succès (0 → 7 jours, 1 → 15, 2 → 30, 3 → 60, puis 120).
     * Un échec le fait retomber « à revoir » et tout recommence.
     */
    private const DELAIS_RAFRAICHIR = [7, 15, 30, 60, 120];
    /** Les colonnes de paliers que `ecrireProgression` sait écrire. */
    private const CHAMPS_PALIERS = ['statut', 'serie', 'production', 'acquis_le', 'valide_le', 'rafraichissements', 'prochaine_revision'];
    /**
     * « Mes mots » : le chapitre que CHAQUE compte possède (clé mes_mots@<id>)
     * et qui contient TOUS ses mots, quoi qu'envoie le navigateur
     * (`lierMesMots`). Il ne se renomme ni ne se supprime. Jusqu'au schéma v3
     * il s'appelait « personnel » : ce nom reste compris à l'import.
     */
    public const CHAPITRE_PAR_DEFAUT = 'mes_mots';
    public const ANCIEN_CHAPITRE_PAR_DEFAUT = 'personnel';
    public const CATEGORIE_PAR_DEFAUT = 'Personnel';
    /** Au-delà, un import ou un ajout en lot est refusé (garde-fou, pas une limite pédagogique). */
    public const MAX_LOT = 5000;

    /**
     * Les préférences gardées dans la base pour le compte (plus rien dans le
     * navigateur depuis le 23/10/2026). Une clé hors de cette liste est
     * refusée : la table ne doit pas devenir un fourre-tout.
     */
    public const CLES_PREFERENCES = [
        'chapitres_coches', // { cléChapitre: false } — un chapitre absent est coché
        'filtres',          // thème, état, limite de l'accueil
        'filtres_lexique',
        'ecriture',         // répétitions, mode difficile
        'theme',            // « clair » / « sombre »
        'kana_alphabet',
        'jeu_kana',
        'kanji_niveau',     // la page « Kanji » : niveau affiché
        'jeu_kanji',        // réglages du jeu des kanjis
        'dernier_mode',
        'migration_v1',     // bilan de la reprise de l'ancienne version
    ];
    public const TAILLE_MAX_PREFERENCE = 65536;
    public const THEMATIQUE_PAR_DEFAUT = 'indéterminé';

    /** Fragments SQL de visibilité ; le paramètre nommé :u est l'id du compte. */
    private const VISIBLE_MOT = '(m.proprietaire_id IS NULL OR m.proprietaire_id = :u)';
    private const VISIBLE_CHAPITRE = '(c.proprietaire_id IS NULL OR c.proprietaire_id = :u)';

    /** @var PDO */
    private $pdo;
    /** @var array{id: int, role: string, email: string, nom: string} */
    private $compte;
    /** @var int */
    private $u;
    /** @var string|null jour fixé par les essais (`fixerJour`) */
    private $jourFixe = null;

    public function __construct(PDO $pdo, array $compte)
    {
        $this->pdo = $pdo;
        $this->compte = $compte;
        $this->u = (int) $compte['id'];
    }

    public function estAdmin(): bool
    {
        return ($this->compte['role'] ?? '') === 'admin';
    }

    private function exigerAdmin(string $quoi): void
    {
        if (!$this->estAdmin()) {
            throw new ErreurApi("Réservé à un administrateur : $quoi.", 403);
        }
    }

    // ------------------------------------------------------------------
    // Listes de variantes (colonnes JSON fr / jp_*)
    // ------------------------------------------------------------------

    /**
     * Accepte un tableau ou une chaîne « a && b » (la syntaxe de saisie de la
     * v1, encore utilisée par le formulaire) ; renvoie une liste propre :
     * valeurs taillées, vides retirées, doublons retirés, ordre conservé.
     * L'ordre compte : la PREMIÈRE variante est celle affichée en question.
     *
     * @param mixed $valeurs
     * @return string[]
     */
    public static function nettoyerListe($valeurs): array
    {
        if ($valeurs === null) {
            return [];
        }
        if (is_string($valeurs)) {
            $valeurs = explode('&&', $valeurs);
        }
        if (!is_array($valeurs)) {
            $valeurs = [$valeurs];
        }
        $propre = [];
        foreach ($valeurs as $v) {
            if (!is_scalar($v)) {
                continue;
            }
            $v = trim((string) $v);
            if ($v !== '' && !in_array($v, $propre, true)) {
                $propre[] = $v;
            }
        }
        return $propre;
    }

    /** @param mixed $valeurs */
    public static function encoderListe($valeurs): string
    {
        return json_encode(self::nettoyerListe($valeurs), JSON_UNESCAPED_UNICODE);
    }

    /** @return string[] */
    public static function decoderListe(?string $json): array
    {
        $liste = json_decode((string) $json, true);
        return is_array($liste) ? $liste : [];
    }

    /**
     * Nom technique d'un chapitre : la v1 remplaçait les espaces par « _ » et
     * affichait l'inverse. Même règle, pour que les exports v1 se rattachent.
     * Un suffixe « @12 » (clé d'un chapitre de compte, présente dans les
     * exports) est retiré : seul le nom voyage d'un compte à l'autre.
     */
    public static function nomTechniqueChapitre(string $nom): string
    {
        $nom = preg_replace('/@\d+$/', '', trim($nom));
        $nom = trim(preg_replace('/\s+/u', '_', $nom));
        if ($nom === '') {
            throw new ErreurApi('Le nom du chapitre est vide.');
        }
        if (strpos($nom, '@') !== false) {
            throw new ErreurApi('Le nom d’un chapitre ne peut pas contenir « @ ».');
        }
        if (mb_strlen($nom) > 80) {
            throw new ErreurApi('Le nom du chapitre dépasse 80 caractères.');
        }
        return $nom;
    }

    // ------------------------------------------------------------------
    // Lecture
    // ------------------------------------------------------------------

    /**
     * Tout ce dont l'interface a besoin, en une réponse : ~1 000 mots pèsent
     * ~300 Ko de JSON, et tous les filtres (chapitres, thème, état) se font
     * dans le navigateur, comme en v1. Pas de pagination côté serveur.
     */
    public function toutesLesDonnees(): array
    {
        $this->assurerMesMots();
        $categories = $this->pdo->query('SELECT id, nom, ordre FROM categorie ORDER BY ordre, nom')->fetchAll();
        foreach ($categories as &$cat) {
            $cat['id'] = (int) $cat['id'];
            $cat['ordre'] = (int) $cat['ordre'];
        }
        unset($cat);

        $req = $this->pdo->prepare(
            'SELECT c.id, c.nom, c.ordre, c.origine, c.proprietaire_id, cat.nom AS categorie,
                    (SELECT COUNT(*) FROM mot_chapitre mc JOIN mot m ON m.id = mc.mot_id
                      WHERE mc.chapitre_id = c.id AND ' . self::VISIBLE_MOT . ') AS nb_mots
               FROM chapitre c JOIN categorie cat ON cat.id = c.categorie_id
              WHERE ' . self::VISIBLE_CHAPITRE . '
              ORDER BY cat.ordre, cat.nom, c.ordre, c.nom'
        );
        $req->execute([':u' => $this->u]);
        $chapitres = array_map(function ($c) {
            return $this->formaterChapitre($c) + ['nb_mots' => (int) $c['nb_mots']];
        }, $req->fetchAll());

        $req = $this->pdo->prepare('SELECT kana, nb_reussites, nb_echecs, derniere_revision FROM kana_progression WHERE utilisateur_id = ?');
        $req->execute([$this->u]);
        $kana = [];
        foreach ($req as $l) {
            $kana[$l['kana']] = ['nb_reussites' => (int) $l['nb_reussites'], 'nb_echecs' => (int) $l['nb_echecs'], 'derniere_revision' => $l['derniere_revision']];
        }
        $req = $this->pdo->prepare('SELECT * FROM kanji_progression WHERE utilisateur_id = ?');
        $req->execute([$this->u]);
        $kanji = [];
        foreach ($req as $l) {
            $kanji[$l['kanji']] = self::formaterKanji($l);
        }

        return [
            'utilisateur' => $this->moi(),
            'categories'  => $categories,
            'chapitres'   => $chapitres,
            'mots'        => $this->lireMots(null),
            'kana'        => $kana,
            'kanji'       => (object) $kanji,
            // (object) : un tableau vide deviendrait « [] » en JSON, pas « {} ».
            'preferences' => (object) $this->lirePreferences(),
        ];
    }

    // ------------------------------------------------------------------
    // « Mes mots »
    // ------------------------------------------------------------------

    public function cleMesMots(): string
    {
        return self::CHAPITRE_PAR_DEFAUT . '@' . $this->u;
    }

    /**
     * Garantit que le compte a son chapitre « Mes mots » et que TOUS ses mots
     * y sont. Appelé au chargement (`toutesLesDonnees`) et avant chaque
     * écriture de mots : couvre un compte neuf, une base restaurée d'avant le
     * schéma v3, un mot rangé ailleurs par un vieux fichier.
     */
    public function assurerMesMots(): void
    {
        if ($this->u <= 0) {
            return;
        }
        $cle = $this->cleMesMots();
        if ($this->ligneChapitre($cle) === null) {
            $ancien = self::ANCIEN_CHAPITRE_PAR_DEFAUT . '@' . $this->u;
            if ($this->ligneChapitre($ancien) !== null) {
                // Liaisons reprises par ON UPDATE CASCADE.
                $this->pdo->prepare('UPDATE chapitre SET id = ?, nom = ? WHERE id = ?')->execute([$cle, self::CHAPITRE_PAR_DEFAUT, $ancien]);
            } else {
                $this->insererChapitre(self::CHAPITRE_PAR_DEFAUT, self::CATEGORIE_PAR_DEFAUT, $this->u);
            }
        }
        $manquants = $this->pdo->prepare(
            'SELECT COUNT(*) FROM mot m WHERE m.proprietaire_id = ?
               AND NOT EXISTS (SELECT 1 FROM mot_chapitre mc WHERE mc.mot_id = m.id AND mc.chapitre_id = ?)'
        );
        $manquants->execute([$this->u, $cle]);
        if ((int) $manquants->fetchColumn() > 0) {
            $this->pdo->prepare('INSERT OR IGNORE INTO mot_chapitre (mot_id, chapitre_id) SELECT id, ? FROM mot WHERE proprietaire_id = ?')
                ->execute([$cle, $this->u]);
        }
    }

    private function lierMesMots(int $motId): void
    {
        $this->pdo->prepare('INSERT OR IGNORE INTO mot_chapitre (mot_id, chapitre_id) VALUES (?, ?)')->execute([$motId, $this->cleMesMots()]);
    }

    /** « Mes mots », « mes mots », « Personnel »… : un nom qui désigne le chapitre par défaut. */
    public static function estNomReserve(string $nomTechnique): bool
    {
        return in_array(mb_strtolower($nomTechnique), [self::CHAPITRE_PAR_DEFAUT, self::ANCIEN_CHAPITRE_PAR_DEFAUT], true);
    }

    private function estMesMots(array $ligneChapitre): bool
    {
        return $ligneChapitre['nom'] === self::CHAPITRE_PAR_DEFAUT && $ligneChapitre['proprietaire_id'] !== null;
    }

    // ------------------------------------------------------------------
    // Préférences du compte
    // ------------------------------------------------------------------

    /** @return array<string, mixed> */
    public function lirePreferences(): array
    {
        $req = $this->pdo->prepare('SELECT cle, valeur FROM preference WHERE utilisateur_id = ?');
        $req->execute([$this->u]);
        $prefs = [];
        foreach ($req as $l) {
            $prefs[$l['cle']] = json_decode($l['valeur'], true);
        }
        return $prefs;
    }

    /** @param mixed $valeur n'importe quelle valeur JSON ; null efface la préférence */
    public function ecrirePreference(string $cle, $valeur): array
    {
        if (!in_array($cle, self::CLES_PREFERENCES, true)) {
            throw new ErreurApi("Préférence inconnue : « $cle ».");
        }
        if ($valeur === null) {
            $this->pdo->prepare('DELETE FROM preference WHERE utilisateur_id = ? AND cle = ?')->execute([$this->u, $cle]);
            return ['cle' => $cle];
        }
        $json = json_encode($valeur, JSON_UNESCAPED_UNICODE);
        if ($json === false || strlen($json) > self::TAILLE_MAX_PREFERENCE) {
            throw new ErreurApi('Préférence trop volumineuse ou illisible.');
        }
        // Pas d'UPSERT (SQLite 3.24 non garanti sur l'hébergement) : lire puis écrire.
        $existe = $this->pdo->prepare('SELECT 1 FROM preference WHERE utilisateur_id = ? AND cle = ?');
        $existe->execute([$this->u, $cle]);
        if ($existe->fetchColumn()) {
            $this->pdo->prepare("UPDATE preference SET valeur = ?, modifie_le = datetime('now') WHERE utilisateur_id = ? AND cle = ?")
                ->execute([$json, $this->u, $cle]);
        } else {
            $this->pdo->prepare('INSERT INTO preference (utilisateur_id, cle, valeur) VALUES (?, ?, ?)')->execute([$this->u, $cle, $json]);
        }
        return ['cle' => $cle];
    }

    /**
     * Le compte connecté, pour l'interface. `nom` est le nom AFFICHÉ (le
     * pseudo choisi, sinon celui de Google / Discord) ; `nom_fournisseur`
     * celui du fournisseur. Jamais l'uid.
     */
    public function moi(): array
    {
        $c = $this->compte;
        return [
            'id'              => $this->u,
            'nom'             => (string) ($c['nom_affiche'] ?? ($c['nom'] ?? '')),
            'nom_fournisseur' => (string) ($c['nom'] ?? ''),
            'pseudo'          => isset($c['pseudo']) ? $c['pseudo'] : null,
            'email'           => (string) ($c['email'] ?? ''),
            'photo'           => (string) ($c['photo'] ?? ''),
            'fournisseur'     => isset($c['fournisseur']) ? $c['fournisseur'] : null,
            'role'            => (string) ($c['role'] ?? 'membre'),
            'cree_le'         => isset($c['cree_le']) ? $c['cree_le'] : null,
        ];
    }

    // ----- Les comptes (requêtes dans Comptes, Authentification.php) -----

    /** « Mon compte » : le compte et ce qu'il contient. */
    public function profil(): array
    {
        return ['compte' => $this->moiFrais(), 'contenu' => Comptes::profil($this->pdo, $this->u)['contenu']];
    }

    public function modifierPseudo(string $pseudo): array
    {
        $this->compte = Comptes::modifierPseudo($this->pdo, $this->u, $pseudo);
        return $this->moi();
    }

    /** Supprime le compte connecté et tout ce qui est à lui (voir Comptes::supprimer). */
    public function supprimerMonCompte(): array
    {
        return Comptes::supprimer($this->pdo, $this->u);
    }

    /** « Gérer les comptes » (administrateur). */
    public function listerComptes(): array
    {
        $this->exigerAdmin('voir la liste des comptes');
        return ['comptes' => Comptes::lister($this->pdo), 'moi' => $this->u];
    }

    public function changerRoleCompte(int $id, string $role): array
    {
        $this->exigerAdmin('changer le rôle d\'un compte');
        $compte = Comptes::changerRole($this->pdo, $id, $role);
        unset($compte['uid']);
        return $compte;
    }

    public function supprimerUnCompte(int $id): array
    {
        $this->exigerAdmin('supprimer un compte');
        if ($id === $this->u) {
            throw new ErreurApi('Pour supprimer votre propre compte, passez par « Mon compte ».');
        }
        return Comptes::supprimer($this->pdo, $id);
    }

    private function moiFrais(): array
    {
        $this->compte = Comptes::lire($this->pdo, $this->u);
        return $this->moi();
    }

    /** google | discord | dev, d'après l'uid (comme la migration 4) ; null = compte initial pas encore réclamé. */
    private static function fournisseurDeUid(?string $uid): ?string
    {
        if ($uid === null) {
            return null;
        }
        if (strpos($uid, 'dev:') === 0) {
            return 'dev';
        }
        return strpos($uid, 'discord:') === 0 ? 'discord' : 'google';
    }

    private function formaterChapitre(array $c): array
    {
        $cours = $c['proprietaire_id'] === null;
        return [
            'id'         => $c['id'],
            'nom'        => $c['nom'],
            'ordre'      => (int) $c['ordre'],
            'origine'    => $cours ? 'cours' : 'perso',
            'categorie'  => $c['categorie'],
            'modifiable' => $cours ? $this->estAdmin() : true,
        ];
    }

    public function lireMot(int $id): array
    {
        $mots = $this->lireMots($id);
        if (!$mots) {
            throw new ErreurApi("Le mot n° $id n'existe pas (ou plus).", 404);
        }
        return $mots[0];
    }

    /** @return array<int, array> */
    private function lireMots(?int $seulement): array
    {
        $filtre = $seulement === null ? '' : ' AND m.id = ' . (int) $seulement;
        $req = $this->pdo->prepare(
            'SELECT m.*, p.statut, p.nb_reussites, p.nb_echecs, p.derniere_revision, p.serie, p.production, p.acquis_le, p.valide_le, p.rafraichissements, p.prochaine_revision
               FROM mot m LEFT JOIN progression p ON p.mot_id = m.id AND p.utilisateur_id = :u
              WHERE ' . self::VISIBLE_MOT . $filtre . ' ORDER BY m.id'
        );
        $req->execute([':u' => $this->u]);
        $lignes = $req->fetchAll();

        $filtreLiaison = $seulement === null ? '' : ' AND mc.mot_id = ' . (int) $seulement;
        $chapitres = [];
        $req = $this->pdo->prepare(
            'SELECT mc.mot_id, mc.chapitre_id FROM mot_chapitre mc JOIN chapitre c ON c.id = mc.chapitre_id
              WHERE ' . self::VISIBLE_CHAPITRE . $filtreLiaison . ' ORDER BY mc.rowid'
        );
        $req->execute([':u' => $this->u]);
        foreach ($req as $l) {
            $chapitres[(int) $l['mot_id']][] = $l['chapitre_id'];
        }
        $thematiques = [];
        $req = $this->pdo->prepare(
            'SELECT t.mot_id, t.thematique FROM mot_thematique t JOIN mot m ON m.id = t.mot_id
              WHERE ' . self::VISIBLE_MOT . str_replace('mc.mot_id', 't.mot_id', $filtreLiaison) . ' ORDER BY t.rowid'
        );
        $req->execute([':u' => $this->u]);
        foreach ($req as $l) {
            $thematiques[(int) $l['mot_id']][] = $l['thematique'];
        }

        $jour = $this->aujourdhui();
        $mots = [];
        foreach ($lignes as $l) {
            $id = (int) $l['id'];
            $statut = $l['statut'] ?? 'non acquis';
            if ($statut === 'acquis' && $l['prochaine_revision'] !== null && $l['prochaine_revision'] <= $jour) {
                $statut = self::ETAT_A_RAFRAICHIR;
            }
            $cours = $l['proprietaire_id'] === null;
            $mots[] = [
                'id'          => $id,
                'fr'          => self::decoderListe($l['fr']),
                'jp_romaji'   => self::decoderListe($l['jp_romaji']),
                'jp_kanji'    => self::decoderListe($l['jp_kanji']),
                'jp_kana'     => self::decoderListe($l['jp_kana']),
                // « context » (et non « contexte ») : le nom du champ dans les
                // exports v1, que l'import doit continuer à comprendre.
                'context'     => $l['contexte'],
                'thematiques' => $thematiques[$id] ?? [],
                'chapitres'   => $chapitres[$id] ?? [],
                'origine'     => $cours ? 'cours' : 'perso',
                'modifiable'  => $cours ? $this->estAdmin() : true,
                'progression' => [
                    'statut'            => $statut,
                    'nb_reussites'      => (int) ($l['nb_reussites'] ?? 0),
                    'nb_echecs'         => (int) ($l['nb_echecs'] ?? 0),
                    'derniere_revision' => $l['derniere_revision'],
                    'serie'              => (int) ($l['serie'] ?? 0),
                    'production'         => (int) ($l['production'] ?? 0) === 1,
                    'acquis_le'          => $l['acquis_le'] ?? null,
                    'valide_le'          => $l['valide_le'] ?? null,
                    'rafraichissements'  => (int) ($l['rafraichissements'] ?? 0),
                    'prochaine_revision' => $l['prochaine_revision'] ?? null,
                ],
            ];
        }
        return $mots;
    }

    /** La ligne brute d'un mot visible, ou 404. */
    private function ligneMot(int $id): array
    {
        $req = $this->pdo->prepare('SELECT m.id, m.proprietaire_id FROM mot m WHERE m.id = :id AND ' . self::VISIBLE_MOT);
        $req->execute([':id' => $id, ':u' => $this->u]);
        $l = $req->fetch();
        if (!$l) {
            throw new ErreurApi("Le mot n° $id n'existe pas (ou plus).", 404);
        }
        return $l;
    }

    private function exigerMotModifiable(int $id): array
    {
        $l = $this->ligneMot($id);
        if ($l['proprietaire_id'] === null && !$this->estAdmin()) {
            throw new ErreurApi('Ce mot appartient au cours : seul un administrateur peut le modifier.', 403);
        }
        return $l;
    }

    // ------------------------------------------------------------------
    // Mots
    // ------------------------------------------------------------------

    /**
     * Crée (pas d'`id`) ou modifie (avec `id`) un mot, liaisons comprises.
     * Un mot créé appartient au compte. Les chapitres sont désignés par leur
     * clé ou leur nom (`resoudreChapitre`) ; un nom inconnu crée un chapitre
     * du compte dans « Personnel ».
     *
     * ⚠️ Un mot du compte reste TOUJOURS dans « Mes mots », même si la liste
     * envoyée ne le contient pas (case décochée à la main, F12) : décidé ici,
     * pas dans le navigateur.
     */
    public function enregistrerMot(array $entree): array
    {
        $mot = $this->validerMot($entree);
        $this->assurerMesMots();
        $id = isset($entree['id']) && $entree['id'] !== null && $entree['id'] !== '' ? (int) $entree['id'] : null;

        $this->pdo->beginTransaction();
        try {
            if ($id !== null) {
                $ligne = $this->exigerMotModifiable($id);
                $req = $this->pdo->prepare(
                    "UPDATE mot SET fr = :fr, jp_romaji = :romaji, jp_kanji = :kanji, jp_kana = :kana,
                            contexte = :contexte, modifie_le = datetime('now')
                      WHERE id = :id"
                );
                $req->execute($this->parametresMot($mot) + [':id' => $id]);
                // ⚠️ Ne retirer que les rattachements VISIBLES : un mot du cours
                // peut être rangé dans les chapitres d'autres comptes.
                $this->pdo->prepare(
                    'DELETE FROM mot_chapitre WHERE mot_id = :id AND chapitre_id IN
                        (SELECT c.id FROM chapitre c WHERE ' . self::VISIBLE_CHAPITRE . ')'
                )->execute([':id' => $id, ':u' => $this->u]);
                $this->pdo->prepare('DELETE FROM mot_thematique WHERE mot_id = ?')->execute([$id]);
                $motDuCours = $ligne['proprietaire_id'] === null;
            } else {
                $id = $this->insererMot($mot, $this->u);
                $motDuCours = false;
            }
            $this->lierChapitres($id, $motDuCours, $mot['chapitres'], [], $motDuCours);
            if (!$motDuCours) {
                $this->lierMesMots($id);
            }
            $this->lierThemes($id, $mot['thematiques']);
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return $this->lireMot($id);
    }

    public function supprimerMot(int $id): void
    {
        $this->exigerMotModifiable($id);
        // progression, mot_chapitre et mot_thematique suivent par ON DELETE CASCADE.
        $this->pdo->prepare('DELETE FROM mot WHERE id = ?')->execute([$id]);
    }

    /** @return array{fr: string[], jp_romaji: string[], jp_kanji: string[], jp_kana: string[], context: string, thematiques: string[], chapitres: string[]} */
    private function validerMot(array $e): array
    {
        $mot = [
            'fr'          => self::nettoyerListe($e['fr'] ?? null),
            'jp_romaji'   => self::nettoyerListe($e['jp_romaji'] ?? null),
            'jp_kanji'    => self::nettoyerListe($e['jp_kanji'] ?? null),
            'jp_kana'     => self::nettoyerListe($e['jp_kana'] ?? null),
            'context'     => trim((string) ($e['context'] ?? '')),
            'thematiques' => self::nettoyerListe($e['thematiques'] ?? null),
            'chapitres'   => self::nettoyerListe($e['chapitres'] ?? null),
        ];
        if (!$mot['fr']) {
            throw new ErreurApi('Il manque le français.');
        }
        if (!$mot['jp_kanji'] && !$mot['jp_kana']) {
            throw new ErreurApi('Il faut au moins une écriture japonaise : kana ou kanji.');
        }
        // La v1 écrivait « N/A » quand le contexte était laissé vide.
        if ($mot['context'] === 'N/A') {
            $mot['context'] = '';
        }
        if (!$mot['thematiques']) {
            $mot['thematiques'] = [self::THEMATIQUE_PAR_DEFAUT];
        }
        if (!$mot['chapitres']) {
            $mot['chapitres'] = [self::CHAPITRE_PAR_DEFAUT];
        }
        // Une référence qui n'est pas une clé visible doit être un nom valide
        // (ErreurApi sinon : le mot est refusé, ou compté « ignoré » à l'import).
        foreach ($mot['chapitres'] as $ref) {
            if ($this->ligneChapitre($ref) === null) {
                self::nomTechniqueChapitre($ref);
            }
        }
        return $mot;
    }

    private function parametresMot(array $mot): array
    {
        return [
            ':fr'       => self::encoderListe($mot['fr']),
            ':romaji'   => self::encoderListe($mot['jp_romaji']),
            ':kanji'    => self::encoderListe($mot['jp_kanji']),
            ':kana'     => self::encoderListe($mot['jp_kana']),
            ':contexte' => $mot['context'],
        ];
    }

    /** @param int|null $proprietaire null = mot du cours */
    private function insererMot(array $mot, ?int $proprietaire): int
    {
        $req = $this->pdo->prepare(
            'INSERT INTO mot (fr, jp_romaji, jp_kanji, jp_kana, contexte, origine, proprietaire_id)
             VALUES (:fr, :romaji, :kanji, :kana, :contexte, :origine, :proprietaire)'
        );
        $req->execute($this->parametresMot($mot) + [':origine' => $proprietaire === null ? 'cours' : 'perso', ':proprietaire' => $proprietaire]);
        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Rattache un mot à des chapitres (sans retirer les rattachements existants).
     *
     * ⚠️ Un mot du cours ne peut être rattaché à un chapitre du cours que si
     * l'on travaille SUR le cours (administrateur) : sinon un membre
     * modifierait le cours de tout le monde. Un membre le range seulement
     * dans ses chapitres à lui.
     *
     * @param array<string, string> $categoriesChapitres catégorie d'un chapitre créé ici
     */
    private function lierChapitres(int $motId, bool $motDuCours, array $chapitres, array $categoriesChapitres, bool $surLeCours): void
    {
        $liaison = $this->pdo->prepare('INSERT OR IGNORE INTO mot_chapitre (mot_id, chapitre_id) VALUES (?, ?)');
        foreach ($chapitres as $ref) {
            // « Mes mots » n'existe que dans un compte : sur le cours, l'ignorer
            // (sinon un chapitre du cours « mes_mots » serait créé).
            if ($surLeCours && $this->ligneChapitre((string) $ref) === null
                && in_array(preg_replace('/@\d+$/', '', trim((string) $ref)), [self::CHAPITRE_PAR_DEFAUT, self::ANCIEN_CHAPITRE_PAR_DEFAUT], true)) {
                continue;
            }
            $cle = $this->resoudreChapitre((string) $ref, (string) ($categoriesChapitres[$ref] ?? $categoriesChapitres[self::nomTechniqueChapitre((string) $ref)] ?? self::CATEGORIE_PAR_DEFAUT), $surLeCours);
            if ($motDuCours && !$surLeCours && $this->chapitreEstDuCours($cle)) {
                continue;
            }
            $liaison->execute([$motId, $cle]);
        }
    }

    private function lierThemes(int $motId, array $thematiques): void
    {
        $liaison = $this->pdo->prepare('INSERT OR IGNORE INTO mot_thematique (mot_id, thematique) VALUES (?, ?)');
        foreach ($thematiques as $t) {
            $liaison->execute([$motId, $t]);
        }
    }

    // ------------------------------------------------------------------
    // Progression (toujours celle du compte)
    // ------------------------------------------------------------------

    /**
     * Les paliers (25/10/2026, schéma v6 — José : « deux fois de suite ») :
     *  - échec, ou mot passé (quel que soit l'exercice) → « a revoir », la
     *    série repart de zéro, la date d'acquisition s'efface ;
     *  - réussite en RECONNAISSANCE (choisir parmi des propositions : paires,
     *    tuiles) → au plus « en cours » ; ne compte pas dans la série ; un
     *    mot acquis le reste (et reste « à rafraîchir » s'il l'était) ;
     *  - réussite en RAPPEL (taper le sens) ou en PRODUCTION (écrire le
     *    japonais) → série + 1 ; « acquis » à SERIE_POUR_ACQUIS réussites de
     *    suite (acquis_le = aujourd'hui). Un mot déjà acquis réussi est
     *    revalidé (valide_le) ; s'il était « à rafraîchir », il compte un
     *    rafraîchissement de plus et s'en va plus loin (DELAIS_RAFRAICHIR).
     * Sans `niveau` (le jeu des paires), c'est la reconnaissance.
     *
     * `$autreAlphabet` (26/10, José) : le bon mot, écrit dans l'AUTRE
     * syllabaire (ミズ pour みず). C'est une réussite (compteur), mais elle ne
     * mène jamais à « acquis » : la série repart de zéro, l'état devient
     * « en cours » ; un mot acquis reste acquis, sans être revalidé.
     */
    public function enregistrerResultat(int $motId, bool $reussite, string $niveau = 'reconnaissance', bool $autreAlphabet = false): array
    {
        if (!in_array($niveau, self::NIVEAUX, true)) {
            throw new ErreurApi("Niveau d'exercice inconnu : « $niveau ».");
        }
        $this->ligneMot($motId);
        $p = $this->ligneProgression($motId);
        $jour = $this->aujourdhui();
        if (!$reussite) {
            $champs = self::champsRemisAZero('a revoir');
        } elseif ($autreAlphabet) {
            $champs = $p['statut'] === 'acquis' ? [] : ['statut' => 'en cours', 'serie' => 0];
        } elseif ($niveau === 'reconnaissance') {
            $champs = $p['statut'] === 'acquis' || $p['statut'] === 'en cours' ? [] : ['statut' => 'en cours'];
        } elseif ($p['statut'] === 'acquis') {
            $aRafraichir = $p['prochaine_revision'] !== null && $p['prochaine_revision'] <= $jour;
            $fois = (int) $p['rafraichissements'] + ($aRafraichir ? 1 : 0);
            $champs = [
                'serie' => (int) $p['serie'] + 1,
                'production' => ((int) $p['production'] === 1 || $niveau === 'production') ? 1 : 0,
                'valide_le' => $jour,
                'rafraichissements' => $fois,
                'prochaine_revision' => $this->jourPlus(self::delaiRafraichir($fois)),
            ];
        } else {
            $serie = (int) $p['serie'] + 1;
            $acquis = $serie >= self::SERIE_POUR_ACQUIS;
            $champs = [
                'statut' => $acquis ? 'acquis' : 'en cours',
                'serie' => $serie,
                'production' => ((int) $p['production'] === 1 || $niveau === 'production') ? 1 : 0,
            ];
            if ($acquis) {
                $champs += ['acquis_le' => $jour, 'valide_le' => $jour, 'rafraichissements' => 0, 'prochaine_revision' => $this->jourPlus(self::delaiRafraichir(0))];
            }
        }
        $this->ecrireProgression($motId, $champs, $reussite ? 1 : 0, $reussite ? 0 : 1);
        return $this->lireMot($motId)['progression'];
    }

    /** Changement manuel de l'état (depuis la liste). Les compteurs ne bougent pas. */
    public function definirStatut(int $motId, string $statut): array
    {
        $this->verifierStatut($statut);
        $this->ligneMot($motId);
        $this->ecrireProgression($motId, $this->champsPourStatut($statut, $this->ligneProgression($motId)), 0, 0, false);
        return $this->lireMot($motId)['progression'];
    }

    /** Un état sans série ni dates (« a revoir », « non acquis »). */
    private static function champsRemisAZero(string $statut): array
    {
        return ['statut' => $statut, 'serie' => 0, 'production' => 0, 'acquis_le' => null, 'valide_le' => null, 'rafraichissements' => 0, 'prochaine_revision' => null];
    }

    /**
     * Ce qu'un état posé à la main (liste, fusion) met dans les paliers.
     * « acquis » : une série complète, acquis (et validé) aujourd'hui — un mot
     * « à rafraîchir » qu'on remet « acquis » repart donc pour un délai ;
     * « en cours » : une réussite ; « a revoir », « non acquis » : tout effacé.
     */
    private function champsPourStatut(string $statut, array $p): array
    {
        $jour = $this->aujourdhui();
        if ($statut === 'acquis') {
            return [
                'statut' => 'acquis',
                'serie' => max(self::SERIE_POUR_ACQUIS, (int) $p['serie']),
                'acquis_le' => $p['statut'] === 'acquis' && $p['acquis_le'] ? $p['acquis_le'] : $jour,
                'valide_le' => $jour,
                'prochaine_revision' => $this->jourPlus(self::delaiRafraichir((int) $p['rafraichissements'])),
            ];
        }
        if ($statut === 'en cours') {
            return ['serie' => 1] + self::champsRemisAZero('en cours');
        }
        return self::champsRemisAZero($statut);
    }

    /**
     * Fusionne des états venus d'ailleurs (fichier de progression v1, ancienne
     * base du navigateur) SANS jamais faire reculer un mot — règle de
     * `importerProgressionDonnees` en v1, étendue à « en cours » :
     *   - « acquis » importé l'emporte sur tout état différent ;
     *   - « en cours » et « a revoir » importés ne remplacent que « non acquis ».
     *
     * @param array<int, array{mot_id: int, statut: string}> $elements
     */
    public function fusionnerStatuts(array $elements): array
    {
        $compte = ['acquis' => 0, 'en_cours' => 0, 'a_revoir' => 0, 'inchanges' => 0];
        $actuels = [];
        $req = $this->pdo->prepare('SELECT mot_id, statut FROM progression WHERE utilisateur_id = ?');
        $req->execute([$this->u]);
        foreach ($req as $l) {
            $actuels[(int) $l['mot_id']] = $l['statut'];
        }
        $visible = $this->pdo->prepare('SELECT 1 FROM mot m WHERE m.id = :id AND ' . self::VISIBLE_MOT);

        $this->pdo->beginTransaction();
        try {
            foreach ($elements as $el) {
                $motId = (int) ($el['mot_id'] ?? 0);
                $statut = (string) ($el['statut'] ?? '');
                $visible->execute([':id' => $motId, ':u' => $this->u]);
                if (!in_array($statut, self::STATUTS, true) || !$visible->fetchColumn()) {
                    $compte['inchanges']++;
                    continue;
                }
                $actuel = $actuels[$motId] ?? 'non acquis';
                $prend = ($statut === 'acquis' && $actuel !== 'acquis')
                    || ($statut !== 'acquis' && $statut !== 'non acquis' && $actuel === 'non acquis');
                if ($prend) {
                    $this->ecrireProgression($motId, $this->champsPourStatut($statut, $this->ligneProgression($motId)), 0, 0, false);
                    $actuels[$motId] = $statut;
                    $compte[str_replace(' ', '_', $statut)]++;
                } else {
                    $compte['inchanges']++;
                }
            }
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return $compte;
    }

    private function verifierStatut(string $statut): void
    {
        if (!in_array($statut, self::STATUTS, true)) {
            throw new ErreurApi("État inconnu : « $statut ».");
        }
    }

    /** Pour les essais : fixe « aujourd'hui » (AAAA-MM-JJ) ; null = la vraie date. */
    public function fixerJour(?string $jour): void
    {
        $this->jourFixe = $jour;
    }

    /** Le jour à Paris : les dates d'acquisition se lisent à l'heure de José, pas en UTC. */
    private function aujourdhui(): string
    {
        if ($this->jourFixe !== null) {
            return $this->jourFixe;
        }
        return (new DateTimeImmutable('now', new DateTimeZone('Europe/Paris')))->format('Y-m-d');
    }

    private function jourPlus(int $jours): string
    {
        return (new DateTimeImmutable($this->aujourdhui()))->modify("+$jours days")->format('Y-m-d');
    }

    /** Jours entre la validation d'un acquis et son passage « à rafraîchir », selon ses rafraîchissements réussis. */
    private static function delaiRafraichir(int $fois): int
    {
        return self::DELAIS_RAFRAICHIR[min(max($fois, 0), count(self::DELAIS_RAFRAICHIR) - 1)];
    }

    /** La ligne de progression du compte pour ce mot, ou ses valeurs par défaut. */
    private function ligneProgression(int $motId): array
    {
        $req = $this->pdo->prepare('SELECT ' . implode(', ', self::CHAMPS_PALIERS) . ' FROM progression WHERE utilisateur_id = ? AND mot_id = ?');
        $req->execute([$this->u, $motId]);
        $l = $req->fetch();
        return $l ?: self::champsRemisAZero('non acquis');
    }

    /**
     * Écrit les champs de paliers donnés (les autres ne bougent pas) et ajoute
     * aux compteurs. Pas d'UPSERT (« ON CONFLICT … DO UPDATE ») : il exige
     * SQLite 3.24, et la version liée au PHP de l'hébergement n'est pas
     * connue. Lire puis écrire.
     *
     * @param array<string, mixed> $champs parmi self::CHAMPS_PALIERS
     */
    private function ecrireProgression(int $motId, array $champs, int $reussites, int $echecs, bool $dater = true): void
    {
        $champs = array_intersect_key($champs, array_flip(self::CHAMPS_PALIERS));
        $existe = $this->pdo->prepare('SELECT 1 FROM progression WHERE utilisateur_id = ? AND mot_id = ?');
        $existe->execute([$this->u, $motId]);
        if ($existe->fetchColumn()) {
            $sets = ['nb_reussites = nb_reussites + :r', 'nb_echecs = nb_echecs + :e'];
            if ($dater) {
                $sets[] = "derniere_revision = datetime('now')";
            }
            $params = [':r' => $reussites, ':e' => $echecs, ':u' => $this->u, ':m' => $motId];
            foreach ($champs as $nom => $valeur) {
                $sets[] = "$nom = :$nom";
                $params[":$nom"] = $valeur;
            }
            $this->pdo->prepare('UPDATE progression SET ' . implode(', ', $sets) . ' WHERE utilisateur_id = :u AND mot_id = :m')->execute($params);
        } else {
            $champs += ['statut' => 'non acquis'];
            $noms = array_keys($champs);
            $params = [':u' => $this->u, ':m' => $motId, ':r' => $reussites, ':e' => $echecs];
            foreach ($champs as $nom => $valeur) {
                $params[":$nom"] = $valeur;
            }
            $this->pdo->prepare(
                'INSERT INTO progression (utilisateur_id, mot_id, nb_reussites, nb_echecs, derniere_revision, ' . implode(', ', $noms) . ')
                 VALUES (:u, :m, :r, :e, ' . ($dater ? "datetime('now')" : 'NULL') . ', :' . implode(', :', $noms) . ')'
            )->execute($params);
        }
    }

    /**
     * Les paliers d'une ligne de sauvegarde, dans l'ordre de CHAMPS_RESTAURES.
     * Une sauvegarde v6 les porte ; plus ancienne, on applique la règle des
     * migrations : un acquis le reste, acquis et validé à sa dernière
     * révision, « à rafraîchir » 7 jours après.
     *
     * @return array<int, mixed>
     */
    private static function paliersRestaures(array $p): array
    {
        if (array_key_exists('serie', $p)) {
            return [(int) $p['serie'], (int) !empty($p['production']), $p['acquis_le'] ?? null, $p['valide_le'] ?? null, (int) ($p['rafraichissements'] ?? 0), $p['prochaine_revision'] ?? null];
        }
        $statut = $p['statut'] ?? '';
        if ($statut !== 'acquis') {
            return [$statut === 'en cours' ? 1 : 0, (int) !empty($p['production']), null, null, 0, null];
        }
        $date = $p['dernier_jour_reussi'] ?? null;
        if (!$date) {
            $date = isset($p['derniere_revision']) && $p['derniere_revision'] ? substr((string) $p['derniere_revision'], 0, 10) : gmdate('Y-m-d');
        }
        return [self::SERIE_POUR_ACQUIS, 1, $date, $date, 0, (new DateTimeImmutable($date))->modify('+' . self::DELAIS_RAFRAICHIR[0] . ' days')->format('Y-m-d')];
    }

    /** Un caractère du jeu des kana : bonne réponse du premier coup ou non. */
    public function enregistrerKana(string $kana, bool $reussite): array
    {
        $kana = trim($kana);
        if ($kana === '' || mb_strlen($kana) > 3 || !preg_match('/^[\x{3041}-\x{3096}\x{30A1}-\x{30FA}ー]+$/u', $kana)) {
            throw new ErreurApi("« $kana » n'est pas un kana du jeu.");
        }
        $existe = $this->pdo->prepare('SELECT 1 FROM kana_progression WHERE utilisateur_id = ? AND kana = ?');
        $existe->execute([$this->u, $kana]);
        if ($existe->fetchColumn()) {
            $this->pdo->prepare("UPDATE kana_progression SET nb_reussites = nb_reussites + ?, nb_echecs = nb_echecs + ?, derniere_revision = datetime('now') WHERE utilisateur_id = ? AND kana = ?")
                ->execute([$reussite ? 1 : 0, $reussite ? 0 : 1, $this->u, $kana]);
        } else {
            $this->pdo->prepare("INSERT INTO kana_progression (utilisateur_id, kana, nb_reussites, nb_echecs, derniere_revision) VALUES (?, ?, ?, ?, datetime('now'))")
                ->execute([$this->u, $kana, $reussite ? 1 : 0, $reussite ? 0 : 1]);
        }
        $req = $this->pdo->prepare('SELECT nb_reussites, nb_echecs, derniere_revision FROM kana_progression WHERE utilisateur_id = ? AND kana = ?');
        $req->execute([$this->u, $kana]);
        $l = $req->fetch();
        return ['kana' => $kana, 'nb_reussites' => (int) $l['nb_reussites'], 'nb_echecs' => (int) $l['nb_echecs'], 'derniere_revision' => $l['derniere_revision']];
    }

    /** Les exercices du jeu des kanjis et la facette qu'ils travaillent. */
    public const EXERCICES_KANJI = ['sens', 'lecture', 'choix'];

    /**
     * Un kanji du jeu des kanjis (26/10/2026, schéma v7). Les paliers, comme
     * ceux des mots :
     *  - échec → « a revoir », la série de CETTE facette repart de zéro ;
     *  - réussite en `choix` (reconnaître parmi quatre) → au plus « en
     *    cours », ne compte pas dans les séries ;
     *  - réussite en `sens` (taper le sens) ou `lecture` (taper une lecture
     *    en kana) → série de la facette + 1 ; « acquis » quand les DEUX
     *    séries atteignent SERIE_POUR_ACQUIS.
     */
    public function enregistrerKanji(string $kanji, string $exercice, bool $reussite): array
    {
        $kanji = trim($kanji);
        if (!preg_match('/^[\x{3005}\x{4E00}-\x{9FFF}]$/u', $kanji)) {
            throw new ErreurApi("« $kanji » n'est pas un kanji du jeu.");
        }
        if (!in_array($exercice, self::EXERCICES_KANJI, true)) {
            throw new ErreurApi("Exercice de kanji inconnu : « $exercice ».");
        }
        $req = $this->pdo->prepare('SELECT * FROM kanji_progression WHERE utilisateur_id = ? AND kanji = ?');
        $req->execute([$this->u, $kanji]);
        $p = $req->fetch() ?: ['statut' => 'non acquis', 'serie_sens' => 0, 'serie_lecture' => 0, 'acquis_le' => null];
        $sens = (int) $p['serie_sens'];
        $lecture = (int) $p['serie_lecture'];
        $statut = $p['statut'];
        $acquisLe = $p['acquis_le'];
        if (!$reussite) {
            if ($exercice === 'sens') $sens = 0;
            if ($exercice === 'lecture') $lecture = 0;
            if ($exercice === 'choix') $sens = 0; // reconnaître le sens raté : le sens n'est pas su
            $statut = 'a revoir';
            $acquisLe = null;
        } elseif ($exercice === 'choix') {
            if ($statut !== 'acquis') $statut = 'en cours';
        } else {
            if ($exercice === 'sens') $sens++;
            else $lecture++;
            if ($sens >= self::SERIE_POUR_ACQUIS && $lecture >= self::SERIE_POUR_ACQUIS) {
                if ($statut !== 'acquis') $acquisLe = $this->aujourdhui();
                $statut = 'acquis';
            } elseif ($statut !== 'acquis') {
                $statut = 'en cours';
            }
        }
        $this->pdo->prepare('DELETE FROM kanji_progression WHERE utilisateur_id = ? AND kanji = ?')->execute([$this->u, $kanji]);
        $this->pdo->prepare("INSERT INTO kanji_progression (utilisateur_id, kanji, statut, serie_sens, serie_lecture, nb_reussites, nb_echecs, acquis_le, derniere_revision)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))")
            ->execute([$this->u, $kanji, $statut, $sens, $lecture, (int) ($p['nb_reussites'] ?? 0) + ($reussite ? 1 : 0), (int) ($p['nb_echecs'] ?? 0) + ($reussite ? 0 : 1), $acquisLe]);
        $req->execute([$this->u, $kanji]);
        return ['kanji' => $kanji] + self::formaterKanji($req->fetch());
    }

    private static function formaterKanji(array $l): array
    {
        return [
            'statut' => $l['statut'], 'serie_sens' => (int) $l['serie_sens'], 'serie_lecture' => (int) $l['serie_lecture'],
            'nb_reussites' => (int) $l['nb_reussites'], 'nb_echecs' => (int) $l['nb_echecs'],
            'acquis_le' => $l['acquis_le'], 'derniere_revision' => $l['derniere_revision'],
        ];
    }

    // ------------------------------------------------------------------
    // Catégories et chapitres
    // ------------------------------------------------------------------

    private function idCategorie(string $nom): int
    {
        $nom = trim($nom) !== '' ? trim($nom) : self::CATEGORIE_PAR_DEFAUT;
        $req = $this->pdo->prepare('SELECT id FROM categorie WHERE nom = ?');
        $req->execute([$nom]);
        $id = $req->fetchColumn();
        if ($id !== false) {
            return (int) $id;
        }
        $ordre = (int) $this->pdo->query('SELECT COALESCE(MAX(ordre), 0) + 1 FROM categorie')->fetchColumn();
        $this->pdo->prepare('INSERT INTO categorie (nom, ordre) VALUES (?, ?)')->execute([$nom, $ordre]);
        return (int) $this->pdo->lastInsertId();
    }

    /** La ligne d'un chapitre visible par sa clé, ou null. */
    private function ligneChapitre(string $cle): ?array
    {
        $req = $this->pdo->prepare('SELECT c.* FROM chapitre c WHERE c.id = :id AND ' . self::VISIBLE_CHAPITRE);
        $req->execute([':id' => $cle, ':u' => $this->u]);
        $l = $req->fetch();
        return $l ?: null;
    }

    private function chapitreEstDuCours(string $cle): bool
    {
        $l = $this->ligneChapitre($cle);
        return $l !== null && $l['proprietaire_id'] === null;
    }

    /** Clé du chapitre visible portant ce nom (le sien d'abord, puis celui du cours), ou null. */
    private function cleParNom(string $nom, ?bool $duCours = null): ?string
    {
        $sql = 'SELECT c.id, c.proprietaire_id FROM chapitre c WHERE c.nom = :nom AND ' . self::VISIBLE_CHAPITRE;
        if ($duCours === true) {
            $sql .= ' AND c.proprietaire_id IS NULL';
        } elseif ($duCours === false) {
            $sql .= ' AND c.proprietaire_id IS NOT NULL';
        }
        $req = $this->pdo->prepare($sql . ' ORDER BY c.proprietaire_id IS NULL');
        $req->execute([':nom' => $nom, ':u' => $this->u]);
        $id = $req->fetchColumn();
        return $id === false ? null : (string) $id;
    }

    /**
     * Désigne un chapitre par sa clé (« vocabulaire_p_45 », « animaux@3 ») ou
     * par son nom (« animaux », fichiers d'import) ; le crée s'il n'existe pas
     * — chapitre du compte, ou du cours si `$surLeCours`.
     */
    private function resoudreChapitre(string $ref, string $categorie, bool $surLeCours = false): string
    {
        $ref = trim($ref);
        if ($this->ligneChapitre($ref) !== null) {
            return $ref;
        }
        $nom = self::nomTechniqueChapitre($ref);
        if (!$surLeCours && self::estNomReserve($nom)) {
            $nom = self::CHAPITRE_PAR_DEFAUT; // « Mes mots », ou « personnel » des fichiers d'avant le schéma v3
        }
        $cle = $surLeCours ? $this->cleParNom($nom, true) : $this->cleParNom($nom);
        if ($cle !== null) {
            return $cle;
        }
        return $this->insererChapitre($nom, $categorie, $surLeCours ? null : $this->u);
    }

    private function insererChapitre(string $nom, string $categorie, ?int $proprietaire): string
    {
        $cle = $proprietaire === null ? $nom : $nom . '@' . $proprietaire;
        $catId = $this->idCategorie($categorie);
        $req = $this->pdo->prepare('SELECT COALESCE(MAX(ordre), 0) + 10 FROM chapitre WHERE categorie_id = ?');
        $req->execute([$catId]);
        $ordre = $nom === self::CHAPITRE_PAR_DEFAUT ? 0 : (int) $req->fetchColumn();
        $this->pdo->prepare('INSERT INTO chapitre (id, nom, categorie_id, ordre, origine, proprietaire_id) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$cle, $nom, $catId, $ordre, $proprietaire === null ? 'cours' : 'perso', $proprietaire]);
        return $cle;
    }

    private function exigerChapitreModifiable(string $cle): array
    {
        $l = $this->ligneChapitre($cle);
        if ($l === null) {
            throw new ErreurApi("Ce chapitre n'existe pas (ou plus).", 404);
        }
        if ($l['proprietaire_id'] === null && !$this->estAdmin()) {
            throw new ErreurApi('Ce chapitre appartient au cours : seul un administrateur peut le modifier.', 403);
        }
        return $l;
    }

    /**
     * Crée un chapitre (du compte ; du cours si `$duCours`, administrateur)
     * et y RATTACHE les mots des thèmes / chapitres choisis
     * (`peupler` : « theme:<nom> », « chap:<clé> »).
     *
     * ⚠️ Différence voulue avec la v1 : elle COPIAIT les mots. Ici un mot peut
     * appartenir à plusieurs chapitres : pas de doublon, et sa progression
     * est la même partout où il apparaît.
     */
    public function creerChapitre(string $nom, string $categorie, array $peupler, bool $duCours = false): array
    {
        if ($duCours) {
            $this->exigerAdmin('créer un chapitre du cours');
        }
        $nom = self::nomTechniqueChapitre($nom);
        if ($this->cleParNom($nom) !== null || self::estNomReserve($nom)) {
            throw new ErreurApi('Le chapitre « ' . str_replace('_', ' ', $nom) . ' » existe déjà.', 409);
        }
        $themes = [];
        $chaps = [];
        foreach ($peupler as $p) {
            $p = (string) $p;
            if (strpos($p, 'theme:') === 0) {
                $themes[] = substr($p, 6);
            } elseif (strpos($p, 'chap:') === 0) {
                $chaps[] = substr($p, 5);
            }
        }

        $this->pdo->beginTransaction();
        try {
            $cle = $this->insererChapitre($nom, $categorie, $duCours ? null : $this->u);
            $motIds = [];
            if ($themes) {
                $req = $this->pdo->prepare('SELECT DISTINCT t.mot_id FROM mot_thematique t JOIN mot m ON m.id = t.mot_id
                    WHERE t.thematique IN (' . $this->marqueurs(count($themes)) . ') AND (m.proprietaire_id IS NULL OR m.proprietaire_id = ?)');
                $req->execute(array_merge($themes, [$this->u]));
                $motIds = array_merge($motIds, $req->fetchAll(PDO::FETCH_COLUMN));
            }
            if ($chaps) {
                $req = $this->pdo->prepare('SELECT DISTINCT mc.mot_id FROM mot_chapitre mc JOIN mot m ON m.id = mc.mot_id
                    JOIN chapitre c ON c.id = mc.chapitre_id
                    WHERE mc.chapitre_id IN (' . $this->marqueurs(count($chaps)) . ')
                      AND (m.proprietaire_id IS NULL OR m.proprietaire_id = ?) AND (c.proprietaire_id IS NULL OR c.proprietaire_id = ?)');
                $req->execute(array_merge($chaps, [$this->u, $this->u]));
                $motIds = array_merge($motIds, $req->fetchAll(PDO::FETCH_COLUMN));
            }
            $motIds = array_values(array_unique(array_map('intval', $motIds)));
            $liaison = $this->pdo->prepare('INSERT OR IGNORE INTO mot_chapitre (mot_id, chapitre_id) VALUES (?, ?)');
            foreach ($motIds as $motId) {
                $liaison->execute([$motId, $cle]);
            }
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return ['id' => $cle, 'nb_mots' => count($motIds)];
    }

    public function modifierChapitre(string $cle, ?string $nouveauNom, ?string $categorie): array
    {
        $chap = $this->exigerChapitreModifiable($cle);
        $cible = $cle;
        $this->pdo->beginTransaction();
        try {
            if ($nouveauNom !== null && trim($nouveauNom) !== '') {
                $nom = self::nomTechniqueChapitre($nouveauNom);
                if ($nom !== $chap['nom']) {
                    if ($this->estMesMots($chap)) {
                        throw new ErreurApi('« Mes mots » contient tous vos mots : il ne se renomme pas.');
                    }
                    if ($this->cleParNom($nom) !== null || self::estNomReserve($nom)) {
                        throw new ErreurApi('Le chapitre « ' . str_replace('_', ' ', $nom) . ' » existe déjà.', 409);
                    }
                    $cible = $chap['proprietaire_id'] === null ? $nom : $nom . '@' . $chap['proprietaire_id'];
                    // Les liaisons suivent par ON UPDATE CASCADE (foreign_keys = ON, Base::ouvrir).
                    $this->pdo->prepare('UPDATE chapitre SET id = ?, nom = ? WHERE id = ?')->execute([$cible, $nom, $cle]);
                }
            }
            if ($categorie !== null && trim($categorie) !== '') {
                $this->pdo->prepare('UPDATE chapitre SET categorie_id = ? WHERE id = ?')
                    ->execute([$this->idCategorie($categorie), $cible]);
            }
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return ['id' => $cible];
    }

    /**
     * Supprime le chapitre et les mots qui n'appartenaient QU'À lui (et au même
     * propriétaire que lui) ; un mot rangé aussi ailleurs est seulement
     * détaché. (La v1 supprimait tous les mots du chapitre — c'étaient des copies.)
     */
    public function supprimerChapitre(string $cle): array
    {
        $chap = $this->exigerChapitreModifiable($cle);
        if ($this->estMesMots($chap)) {
            throw new ErreurApi('« Mes mots » contient tous vos mots : il ne se supprime pas.');
        }
        $this->pdo->beginTransaction();
        try {
            $req = $this->pdo->prepare(
                'SELECT mc.mot_id FROM mot_chapitre mc JOIN mot m ON m.id = mc.mot_id
                  WHERE mc.chapitre_id = ? AND m.proprietaire_id IS ?
                    AND (SELECT COUNT(*) FROM mot_chapitre x WHERE x.mot_id = mc.mot_id) = 1'
            );
            $req->execute([$cle, $chap['proprietaire_id']]);
            $seuls = $req->fetchAll(PDO::FETCH_COLUMN);
            $req = $this->pdo->prepare('SELECT COUNT(*) FROM mot_chapitre mc JOIN mot m ON m.id = mc.mot_id WHERE mc.chapitre_id = :c AND ' . self::VISIBLE_MOT);
            $req->execute([':c' => $cle, ':u' => $this->u]);
            $total = (int) $req->fetchColumn();

            $suppr = $this->pdo->prepare('DELETE FROM mot WHERE id = ?');
            foreach ($seuls as $motId) {
                $suppr->execute([(int) $motId]);
            }
            $this->pdo->prepare('DELETE FROM chapitre WHERE id = ?')->execute([$cle]);
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return ['mots_supprimes' => count($seuls), 'mots_detaches' => max(0, $total - count($seuls))];
    }

    /**
     * Range des mots (visibles) dans un chapitre modifiable, sans les retirer
     * des autres. Sert au gestionnaire de chapitres : un mot choisi à la main,
     * tout un chapitre, toute une thématique (le navigateur envoie les ids).
     *
     * Refusés sans erreur (comptés) : les mots invisibles, et un mot DU
     * COMPTE vers un chapitre du cours (il n'y serait visible que par lui).
     *
     * @param int[] $ids
     * @return array{ajoutes: int, deja: int, refuses: int}
     */
    public function ajouterMotsAuChapitre(string $cle, array $ids): array
    {
        $chap = $this->exigerChapitreModifiable($cle);
        $ids = $this->idsDuLot($ids);
        $versLeCours = $chap['proprietaire_id'] === null;
        $r = ['ajoutes' => 0, 'deja' => 0, 'refuses' => 0];
        $lignes = $this->lignesMots($ids);
        $liaison = $this->pdo->prepare('INSERT OR IGNORE INTO mot_chapitre (mot_id, chapitre_id) VALUES (?, ?)');
        $this->pdo->beginTransaction();
        try {
            foreach ($ids as $id) {
                // array_key_exists et non isset : un mot du cours vaut null ici.
                if (!array_key_exists($id, $lignes) || ($versLeCours && $lignes[$id] !== null)) {
                    $r['refuses']++;
                    continue;
                }
                $liaison->execute([$id, $cle]);
                $r[$liaison->rowCount() > 0 ? 'ajoutes' : 'deja']++;
            }
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return $r;
    }

    /**
     * Retire des mots d'un chapitre modifiable (ils restent dans leurs autres
     * chapitres). ⚠️ Un mot du compte ne quitte jamais « Mes mots » : il y
     * est gardé (compté) ; pour l'en sortir, il faut le supprimer.
     *
     * @param int[] $ids
     * @return array{retires: int, gardes: int}
     */
    public function retirerMotsDuChapitre(string $cle, array $ids): array
    {
        $chap = $this->exigerChapitreModifiable($cle);
        $ids = $this->idsDuLot($ids);
        $mesMots = $this->estMesMots($chap);
        $lignes = $this->lignesMots($ids);
        $r = ['retires' => 0, 'gardes' => 0];
        $suppr = $this->pdo->prepare('DELETE FROM mot_chapitre WHERE mot_id = ? AND chapitre_id = ?');
        $this->pdo->beginTransaction();
        try {
            foreach ($ids as $id) {
                if (!array_key_exists($id, $lignes)) {
                    continue;
                }
                if ($mesMots && $lignes[$id] !== null) {
                    $r['gardes']++;
                    continue;
                }
                $suppr->execute([$id, $cle]);
                $r['retires'] += $suppr->rowCount();
            }
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return $r;
    }

    /** @return int[] ids distincts, positifs ; ErreurApi au-delà de MAX_LOT */
    private function idsDuLot(array $ids): array
    {
        $propres = [];
        foreach ($ids as $id) {
            if (is_numeric($id) && (int) $id > 0) {
                $propres[(int) $id] = true;
            }
        }
        if (count($propres) > self::MAX_LOT) {
            throw new ErreurApi('Trop de mots d’un coup (' . self::MAX_LOT . ' au plus).');
        }
        return array_keys($propres);
    }

    /**
     * Les mots VISIBLES parmi ces ids : id => proprietaire_id (null = cours).
     * Par paquets de 500 (limite de paramètres des vieux SQLite : 999).
     *
     * @param int[] $ids
     * @return array<int, int|null>
     */
    private function lignesMots(array $ids): array
    {
        $trouves = [];
        foreach (array_chunk($ids, 500) as $paquet) {
            $req = $this->pdo->prepare('SELECT m.id, m.proprietaire_id FROM mot m WHERE m.id IN (' . $this->marqueurs(count($paquet)) . ')
                AND (m.proprietaire_id IS NULL OR m.proprietaire_id = ?)');
            $req->execute(array_merge($paquet, [$this->u]));
            foreach ($req as $l) {
                $trouves[(int) $l['id']] = $l['proprietaire_id'] === null ? null : (int) $l['proprietaire_id'];
            }
        }
        return $trouves;
    }

    private function marqueurs(int $n): string
    {
        return implode(',', array_fill(0, $n, '?'));
    }

    // ------------------------------------------------------------------
    // Import, sauvegarde, restauration
    // ------------------------------------------------------------------

    /**
     * Importe une liste de mots au format des exports v1 (ou de cette
     * version). Un mot déjà visible — mêmes sens français, mêmes kana, mêmes
     * kanji — n'est pas recréé : il gagne seulement les chapitres du fichier
     * (et ses thèmes, s'il appartient au compte). C'est ce qui absorbe les
     * copies que la v1 faisait en peuplant un chapitre.
     *
     * `cible` : « perso » (défaut) → mots du compte ; « cours » (administrateur)
     * → mots et chapitres du cours, visibles par tous les comptes.
     * Mode « ecraser » (perso seulement) : supprime d'abord les mots du compte
     * et les rattachements à ses chapitres.
     *
     * Page « Importer des mots » (23/10/2026) :
     *   - `$chapitresCibles` : clés de chapitres où ranger TOUS les mots du
     *     fichier — les siens (cible perso) ou ceux du cours (cible cours) ;
     *     un autre chapitre est refusé (403) ;
     *   - `$nouveauChapitre` : un nom ; le chapitre est créé (ou retrouvé) et
     *     reçoit lui aussi tous les mots ;
     *   - cible perso : chaque mot importé va AUSSI dans « Mes mots », imposé
     *     ici quoi qu'envoie le navigateur.
     *
     * @param array<string, string> $categoriesChapitres chapitre => catégorie (pour les chapitres créés)
     * @param string[] $chapitresCibles
     */
    public function importerMots(array $mots, string $mode, array $categoriesChapitres = [], string $cible = 'perso', array $chapitresCibles = [], string $nouveauChapitre = ''): array
    {
        if (!in_array($mode, ['ajouter', 'ecraser'], true)) {
            throw new ErreurApi("Mode d'import inconnu : « $mode ».");
        }
        if (!in_array($cible, ['perso', 'cours'], true)) {
            throw new ErreurApi("Cible d'import inconnue : « $cible ».");
        }
        $surLeCours = $cible === 'cours';
        if ($surLeCours) {
            $this->exigerAdmin('importer dans le cours');
            if ($mode === 'ecraser') {
                throw new ErreurApi('« Écraser » ne s’applique qu’à vos mots, pas au cours.');
            }
        }
        if (count($mots) > self::MAX_LOT) {
            throw new ErreurApi('Trop de mots dans ce fichier (' . self::MAX_LOT . ' au plus) : coupez-le en plusieurs imports.');
        }
        $cibles = [];
        foreach (self::nettoyerListe($chapitresCibles) as $ref) {
            $l = $this->ligneChapitre($ref);
            if ($l === null) {
                throw new ErreurApi("Le chapitre « $ref » n'existe pas (ou plus).", 404);
            }
            $duCours = $l['proprietaire_id'] === null;
            if ($duCours !== $surLeCours) {
                throw new ErreurApi($surLeCours ? 'Un import dans le cours se range dans des chapitres du cours.' : 'Vos mots se rangent dans vos chapitres, pas dans ceux du cours.', 403);
            }
            $cibles[] = (string) $l['id'];
        }
        $compte = ['crees' => 0, 'fusionnes' => 0, 'ignores' => 0, 'chapitre' => null];
        if (!$surLeCours) {
            $this->assurerMesMots();
        }

        $this->pdo->beginTransaction();
        try {
            if (trim($nouveauChapitre) !== '') {
                $nom = self::nomTechniqueChapitre($nouveauChapitre);
                if (self::estNomReserve($nom)) {
                    if ($surLeCours) {
                        throw new ErreurApi('« Mes mots » n’existe que dans un compte, pas dans le cours.');
                    }
                    $nom = self::CHAPITRE_PAR_DEFAUT;
                }
                $cle = $surLeCours ? $this->cleParNom($nom, true) : $this->cleParNom($nom, false);
                if ($cle === null) {
                    $cle = $this->insererChapitre($nom, $surLeCours ? 'Vocabulaire' : self::CATEGORIE_PAR_DEFAUT, $surLeCours ? null : $this->u);
                }
                $cibles[] = $cle;
                $compte['chapitre'] = $cle;
            }
            $cibles = array_values(array_unique($cibles));
            if ($mode === 'ecraser') {
                $this->pdo->prepare('DELETE FROM mot WHERE proprietaire_id = ?')->execute([$this->u]);
                $this->pdo->prepare('DELETE FROM mot_chapitre WHERE chapitre_id IN (SELECT id FROM chapitre WHERE proprietaire_id = ?)')->execute([$this->u]);
            }
            $signatures = [];
            $sql = $surLeCours
                ? 'SELECT m.id, m.fr, m.jp_kana, m.jp_kanji, m.proprietaire_id FROM mot m WHERE m.proprietaire_id IS NULL'
                : 'SELECT m.id, m.fr, m.jp_kana, m.jp_kanji, m.proprietaire_id FROM mot m WHERE ' . self::VISIBLE_MOT;
            $req = $this->pdo->prepare($sql);
            $req->execute($surLeCours ? [] : [':u' => $this->u]);
            foreach ($req as $l) {
                $signatures[$this->signature(self::decoderListe($l['fr']), self::decoderListe($l['jp_kana']), self::decoderListe($l['jp_kanji']))]
                    = ['id' => (int) $l['id'], 'cours' => $l['proprietaire_id'] === null];
            }
            foreach ($mots as $brut) {
                if (!is_array($brut)) {
                    $compte['ignores']++;
                    continue;
                }
                $brut = self::champsImport($brut);
                // Un mot sans chapitre ni cible, sur le cours, n'aurait aucune
                // place (« Mes mots » n'existe que dans un compte).
                if ($surLeCours && !$cibles && !self::nettoyerListe($brut['chapitres'] ?? null)) {
                    $compte['ignores']++;
                    continue;
                }
                try {
                    $mot = $this->validerMot($brut);
                } catch (ErreurApi $e) {
                    $compte['ignores']++;
                    continue;
                }
                $sig = $this->signature($mot['fr'], $mot['jp_kana'], $mot['jp_kanji']);
                if (isset($signatures[$sig])) {
                    $id = $signatures[$sig]['id'];
                    $motDuCours = $signatures[$sig]['cours'];
                    $compte['fusionnes']++;
                } else {
                    $id = $this->insererMot($mot, $surLeCours ? null : $this->u);
                    $motDuCours = $surLeCours;
                    $signatures[$sig] = ['id' => $id, 'cours' => $motDuCours];
                    $compte['crees']++;
                }
                $this->lierChapitres($id, $motDuCours, $mot['chapitres'], $categoriesChapitres, $surLeCours);
                $liaisonCible = $this->pdo->prepare('INSERT OR IGNORE INTO mot_chapitre (mot_id, chapitre_id) VALUES (?, ?)');
                foreach ($cibles as $cle) {
                    $liaisonCible->execute([$id, $cle]);
                }
                if (!$surLeCours) {
                    $this->lierMesMots($id);
                }
                // Les thèmes d'un mot du cours ne se touchent que sur le cours.
                if (!$motDuCours || $surLeCours) {
                    $this->lierThemes($id, $mot['thematiques']);
                }
            }
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return $compte;
    }

    /**
     * Les noms « humains » du format d'import (page « Importer des mots »,
     * réponses d'IA) vers ceux de l'API : kanji → jp_kanji, kana → jp_kana,
     * romaji → jp_romaji, contexte → context, themes → thematiques. Un champ
     * déjà au nom de l'API l'emporte.
     */
    public static function champsImport(array $brut): array
    {
        $alias = ['kanji' => 'jp_kanji', 'kana' => 'jp_kana', 'romaji' => 'jp_romaji', 'rōmaji' => 'jp_romaji',
            'contexte' => 'context', 'themes' => 'thematiques', 'thèmes' => 'thematiques', 'francais' => 'fr', 'français' => 'fr'];
        foreach ($alias as $humain => $api) {
            if (array_key_exists($humain, $brut) && !array_key_exists($api, $brut)) {
                $brut[$api] = $brut[$humain];
            }
        }
        return $brut;
    }

    private function signature(array $fr, array $kana, array $kanji): string
    {
        $prep = function (array $l, bool $minuscules): array {
            $l = array_map(function ($v) use ($minuscules) {
                $v = trim((string) $v);
                return $minuscules ? mb_strtolower($v) : $v;
            }, $l);
            sort($l);
            return $l;
        };
        return json_encode([$prep($fr, true), $prep($kana, false), $prep($kanji, false)], JSON_UNESCAPED_UNICODE);
    }

    /**
     * TOUTE la base — tous les comptes — pour passer du poste local à
     * l'hébergement (ou l'inverse). Administrateur seulement.
     */
    public function sauvegarde(): array
    {
        $this->exigerAdmin('télécharger la sauvegarde complète');
        $tout = function (string $sql): array { return $this->pdo->query($sql)->fetchAll(); };
        $mots = [];
        $chaps = [];
        foreach ($tout('SELECT mot_id, chapitre_id FROM mot_chapitre ORDER BY rowid') as $l) {
            $chaps[(int) $l['mot_id']][] = $l['chapitre_id'];
        }
        $themes = [];
        foreach ($tout('SELECT mot_id, thematique FROM mot_thematique ORDER BY rowid') as $l) {
            $themes[(int) $l['mot_id']][] = $l['thematique'];
        }
        foreach ($tout('SELECT * FROM mot ORDER BY id') as $l) {
            $id = (int) $l['id'];
            $mots[] = [
                'id' => $id, 'fr' => self::decoderListe($l['fr']), 'jp_romaji' => self::decoderListe($l['jp_romaji']),
                'jp_kanji' => self::decoderListe($l['jp_kanji']), 'jp_kana' => self::decoderListe($l['jp_kana']),
                'context' => $l['contexte'], 'origine' => $l['origine'],
                'proprietaire_id' => $l['proprietaire_id'] === null ? null : (int) $l['proprietaire_id'],
                'thematiques' => $themes[$id] ?? [], 'chapitres' => $chaps[$id] ?? [],
            ];
        }
        return [
            'format'         => 'nihonjo_sauvegarde',
            'version_schema' => Base::versionSchema($this->pdo),
            'exporte_le'     => gmdate('c'),
            'utilisateurs'   => $tout('SELECT id, uid, email, nom, pseudo, photo, fournisseur, role, cree_le, vu_le FROM utilisateur ORDER BY id'),
            'categories'     => $tout('SELECT nom, ordre FROM categorie ORDER BY ordre, nom'),
            'chapitres'      => $tout('SELECT c.id, c.nom, cat.nom AS categorie, c.ordre, c.origine, c.proprietaire_id FROM chapitre c JOIN categorie cat ON cat.id = c.categorie_id ORDER BY c.rowid'),
            'mots'           => $mots,
            'progression'    => $tout('SELECT utilisateur_id, mot_id, statut, nb_reussites, nb_echecs, derniere_revision, serie, production, acquis_le, valide_le, rafraichissements, prochaine_revision FROM progression'),
            'kana'           => $tout('SELECT utilisateur_id, kana, nb_reussites, nb_echecs, derniere_revision FROM kana_progression'),
            'kanji'          => $tout('SELECT utilisateur_id, kanji, statut, serie_sens, serie_lecture, nb_reussites, nb_echecs, acquis_le, derniere_revision FROM kanji_progression'),
            'preferences'    => $tout('SELECT utilisateur_id, cle, valeur FROM preference'),
        ];
    }

    /**
     * Remplace TOUT le contenu de la base par une sauvegarde. Administrateur.
     * - sauvegarde v2 (avec `utilisateurs`) : tout est repris, comptes compris ;
     * - sauvegarde v1 (un seul utilisateur, 22/10/2026) : le cours reste le
     *   cours, le reste (mots, chapitres perso, progression) va au compte qui
     *   restaure.
     */
    public function restaurer(array $s): array
    {
        $this->exigerAdmin('restaurer une sauvegarde complète');
        if (($s['format'] ?? '') !== 'nihonjo_sauvegarde' || !isset($s['mots'], $s['chapitres'], $s['categories'])) {
            throw new ErreurApi("Ce fichier n'est pas une sauvegarde complète Nihonjo.");
        }
        $v2 = isset($s['utilisateurs']) && is_array($s['utilisateurs']);
        $moi = $this->compte;

        $this->pdo->beginTransaction();
        try {
            foreach (['preference', 'kanji_progression', 'kana_progression', 'progression', 'mot_thematique', 'mot_chapitre', 'mot', 'chapitre', 'categorie', 'utilisateur'] as $table) {
                $this->pdo->exec("DELETE FROM $table");
            }
            if ($v2) {
                // pseudo, photo, fournisseur : depuis le schéma v4 (24/10) ; une
                // sauvegarde plus ancienne ne les a pas, le fournisseur se
                // déduit alors de l'uid comme dans la migration 4.
                $ins = $this->pdo->prepare('INSERT INTO utilisateur (id, uid, email, nom, pseudo, photo, fournisseur, role, cree_le, vu_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
                foreach ($s['utilisateurs'] as $c) {
                    $uid = isset($c['uid']) && $c['uid'] !== null ? (string) $c['uid'] : null;
                    $fournisseur = array_key_exists('fournisseur', $c) ? $c['fournisseur'] : self::fournisseurDeUid($uid);
                    $pseudo = isset($c['pseudo']) && $c['pseudo'] !== '' ? (string) $c['pseudo'] : null;
                    $ins->execute([(int) $c['id'], $uid, (string) ($c['email'] ?? ''), (string) ($c['nom'] ?? ''), $pseudo, (string) ($c['photo'] ?? ''),
                        $fournisseur === null ? null : (string) $fournisseur,
                        ($c['role'] ?? '') === 'admin' ? 'admin' : 'membre', $c['cree_le'] ?? gmdate('Y-m-d H:i:s'), $c['vu_le'] ?? null]);
                }
            }
            // Le compte qui restaure doit exister après coup (sinon il se
            // retrouverait sans compte, ou ses données v1 sans propriétaire).
            $existe = $this->pdo->prepare('SELECT id FROM utilisateur WHERE uid IS ? AND id = ?');
            $existe->execute([$moi['uid'] ?? null, $moi['id']]);
            if (!$existe->fetchColumn()) {
                $parUid = $this->pdo->prepare('SELECT id FROM utilisateur WHERE uid = ?');
                $parUid->execute([$moi['uid'] ?? '']);
                $trouve = ($moi['uid'] ?? null) !== null ? $parUid->fetchColumn() : false;
                if ($trouve !== false) {
                    $this->u = (int) $trouve;
                } else {
                    $libre = (int) $this->pdo->query('SELECT COUNT(*) FROM utilisateur WHERE id = ' . (int) $moi['id'])->fetchColumn() === 0;
                    $this->pdo->prepare("INSERT INTO utilisateur (id, uid, email, nom, photo, fournisseur, role) VALUES (?, ?, ?, ?, ?, ?, 'admin')")
                        ->execute([$libre ? $moi['id'] : null, $moi['uid'] ?? null, (string) ($moi['email'] ?? ''), (string) ($moi['nom'] ?? ''),
                            (string) ($moi['photo'] ?? ''), self::fournisseurDeUid($moi['uid'] ?? null)]);
                    $this->u = (int) $this->pdo->lastInsertId();
                }
            }

            $insCat = $this->pdo->prepare('INSERT INTO categorie (nom, ordre) VALUES (?, ?)');
            foreach ($s['categories'] as $cat) {
                $insCat->execute([(string) $cat['nom'], (int) ($cat['ordre'] ?? 0)]);
            }
            $insChap = $this->pdo->prepare('INSERT INTO chapitre (id, nom, categorie_id, ordre, origine, proprietaire_id) VALUES (?, ?, ?, ?, ?, ?)');
            $clesV1 = [];
            foreach ($s['chapitres'] as $c) {
                if ($v2) {
                    $proprio = isset($c['proprietaire_id']) && $c['proprietaire_id'] !== null ? (int) $c['proprietaire_id'] : null;
                    $insChap->execute([(string) $c['id'], (string) ($c['nom'] ?? $c['id']), $this->idCategorie((string) ($c['categorie'] ?? '')), (int) ($c['ordre'] ?? 0), $proprio === null ? 'cours' : 'perso', $proprio]);
                } else {
                    $nom = self::nomTechniqueChapitre((string) $c['id']);
                    $cours = ($c['origine'] ?? '') === 'cours';
                    $cle = $cours ? $nom : $nom . '@' . $this->u;
                    $clesV1[(string) $c['id']] = $cle;
                    $insChap->execute([$cle, $nom, $this->idCategorie((string) ($c['categorie'] ?? '')), (int) ($c['ordre'] ?? 0), $cours ? 'cours' : 'perso', $cours ? null : $this->u]);
                }
            }
            $insMot = $this->pdo->prepare(
                'INSERT INTO mot (id, fr, jp_romaji, jp_kanji, jp_kana, contexte, origine, proprietaire_id)
                 VALUES (:id, :fr, :romaji, :kanji, :kana, :contexte, :origine, :proprietaire)'
            );
            $lien = $this->pdo->prepare('INSERT OR IGNORE INTO mot_chapitre (mot_id, chapitre_id) VALUES (?, ?)');
            $insProg = $this->pdo->prepare(
                'INSERT OR REPLACE INTO progression (utilisateur_id, mot_id, statut, nb_reussites, nb_echecs, derniere_revision, serie, production, acquis_le, valide_le, rafraichissements, prochaine_revision)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            );
            $nb = 0;
            foreach ($s['mots'] as $brut) {
                $mot = $this->validerMot($brut);
                $id = (int) $brut['id'];
                if ($v2) {
                    $proprio = isset($brut['proprietaire_id']) && $brut['proprietaire_id'] !== null ? (int) $brut['proprietaire_id'] : null;
                } else {
                    $proprio = ($brut['origine'] ?? '') === 'cours' ? null : $this->u;
                }
                $insMot->execute($this->parametresMot($mot) + [':id' => $id, ':origine' => $proprio === null ? 'cours' : 'perso', ':proprietaire' => $proprio]);
                foreach (self::nettoyerListe($brut['chapitres'] ?? []) as $ref) {
                    $cle = $v2 ? $ref : ($clesV1[$ref] ?? null);
                    if ($cle !== null) {
                        $lien->execute([$id, $cle]);
                    }
                }
                $this->lierThemes($id, $mot['thematiques']);
                $p = $brut['progression'] ?? null; // sauvegarde v1 : progression dans le mot
                if (!$v2 && is_array($p) && in_array($p['statut'] ?? '', self::STATUTS, true) && ($p['statut'] !== 'non acquis' || ($p['nb_reussites'] ?? 0) || ($p['nb_echecs'] ?? 0))) {
                    $insProg->execute(array_merge([$this->u, $id, $p['statut'], (int) ($p['nb_reussites'] ?? 0), (int) ($p['nb_echecs'] ?? 0), $p['derniere_revision'] ?? null], self::paliersRestaures($p)));
                }
                $nb++;
            }
            if ($v2) {
                foreach ($s['progression'] ?? [] as $p) {
                    if (in_array($p['statut'] ?? '', self::STATUTS, true)) {
                        $insProg->execute(array_merge([(int) $p['utilisateur_id'], (int) $p['mot_id'], $p['statut'], (int) $p['nb_reussites'], (int) $p['nb_echecs'], $p['derniere_revision'] ?? null], self::paliersRestaures($p)));
                    }
                }
                $insKana = $this->pdo->prepare('INSERT OR REPLACE INTO kana_progression (utilisateur_id, kana, nb_reussites, nb_echecs, derniere_revision) VALUES (?, ?, ?, ?, ?)');
                foreach ($s['kana'] ?? [] as $k) {
                    $insKana->execute([(int) $k['utilisateur_id'], (string) $k['kana'], (int) $k['nb_reussites'], (int) $k['nb_echecs'], $k['derniere_revision'] ?? null]);
                }
                // Les kanjis : depuis le schéma v7 (26/10) ; absents d'une sauvegarde plus ancienne.
                $insKanji = $this->pdo->prepare('INSERT OR REPLACE INTO kanji_progression (utilisateur_id, kanji, statut, serie_sens, serie_lecture, nb_reussites, nb_echecs, acquis_le, derniere_revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
                foreach ($s['kanji'] ?? [] as $k) {
                    if (in_array($k['statut'] ?? '', self::STATUTS, true)) {
                        $insKanji->execute([(int) $k['utilisateur_id'], (string) $k['kanji'], $k['statut'], (int) $k['serie_sens'], (int) $k['serie_lecture'], (int) $k['nb_reussites'], (int) $k['nb_echecs'], $k['acquis_le'] ?? null, $k['derniere_revision'] ?? null]);
                    }
                }
                $insPref = $this->pdo->prepare('INSERT OR REPLACE INTO preference (utilisateur_id, cle, valeur) VALUES (?, ?, ?)');
                foreach ($s['preferences'] ?? [] as $p) {
                    if (in_array($p['cle'] ?? '', self::CLES_PREFERENCES, true)) {
                        $insPref->execute([(int) $p['utilisateur_id'], (string) $p['cle'], (string) $p['valeur']]);
                    }
                }
            }
            $this->pdo->commit();
        } catch (Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
        return ['mots' => $nb, 'comptes' => (int) $this->pdo->query('SELECT COUNT(*) FROM utilisateur')->fetchColumn()];
    }

    public function sante(string $cheminBase): array
    {
        return [
            'php'            => PHP_VERSION,
            'sqlite'         => $this->pdo->query('SELECT sqlite_version()')->fetchColumn(),
            'version_schema' => Base::versionSchema($this->pdo),
            'base'           => basename($cheminBase),
            'dossier_inscriptible' => is_writable(dirname($cheminBase)),
            'nb_mots_du_cours' => (int) $this->pdo->query('SELECT COUNT(*) FROM mot WHERE proprietaire_id IS NULL')->fetchColumn(),
            'nb_comptes'     => (int) $this->pdo->query('SELECT COUNT(*) FROM utilisateur WHERE uid IS NOT NULL')->fetchColumn(),
        ];
    }
}
