# T-005 · Lanceur `lancer_nihonjo.bat`

- **Créé** : 2026-10-23
- **Tags** : #local #docker

## Description
Un double-clic lance toute la solution sur le poste : démarre Docker Desktop
s'il ne répond pas (attente jusqu'à ~2 min), `docker compose up -d --build`
(ou `docker-compose` v1), attend que l'API réponde, ouvre
http://localhost:8080. En cas d'échec, montre les derniers journaux du
conteneur. Rappelle la commande d'arrêt et l'interdiction de `down -v`.

## Comment tester
1. Docker Desktop fermé : double-clic sur `lancer_nihonjo.bat` → Docker
   démarre, puis la construction, puis le navigateur s'ouvre sur Nihonjo.
2. Relancer avec Docker ouvert : plus rapide, même résultat.
3. Après une modification de code : relancer le `.bat`, la modification est
   visible.
4. La fenêtre se ferme sur une touche ; le conteneur continue de tourner.

## Commentaires
### 2026-10-23 · écrit sans Windows
Jamais lancé : écrit et relu dans un conteneur Linux, fins de ligne CRLF
contrôlées (`.gitattributes`). À essayer par José.

### 2026-10-24 · toujours refaire le conteneur, et dire le mode
Un conteneur ancien continuait de tourner après une livraison (vu le 24/10 :
plus d'un jour de retard). Le `.bat` lance maintenant `up -d --build
--force-recreate`, puis affiche « Connexion : Google » ou « Connexion :
AUCUNE » d'après l'action `sante` du serveur lancé.
