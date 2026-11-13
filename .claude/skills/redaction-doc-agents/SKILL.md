---
name: redaction-doc-agents
description: Écrire ou mettre à jour la documentation et les commentaires de code de Nihonjo — CLAUDE.md, contexte.md, doc_pour_agents/, CHANGEMENTS_AAAA-MM.md, CHARTE_GRAPHIQUE.md, tickets, carnet_agent, en-têtes de fonction. À utiliser dès qu'un .md du projet est créé ou modifié, ou qu'un commentaire est ajouté au code.
---

# Écrire la doc et les commentaires de Nihonjo

Même forme que la doc d'odyvresse_all (dont ce skill est adapté) : c'est ce
qui fait qu'un agent qui arrive froid trouve en trois lignes pourquoi une
fonction est écrite ainsi.

## La règle qui commande toutes les autres : le POURQUOI

Un commentaire qui paraphrase le code ne vaut rien — le code est déjà là. Ce
qui manque toujours, c'est **la raison**, et surtout **le défaut que la ligne
ferme**.

```
// ✗ Crée une nouvelle feuille
// ✓ Une feuille NEUVE par mot : réutiliser l'ancienne empilerait ses
//   écouteurs (un clic sur « Suivant » sauterait plusieurs mots).
```

Quand un choix a été pris **contre** une alternative évidente, dire laquelle
et pourquoi elle a été écartée (« pas d'UPSERT : exige SQLite 3.24 »).

## ⚠️ signale un PIÈGE RÉEL, jamais une emphase

Un ⚠️ veut dire : « ici, quelqu'un s'est déjà fait avoir, et le symptôme ne
désignait pas la cause ». Il mérite sa place pour un comportement qui échoue
**sans erreur visible** (`foreign_keys` OFF, clic avalé par un re-rendu), une
perte de données silencieuse (`data/` écrasé par FTP), un ordre
contre-intuitif. Trois ⚠️ à la suite sans incident raconté : deux de trop.

## La forme

- **En français**, noms de fonctions et de variables compris.
- **Des tableaux** pour tout ce qui est « cas → conséquence », « v1 → v2 ».
- **Des chiffres mesurés et datés** : « 1 034 mots », « ~300 Ko », pas
  « beaucoup ».
- **Nommer fichiers et fonctions exactement** (`Depot::importerMots`,
  `assets/js/vues/exercice.js`) — **jamais de numéros de ligne** : ils
  périment à la première modification.
- Les limites connues se **déclarent** avec leur raison.

## Où écrire quoi

| fichier | contenu |
|---|---|
| `CLAUDE.md` | les règles qui ne se devinent pas, l'aiguillage vers les skills — court |
| `contexte.md` | la pile, l'arborescence, comment lancer |
| `doc_pour_agents/*.md` | une mécanique par fichier, en profondeur |
| `.claude/skills/*/SKILL.md` | comment travailler sur une classe de tâche, les pièges |
| `CHARTE_GRAPHIQUE.md` | jetons, polices, règles visuelles |
| `CHANGEMENTS_AAAA-MM.md` | le journal mensuel, orienté « pourquoi » |
| `tickets/` | le travail à faire (INBOX, BACKLOG, tâches, décisions), pas la doc |
| `carnet_agent/` | les notes de travail des agents (voir son `LISEZ-MOI.md`) |

⚠️ **Mettre à jour la doc fait partie du travail, pas après.** Une section qui
ment est pire qu'absente. Un point traité se barre et renvoie vers la section
qui le décrit.

## ⚠️ Documenter n'est pas corriger

Une tâche de doc porte sur les `.md`. Un défaut découvert en rédigeant se
**signale** (et se note dans `carnet_agent/en_suspens.md`), il ne se corrige
pas dans la foulée. Et l'inverse : une tâche de code ne devient pas une
réécriture de la prose alentour.
