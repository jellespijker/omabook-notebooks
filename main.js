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
omabook.include("lib/store.js");     // Store: notebooks and pages in the change log
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

// The notebook file as it would be written now, and one read back.
function snapshot(id) { return Snapshot.build(id); }
function readSnapshot(text) { return Snapshot.read(text); }
function snapshotText(snapshot) { return Snapshot.text(Snapshot.read(JSON.stringify(snapshot))); }
