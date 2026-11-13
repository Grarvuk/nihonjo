<?php
declare(strict_types=1);

/**
 * Premier remplissage de la base, depuis api/amorce/vocabulaire_initial.json
 * (produit par outils/convertir_donnees_v1.mjs à partir de data_cours.js).
 *
 * Ne s'exécute QUE si la base est vide (ni catégorie, ni mot). Une base
 * existante n'est jamais ré-amorcée : modifier l'amorce n'a donc aucun effet
 * sur une installation qui tourne déjà — pour ajouter du vocabulaire à une
 * base existante, passer par l'import (écran « Données »).
 */
final class Amorcage
{
    public static function siBaseVide(PDO $pdo, string $cheminAmorce): bool
    {
        if (!self::estVide($pdo)) {
            return false;
        }
        // BEGIN IMMEDIATE prend le verrou d'écriture tout de suite : deux
        // premières requêtes simultanées (l'interface en lance plusieurs au
        // chargement) ne peuvent pas amorcer deux fois. Le second attend
        // (busy_timeout), puis voit la base remplie et repart.
        $pdo->exec('BEGIN IMMEDIATE');
        try {
            if (!self::estVide($pdo)) {
                $pdo->exec('COMMIT');
                return false;
            }
            self::remplir($pdo, self::lire($cheminAmorce));
            $pdo->exec('COMMIT');
            return true;
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            throw $e;
        }
    }

    private static function estVide(PDO $pdo): bool
    {
        return (int) $pdo->query('SELECT (SELECT COUNT(*) FROM categorie) + (SELECT COUNT(*) FROM mot)')->fetchColumn() === 0;
    }

    private static function lire(string $chemin): array
    {
        if (!is_file($chemin)) {
            throw new RuntimeException("Amorce introuvable : $chemin");
        }
        $amorce = json_decode((string) file_get_contents($chemin), true);
        if (!is_array($amorce) || !isset($amorce['categories'], $amorce['chapitres'], $amorce['mots'])) {
            throw new RuntimeException("Amorce illisible : $chemin");
        }
        return $amorce;
    }

    private static function remplir(PDO $pdo, array $amorce): void
    {
        $idsCategorie = [];
        $insCat = $pdo->prepare('INSERT INTO categorie (nom, ordre) VALUES (?, ?)');
        foreach ($amorce['categories'] as $cat) {
            $insCat->execute([$cat['nom'], (int) $cat['ordre']]);
            $idsCategorie[$cat['nom']] = (int) $pdo->lastInsertId();
        }

        $insChap = $pdo->prepare("INSERT INTO chapitre (id, nom, categorie_id, ordre, origine) VALUES (?, ?, ?, ?, 'cours')");
        foreach ($amorce['chapitres'] as $c) {
            // « personnel » vient de config_chapitres.js, mais depuis les
            // comptes chaque compte a le sien — « Mes mots » (mes_mots@<id>)
            // depuis le schéma v3 : ce n'est pas un chapitre du cours.
            if ($c['id'] === Depot::ANCIEN_CHAPITRE_PAR_DEFAUT || $c['id'] === Depot::CHAPITRE_PAR_DEFAUT) {
                continue;
            }
            if (!isset($idsCategorie[$c['categorie']])) {
                $insCat->execute([$c['categorie'], count($idsCategorie) + 1]);
                $idsCategorie[$c['categorie']] = (int) $pdo->lastInsertId();
            }
            $insChap->execute([$c['id'], $c['id'], $idsCategorie[$c['categorie']], (int) $c['ordre']]);
        }

        $insMot = $pdo->prepare(
            "INSERT INTO mot (fr, jp_romaji, jp_kanji, jp_kana, contexte, origine) VALUES (?, ?, ?, ?, ?, 'cours')"
        );
        $insLienChap = $pdo->prepare('INSERT OR IGNORE INTO mot_chapitre (mot_id, chapitre_id) VALUES (?, ?)');
        $insLienTheme = $pdo->prepare('INSERT OR IGNORE INTO mot_thematique (mot_id, thematique) VALUES (?, ?)');
        foreach ($amorce['mots'] as $m) {
            $insMot->execute([
                Depot::encoderListe($m['fr']),
                Depot::encoderListe($m['jp_romaji']),
                Depot::encoderListe($m['jp_kanji']),
                Depot::encoderListe($m['jp_kana']),
                (string) ($m['context'] ?? ''),
            ]);
            $id = (int) $pdo->lastInsertId();
            foreach (Depot::nettoyerListe($m['chapitres']) as $chap) {
                $insLienChap->execute([$id, $chap]);
            }
            foreach (Depot::nettoyerListe($m['thematiques']) as $t) {
                $insLienTheme->execute([$id, $t]);
            }
        }
    }
}
