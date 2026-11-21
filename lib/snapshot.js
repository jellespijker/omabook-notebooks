// Snapshot: the notebook file, and the book format that reads it.
//
// A notebook in the library is a file of this plugin's own format, so it is
// on the shelf, in collections and in search like a book. The file is a
// snapshot written from the change log (Store), never the other way round:
// the log is what lives and merges, the file is what a book's file is for
// (a copy, an export, what the reader and search read). It is JSON:
//
//   {"format": "omabook-notebook", "version": 1,
//    "notebook": {id, title, created, private},
//    "pages": [{id, paper: {kind, ruling, size}, created,
//               strokes: {}, text: {}, pictures: {}, recordings: {}}]}
//
// The sets of a page are as the log keeps them (`{key: value}`): strokes in
// Omabook's codec (base64), text blocks (`{text, format, x, y, width,
// height, layer, z}`, in millimetres), pictures (where each is, not its
// bytes, which stay in the change log: Pictures), and references to
// recordings (`{file, started, duration, transcript}`: the audio stays in the
// plugin's data/, never in the file; the transcript's text is read as the page's).
// A newer version than this plugin knows is refused, not half read.
var Snapshot = (function () {
    "use strict";

    const format = "omabook-notebook";
    const version = 1;
    const extension = "omanotebook";
    const name = "Notebook";

    function path(notebookId) { return "data/notebooks/" + notebookId + "." + extension; }

    // A set with its keys in order, and the keys of what is in it, so the
    // same notebook is the same file whichever way its values came (Omabook
    // hands JSON over with keys sorted, a script keeps them as written).
    function sorted(value) {
        if (Array.isArray(value))
            return value.map(sorted);
        if (!value || typeof value !== "object")
            return value;
        const out = {};
        Object.keys(value).sort().forEach(function (key) { out[key] = sorted(value[key]); });
        return out;
    }

    function pageOf(page) {
        const out = {id: String(page.id), paper: Paper.normal(page.paper), created: Util.text(page.created)};
        Store.sets.forEach(function (set) { out[set] = sorted(Util.object(page[set])); });
        return out;
    }

    // The snapshot of a notebook as the log has it now.
    function build(notebookId) {
        const notebook = Store.notebook(notebookId);
        return {
            format: format, version: version,
            notebook: {id: notebook.id, title: notebook.title, created: notebook.created, private: notebook.private},
            pages: Store.pages(notebook.id).map(function (one) { return pageOf(Store.page(one.id)); })
        };
    }

    function text(snapshot) { return JSON.stringify(snapshot, null, 2) + "\n"; }

    function write(notebookId) {
        const file = path(notebookId);
        omabook.files.write(file, text(build(notebookId)));
        return file;
    }

    // A notebook file read back: the same data, or an Error that says why not.
    function read(words) {
        let data;
        try {
            data = JSON.parse(words);
        } catch (error) {
            throw new Error("This isn't a notebook file: it isn't JSON (" + error.message + ").");
        }
        if (!data || data.format !== format)
            throw new Error("This isn't a notebook file: it doesn't say it is \"" + format + "\".");
        if (typeof data.version !== "number" || data.version > version)
            throw new Error("This notebook was written by a newer Notebooks (version " + data.version + "); update the plugin to read it.");
        const notebook = Util.object(data.notebook);
        if (!Util.text(notebook.id))
            throw new Error("This notebook file has no notebook id.");
        if (!Array.isArray(data.pages))
            throw new Error("This notebook file has no pages.");
        return {
            format: format, version: version,
            notebook: {id: String(notebook.id), title: Util.text(notebook.title) || "Untitled notebook", created: Util.text(notebook.created),
                       private: notebook.private !== false},
            pages: data.pages.map(function (page, at) {
                if (!page || !Util.text(page.id))
                    throw new Error("Page " + (at + 1) + " of this notebook file has no id.");
                return pageOf(page);
            })
        };
    }

    // What the reader, search and the command line read of a page: its
    // typed text, and in a line what else is on it and its paper.
    function chapterOf(page, at) {
        const typed = Object.keys(page.text).map(function (key) { return page.text[key]; })
            .filter(function (block) { return block && typeof block.text === "string" && block.text.trim() !== ""; })
            .sort(function (a, b) { return (Number(a.y) || 0) - (Number(b.y) || 0) || (Number(a.x) || 0) - (Number(b.x) || 0); })
            .map(function (block) {
                // A file may come from anywhere: its words are read as a block's would be kept.
                const words = block.text.slice(0, Typed.longest);
                return block.format === "plain" ? Typed.asMarkdown(Typed.clean(words, "plain")) : Typed.clean(words, "markdown");
            });
        const counts = [["strokes", "stroke"], ["pictures", "picture"], ["recordings", "recording"]].map(function (pair) {
            const count = Object.keys(page[pair[0]]).length;
            return count ? count + " " + pair[1] + (count === 1 ? "" : "s") : "";
        }).filter(Boolean);
        const about = "*" + Paper.title(page.paper) + (counts.length ? "; " + counts.join(", ") : "") + ".*";
        // What was said while it was written, so search finds it too.
        const said = Object.keys(page.recordings).sort().map(function (key) { return page.recordings[key]; })
            .filter(function (one) { return one && typeof one.transcript === "string" && one.transcript.trim() !== ""; })
            .map(function (one) { return "> " + Typed.asMarkdown(Typed.clean(one.transcript.slice(0, Typed.longest), "plain")).replace(/\n/g, "\n> "); });
        return {title: "Page " + (at + 1), markdown: typed.concat(said, [about]).join("\n\n")};
    }

    function open(source) {
        const entries = source.entries();
        const file = entries.filter(function (entry) { return entry.slice(-extension.length - 1) === "." + extension; })[0] || entries[0];
        const words = file ? source.text(file) : null;
        if (words === null || words === undefined)
            throw new Error("There is no notebook in " + source.name + ".");
        const snapshot = read(words);
        return {
            title: snapshot.notebook.title,
            description: snapshot.pages.length + (snapshot.pages.length === 1 ? " page" : " pages") + ", written in Notebooks.",
            tags: ["notebook"],
            chapters: snapshot.pages.length ? snapshot.pages.map(chapterOf) : [{title: "Page 1", markdown: "*No pages yet.*"}]
        };
    }

    function register() {
        omabook.format.register({name: name, extensions: [extension], open: open});
    }

    return {build: build, text: text, write: write, read: read, path: path, register: register, name: name, extension: extension};
})();
