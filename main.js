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
omabook.include("lib/recordings.js"); // Recordings: what was said while a page was written, tied to its ink
omabook.include("lib/transcripts.js"); // Transcripts: the words a recording holds, each with its moment
omabook.include("lib/finder.js");    // Finder: a page's words, typed, written and said, and the pages that hold some
omabook.include("lib/references.js"); // References: place references, from a page to a passage of a book
omabook.include("lib/snapshot.js");  // Snapshot: the notebook file and its book format
omabook.include("lib/shelf.js");     // Shelf: notebooks in the library, and the view's overview
omabook.include("lib/mentions.js");  // Mentions: what the pages are about, in the knowledge graph

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

// Opening a notebook from the shelf opens it in the view. Opening another
// book finds the passages the notebooks refer to in it again, if its file
// changed since they were made.
omabook.on("book.opened", function (event) {
    const notebook = event.identifiers && event.identifiers[Shelf.scheme];
    if (event.generated === omabook.plugin.id && notebook)
        show(notebook);
    else if (event.id)
        References.recheck(event.id);
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

// Whether a notebook is the person's alone (as it starts) or shared with
// others who read its books: a shared one's place references never show what
// lies past one's own place in a book. Omabook doesn't tell a plugin yet when
// the person lets one of its books into a shared collection (#127), so it
// is said here; sharing the notebook itself is for a later ticket (#1).
function setNotebookShared(id, shared) {
    Store.changeNotebook(id, {private: shared !== true});
    Shelf.refresh(id);
    return Store.notebook(id);
}

function setNotebookPaper(id, paper) {
    Store.changeNotebook(id, {paper: paper});
    return Store.notebook(id);
}

// How a notebook's handwriting and recordings are recognised: `hosted` (true
// lets a hosted AI server read its handwriting, when Omabook's settings allow
// hosted ones too; else only one's own servers do), `speechHosted` (the same
// for its recordings, chosen apart) and `language` (a hint, such as "nl").
function setNotebookRecognition(id, details) {
    details = details || {};
    return Store.changeNotebook(id, {hosted: details.hosted, speechHosted: details.speechHosted, language: details.language});
}

function removeNotebook(id) {
    Mentions.untie(id);
    Shelf.remove(id);
}

function openNotebook(id) { show(id); }

// A new page, at `at` (from 0) or last; in no notebook it is a loose note.
// Written beside a book, it refers to where the reader is; `place` says
// another ({book, section, fraction, quote}), or false for none.
function addPage(notebook, paper, at, place) {
    const id = Store.addPage(notebook, {paper: paper, at: at});
    referHere(id, place);
    Shelf.refresh(notebook);
    return id;
}

function makeLooseNote(paper, place) {
    const id = Store.addPage("", {paper: paper});
    referHere(id, place);
    return id;
}

function referHere(pageId, place) {
    if (place === false)
        return;
    const reading = place ? null : omabook.reader.current();
    if (place || (reading && reading.generated !== omabook.plugin.id))
        References.make(pageId, place || {});
}

function page(id) { return Store.page(id); }

// A page's number is in what the graph is told of what it is about (Mentions).
function movePage(id, at) {
    Store.movePage(id, at);
    const notebook = Store.page(id).notebook;
    Shelf.refresh(notebook);
    Mentions.follow([notebook]);
}

function filePage(id, notebook, at) {
    const was = Store.filePage(id, notebook, at);
    Shelf.refresh(was);
    Shelf.refresh(notebook);
    Mentions.follow([was, notebook], Mentions.ofPage(id).length > 0);
}

function setPaper(id, paper) {
    Store.setPaper(id, paper);
    Shelf.refresh(Store.page(id).notebook);
}

function removePage(id) {
    const said = Mentions.ofPage(id).length > 0;
    const notebook = Store.removePage(id);
    Shelf.refresh(notebook);
    Mentions.follow([notebook], said);
}

// A page's ink: its strokes ({id: base64}), what the ink surface did since
// the pen paused or the lasso let go (an ink batch, {add, remove}), and the
// tools. A stroke the lasso moved keeps its moment in a recording.
function strokes(pageId) { return Ink.strokes(pageId); }
function ink(pageId, batch) {
    const moved = Recordings.carried(pageId, batch);
    const count = Ink.write(pageId, batch);
    Recordings.inked(String(pageId), batch && batch.add);
    Recordings.stamp(moved);
    return count;
}
function inkTools() { return Ink.tools(); }

// Where a page's strokes lie, {id: {x, y, width, height}} in millimetres:
// for choosing some of them with a rectangle.
function strokeBounds(pageId) { return Ink.bounds(pageId); }

// A page's recognised text and where it stands (Recognised.state); its ink
// read, a promise of that again, or of a selection's words with `strokes`
// ({background, again, strokes}); the person's own words for it; and a text
// block made of it where the ink lies ({text, strokes, replace}).
// The notebook's file follows what was read, so search and the book's text have it.
function recognised(pageId) { return Recognised.state(pageId); }
function recognise(pageId, options) {
    const before = Recognised.state(pageId).at;
    return Recognised.recognise(pageId, options).then(function (told) {
        if (told && told.at !== undefined && told.at !== before)
            pageWritten(pageId);
        return told;
    });
}
function correctRecognised(pageId, text) {
    const told = Recognised.correct(pageId, text);
    pageWritten(pageId);
    return told;
}
function recognisedToText(pageId, options) { return Recognised.toText(pageId, options); }

// Recording on a page while it is written (only in the window, once the
// person said yes): started, paused or gone on with, stopped, and what is
// under way. When it stops it is kept, and transcribed in the background.
// The notebook's file follows what a recording added: its entry, its words.
function recordingWritten(id) {
    Shelf.refresh(Store.pageEntry(Store.recording(id).fields.page).notebook);
    return id;
}
function transcribeKept(id) {
    recordingWritten(id);
    return Transcripts.transcribe(id, {background: true}).then(function (told) { recordingWritten(id); return told; });
}
function record(pageId) { return Recordings.start(pageId, transcribeKept); }
function pauseRecording(paused) { return Recordings.pause(paused !== false); }
function stopRecording() { return Recordings.stop(transcribeKept); }
function recording() { return Recordings.under(); }

// A recording kept on a page from its file under data/recordings/ (one cut
// short when Omabook quit while it recorded): {file}, or the recorder's summary.
function keepRecording(pageId, summary) { return recordingWritten(Recordings.keep(pageId, summary)); }
function removeRecording(id) {
    const notebook = Store.pageEntry(Store.recording(id).fields.page).notebook;
    Recordings.remove(id);
    Shelf.refresh(notebook);
}

// A page's recordings and the moment in one of each stroke written during
// it; the moment of the ink at a point (millimetres); playing a recording
// from a moment, or from the ink at a point; and what plays paused
// ("pause"), gone on with ("play"), moved ("seek", at) or let go ("stop").
function recordings(pageId) { return Recordings.timeline(pageId); }
function momentAt(pageId, x, y) { return Recordings.momentAt(pageId, x, y); }
function play(id, at) { return Recordings.play(id, at); }
function playFrom(pageId, x, y) { return Recordings.playFrom(pageId, x, y); }
function playing(how, at) { return Recordings.control(how, at); }

// A recording's transcript and where it stands, a page's, and a promise of
// one transcribed ({again, background}).
function transcript(id) { return Transcripts.state(id); }
function transcripts(pageId) { return Transcripts.ofPage(pageId); }
function transcribe(id, options) {
    return Transcripts.transcribe(id, options).then(function (told) { recordingWritten(id); return told; });
}

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

// The pages whose words, typed, read from the ink or said, hold every word
// of `words`, and where: [{notebook, title, loose, page, number, kind
// ("typed", "recognised", "transcript"), text, block, recording, at (ms)}].
function find(words) { return Finder.find(words); }

// What a page is about in the knowledge graph (Mentions): what the person
// said, [{id, kind, name, scope, made}]; the things its words name, to say
// yes or no to ([{node, kind, name, summary, scope}]); the things some
// words find, to say by hand; said ({node} or {kind, name, summary}, made
// when the graph has none), taken back, and said not to be.
function mentions(pageId) { return Mentions.ofPage(pageId); }
function suggestMentions(pageId) { return Mentions.suggest(pageId); }
function findThings(words) { return Mentions.lookup(words); }
function mention(pageId, what) { return Mentions.confirm(pageId, what); }
function forgetMention(id) { return Mentions.forget(id); }
function dismissMention(pageId, what) { return Mentions.dismiss(pageId, what); }

// Place references (#8): from a page, or strokes or a text block of it, to
// a passage of a book. Made at where the reader is, at a place given
// ({book, section, fraction}) or on words chosen there (`quote`), tied to
// `strokes` or a `block`, or put at {x, y}; or on the words copied in the
// reader, the reader's selection. A page's, and every one to a book, with
// its page. Followed: the book opens at the passage, found again by its
// words if its file changed ({anyway} past where a shared notebook's reader
// has read). Moved on the page, and removed.
function refer(pageId, details) {
    const id = References.make(pageId, details);
    pageWritten(pageId);
    return id;
}
function referCopied(pageId, details) {
    const quote = omabook.ui.clipboard.readText();
    if (!Util.text(quote))
        throw new Error("Select some words in the reader and copy them (Ctrl+C) first; then refer to them here.");
    return refer(pageId, Object.assign({}, details, {quote: quote}));
}
function references(pageId) { return References.ofPage(pageId); }
function bookReferences(bookId) { return References.ofBook(bookId); }
function followReference(id, options) { return References.follow(id, options); }
function placeReference(id, at) { return References.place(id, at); }
function removeReference(id) {
    const pageId = Store.reference(id).page;
    References.remove(id);
    pageWritten(pageId);
}

// The notebook file as it would be written now, and one read back.
function snapshot(id) { return Snapshot.build(id); }
function readSnapshot(text) { return Snapshot.read(text); }
function snapshotText(snapshot) { return Snapshot.text(Snapshot.read(JSON.stringify(snapshot))); }
