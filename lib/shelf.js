// Shelf: a notebook as an item in the library, and what the view is shown.
//
// Each notebook is a book of this plugin's (`generated`), its file the
// snapshot (Snapshot), found again by the identifier `notebook`, so the
// shelf, collections and search have it as they have any book. Every change
// to a notebook writes its snapshot again and puts it in the book's place.
// Loose notes are pages of no notebook: they are in the view, not the
// library, until they are filed into a notebook.
var Shelf = (function () {
    "use strict";

    const scheme = "notebook";

    function ours(book) { return book.generated === omabook.plugin.id && book.identifiers && book.identifiers[scheme]; }

    // The library's notebooks, by the notebook each is.
    function books() {
        const found = {};
        omabook.library.list().filter(ours).forEach(function (book) { found[book.identifiers[scheme]] = book; });
        return found;
    }

    // Writes the notebook's snapshot and puts it in the library: as a new
    // book the first time (or when the book was lost), in place of its file
    // after that.
    function refresh(notebookId) {
        if (!notebookId)
            return 0;
        const notebook = Store.notebook(notebookId);
        const file = Snapshot.write(notebook.id);
        const book = books()[notebook.id];
        if (book) {
            omabook.library.replaceFile(book.id, file);
            if (book.title !== notebook.title)
                omabook.library.setMeta(book.id, {title: notebook.title});
            return book.id;
        }
        const made = omabook.library.create({title: notebook.title, tags: ["notebook"]}, file);
        omabook.library.setIdentifier(made.id, scheme, notebook.id);
        return made.id;
    }

    // A new notebook, with its first page, on the shelf.
    function make(details) {
        const id = Store.makeNotebook(details);
        Store.addPage(id, {});
        return {notebook: id, book: refresh(id)};
    }

    // The notebook, its pages and its book. Removing the book from the shelf
    // comes here too (main.js, book.removed), so it is done in this order:
    // the log first, so that the book's going finds nothing left to remove.
    function remove(notebookId) {
        const book = books()[notebookId];
        Store.removeNotebook(notebookId);
        if (omabook.files.exists(Snapshot.path(notebookId)))
            omabook.files.remove(Snapshot.path(notebookId));
        if (book)
            omabook.library.remove(book.id);
    }

    function pageEntry(page, at) {
        return {id: page.id, number: at + 1, paper: page.paper, title: Paper.title(page.paper), created: page.created};
    }

    // What the view shows: every notebook with its pages, and the loose notes.
    function overview() {
        const library = books();
        return {
            notebooks: Store.notebooks().map(function (notebook) {
                const book = library[notebook.id];
                return {id: notebook.id, title: notebook.title, private: notebook.private, hosted: notebook.hosted, paper: notebook.paper,
                        created: notebook.created, book: book ? book.id : 0, pages: Store.pages(notebook.id).map(pageEntry)};
            }),
            loose: Store.pages("").map(pageEntry)
        };
    }

    // The view finds its plugin by this value: a plugin's name is its
    // folder's, chosen when it is installed.
    function publish() {
        omabook.ui.set("view", {notebooks: true, plugin: omabook.plugin.id, at: Util.now()});
    }

    return {books: books, refresh: refresh, make: make, remove: remove, overview: overview, publish: publish, scheme: scheme};
})();
