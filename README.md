# Omabook Notebooks

A plugin for [Omabook](https://github.com/jellespijker/omabook): notebooks of pages on paper (lined,
squared, dotted, blank, music staves or Cornell), written with a pen, typed, with pictures and
recordings, recognised (transcripts of what was said, the text of what was written) and linked to the
knowledge graph of what you read.

Being built. The plan is [#1](https://github.com/jellespijker/omabook-notebooks/issues/1); its words
are in [GLOSSARY.md](GLOSSARY.md). It needs Omabook 0.1.10 (a full plugin view, an ink surface, audio,
recognition, and plugin data in the change log: Omabook's
[ADR 0002](https://github.com/jellespijker/omabook/blob/main/docs/adr/0002-plugin-data-in-the-change-log.md)),
and comes as 1.0 with Omabook 0.2.0.

## What it does so far

- **Notebooks on the shelf.** A notebook is a book of the plugin's own format (`.omanotebook`), on the
  shelf, in collections and in search like any book. *Notebooks* on the shelf, or `Alt+N`, opens the view of
  notebooks and their pages; opening a notebook from the shelf opens it there too.
- **Pages on paper.** Each page has one paper: lined (narrow, college or wide), squared (5 mm), dotted
  (5 mm), blank, music staves or Cornell, at A4, A5 or Letter. Pages are added, reordered and removed.
- **Ink.** A page opens to write on (a click, or `Enter` and `Page Down`): a pen and a highlighter in a few
  colours and thicknesses, an eraser that takes out what it covers or whole strokes, undo and redo, and zoom.
  The pen's pressure makes the line wider, its other end erases, and a palm on the screen is ignored while
  the pen is near; a finger writes until a pen has been seen and scrolls after (or as you set it), and the
  mouse writes too. Keys: `P` pen, `H` highlighter, `E` eraser (again for whole strokes), `1` to `4` a colour,
  `[` and `]` thinner and thicker, `F` what a finger does, `Ctrl+Z` and `Ctrl+Shift+Z`, `Ctrl+=` and
  `Ctrl+-`. Each pause of the pen is one write to the change log, so a page written on two computers has
  both computers' strokes.
- **Loose notes.** A page of no notebook, filed into one later (or taken out again).
- **Live in the change log.** Notebooks and pages are kept as operations in Omabook's change log, so they
  go to your other computers and merge there; the notebook file is a snapshot written from them.

From the command line, as the tests do:

```bash
omabook plugin run notebooks makeNotebook '["Physics", {"kind": "squared", "size": "A4"}]'
omabook plugin run notebooks notebooks
omabook plugin run notebooks paper '[{"kind": "cornell", "size": "Letter"}]'   # what a paper draws, in mm
omabook plugin run notebooks strokes '["<page id>"]'                           # a page's ink, {id: base64}
```

- **Private.** A notebook stays on your computers; it goes into a shared space only when you switch it on.
- **Your own servers first.** Handwriting and recordings are recognised by a server you mark as your own
  (this computer or your tailnet); a hosted service only for a notebook you choose it for.

## License

MIT; see [LICENSE](LICENSE).
