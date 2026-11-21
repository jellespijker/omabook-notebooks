// References: place references, from a page to a passage of a book (#8).
//
// A place reference is a thing of its own in the change log (Store), naming
// its page as a text block does, and the passage by its words as well as its
// place, as Omabook keeps a highlight's (its ADR 0004, `Passage`): the words
// (`quote`), a few just before and after them, the section and the fraction
// into it where they start, and a fingerprint of that section's text as it
// was (`hash`). The place goes to the passage quickly; when the book's file
// changed (a new edition, a typo fixed) the words find it again, nearest its
// own section first, the words around it telling one occurrence from
// another. One whose words are gone is `lost`: kept, never guessed at. One
// to a place without words (a comic's page) has its place alone.
//
// The words come from the book's own text (`omabook.library.text`), whose
// characters a place's fraction counts, so a reference is the same in any
// layout, font or window. A book is named by its global id (`global_id`,
// the same on each of the person's computers), by its number here, and by its
// title, authors and ISBN, which find it on a computer that doesn't know it
// by that id (a reference made before Omabook gave plugins global ids).
//
// A reference may be tied to strokes of the page or to a text block, and
// stands beside them as a chip; else in the page's top margin. In a shared
// notebook a reference never points past where the person has read the book
// to: its words are kept back and it doesn't open the book there.
var References = (function () {
    "use strict";

    // Words kept just before and after a passage, and taken at a place when no words were chosen.
    const around = 6;
    const taken = 12;
    // The most characters of a passage's words kept.
    const longest = 600;

    // A section's text, "" for a section the book's file no longer has (a chapter taken out).
    function sectionText(book, section) {
        try {
            return String(omabook.library.text(book, section) || "");
        } catch (error) {
            return "";
        }
    }

    function wordsOf(text) { return Util.text(text).split(/\s+/).filter(Boolean); }

    function escaped(word) { return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

    // A pattern that finds some words wherever the text breaks its lines or spaces them.
    function pattern(words) { return new RegExp(words.map(escaped).join("\\s+"), "gi"); }

    function occurrences(text, words) {
        const found = [];
        if (!words.length)
            return found;
        const search = pattern(words);
        let match;
        while ((match = search.exec(text)) !== null && found.length < 500)
            found.push({start: match.index, end: match.index + match[0].length});
        return found;
    }

    // The passage from character `start` to `end` of a section's text, with the words around it.
    function passage(text, section, start, end) {
        return {section: section, fraction: text.length ? start / text.length : 0, quote: text.slice(start, end).replace(/\s+/g, " ").trim(),
                before: wordsOf(text.slice(Math.max(0, start - 400), start)).slice(-around).join(" "),
                after: wordsOf(text.slice(end, end + 400)).slice(0, around).join(" "), hash: Util.hash(text), start: start, end: end};
    }

    // The passage at a place of a section: the words chosen nearest it, or those that start there.
    function passageAt(text, section, fraction, quote) {
        const at = Math.round(Math.max(0, Math.min(1, Number(fraction) || 0)) * text.length);
        const chosen = wordsOf(String(quote || "").slice(0, longest));
        if (chosen.length) {
            const found = occurrences(text, chosen).sort(function (a, b) { return Math.abs(a.start - at) - Math.abs(b.start - at); });
            if (!found.length)
                throw new Error("Those words aren't in this chapter of the book; select them in the reader again, where you are reading.");
            return passage(text, section, found[0].start, found[0].end);
        }
        let start = at;
        while (start > 0 && /\S/.test(text[start - 1]))
            start--;
        const rest = text.slice(start);
        const first = rest.search(/\S/);
        // A page of pictures (a comic, a scan) has no words: the reference is to its place alone.
        if (first < 0)
            return {section: section, fraction: Math.max(0, Math.min(1, Number(fraction) || 0)), quote: "", before: "", after: "",
                    hash: Util.hash(text), start: at, end: at};
        return passage(text, section, start + first, wordsOn(text, start + first, taken));
    }

    // How well the words around an occurrence are the passage's: 0 to 1.
    function fits(text, place, one) {
        const before = wordsOf(one.before).map(function (w) { return w.toLowerCase(); });
        const after = wordsOf(one.after).map(function (w) { return w.toLowerCase(); });
        const there = wordsOf(text.slice(Math.max(0, place.start - 400), place.start)).slice(-before.length).map(function (w) { return w.toLowerCase(); });
        const next = wordsOf(text.slice(place.end, place.end + 400)).slice(0, after.length).map(function (w) { return w.toLowerCase(); });
        const same = before.filter(function (w, i) { return there[i] === w; }).length + after.filter(function (w, i) { return next[i] === w; }).length;
        return before.length + after.length ? same / (before.length + after.length) : 1;
    }

    // The passage found again in the book's text as it is now, or null: by all
    // its words, else by its first or its last half (a word of it changed),
    // the best fit of the words around it, nearest its own section.
    function findAgain(book, one) {
        const count = Number(Util.object(omabook.library.toc(book)).sections) || 0;
        const sections = [];
        for (let s = 0; s < count; s++)
            sections.push(s);
        sections.sort(function (a, b) { return Math.abs(a - one.section) - Math.abs(b - one.section); });
        const words = wordsOf(one.quote);
        const half = Math.max(2, Math.ceil(words.length / 2));
        const tries = [{words: words, sure: 1}];
        if (words.length >= 4)
            tries.push({words: words.slice(0, half), sure: 0.6}, {words: words.slice(-half), sure: 0.6});
        const texts = {};
        for (const attempt of tries) {
            let best = null;
            sections.forEach(function (s) {
                const text = texts[s] !== undefined ? texts[s] : (texts[s] = sectionText(book, s));
                occurrences(text, attempt.words).forEach(function (place) {
                    const score = fits(text, place, one) - Math.abs(s - one.section) * 0.001;
                    if (!best || score > best.score)
                        best = {score: score, text: text, section: s, place: place};
                });
            });
            if (best && (attempt.sure === 1 || best.score > 0.3)) {
                const span = attempt.sure === 1 ? best.place : spanned(best.text, best.place, attempt.words === tries[1].words, words.length - half);
                return Object.assign(passage(best.text, best.section, span.start, span.end), {confidence: attempt.sure * Math.max(0.5, best.score)});
            }
        }
        return null;
    }

    // Where `count` words after `start` end, and where `count` words before `end` start.
    function wordsOn(text, start, count) {
        let at = start;
        for (let k = 0; k < count; k++) {
            while (at < text.length && /\s/.test(text[at]))
                at++;
            while (at < text.length && /\S/.test(text[at]))
                at++;
        }
        return at;
    }

    function wordsBack(text, end, count) {
        let at = end;
        for (let k = 0; k < count; k++) {
            while (at > 0 && /\s/.test(text[at - 1]))
                at--;
            while (at > 0 && /\S/.test(text[at - 1]))
                at--;
        }
        return at;
    }

    // The whole passage from where half of its words were found: the other half's words on from the first, or back from the last.
    function spanned(text, place, first, rest) {
        return first ? {start: place.start, end: wordsOn(text, place.end, rest)} : {start: wordsBack(text, place.start, rest), end: place.end};
    }

    // The book a reference is to on this computer: by its global id, its number, or its ISBN, or its title and authors.
    function bookOf(one) {
        const byGlobal = one.global ? omabook.library.byGlobalId(String(one.global)) : null;
        if (byGlobal)
            return byGlobal;
        const byNumber = one.book ? omabook.library.get(Number(one.book)) : null;
        if (byNumber && (!one.title || byNumber.title === one.title))
            return byNumber;
        const all = omabook.library.list();
        return all.filter(function (b) { return one.isbn && b.isbn === one.isbn; })[0]
            || all.filter(function (b) { return b.title === one.title && String(b.authors) === String(one.authors); })[0] || null;
    }

    // Whether a place lies past where the book has been read to.
    function past(book, one) {
        const read = Util.object(omabook.library.progress(book));
        const section = Number(read.section) || 0;
        return one.section > section || (one.section === section && one.fraction > (Number(read.fraction) || 0) + 1e-6);
    }

    function sharedPage(pageId) {
        const notebook = Store.pageEntry(pageId).notebook;
        return notebook ? Store.notebook(notebook).private === false : false;
    }

    // Where a new chip stands: beside the strokes or the text block it is
    // tied to, else in the top margin, under the page's other chips.
    function spot(pageId, details) {
        if (details.x !== undefined && details.y !== undefined)
            return {x: Number(details.x) || 0, y: Number(details.y) || 0};
        const width = Paper.layout(Store.pageEntry(pageId).paper).width;
        let near = null;
        if (details.strokes && details.strokes.length)
            near = Ink.around(Ink.bounds(pageId, details.strokes));
        else if (details.block)
            near = Store.content(details.block).fields;
        if (near)
            return {x: Math.min(width - 50, Number(near.x) + Number(near.width) + 2), y: Math.max(0, Number(near.y))};
        return {x: Math.max(0, width - 62), y: 3 + 8 * Store.references(pageId).filter(function (one) { return !one.strokes && !one.block; }).length};
    }

    function strokeIds(given) {
        if (given === undefined || given === null)
            return [];
        if (!Array.isArray(given) || !given.every(function (id) { return typeof id === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(id); }))
            throw new Error("A place reference is tied to strokes by their ids.");
        return given.slice(0, 1000);
    }

    // A new place reference on a page: `details` {book, section, fraction,
    // quote, strokes, block, x, y}, every one optional; without a book,
    // where the reader is.
    function make(pageId, details) {
        details = Util.object(details);
        Store.pageThing(pageId);
        let book = Number(details.book) || 0;
        let section = details.section;
        let fraction = details.fraction;
        if (!book) {
            const reading = omabook.reader.current();
            if (!reading)
                throw new Error("Open a book to refer to a place in it; the notebook beside it then refers to where you are.");
            book = reading.id;
            section = section === undefined ? reading.section : section;
            fraction = fraction === undefined ? reading.fraction : fraction;
        }
        const found = omabook.library.get(book);
        if (!found)
            throw new Error("There is no such book in the library.");
        if (found.generated === omabook.plugin.id)
            throw new Error("A notebook refers to the books you read, not to a notebook.");
        const count = Number(Util.object(omabook.library.toc(book)).sections) || 0;
        section = Math.max(0, Math.min(count - 1, Math.floor(Number(section) || 0)));
        const there = passageAt(String(omabook.library.text(book, section) || ""), section, fraction, details.quote);
        const strokes = strokeIds(details.strokes);
        const id = Util.id("r");
        const at = spot(pageId, {x: details.x, y: details.y, strokes: strokes, block: details.block});
        delete there.start;
        delete there.end;
        Store.keepReference(id, Object.assign(there, {
            page: String(pageId), book: book, global: Util.text(found.global_id),
            title: Util.text(found.title), authors: String(found.authors || ""), isbn: Util.text(found.isbn),
            x: at.x, y: at.y, strokes: strokes, block: Util.text(details.block), lost: false, created: Util.now()
        }));
        return id;
    }

    // What the view shows of a reference: its words kept back where they lie ahead in a shared notebook.
    function entryOf(one, shared, books) {
        const book = books[one.id] === undefined ? (books[one.id] = bookOf(one)) : books[one.id];
        const ahead = !!book && shared && past(book.id, one);
        const contents = book ? Util.object(omabook.library.toc(book.id)).contents || [] : [];
        const heading = contents.filter(function (c) { return c.section <= one.section; }).slice(-1)[0];
        return {id: one.id, page: one.page, book: book ? book.id : 0, global: book ? Util.text(book.global_id) : Util.text(one.global),
                title: one.title, section: one.section,
                chapter: heading ? heading.title : "Chapter " + (one.section + 1), fraction: one.fraction,
                quote: ahead ? "" : one.quote, ahead: ahead, lost: one.lost === true, here: !!book,
                x: Number(one.x) || 0, y: Number(one.y) || 0, strokes: one.strokes || [], block: one.block || ""};
    }

    function ofPage(pageId) {
        Store.pageThing(pageId);
        const shared = sharedPage(String(pageId));
        const books = {};
        return Store.references(String(pageId)).map(function (one) { return entryOf(one, shared, books); });
    }

    // A page's references as the AI may be told them (Asking): for one past
    // where the person has read the book to, in any notebook, only that the
    // book is referred to, never its words or which chapter.
    function reading(pageId) {
        const books = {};
        return Store.references(String(pageId)).map(function (one) {
            const book = books[one.id] === undefined ? (books[one.id] = bookOf(one)) : books[one.id];
            if (!book || past(book.id, one))
                return {title: one.title, chapter: "", quote: "", before: "", ahead: true};
            return {title: one.title, chapter: entryOf(one, false, books).chapter, quote: one.lost ? "" : one.quote, before: one.lost ? "" : Util.text(one.before), ahead: false};
        });
    }

    // Every reference to a book, in every notebook, by the book's place: with the page each is on.
    function ofBook(bookId) {
        const found = omabook.library.get(Number(bookId));
        if (!found)
            throw new Error("There is no such book in the library.");
        const books = {};
        const pages = {};
        return Store.references().map(function (one) {
            const book = bookOf(one);
            return book && book.id === found.id ? one : null;
        }).filter(Boolean).map(function (one) {
            const page = pages[one.page] || (pages[one.page] = Store.pageEntry(one.page));
            const notebook = page.notebook ? Store.notebook(page.notebook) : null;
            const numbered = Store.pages(page.notebook).findIndex(function (p) { return p.id === page.id; }) + 1;
            return Object.assign(entryOf(one, !!notebook && notebook.private === false, books),
                                 {notebook: page.notebook, notebookTitle: notebook ? notebook.title : "Loose notes", number: numbered});
        }).sort(function (a, b) { return a.section - b.section || a.fraction - b.fraction; });
    }

    // Whether a reference's words are where it says in the book's text now;
    // if not, found again and kept so (or lost). Answers it as it is then.
    function check(one, book) {
        const text = sectionText(book, one.section);
        if (Util.hash(text) === one.hash || !Util.text(one.quote))
            return {one: one, moved: false};
        let found = null;
        try {
            found = passageAt(text, one.section, one.fraction, one.quote);
            if (fits(text, found, one) < 0.5)
                found = null;
        } catch (error) {
            found = null;
        }
        found = found || findAgain(book, one);
        if (!found) {
            Store.keepReference(one.id, {lost: true});
            return {one: Object.assign(one, {lost: true}), moved: false};
        }
        const fields = {section: found.section, fraction: found.fraction, quote: found.quote, before: found.before, after: found.after,
                        hash: found.hash, lost: false};
        const moved = found.section !== one.section || Math.abs(found.fraction - one.fraction) > 1e-9;
        Store.keepReference(one.id, fields);
        return {one: Object.assign(one, fields), moved: moved, confidence: found.confidence === undefined ? 1 : found.confidence};
    }

    // Opens the book at a reference's passage, found again first if the book
    // changed: {book, section, fraction, moved}. One past where a shared
    // notebook's reader has read to opens only when asked (`anyway`).
    function follow(id, options) {
        options = Util.object(options);
        const kept = Store.reference(id);
        const book = bookOf(kept);
        if (!book)
            throw new Error("The book this refers to (" + (kept.title || "untitled") + ") isn't in the library on this computer.");
        const checked = check(kept, book.id);
        if (checked.one.lost)
            throw new Error("The words this refers to aren't in the book any more (" + checked.one.quote.slice(0, 60) + "); refer to the passage again.");
        if (sharedPage(kept.page) && past(book.id, checked.one) && options.anyway !== true)
            throw new Error("This refers to a place past where you have read to; read on first, or open it anyway.");
        omabook.reader.open(book.id, {section: checked.one.section, fraction: checked.one.fraction});
        return {book: book.id, section: checked.one.section, fraction: checked.one.fraction, moved: checked.moved};
    }

    // Every reference to a book checked against its text, when it is opened:
    // those whose section changed are found again, a lost one sought again in
    // this file. Answers how many moved or are lost.
    function recheck(bookId) {
        const book = omabook.library.get(Number(bookId));
        if (!book || book.generated === omabook.plugin.id)
            return 0;
        return Store.references().filter(function (one) {
            const its = bookOf(one);
            return its && its.id === book.id;
        }).filter(function (one) { return check(one, book.id).moved || one.lost; }).length;
    }

    function place(id, at) {
        Store.reference(id);
        at = Util.object(at);
        Store.keepReference(id, {x: Math.max(0, Number(at.x) || 0), y: Math.max(0, Number(at.y) || 0)});
        return entryOf(Store.reference(id), sharedPage(Store.reference(id).page), {});
    }

    function remove(id) { Store.removeReference(id); }

    // The link that opens Omabook at a reference's passage, on whichever of
    // the person's computers (#11): by the book's global id, "" when it has none.
    function link(entry) {
        // Encoded as Omabook makes them (BookLink), a global id's colons kept.
        const book = encodeURIComponent(entry.global).replace(/%3A/g, ":");
        return entry.global ? "omabook://book/" + book + "/section/" + entry.section : "";
    }

    return {make: make, ofPage: ofPage, reading: reading, ofBook: ofBook, follow: follow, recheck: recheck, place: place, remove: remove,
            link: link};
})();
