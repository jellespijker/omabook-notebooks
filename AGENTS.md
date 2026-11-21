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
  example of a plugin; the harness here is its harness.

JavaScript for Omabook's script engine (`main.js`, `lib/`), a QML view (`NotebookView.qml`, with `InkPage.qml`, `PageTools.qml`,
`PageReferences.qml`, `BookReferences.qml`, `PageContent.qml`, `ContentItem.qml`,
`PictureImport.qml`, `RecognisedText.qml`, `PageRecordings.qml`, `InkMoments.qml`, `TranscriptPane.qml`,
`PageAbout.qml`, `NotebookFind.qml` and `PaperSheet.qml`), and Python
tests.

## The harness

Every edit and commit is checked: the script language's rules and the plugin's design (ast-grep,
`rules/js/`), the parts' include order, ruff, file-size and complexity budgets, secrets, and an issue
number in the commit message. Only what a change adds is judged. **Read the rule that applies before you
write the code**:

| Rule | When it applies |
|---|---|
| [.agents/rules/00-harness.md](.agents/rules/00-harness.md) | What runs when, and what to do when a check is wrong |
| [.agents/rules/10-structure.md](.agents/rules/10-structure.md) | Adding a part, or using one part from another |
| [.agents/rules/20-plugin-javascript.md](.agents/rules/20-plugin-javascript.md) | Any JavaScript |
| [.agents/rules/30-size-and-complexity.md](.agents/rules/30-size-and-complexity.md) | Growing a file or a function |

Once per clone: `uvx pre-commit install`. Before handing work in: `bin/check`. Never skip the hooks
(`--no-verify`) and never edit a baseline by hand.

## Testing

```bash
python3 tests/run.py     # notebooks, pages, paper, ink, text blocks, pictures, recognised text, recordings, search, the graph and place references; needs omabook on the PATH, or OMABOOK=/path/to/omabook
```

Recognition is tested against a stand-in AI server on this computer (`tests/fakeserver.py`, as Omabook's
`tests/fakeaiserver.h`), which the scratch config.json points at; nothing is sent anywhere else. So are
transcripts; a recording comes in as an Opus file the tests write (`tests/opus.py`), since from a command line
nobody can say yes to the microphone.

It passes before a ticket lands, and needs no window. The QML is checked with
`/usr/lib/qt6/bin/qmllint`: a new file has no warning but `backend`, `theme` and `Omabook`, which only
Omabook provides. It needs an Omabook as new as `plugin.json` says.
A change someone using the plugin would notice gets a line in `CHANGELOG.md` under *Unreleased*.
