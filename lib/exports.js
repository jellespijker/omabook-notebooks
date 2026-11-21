// Exports: a notebook, or the pages of it the person chose, as a PDF
// (PdfExport) or as Markdown (MarkdownExport) (#9).
//
// From the view, it is saved where the person chooses, with the desktop's
// own save dialog (`omabook.ui.saveFile`, #11), and nothing of it is kept in
// the plugin's folder, which goes to their other computers. That dialog
// writes one file, so a Markdown saved there holds its pictures in it.
// Omabook opens the dialog only right after the person did something of the
// plugin's: an export that took longer to make than that moment is kept here
// until they say Save (`saveMade`).
//
// From the command line, where there is nobody to ask, `save` writes it
// under the plugin's data/exports/ by the name given (the notebook's title
// when none), a Markdown's pictures in a folder beside it; a new export of
// the same name takes the place of the one before.
var Exports = (function () {
    "use strict";

    const folder = "data/exports";
    const formats = ["pdf", "markdown"];
    // The export made for the view and not yet saved: in this engine only.
    let made = null;

    // The pages to export, in the notebook's order, each with its number: all, or those of `given` (page ids).
    function chosen(notebookId, given) {
        const all = Store.pages(notebookId).map(function (page, at) { return {id: page.id, number: at + 1}; });
        if (given === undefined || given === null)
            return all;
        if (!Array.isArray(given))
            throw new Error("The pages to export are a list of page ids.");
        given.forEach(function (id) {
            if (!all.some(function (page) { return page.id === id; }))
                throw new Error("Page " + String(id).slice(0, 40) + " isn't in this notebook.");
        });
        return all.filter(function (page) { return given.indexOf(page.id) >= 0; });
    }

    function titleOf(notebookId) { return notebookId ? Store.notebook(notebookId).title : "Loose notes"; }

    // Where a file of the plugin's lies on this computer, for the person to find it.
    function onDisk(path) { return String(omabook.plugin.dataFolder).replace(/\/$/, "") + path.slice("data".length); }

    function names(path) {
        try {
            return omabook.files.list(path) || [];
        } catch (error) {
            return [];
        }
    }

    // An earlier export's Markdown and pictures, so none of them is left beside the new one.
    function clear(path) {
        names(path + "/pictures").forEach(function (name) { omabook.files.remove(path + "/pictures/" + name); });
        names(path).filter(function (name) { return /\.md$/.test(name); }).forEach(function (name) { omabook.files.remove(path + "/" + name); });
    }

    function answer(format, file, place, pages, extra) {
        return Object.assign({format: format, file: file, path: onDisk(file), folder: onDisk(place), pages: pages.length}, extra);
    }

    // What is asked for, checked: {notebookId, format, pages, name}.
    function asked(notebookId, options) {
        options = Util.object(options);
        const format = Util.text(options.format) || "pdf";
        if (formats.indexOf(format) < 0)
            throw new Error("A notebook is exported as \"pdf\" or \"markdown\", not \"" + format + "\".");
        notebookId = Util.text(notebookId);
        if (notebookId)
            Store.notebook(notebookId);
        const pages = chosen(notebookId, options.pages);
        if (!pages.length)
            throw new Error("There are no pages to export.");
        return {notebookId: notebookId, format: format, pages: pages, name: Util.slug(Util.text(options.name) || titleOf(notebookId))};
    }

    function pdf(want) {
        return PdfExport.build(titleOf(want.notebookId), want.pages.map(function (page) { return page.id; })).then(function (built) {
            const file = folder + "/" + want.name + ".pdf";
            omabook.files.writeBytes(file, built.bytes);
            return answer("pdf", file, folder, want.pages, {bytes: built.bytes.length, missed: built.missed});
        });
    }

    function markdown(want) {
        const built = MarkdownExport.build(titleOf(want.notebookId), want.pages, !want.notebookId);
        const place = folder + "/" + want.name;
        clear(place);
        const file = place + "/" + want.name + ".md";
        omabook.files.write(file, built.text);
        built.files.forEach(function (one) { omabook.files.writeBytes(place + "/" + one.path, one.base64); });
        return answer("markdown", file, place, want.pages, {pictures: built.files.length});
    }

    // A promise of the export under data/exports/ (the command line's):
    // {format, file (in the plugin's folder), path and folder (on this
    // computer), pages, and for a PDF its bytes and the pictures it couldn't
    // show (`missed`), for Markdown its pictures}. `options` {format ("pdf"
    // or "markdown"), pages (ids; all when not given), name (of the file;
    // the notebook's title when not given)}.
    function save(notebookId, options) {
        const want = asked(notebookId, options);
        return want.format === "pdf" ? pdf(want) : Promise.resolve(markdown(want));
    }

    // What the save dialog is handed: the file's name to start with, its kind and what it holds.
    function build(want) {
        const title = titleOf(want.notebookId);
        if (want.format === "markdown") {
            const text = MarkdownExport.build(title, want.pages, !want.notebookId, true).text;
            return Promise.resolve({format: "markdown", name: want.name + ".md", kinds: [".md"], text: text, pages: want.pages.length, missed: 0});
        }
        return PdfExport.build(title, want.pages.map(function (page) { return page.id; })).then(function (built) {
            return {format: "pdf", name: want.name + ".pdf", kinds: [".pdf"], bytes: built.bytes, pages: want.pages.length, missed: built.missed};
        });
    }

    function told(one, saved) {
        return {format: one.format, pages: one.pages, missed: one.missed, waiting: false, saved: saved ? {name: saved.name, size: saved.size} : null};
    }

    // A promise of what the save dialog answered: {saved: {name, size} or
    // null when the person chose nowhere}. Throws when Omabook won't open
    // the dialog now (the person's moment has passed).
    function ask(one) {
        const what = {name: one.name, kinds: one.kinds};
        if (one.text !== undefined)
            what.text = one.text;
        else
            what.bytes = one.bytes;
        return omabook.ui.saveFile(what).then(function (saved) {
            made = null;
            return told(one, saved);
        });
    }

    // From the view: the export made and saved where the person chooses (#11).
    // A promise of {format, pages, missed, saved: {name, size} | null,
    // waiting}: `waiting` when it took too long to make for the dialog to
    // open by itself, and waits for `saveMade`. `options` as for `save`.
    function choose(notebookId, options) {
        const want = asked(notebookId, options);
        made = null;
        return build(want).then(function (one) {
            made = one;
            try {
                return ask(one);
            } catch (error) {
                return Object.assign(told(one, null), {waiting: true});
            }
        });
    }

    // The export `choose` made, saved where the person chooses, on their Save.
    function saveMade() {
        if (!made)
            throw new Error("There is no export waiting to be saved; export again.");
        return ask(made);
    }

    return {save: save, choose: choose, saveMade: saveMade, folder: folder};
})();
