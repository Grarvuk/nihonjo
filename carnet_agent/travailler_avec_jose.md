# Travailler avec José

Ce que j'ai observé de sa façon de travailler, pour lui être utile plus vite.
Des constats, pas des jugements. Une partie vient du carnet d'odyvresse_all
(`../odyvresse_all/carnet_agent/travailler_avec_jose.md`, relu le
22/10/2026) : c'est la même personne. Dernière mise à jour : 22/10/2026.

## Comment il demande

- En français, en quelques lignes, souvent plusieurs demandes dans un seul
  message (le 22/10 : base de données + doc agents + « au passage » refaire
  toute l'interface). Toutes comptent ; « au passage » n'est pas « en
  option ».
- Il délègue les choix techniques franchement (« Je te laisse choisir le type
  de bdd ») : choisir, puis **dire pourquoi en une phrase** et écrire la
  décision (`tickets/decisions/`).
- Il décrit ce qu'il **voit** ou **veut voir** ; s'il joint une capture, la
  regarder vraiment (constat odyvresse).

## Ce qu'il attend

- **Jamais de demande d'autorisation** (première ligne de `CLAUDE.md`). Agir,
  puis dire ce qui a été fait.
- Une réponse finale courte : ce qui marche, ce qu'il doit relancer, ce qui
  reste non vérifié.
- Des noms et une doc en français, y compris dans le code.

## Comment il teste

- Lui-même, vite, sur son poste (Docker) et son téléphone. Il revient avec le
  symptôme exact : le prendre au mot (constat odyvresse).
- « Ça fonctionne » est souvent suivi de la demande suivante dans le même
  message.

## Ce qu'il faut savoir de son installation

- Poste Windows, projets dans `C:\Users\josel\Documents\projets\`.
- Nihonjo tourne en local dans Docker (port 8080) et en ligne sur son
  hébergement OVH, à côté du front d'Odyvresse, derrière un mot de passe.
- Il envoie les fichiers sur OVH lui-même (le front d'Odyvresse est copié par
  `build_web_production.bat` dans un dossier qu'il envoie ensuite) :
  d'où la règle « ne jamais envoyer `data/nihonjo.sqlite` ».
- Il utilise la v1 dans au moins un navigateur ; ses mots ajoutés et sa
  progression y sont restés tant qu'il n'a pas fait la reprise (bandeau de
  l'accueil, sur chaque appareil).
