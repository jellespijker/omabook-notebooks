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
| `Paper` | the kinds of paper and sizes, and what each draws, in millimetres |
| `Typed` | a text block's words: plain text or Markdown, cleaned, never HTML |
| `Store` | **the live data**: notebooks, pages, text blocks and pictures as things in `omabook.log` (ADR 0002) |
| `Ink` | the strokes on a page (ink batches from Omabook's ink surface, through `Store`), and the tools |
| `Pictures` | a picture's bytes: checked, capped, in pieces for the log, joined again |
| `Content` | text blocks and pictures on a page: placed on the paper's lines, moved, resized, above or below the ink |
| `Snapshot` | the notebook file: written from the store, read back, and its book format |
| `Shelf` | a notebook as an item in the library, and what the view is shown |
| `main.js` | the front door: registers the format, the view, commands and events |

`main.js` stays a list of registrations and thin functions that call the parts;
the work is in `lib/`. A new part is a new file with one global, included at
the place in the order its dependencies allow.

## When a part needs a later one

The dependency points the wrong way. Move the shared piece into an earlier
part, or have the earlier part take a function as a parameter. A use that must
stay (it runs only long after everything is loaded) says so:
`// layers-allow: <why>`.
