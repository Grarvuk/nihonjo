# Backlog

> Légende : 🔴 critique · 🟡 normal · 🟢 nice-to-have
>
> Source de vérité du travail à faire. Une fois une tâche prise en charge, le
> détail d'implémentation va dans sa fiche `tasks/`.

## 🔴 Critique

*Rien en attente.*

---

## 🟡 Normal

| ID    | Tags | Description |
|-------|------|-------------|
| T-002 | #deploiement | **Mettre la v2 en ligne sur OVH et la vérifier.** Envoyer `index.html`, `assets/`, `api/` et `data/.htaccess` — **pas** `data/nihonjo.sqlite`. Puis les cinq vérifications de `doc_pour_agents/deploiement.md` (PHP et `pdo_sqlite` actifs, `data/nihonjo.sqlite` → 403, `api/config.php` → 403, mot de passe demandé, ligne « Serveur »). Ensuite, sur chaque appareil où la v1 servait en ligne : le bandeau de l'accueil → « Importer dans la base ». Dépend de T-001 (validation locale). **Depuis le 23/10 (T-003)** : avant l'envoi, ajouter `nihonjo.odyvresse.com` aux domaines autorisés de la console Firebase (projet « odyvresse ») ; se connecter **le premier** (ou poser `administrateurs` dans `api/config.local.php` du serveur) ; vérifier que `sante` dit `"mode": "firebase"` et que la connexion Google aboutit (sinon : PHP ne joint pas `www.googleapis.com`) ; décider de garder ou non le mot de passe Basic. Détail : `doc_pour_agents/deploiement.md`. |

---

## 🟢 Nice-to-have

*Les pistes proposées par les agents sont dans `carnet_agent/idees.md`
(répétition espacée, homonymes en Français → japonais, fusion de thèmes,
envoi FTP par script…) : à reprendre ici quand José en retient une.*
