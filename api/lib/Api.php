<?php
declare(strict_types=1);

/**
 * Routeur des actions de l'API : `api/index.php?action=<nom>`.
 *
 * Style « une action par nom » plutôt que REST (PUT/DELETE, réécriture
 * d'URL) : rien ici ne dépend de mod_rewrite ni d'un verbe HTTP que
 * l'hébergement pourrait filtrer. Lecture en GET, toute écriture en POST.
 *
 * Toutes ces actions agissent POUR le compte connecté (le `Depot` reçu est
 * celui de ce compte). Celles qui se passent de compte — `sante`,
 * `compte.creer` (l'inscription), `deconnexion`, `discord.debut`,
 * `discord.retour` — sont traitées avant l'authentification, dans
 * api/index.php.
 */
final class Api
{
    /** @var Depot */
    private $depot;
    /** @var string firebase | aucune | dev */
    private $modeAuth;

    public function __construct(Depot $depot, string $modeAuth = 'firebase')
    {
        $this->depot = $depot;
        $this->modeAuth = $modeAuth;
    }

    /** @return array<string, array{0: string, 1: callable}> */
    private function routes(): array
    {
        $d = $this->depot;
        return [
            'donnees'               => ['GET',  function () use ($d) { return $d->toutesLesDonnees(); }],
            'moi'                   => ['GET',  function () use ($d) { return $d->moi(); }],
            'sauvegarde'            => ['GET',  function () use ($d) { return $d->sauvegarde(); }],
            'mot.enregistrer'       => ['POST', function (array $c) use ($d) { return $d->enregistrerMot($c); }],
            'mot.supprimer'         => ['POST', function (array $c) use ($d) { $d->supprimerMot($this->entier($c, 'id')); return null; }],
            'progression.resultat'  => ['POST', function (array $c) use ($d) { return $d->enregistrerResultat($this->entier($c, 'mot_id'), !empty($c['reussite']), (string) ($c['niveau'] ?? 'reconnaissance'), !empty($c['autre_alphabet'])); }],
            'progression.definir'   => ['POST', function (array $c) use ($d) { return $d->definirStatut($this->entier($c, 'mot_id'), (string) ($c['statut'] ?? '')); }],
            'progression.fusionner' => ['POST', function (array $c) use ($d) { return $d->fusionnerStatuts($this->liste($c, 'elements')); }],
            'kanji.resultat'        => ['POST', function (array $c) use ($d) { return $d->enregistrerKanji((string) ($c['kanji'] ?? ''), (string) ($c['exercice'] ?? ''), !empty($c['reussite'])); }],
            'kana.resultat'         => ['POST', function (array $c) use ($d) { return $d->enregistrerKana((string) ($c['kana'] ?? ''), !empty($c['reussite'])); }],
            'chapitre.creer'        => ['POST', function (array $c) use ($d) {
                return $d->creerChapitre((string) ($c['nom'] ?? ''), (string) ($c['categorie'] ?? ''), $this->liste($c, 'peupler', true), !empty($c['cours']));
            }],
            'chapitre.modifier'     => ['POST', function (array $c) use ($d) {
                return $d->modifierChapitre((string) ($c['id'] ?? ''), isset($c['nom']) ? (string) $c['nom'] : null, isset($c['categorie']) ? (string) $c['categorie'] : null);
            }],
            'chapitre.supprimer'    => ['POST', function (array $c) use ($d) { return $d->supprimerChapitre((string) ($c['id'] ?? '')); }],
            'chapitre.ajouterMots'  => ['POST', function (array $c) use ($d) { return $d->ajouterMotsAuChapitre((string) ($c['id'] ?? ''), $this->liste($c, 'mots')); }],
            'chapitre.retirerMots'  => ['POST', function (array $c) use ($d) { return $d->retirerMotsDuChapitre((string) ($c['id'] ?? ''), $this->liste($c, 'mots')); }],
            'import.mots'           => ['POST', function (array $c) use ($d) {
                return $d->importerMots($this->liste($c, 'mots'), (string) ($c['mode'] ?? 'ajouter'), $this->liste($c, 'categories_chapitres', true),
                    (string) ($c['cible'] ?? 'perso'), $this->liste($c, 'chapitres', true), (string) ($c['nouveau_chapitre'] ?? ''));
            }],
            'preference.ecrire'     => ['POST', function (array $c) use ($d) { return $d->ecrirePreference((string) ($c['cle'] ?? ''), $c['valeur'] ?? null); }],
            'restauration'          => ['POST', function (array $c) use ($d) { return $d->restaurer($c); }],
            // Les comptes (Comptes, dans Authentification.php ; droits dans Depot).
            'compte.profil'         => ['GET',  function () use ($d) { return $d->profil(); }],
            'compte.modifier'       => ['POST', function (array $c) use ($d) { return $d->modifierPseudo((string) ($c['pseudo'] ?? '')); }],
            'compte.supprimer'      => ['POST', function (array $c) use ($d) {
                if ($this->modeAuth === 'aucune') {
                    throw new ErreurApi('Sur un poste local sans connexion, le compte unique ne se supprime pas.');
                }
                // Garde contre un appel par erreur : l'interface envoie la
                // confirmation que l'utilisateur a donnée dans la boîte de dialogue.
                if (($c['confirmation'] ?? '') !== 'supprimer') {
                    throw new ErreurApi('Suppression non confirmée.');
                }
                $bilan = $d->supprimerMonCompte();
                Authentification::deconnecter();
                return $bilan;
            }],
            'comptes.lister'        => ['GET',  function () use ($d) { return $d->listerComptes(); }],
            'comptes.role'          => ['POST', function (array $c) use ($d) { return $d->changerRoleCompte($this->entier($c, 'id'), (string) ($c['role'] ?? '')); }],
            'comptes.supprimer'     => ['POST', function (array $c) use ($d) { return $d->supprimerUnCompte($this->entier($c, 'id')); }],
        ];
    }

    /** @return mixed */
    public function traiter(string $methode, string $action, array $corps)
    {
        $routes = $this->routes();
        if (!isset($routes[$action])) {
            throw new ErreurApi("Action inconnue : « $action ».", 404);
        }
        [$attendue, $fonction] = $routes[$action];
        if ($methode !== $attendue) {
            throw new ErreurApi("L'action « $action » s'appelle en $attendue.", 405);
        }
        return $fonction($corps);
    }

    private function entier(array $c, string $cle): int
    {
        if (!isset($c[$cle]) || !is_numeric($c[$cle])) {
            throw new ErreurApi("Paramètre « $cle » manquant ou non numérique.");
        }
        return (int) $c[$cle];
    }

    private function liste(array $c, string $cle, bool $facultatif = false): array
    {
        if (!isset($c[$cle])) {
            if ($facultatif) {
                return [];
            }
            throw new ErreurApi("Paramètre « $cle » manquant.");
        }
        if (!is_array($c[$cle])) {
            throw new ErreurApi("Le paramètre « $cle » doit être une liste.");
        }
        return $c[$cle];
    }
}
