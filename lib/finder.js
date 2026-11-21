// Finder: the words of a page, typed, read from its ink and said while it
// was written, and the pages that hold some words.
//
// Omabook's own search reads a notebook as a book: its chapters (Snapshot)
// hold the typed text, the recognised text and the transcripts, so Find (/)
// in it, the book's text (`omabook text`) and its meaning (#72) have them.
// The library's search finds a book by its details and by what the graph
// knows of it (`knows:`, Mentions), not by its text; so the view finds the
// words here too, and a hit says where they are: the page, the text block,
// or the moment in the recording they were said at.
//
// Words are found as Omabook finds them: each by the start of a word, case
// and the accents of Latin letters aside ("lumi" finds "Lumière").
var Finder = (function () {
    "use strict";

    const most = 50;
    const around = 40;
    // What is not part of a word: the script engine's expressions know no
    // Unicode classes, so the letters are those of Latin, Greek and Cyrillic.
    const apart = "[^0-9A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF\\u0400-\\u04FF]";

    function folded(text) {
        const plain = String(text || "");
        return (typeof plain.normalize === "function" ? plain.normalize("NFD") : plain).replace(/[̀-ͯ]/g, "").toLowerCase();
    }

    function wordsOf(query) {
        return folded(query).split(new RegExp(apart + "+")).filter(Boolean);
    }

    // Where a word begins in `text` (folded), or -1.
    function at(text, word) {
        const found = new RegExp("(^|" + apart + ")" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).exec(text);
        return found ? found.index + found[1].length : -1;
    }

    // Whether `text` names `phrase` as words of its own: "Vin" in "Vin
    // smiled", not in "vinegar".
    function names(text, phrase) {
        const words = wordsOf(phrase);
        if (!words.length)
            return false;
        const quoted = words.map(function (word) { return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }).join(apart + "+");
        return new RegExp("(^|" + apart + ")" + quoted + "($|" + apart + ")").test(folded(text));
    }

    function holds(text, words) {
        const plain = folded(text);
        return words.every(function (word) { return at(plain, word) >= 0; });
    }

    function snippet(text, word) {
        const whole = String(text).replace(/\s+/g, " ").trim();
        const start = Math.max(0, at(folded(whole), word) - around);
        return (start > 0 ? "…" : "") + whole.slice(start, start + 2 * around + word.length).trim() + (start + 2 * around < whole.length ? "…" : "");
    }

    // What a page holds in words, each piece with where it is:
    // [{kind: "typed", block, text}, {kind: "recognised", text},
    //  {kind: "transcript", recording, at, text, words}] (`at` in ms, a segment each).
    function pieces(pageId) {
        const out = [];
        const blocks = Store.onPage("text", pageId);
        Object.keys(blocks).sort().forEach(function (id) {
            if (Util.text(blocks[id].text))
                out.push({kind: "typed", block: id, text: String(blocks[id].text)});
        });
        const read = Store.recognised(pageId);
        if (read && Util.text(read.text))
            out.push({kind: "recognised", text: String(read.text)});
        Transcripts.ofPage(pageId).forEach(function (one) {
            const segments = Array.isArray(one.segments) && one.segments.length ? one.segments : [{start: 0, text: one.text, words: []}];
            segments.forEach(function (segment) {
                if (Util.text(segment.text))
                    out.push({kind: "transcript", recording: one.id, at: Number(segment.start) || 0, text: String(segment.text),
                              words: Array.isArray(segment.words) ? segment.words : []});
            });
        });
        return out;
    }

    // All the words of a page, as one text: what Mentions looks for names in.
    function text(pageId) { return pieces(pageId).map(function (one) { return one.text; }).join("\n"); }

    // The moment a word was said at, in a segment's words ([[text, start, end]]).
    function momentOf(piece, word) {
        const said = piece.words.filter(function (one) { return at(folded(one[0]), word) >= 0; })[0];
        return said ? Number(said[1]) || piece.at : piece.at;
    }

    function hitsOn(page, where, words) {
        return pieces(page.id).filter(function (piece) { return holds(piece.text, words); }).map(function (piece) {
            const hit = Object.assign({}, where, {page: page.id, number: page.number, kind: piece.kind, text: snippet(piece.text, words[0])});
            if (piece.kind === "typed")
                hit.block = piece.block;
            if (piece.kind === "transcript") {
                hit.recording = piece.recording;
                hit.at = momentOf(piece, words[0]);
            }
            return hit;
        });
    }

    // The pages whose words hold every word of `query`, notebooks first in
    // their order, then the loose notes: [{notebook, title, loose, page,
    // number, kind ("typed", "recognised", "transcript"), text (around the
    // words), block, recording, at}]. At most fifty.
    function find(query) {
        const words = wordsOf(query);
        if (!words.length)
            return [];
        const books = Store.notebooks().map(function (one) { return {id: one.id, title: one.title, loose: false}; });
        let hits = [];
        books.concat([{id: "", title: "Loose notes", loose: true}]).some(function (book) {
            Store.pages(book.id).forEach(function (page, index) {
                if (hits.length < most)
                    hits = hits.concat(hitsOn({id: page.id, number: index + 1}, {notebook: book.id, title: book.title, loose: book.loose}, words));
            });
            return hits.length >= most;
        });
        return hits.slice(0, most);
    }

    return {find: find, text: text, folded: folded, wordsOf: wordsOf, names: names};
})();
