// Notebooks: notebooks of pages on paper, beside the books one reads.
//
// This file is the plugin's front door and is meant to be read first. It
// includes the parts, registers what the plugin adds to Omabook (a book
// format, a view, an entry on the shelf, events), and defines the top-level
// functions the view and the command line call
// (`omabook plugin run notebooks <function> '<json>'`).
//
// The rules of the house (see `omabook plugin api` and
// .agents/rules/20-plugin-javascript.md): JavaScript without async/await,
// modules or timers; every call back within five seconds; the world only
// through `omabook`; and running the top level changes nothing, since
// Omabook loads a script more than once.

// 1. The parts, lowest first: each file makes one global and may use the
//    ones above it.
omabook.include("lib/util.js");      // Util: small helpers
omabook.include("lib/paper.js");     // Paper: kinds and sizes of paper, and what each draws
omabook.include("lib/typed.js");     // Typed: a text block's words, plain or Markdown, never HTML
omabook.include("lib/store.js");     // Store: notebooks, pages and what is on them in the change log
omabook.include("lib/ink.js");       // Ink: the strokes on a page, and the tools that write them
omabook.include("lib/pictures.js");  // Pictures: a picture's bytes, checked and kept in pieces
omabook.include("lib/content.js");   // Content: text blocks and pictures on a page, placed and layered
omabook.include("lib/recognised.js"); // Recognised: the words found in a page's ink, kept with it
omabook.include("lib/snapshot.js");  // Snapshot: the notebook file and its book format
omabook.include("lib/shelf.js");     // Shelf: notebooks in the library, and the view's overview

// 2. What the plugin adds to Omabook.

// A notebook is a book of this format: on the shelf, in collections and in
// search like any other.
Snapshot.register();

// The view of notebooks and their pages: in place of the shelf, or beside
// the page while a book is open.
omabook.ui.view({id: "notebooks", title: "Notebooks", source: "NotebookView.qml", key: "Alt+N"});

// An entry on the shelf that opens the view, where notebooks are made.
omabook.ui.launcher({
    id: "notebooks", title: "Notebooks", author: "Notebooks",
    description: "Your notebooks and loose notes: pages on paper, written by hand or typed.",
    open: function () { return show(); }
});

// 3. What the person does elsewhere.

// Opening a notebook from the shelf opens it in the view.
omabook.on("book.opened", function (event) {
    const notebook = event.identifiers && event.identifiers[Shelf.scheme];
    if (event.generated === omabook.plugin.id && notebook)
        show(notebook);
});

// Removing a notebook's book from the shelf removes the notebook. When the
// plugin removed it itself, the notebook is gone already.
omabook.on("book.removed", function (event) {
    const book = event.book || {};
    const identifiers = book.identifiers || {};
    const notebook = identifiers[Shelf.scheme];
    // The library says whose a book is as `generated`, the command line's
    // listing among its identifiers: either will do.
    const mine = (book.generated || identifiers.generated) === omabook.plugin.id;
    if (mine && notebook && Store.notebooks().some(function (one) { return one.id === notebook; }))
        Shelf.remove(notebook);
});

omabook.on("app.started", function () { Shelf.publish(); });

function show(notebook) {
    Shelf.publish();
    omabook.ui.showView("notebooks", {notebook: notebook || ""});
}

// 4. The functions, for the view and the command line.

// Every notebook with its pages, and the loose notes.
function notebooks() { return Shelf.overview(); }

// The papers there are, and what one draws, in millimetres.
function papers() { return Paper.choices(); }
function paper(kind) { return Paper.layout(kind); }

function makeNotebook(title, paper) { return Shelf.make({title: title, paper: paper}); }

function renameNotebook(id, title) {
    Store.changeNotebook(id, {title: title});
    return Shelf.refresh(id);
}

// Sharing is for a later ticket (#1); until then a notebook stays private.
function setNotebookPaper(id, paper) {
    Store.changeNotebook(id, {paper: paper});
    return Store.notebook(id);
}

