# AGENTS.md — Omabook Notebooks

Notebooks is a plugin for Omabook, developed in the
[omabook-workspace](https://github.com/jellespijker/omabook-workspace), the main workspace for Omabook
and its plugins (it holds the shared Kanban board, labels and milestones). Work from there:
`omabook-workspace/omabook-notebooks/`, or the worktree `herdr-kanban claim` gives you. Read the
workspace's `AGENTS.md` first.

- The design is [#1](https://github.com/jellespijker/omabook-notebooks/issues/1) and its tickets; use the
  words in [GLOSSARY.md](GLOSSARY.md) (notebook, page, loose note, paper, ink, stroke, text block,
  recording, transcript, recognised text, place reference, notebook scope) and add a term there when
  one is settled.
- Live data goes through Omabook's change log (Omabook's ADR 0002); the notebook file is a snapshot.
- Handwriting and recordings go only to the user's own servers unless a notebook says otherwise.
- Every commit names a GitHub issue of this repository (`(#2)`), or another as `jellespijker/omabook#76`.
- Storyteller ([omabook-storyteller](https://github.com/jellespijker/omabook-storyteller)) is the worked
  example of a plugin: copy its harness (`.agents/rules`, `bin/check`, hooks, tests) when the first code
  lands.
