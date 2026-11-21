// Asking: a question about a notebook, answered by the AI from its own words (#9).
//
// "What did I write about entropy?", or a summary when nothing is asked.
// The model is told the notebook alone: its typed text, the words read from
// its handwriting, and what was said while it was written; and of the books
// its place references are to, only the passages the person has read to
// (References.reading): one further on is said to be there, never what it
// says. Nothing else of the library goes with it.
//
// The rule is recognition's: a notebook is private, and what is in it goes
// to an AI only once the person let it go to a hosted one (the notebook's
// `hosted`, said in its settings, as for its handwriting); what was said
// while writing only when its recordings may go too (`speechHosted`). Omabook
// asks the model chosen in its own settings, and never with the AI off
// (Ai). It doesn't tell a plugin whether that model runs on the person's own
// computer, so a notebook not let go is never sent, wherever the model is.
var Asking = (function () {
    "use strict";

    // The most characters of a notebook one question takes; past that, the
    // pages after are left out, and the answer says so.
    const most = 48000;

    function time(ms) {
        const s = Math.floor((Number(ms) || 0) / 1000);
        return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2);
    }

    function allowed(notebookId) {
        if (!Util.text(notebookId))
            throw new Error("Loose notes are yours alone; file the note in a notebook you let the AI read, and ask there.");
        const notebook = Store.notebook(notebookId);
        if (!omabook.ai.available())
            throw new Error("There is no AI to ask: it is off, or not set up, in Omabook's settings (AI). Nothing was sent.");
        if (!notebook.hosted)
            throw new Error("This notebook is private: the AI reads it only once you let it (Let the AI read this notebook). Nothing was sent.");
        return notebook;
    }

    function referenceLine(one) {
        if (one.ahead)
            return "Refers to a place in \"" + one.title + "\" past where they have read to (kept back).";
        const before = one.before ? "…" + one.before + " " : "";
        return "Refers to \"" + one.title + "\", " + one.chapter + (one.quote ? ": " + before + "“" + one.quote + "”" : ".");
    }

    // A page's words, as the model is told them.
    function pageText(pageId, number, notebook) {
        const lines = ["## Page " + number];
        Finder.pieces(pageId).forEach(function (piece) {
            if (piece.kind === "typed")
                lines.push(piece.text.trim());
            else if (piece.kind === "recognised")
                lines.push("Handwriting: " + piece.text.trim());
            else if (notebook.speechHosted)
                lines.push("Said at " + time(piece.at) + ": " + piece.text.trim());
        });
        References.reading(pageId).forEach(function (one) { lines.push(referenceLine(one)); });
        return lines.length > 1 ? lines.join("\n") : "";
    }

    // The pages asked about (all when `given` is not), as text no longer than `most`.
    function context(notebook, given) {
        const pages = Store.pages(notebook.id).map(function (page, at) { return {id: page.id, number: at + 1}; })
            .filter(function (page) { return !Array.isArray(given) || given.indexOf(page.id) >= 0; });
        const parts = [];
        let length = 0;
        let cut = false;
        pages.forEach(function (page) {
            const text = cut ? "" : pageText(page.id, page.number, notebook);
            if (!text)
                return;
            if (length + text.length > most) {
                cut = true;
                return;
            }
            parts.push(text);
            length += text.length + 2;
        });
        return {text: parts.join("\n\n"), pages: parts.length, cut: cut};
    }

    // A promise of {answer (Markdown), pages (how many were read), cut
    // (whether some were left out), said (whether what was said went too)}.
    // `options` {pages: [ids]} asks about those pages alone.
    function ask(notebookId, question, options) {
        options = Util.object(options);
        const notebook = allowed(notebookId);
        const made = context(notebook, options.pages);
        if (!made.text)
            throw new Error("Nothing in this notebook is in words yet: type, or let its handwriting be recognised, first.");
        return Ai.ask(Prompts.question(question, notebook.title, made.text), Prompts.reader).then(function (answer) {
            return {answer: answer, pages: made.pages, cut: made.cut, said: notebook.speechHosted};
        });
    }

    return {ask: ask};
})();