// How a notebook's handwriting is recognised: `hosted` (true lets a hosted
// AI server read it, when Omabook's settings allow hosted ones too; else
// only one's own servers do) and `language` (a hint, such as "nl").
function setNotebookRecognition(id, details) {
    details = details || {};
    return Store.changeNotebook(id, {hosted: details.hosted, language: details.language});
}

function removeNotebook(id) { Shelf.remove(id); }

function openNotebook(id) { show(id); }

// A new page, at `at` (from 0) or last; in no notebook it is a loose note.
function addPage(notebook, paper, at) {
    const id = Store.addPage(notebook, {paper: paper, at: at});
    Shelf.refresh(notebook);
    return id;
}

function makeLooseNote(paper) { return Store.addPage("", {paper: paper}); }

function page(id) { return Store.page(id); }

function movePage(id, at) {
    Store.movePage(id, at);
    Shelf.refresh(Store.page(id).notebook);
}

function filePage(id, notebook, at) {
    const was = Store.filePage(id, notebook, at);
    Shelf.refresh(was);
    Shelf.refresh(notebook);
}

function setPaper(id, paper) {
    Store.setPaper(id, paper);
    Shelf.refresh(Store.page(id).notebook);
}

function removePage(id) { Shelf.refresh(Store.removePage(id)); }

// A page's ink: its strokes ({id: base64}), what the ink surface did since
// the pen paused (an ink batch, {add, remove}), and the tools.
function strokes(pageId) { return Ink.strokes(pageId); }
function ink(pageId, batch) { return Ink.write(pageId, batch); }
function inkTools() { return Ink.tools(); }

// Where a page's strokes lie, {id: {x, y, width, height}} in millimetres:
// for choosing some of them with a rectangle.
function strokeBounds(pageId) { return Ink.bounds(pageId); }

// A page's recognised text and where it stands (Recognised.state); its ink
// read, a promise of that again, or of a selection's words with `strokes`
// ({background, again, strokes}); the person's own words for it; and a text
// block made of it where the ink lies ({text, strokes, replace}).
function recognised(pageId) { return Recognised.state(pageId); }
function recognise(pageId, options) { return Recognised.recognise(pageId, options); }
function correctRecognised(pageId, text) { return Recognised.correct(pageId, text); }
function recognisedToText(pageId, options) { return Recognised.toText(pageId, options); }

// What is on a page but its ink: its text blocks and pictures, lowest first
// (below the ink, then above it), and where typed lines fall on its paper.
function content(pageId) { return Content.list(pageId); }

// A text block: {x, y, width, height, text, format ("markdown" or "plain"),
// layer}, every part of it optional; its words changed; moved or resized
// ({x, y, width, height}, in millimetres); above or below the ink, or to the
// front or the back ("above", "below", "front", "back"); removed. The same
// place, arrange and remove are a picture's.
function addText(pageId, details) { return Content.addText(pageId, details); }
function changeText(id, details) { return Content.changeText(id, details); }
function place(id, rectangle) { return Content.place(id, rectangle); }
function arrange(id, how) { return Content.arrange(id, how); }
function removeContent(id) { return Content.remove(id); }

// A picture from a file, as the view read it: {data (a data address of PNG
// or JPEG), pixels: {width, height}, title, x, y, width}. Its bytes as a data
// address again, "" while they are still on their way from another computer.
function addPicture(pageId, details) { return Content.addPicture(pageId, details); }
function picture(id) { return Content.picture(id); }
function pictureLimits() { return {bytes: Pictures.largest, side: Pictures.largestSide}; }

// Written on a page and done with it: its notebook's file follows the ink,
// once, rather than at every pause of the pen.
function pageWritten(pageId) { Shelf.refresh(Store.page(pageId).notebook); }

// The notebook file as it would be written now, and one read back.
function snapshot(id) { return Snapshot.build(id); }
function readSnapshot(text) { return Snapshot.read(text); }
function snapshotText(snapshot) { return Snapshot.text(Snapshot.read(JSON.stringify(snapshot))); }
