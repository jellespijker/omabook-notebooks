# Structure: parts in include order

A script plugin has no modules. `main.js` includes each file of `lib/`,
**lowest first**, and each file makes **one global**, named for what it does:

```js
var Paper = (function () {
    // ...
    return {layout: layout, normal: normal};
})();
```

The order in `main.js` is the dependency order: a part may use the globals of
the parts included before it, never after it. `check_layers.py` checks this,
that every file in `lib/` is included, and that each makes exactly one global.

## Where code goes

| Part | What it is for |
|---|---|
| `Util` | helpers: know nothing of notebooks |
| `Inflate` | what zlib's deflate packed, unpacked: a PNG's pixels |
| `Images` | a PNG's or a JPEG's bytes as a PDF takes a picture |
| `Pdf` | a PDF file written: pages of lines, text, pictures and links; knows nothing of notebooks |
| `Paper` | the kinds of paper and sizes, and what each draws, in millimetres |
| `Typed` | a text block's words: plain text or Markdown, cleaned, never HTML |
| `Store` | **the live data**: notebooks, pages, text blocks, pictures, recognised text, recordings, transcripts, mentions and place references as things in `omabook.log` (ADR 0002) |
| `Ink` | the strokes on a page (ink batches from Omabook's ink surface and its lasso, through `Store`), where each lies, and the tools |
| `Pictures` | a picture's bytes: checked, capped, in pieces for the log, joined again |
| `Content` | text blocks and pictures on a page: placed on the paper's lines, moved, resized, above or below the ink |
| `Recognised` | the words found in a page's ink (Omabook's `recognize.ink`): read after the pen rests, kept with the strokes, corrected, made a text block |
| `Recordings` | what was said while a page was written (Omabook's `audio`): recorded, kept with each stroke's moment in it, played from the ink |
| `Transcripts` | the words a recording holds (Omabook's `recognize.audio`), each with its moment, kept with the recording |
| `Finder` | a page's words (typed, recognised, said) and the pages that hold some words, with where |
| `References` | place references: from a page to a passage of a book (by its global id), by its words and its place, found again when the book's file changes; their `omabook://` links |
| `Snapshot` | the notebook file: written from the store, read back, and its book format |
| `Shelf` | a notebook as an item in the library, and what the view is shown |
| `Mentions` | what a page is about in the knowledge graph (`omabook.graph`): suggested, said by hand, tied to the notebook's book |
| `PdfExport` | a notebook's pages drawn as a PDF: paper, ink as lines, text, pictures, references as links |
| `MarkdownExport` | a notebook's pages' words as Markdown, pictures as files beside it |
| `Exports` | the pages chosen, saved as PDF or Markdown where the person chooses (`ui.saveFile`), or under `data/exports/` from the command line |
| `Prompts` | every word sent to a model |
| `Ai` | the one way to the model the person chose (`omabook.ai`), its answers checked |
| `Asking` | a question about a notebook, from its own words, under recognition's privacy rule |
| `main.js` | the front door: registers the format, the view, commands and events |

`main.js` stays a list of registrations and thin functions that call the parts;
the work is in `lib/`. A new part is a new file with one global, included at
the place in the order its dependencies allow.

## When a part needs a later one

The dependency points the wrong way. Move the shared piece into an earlier
part, or have the earlier part take a function as a parameter. A use that must
stay (it runs only long after everything is loaded) says so:
`// layers-allow: <why>`.
