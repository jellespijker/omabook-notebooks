// Exports: a notebook, or the pages of it the person chose, saved as a PDF
// (PdfExport) or as Markdown with its pictures (MarkdownExport) (#9).
//
// Omabook lets a plugin ask the person for a file to open
// (`omabook.ui.pickFile`) but not yet for one to save to, and writes a
// plugin's files only in its own folder; so an export is saved there, under
// data/exports/, by the name the person gave it (the notebook's title when
// none), and the view says where and opens that folder. A new export of the
// same name takes the place of the one before.
var Exports = (function () {
    "use strict";

    const folder = "data/exports";
    const formats = ["pdf", "markdown"];

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

    function pdf(notebookId, pages, name) {
        return PdfExport.build(titleOf(notebookId), pages.map(function (page) { return page.id; })).then(function (made) {
            const file = folder + "/" + name + ".pdf";
            omabook.files.writeBytes(file, made.bytes);
            return answer("pdf", file, folder, pages, {bytes: made.bytes.length, missed: made.missed});
        });
    }

    function markdown(notebookId, pages, name) {
        const made = MarkdownExport.build(titleOf(notebookId), pages, !notebookId);
        const place = folder + "/" + name;
        clear(place);
        const file = place + "/" + name + ".md";
        omabook.files.write(file, made.text);
        made.files.forEach(function (one) { omabook.files.writeBytes(place + "/" + one.path, one.base64); });
        return answer("markdown", file, place, pages, {pictures: made.files.length});
    }

    // A promise of the export: {format, file (in the plugin's folder), path
    // and folder (on this computer), pages, and for a PDF its bytes and the
    // pictures it couldn't show (`missed`), for Markdown its pictures}.
    // `options` {format ("pdf" or "markdown"), pages (ids; all when not
    // given), name (of the file; the notebook's title when not given)}.
    function save(notebookId, options) {
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
        const name = Util.slug(Util.text(options.name) || titleOf(notebookId));
        return format === "pdf" ? pdf(notebookId, pages, name) : Promise.resolve(markdown(notebookId, pages, name));
    }

    return {save: save, folder: folder};
})();
