<?php
declare(strict_types=1);

/**
 * Connexion SQLite et schéma de la base Nihonjo.
 *
 * Le schéma évolue par MIGRATIONS NUMÉROTÉES (`Base::MIGRATIONS`), suivies par
 * `PRAGMA user_version`. Une base existante n'est jamais recréée : on lui
 * applique seulement les migrations qui lui manquent. Ajouter une migration =
 * ajouter une entrée à la fin du tableau, ne JAMAIS modifier une entrée déjà
 * livrée (la base de production l'a déjà jouée et ne la rejouera pas).
 */
final class Base
{
    /** @var array<int, string> version => SQL. La clé est la version ATTEINTE après la migration. */
    private const MIGRATIONS = [
        1 => <<<'SQL'
            CREATE TABLE categorie (
                id     INTEGER PRIMARY KEY,
                nom    TEXT    NOT NULL UNIQUE,
                ordre  INTEGER NOT NULL DEFAULT 0
            );

            -- L'identifiant d'un chapitre est son nom technique historique
            -- (« vocabulaire_p_45 », « personnel ») : c'est lui que portent les
            -- exports JSON de la v1 et les cases cochées gardées dans le
            -- localStorage. Le renommer change donc la clé primaire, d'où le
            -- ON UPDATE CASCADE de mot_chapitre.
            CREATE TABLE chapitre (
                id            TEXT    PRIMARY KEY,
                categorie_id  INTEGER NOT NULL REFERENCES categorie(id),
                ordre         INTEGER NOT NULL DEFAULT 0,
                origine       TEXT    NOT NULL DEFAULT 'perso' CHECK (origine IN ('cours', 'perso')),
                cree_le       TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            -- fr / jp_* sont des LISTES de variantes acceptées (synonymes,
            -- lectures on/kun), rangées en JSON : on ne les interroge jamais
            -- une par une en SQL, la comparaison des réponses se fait dans le
            -- navigateur. Toujours passer par Depot::encoderListe/decoderListe.
            CREATE TABLE mot (
                id          INTEGER PRIMARY KEY,
                fr          TEXT NOT NULL,
                jp_romaji   TEXT NOT NULL DEFAULT '[]',
                jp_kanji    TEXT NOT NULL DEFAULT '[]',
                jp_kana     TEXT NOT NULL DEFAULT '[]',
                contexte    TEXT NOT NULL DEFAULT '',
                origine     TEXT NOT NULL DEFAULT 'perso' CHECK (origine IN ('cours', 'perso')),
                cree_le     TEXT NOT NULL DEFAULT (datetime('now')),
                modifie_le  TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE mot_chapitre (
                mot_id       INTEGER NOT NULL REFERENCES mot(id) ON DELETE CASCADE,
                chapitre_id  TEXT    NOT NULL REFERENCES chapitre(id) ON DELETE CASCADE ON UPDATE CASCADE,
                PRIMARY KEY (mot_id, chapitre_id)
            );
            CREATE INDEX idx_mot_chapitre_chapitre ON mot_chapitre(chapitre_id);

            CREATE TABLE mot_thematique (
                mot_id      INTEGER NOT NULL REFERENCES mot(id) ON DELETE CASCADE,
                thematique  TEXT    NOT NULL,
                PRIMARY KEY (mot_id, thematique)
            );

            -- Une ligne par mot DÉJÀ travaillé ; pas de ligne = « non acquis ».
            -- La v1 indexait la progression par le texte français (fr[0]) :
            -- deux mots de même sens partageaient leur état. Ici, par mot.
            CREATE TABLE progression (
                mot_id             INTEGER PRIMARY KEY REFERENCES mot(id) ON DELETE CASCADE,
                statut             TEXT    NOT NULL CHECK (statut IN ('non acquis', 'a revoir', 'acquis')),
                nb_reussites       INTEGER NOT NULL DEFAULT 0,
                nb_echecs          INTEGER NOT NULL DEFAULT 0,
                derniere_revision  TEXT
            );
            SQL,

        // v2 (23/10/2026) — comptes Firebase. Une base v1 (un seul
        // utilisateur) devient le « compte initial » (id 1, sans uid) : la
        // première connexion le réclame (Comptes::pourIdentite) et retrouve
        // ainsi ses mots, ses chapitres et sa progression.
        2 => <<<'SQL'
            CREATE TABLE utilisateur (
                id       INTEGER PRIMARY KEY,
                uid      TEXT UNIQUE,                 -- uid Firebase ; NULL = compte initial pas encore réclamé
                email    TEXT NOT NULL DEFAULT '',
                nom      TEXT NOT NULL DEFAULT '',
                role     TEXT NOT NULL DEFAULT 'membre' CHECK (role IN ('membre', 'admin')),
                cree_le  TEXT NOT NULL DEFAULT (datetime('now')),
                vu_le    TEXT
            );
            INSERT INTO utilisateur (id, nom, role) VALUES (1, 'Compte initial', 'admin');

            -- NULL = mot du cours, partagé par tous les comptes.
            ALTER TABLE mot ADD COLUMN proprietaire_id INTEGER REFERENCES utilisateur(id) ON DELETE CASCADE;
            UPDATE mot SET proprietaire_id = 1 WHERE origine = 'perso';
            CREATE INDEX idx_mot_proprietaire ON mot(proprietaire_id);

            -- Deux comptes peuvent avoir chacun leur chapitre « animaux » : la
            -- clé d'un chapitre de compte devient « nom@idCompte » ; celle d'un
            -- chapitre du cours reste son nom (vocabulaire_p_45). Les liaisons
            -- suivent par ON UPDATE CASCADE.
            ALTER TABLE chapitre ADD COLUMN proprietaire_id INTEGER REFERENCES utilisateur(id) ON DELETE CASCADE;
            ALTER TABLE chapitre ADD COLUMN nom TEXT NOT NULL DEFAULT '';
            UPDATE chapitre SET nom = id;
            UPDATE chapitre SET proprietaire_id = 1 WHERE origine = 'perso';
            UPDATE chapitre SET id = nom || '@1' WHERE proprietaire_id = 1;
            CREATE INDEX idx_chapitre_proprietaire ON chapitre(proprietaire_id);

            -- La progression devient propre à chaque compte : nouvelle clé
            -- primaire, donc table reconstruite (SQLite ne change pas une PK).
            CREATE TABLE progression_v2 (
                utilisateur_id     INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
                mot_id             INTEGER NOT NULL REFERENCES mot(id) ON DELETE CASCADE,
                statut             TEXT    NOT NULL CHECK (statut IN ('non acquis', 'a revoir', 'acquis')),
                nb_reussites       INTEGER NOT NULL DEFAULT 0,
                nb_echecs          INTEGER NOT NULL DEFAULT 0,
                derniere_revision  TEXT,
                PRIMARY KEY (utilisateur_id, mot_id)
            );
            INSERT INTO progression_v2 (utilisateur_id, mot_id, statut, nb_reussites, nb_echecs, derniere_revision)
                SELECT 1, mot_id, statut, nb_reussites, nb_echecs, derniere_revision FROM progression;
            DROP TABLE progression;
            ALTER TABLE progression_v2 RENAME TO progression;

            -- Le jeu des kana : une ligne par compte et par caractère joué
            -- (« か » et « カ » sont deux caractères distincts).
            CREATE TABLE kana_progression (
                utilisateur_id     INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
                kana               TEXT    NOT NULL,
                nb_reussites       INTEGER NOT NULL DEFAULT 0,
                nb_echecs          INTEGER NOT NULL DEFAULT 0,
                derniere_revision  TEXT,
                PRIMARY KEY (utilisateur_id, kana)
            );
            SQL,

        // v3 (23/10/2026) — tout ce qui restait dans le navigateur (sélection
        // de révision, filtres, réglages, thème) passe dans la base, par
        // compte ; et le chapitre par défaut « personnel » devient « Mes mots »
        // (mes_mots@<id>), que chaque compte possède et qui contient TOUS ses
        // mots (Depot::assurerMesMots le tient à jour ensuite).
        3 => <<<'SQL'
            CREATE TABLE preference (
                utilisateur_id  INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
                cle             TEXT    NOT NULL,      -- liste blanche : Depot::CLES_PREFERENCES
                valeur          TEXT    NOT NULL,      -- JSON
                modifie_le      TEXT    NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (utilisateur_id, cle)
            );

            -- « personnel@3 » → « mes_mots@3 » ; les liaisons suivent par
            -- ON UPDATE CASCADE (foreign_keys est déjà ON : Base::ouvrir).
            UPDATE chapitre SET nom = 'mes_mots', id = 'mes_mots@' || proprietaire_id
             WHERE nom = 'personnel' AND proprietaire_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM chapitre x WHERE x.id = 'mes_mots@' || chapitre.proprietaire_id);

            -- ⚠️ Seulement sur une base DÉJÀ remplie : sur une base neuve, créer
            -- une catégorie ici empêcherait l'amorce (Amorcage::estVide compte
            -- les catégories). Depot::assurerMesMots crée alors « Mes mots » au
            -- premier appel du compte.
            -- (Sous-requête pour MAX : « SELECT MAX(…) FROM t WHERE <faux> »
            -- renvoie QUAND MÊME une ligne — un agrégat sans GROUP BY.)
            INSERT OR IGNORE INTO categorie (nom, ordre)
                SELECT 'Personnel', (SELECT COALESCE(MAX(ordre), 0) + 1 FROM categorie) WHERE EXISTS (SELECT 1 FROM mot);
            INSERT INTO chapitre (id, nom, categorie_id, ordre, origine, proprietaire_id)
                SELECT 'mes_mots@' || u.id, 'mes_mots', (SELECT id FROM categorie WHERE nom = 'Personnel'), 0, 'perso', u.id
                  FROM utilisateur u
                 WHERE EXISTS (SELECT 1 FROM categorie WHERE nom = 'Personnel')
                   AND NOT EXISTS (SELECT 1 FROM chapitre c WHERE c.id = 'mes_mots@' || u.id);
            INSERT OR IGNORE INTO mot_chapitre (mot_id, chapitre_id)
                SELECT m.id, 'mes_mots@' || m.proprietaire_id FROM mot m
                 WHERE m.proprietaire_id IS NOT NULL
                   AND EXISTS (SELECT 1 FROM chapitre c WHERE c.id = 'mes_mots@' || m.proprietaire_id);
            SQL,

        // v4 (24/10/2026) — gestion des comptes comme Odyvresse : inscription
        // explicite, deux fournisseurs (Google par Firebase, Discord par
        // OAuth2), un pseudo que l'utilisateur choisit (le nom du fournisseur
        // est rafraîchi à chaque connexion, le pseudo jamais), une photo.
        4 => <<<'SQL'
            ALTER TABLE utilisateur ADD COLUMN fournisseur TEXT;  -- google | discord | dev ; NULL = compte initial pas encore réclamé
            ALTER TABLE utilisateur ADD COLUMN pseudo TEXT;       -- nom choisi dans « Mon compte » ; NULL = le nom du fournisseur
            ALTER TABLE utilisateur ADD COLUMN photo TEXT NOT NULL DEFAULT '';  -- URL de l'avatar du fournisseur
            UPDATE utilisateur SET fournisseur = CASE
                WHEN uid IS NULL THEN NULL
                WHEN uid LIKE 'dev:%' THEN 'dev'
                WHEN uid LIKE 'discord:%' THEN 'discord'
                ELSE 'google' END;
            SQL,

        // v5 (25/10/2026) — paliers de progression : un mot réussi une fois
        // n'est plus « acquis » d'emblée. Nouvel état « en cours » (CHECK
        // changé, donc table reconstruite) ; « acquis » demande des réussites
        // sur deux jours différents dont une en production (écrire le
        // japonais) ; chaque mot a une date de prochaine révision.
        // Les mots déjà acquis le restent ; ils reviennent 3 jours après leur
        // dernière révision.
        5 => <<<'SQL'
            CREATE TABLE progression_v5 (
                utilisateur_id      INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
                mot_id              INTEGER NOT NULL REFERENCES mot(id) ON DELETE CASCADE,
                statut              TEXT    NOT NULL CHECK (statut IN ('non acquis', 'en cours', 'a revoir', 'acquis')),
                nb_reussites        INTEGER NOT NULL DEFAULT 0,
                nb_echecs           INTEGER NOT NULL DEFAULT 0,
                derniere_revision   TEXT,
                jours_reussis       INTEGER NOT NULL DEFAULT 0,  -- jours DIFFÉRENTS avec une réussite (rappel ou production) depuis le dernier échec
                dernier_jour_reussi TEXT,                        -- AAAA-MM-JJ, heure de Paris
                production          INTEGER NOT NULL DEFAULT 0,  -- 1 : réussi en production depuis le dernier échec
                prochaine_revision  TEXT,                        -- AAAA-MM-JJ : le mot revient à partir de ce jour ; NULL = pas de date
                PRIMARY KEY (utilisateur_id, mot_id)
            );
            INSERT INTO progression_v5 (utilisateur_id, mot_id, statut, nb_reussites, nb_echecs, derniere_revision,
                                        jours_reussis, dernier_jour_reussi, production, prochaine_revision)
                SELECT utilisateur_id, mot_id, statut, nb_reussites, nb_echecs, derniere_revision,
                       CASE WHEN statut = 'acquis' THEN 2 ELSE 0 END,
                       CASE WHEN statut = 'acquis' THEN date(derniere_revision) END,
                       CASE WHEN statut = 'acquis' THEN 1 ELSE 0 END,
                       CASE WHEN statut = 'acquis' THEN date(COALESCE(derniere_revision, 'now'), '+3 days')
                            WHEN statut = 'a revoir' THEN date(COALESCE(derniere_revision, 'now')) END
                  FROM progression;
            DROP TABLE progression;
            ALTER TABLE progression_v5 RENAME TO progression;
            SQL,

        // v6 (25/10/2026, le soir) — José : « acquis » = deux réussites DE
        // SUITE (plus deux jours différents) ; et un état pour revoir les mots
        // appris il y a longtemps (« à rafraîchir », calculé : un acquis dont
        // la date de rafraîchissement est arrivée). D'où la date
        // d'acquisition, la date de dernière validation et le nombre de
        // rafraîchissements réussis. Table reconstruite pour retirer
        // jours_reussis / dernier_jour_reussi (RENAME / DROP COLUMN exigent un
        // SQLite récent, inconnu chez OVH).
        6 => <<<'SQL'
            CREATE TABLE progression_v6 (
                utilisateur_id      INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
                mot_id              INTEGER NOT NULL REFERENCES mot(id) ON DELETE CASCADE,
                statut              TEXT    NOT NULL CHECK (statut IN ('non acquis', 'en cours', 'a revoir', 'acquis')),
                nb_reussites        INTEGER NOT NULL DEFAULT 0,
                nb_echecs           INTEGER NOT NULL DEFAULT 0,
                derniere_revision   TEXT,
                serie               INTEGER NOT NULL DEFAULT 0,  -- réussites de suite (rappel ou production) depuis le dernier échec
                production          INTEGER NOT NULL DEFAULT 0,  -- 1 : réussi en production depuis le dernier échec (information)
                acquis_le           TEXT,                        -- AAAA-MM-JJ (Paris) : devenu acquis ; NULL sinon
                valide_le           TEXT,                        -- AAAA-MM-JJ : dernière réussite d'un mot acquis (ou son acquisition)
                rafraichissements   INTEGER NOT NULL DEFAULT 0,  -- fois où il a été réussi alors qu'il était « à rafraîchir »
                prochaine_revision  TEXT,                        -- AAAA-MM-JJ : un acquis devient « à rafraîchir » ce jour-là ; NULL hors acquis
                PRIMARY KEY (utilisateur_id, mot_id)
            );
            INSERT INTO progression_v6 (utilisateur_id, mot_id, statut, nb_reussites, nb_echecs, derniere_revision,
                                        serie, production, acquis_le, valide_le, rafraichissements, prochaine_revision)
                SELECT utilisateur_id, mot_id, statut, nb_reussites, nb_echecs, derniere_revision,
                       CASE statut WHEN 'acquis' THEN MAX(jours_reussis, 2) WHEN 'en cours' THEN MIN(MAX(jours_reussis, 0), 1) ELSE 0 END,
                       production,
                       CASE WHEN statut = 'acquis' THEN COALESCE(dernier_jour_reussi, date(derniere_revision), date('now')) END,
                       CASE WHEN statut = 'acquis' THEN COALESCE(dernier_jour_reussi, date(derniere_revision), date('now')) END,
                       0,
                       CASE WHEN statut = 'acquis' THEN date(COALESCE(dernier_jour_reussi, date(derniere_revision), date('now')), '+7 days') END
                  FROM progression;
            DROP TABLE progression;
            ALTER TABLE progression_v6 RENAME TO progression;
            SQL,

        // v7 (26/10/2026) — les kanjis (page « Kanji » et son jeu) ont leur
        // progression, à part de celle des mots : un kanji n'est pas un mot.
        // Deux facettes, chacune avec sa série de réussites : le SENS (taper
        // le sens en français) et la LECTURE (taper une lecture en kana).
        // « acquis » = les deux séries à Depot::SERIE_POUR_ACQUIS
        // (Depot::enregistrerKanji). Clé : le caractère (« 水 »).
        7 => <<<'SQL'
            CREATE TABLE kanji_progression (
                utilisateur_id     INTEGER NOT NULL REFERENCES utilisateur(id) ON DELETE CASCADE,
                kanji              TEXT    NOT NULL,
                statut             TEXT    NOT NULL DEFAULT 'non acquis' CHECK (statut IN ('non acquis', 'en cours', 'a revoir', 'acquis')),
                serie_sens         INTEGER NOT NULL DEFAULT 0,  -- sens réussi de suite depuis le dernier échec sur le sens
                serie_lecture      INTEGER NOT NULL DEFAULT 0,  -- lecture réussie de suite depuis le dernier échec sur la lecture
                nb_reussites       INTEGER NOT NULL DEFAULT 0,
                nb_echecs          INTEGER NOT NULL DEFAULT 0,
                acquis_le          TEXT,                        -- AAAA-MM-JJ (Paris) ; NULL hors acquis
                derniere_revision  TEXT,
                PRIMARY KEY (utilisateur_id, kanji)
            );
            SQL,
    ];

