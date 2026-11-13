# Gestion de projet — Nihonjo

Même organisation que les tickets d'odyvresse_all (`deckolector/tickets/`).

## Structure

```
INBOX.md            Idées brutes à traiter par l'IA
BACKLOG.md          Backlog complet (critique / normal / nice-to-have)

tasks/
  totest/           Implémenté, à valider par José
  done/             Terminé
  wontdo/           Tickets explicitement abandonnés (raison dans Commentaires)
  _TEMPLATE.md

decisions/
  D-001-*.md        Décisions d'architecture et raisons d'abandon, une par fichier
  _TEMPLATE.md
```

Pour le contexte du projet : `contexte.md` à la racine. Les notes de travail
des agents (défauts repérés, non vérifiés) : `carnet_agent/en_suspens.md` —
ce ne sont pas des tickets tant que José ne les a pas retenus.

## Convention de nommage

| Type     | Format              | Exemple                       |
|----------|---------------------|-------------------------------|
| Tâche    | `T-{ID}-{slug}.md`  | `T-001-vocabulaire-en-base.md` |
| Décision | `D-{ID}-{slug}.md`  | `D-001-base-sqlite-et-api-php.md` |

**L'ID est immuable.** Le slug peut changer, l'ID jamais. Les références
utilisent l'ID seul : `T-001`, `D-001`.

## Workflows

### Traiter une demande de José

1. Chercher d'abord dans les tickets (`BACKLOG.md`, `tasks/`).
2. Si rien ne correspond, regarder `INBOX.md` : la tâche y est peut-être en brut.
3. En profiter pour traiter l'INBOX : formaliser chaque entrée en ticket, la
   placer dans `totest/` (si implémentée) ou dans `BACKLOG.md`, puis la
   supprimer de `INBOX.md`.

### Cycle de vie d'une tâche

- **Backlog → à tester** : créer `tasks/totest/T-NNN-slug.md` (depuis
  `_TEMPLATE.md`), retirer la ligne de `BACKLOG.md`.
- **À tester → done** : José valide ; `mv tasks/totest/T-NNN-*.md tasks/done/`
  et ajouter `### AAAA-MM-JJ · validé` dans Commentaires.
- **Abandon** : `tasks/wontdo/`, raison dans Commentaires ; une décision
  `decisions/D-NNN-*.md` si le raisonnement mérite d'être gardé.

### Prochain ID

```bash
ls tickets/tasks/*/T-*.md | sed 's/.*T-\([0-9]*\)-.*/\1/' | sort -n | tail -1
```
