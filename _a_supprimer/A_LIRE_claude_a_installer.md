# À renommer en `.claude`

Ce dossier contient la configuration des agents de Nihonjo : le crochet de
démarrage (`settings.json`, qui injecte `contexte.md` et
`carnet_agent/LISEZ-MOI.md`) et les cinq skills (`skills/`), auxquels
`CLAUDE.md` renvoie.

L'agent qui les a écrits (22/10/2026, session cloud reliée au poste) ne peut
pas écrire dans un dossier `.claude` du poste : emplacement protégé. Il faut
donc **renommer ce dossier `claude_a_installer` en `.claude`** (à la racine du
projet), puis supprimer ce fichier `A_LIRE.md`.

Sous Windows : `ren claude_a_installer .claude` dans un terminal ouvert dans
le dossier du projet (l'Explorateur refuse parfois un nom qui commence par un
point).