    public static function ouvrir(string $chemin): PDO
    {
        $dossier = dirname($chemin);
        if (!is_dir($dossier) && !@mkdir($dossier, 0775, true)) {
            throw new RuntimeException("Impossible de créer le dossier de la base : $dossier");
        }
        if (!is_writable($dossier)) {
            // ⚠️ SQLite écrit un fichier de journal À CÔTÉ de la base pendant
            // chaque écriture : un dossier non inscriptible fait échouer les
            // écritures même si le fichier .sqlite lui-même l'est.
            throw new RuntimeException("Le dossier de la base n'est pas inscriptible par PHP : $dossier");
        }

        $pdo = new PDO('sqlite:' . $chemin, null, null, [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        // ⚠️ foreign_keys est réglé PAR CONNEXION et vaut OFF par défaut.
        // Sans cette ligne, ON DELETE CASCADE et ON UPDATE CASCADE ne font
        // rien, sans une erreur : supprimer un mot laisse ses liaisons, et
        // renommer un chapitre vide silencieusement ses mots.
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        // Pas de journal WAL : il exige une mémoire partagée que les
        // hébergements mutualisés (OVH) ne garantissent pas sur leur stockage.
        self::migrer($pdo);
        return $pdo;
    }

    public static function versionSchema(PDO $pdo): int
    {
        return (int) $pdo->query('PRAGMA user_version')->fetchColumn();
    }

    public static function versionCible(): int
    {
        return max(array_keys(self::MIGRATIONS));
    }

    private static function migrer(PDO $pdo): void
    {
        $actuelle = self::versionSchema($pdo);
        foreach (self::MIGRATIONS as $version => $sql) {
            if ($version <= $actuelle) {
                continue;
            }
            $pdo->beginTransaction();
            try {
                $pdo->exec($sql);
                // PRAGMA n'accepte pas de paramètre lié : $version est un entier de ce fichier.
                $pdo->exec('PRAGMA user_version = ' . (int) $version);
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw new RuntimeException("Migration $version du schéma impossible : " . $e->getMessage(), 0, $e);
            }
        }
    }
}
