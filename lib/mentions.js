// Mentions: what a notebook's pages are about, in the knowledge graph.
//
// A page is about a thing of the graph ("Vin", "Mistborn", "the Ford")
// when the person says so: by hand ("this is about Vin"), or by saying yes
// to one the page names (`suggest`: the things of the graph whose name or
// other name its words hold, typed, read from the ink or said). Nothing
// goes into the graph unasked, and no word of the page goes to a model.
//
// Said so, the thing is tied to the notebook's book (Omabook's own thing for
// it, of kind `book`) by a relation `written about in`, its note the pages
// ("Pages 2 and 5"). It is written as by hand, of no place in a book, in the
// graph of the notebook's book: so it is in the notebook's tenant (the
// top-level collections its book is in, ADR 0003), where the thing must be
// too, and `knows:vin` (and a bare `vin`) on the shelf finds the notebook.
// Nothing of it goes into a shared or published space while the notebook is
// private: its book is of a kind Notebooks keeps private (plugin.json,
// Omabook #127), and a space leaves out such a book's node with what is tied to it.
//
// A thing that isn't in the graph yet is made in the notebook's book, as
// met on its page; it goes again when nothing is tied to it any more.
//
// What the person said is kept in the change log (Store, `mention`); the
// relations are made from it (`tie`), so the same is said on every computer
// and a page moved, filed or removed says it again.
var Mentions = (function () {
    "use strict";

    const relation = "written about in";
    // Kinds a person writes about. Tags, books, questions and other
    // plugins' things are not suggested; a new thing is one of these.
    const kinds = ["character", "place", "group", "concept", "item", "event", "theme", "topic", "author", "series"];
    const asked = 60;
    const most = 12;

    function keyOf(kind, name) { return Util.text(kind).toLowerCase() + ":" + Finder.folded(Util.text(name)); }

    function bookOf(notebookId) {
        const book = Shelf.books()[notebookId];
        if (!book)
            throw new Error("This notebook isn't in the library just now; open it again from the shelf and try once more.");
        return book;
    }

    // Omabook's own thing for the notebook's book. The graph has one for every
    // book once it has looked at the library's books, which a plugin can't ask
    // for (a book it makes has none until then); exporting the general graph
    // has it look, when books came or went since it last did. A plugin finds
    // things only in the library's preferred tenant, so the number found is
    // remembered (settings, `nodes`): a thing is read by its number in its own.
    function bookNode(book) {
        const ours = function (one) { return !!one && one.kind === "book" && one.book === book.id; };
        const remembered = Util.object(omabook.settings.get("nodes", {}));
        const hint = Number(remembered[book.id]) > 0 ? omabook.graph.node(Number(remembered[book.id])) : null;
        if (ours(hint))
            return hint;
        const find = function () { return omabook.graph.find(book.title, {kind: "book", limit: 50}).filter(ours)[0] || null; };
        const found = find() || (omabook.graph.exported("json", {}) !== null && find());
        if (!found)
            throw new Error("This notebook's book isn't in the knowledge graph shown first (that of the collection with the most "
                + "books); open the knowledge graph in the notebook's collection once and try again.");
        remembered[book.id] = found.id;
        omabook.settings.set("nodes", remembered);
        return found;
    }

    function called(node) { return [node.name].concat(Array.isArray(node.data && node.data.aliases) ? node.data.aliases : []); }

    // The thing a mention stands for here: by the number it had on this
    // computer, else by its kind and name, which every computer knows it by.
    function nodeOf(mention) {
        const hint = Number(mention.node) > 0 ? omabook.graph.node(Number(mention.node)) : null;
        if (hint && hint.kind === mention.kind)
            return hint;
        const name = Finder.folded(mention.name);
        return omabook.graph.find(mention.name, {kind: mention.kind, scope: mention.scope || "", limit: 20}).filter(function (one) {
            return called(one).some(function (each) { return Finder.folded(each) === name; });
        })[0] || null;
    }

    function pagesNote(numbers) {
        numbers.sort(function (a, b) { return a - b; });
        if (numbers.length === 1)
            return "Page " + numbers[0];
        return "Pages " + numbers.slice(0, -1).join(", ") + " and " + numbers[numbers.length - 1];
    }

    // What the notebook's mentions say, by thing: {key: {mention, numbers}}.
    function wanted(notebookId) {
        const numbers = {};
        Store.pages(notebookId).forEach(function (page, at) { numbers[page.id] = at + 1; });
        const out = {};
        Store.mentions().forEach(function (one) {
            if (!numbers[one.page])
                return;
            const key = keyOf(one.kind, one.name);
            out[key] = out[key] || {mention: one, numbers: []};
            if (out[key].numbers.indexOf(numbers[one.page]) < 0)
                out[key].numbers.push(numbers[one.page]);
        });
        return out;
    }

    function link(thing, book, target, note, existing) {
        const before = existing.filter(function (edge) { return edge.source === thing.id; })[0];
        if (before && before.note === note)
            return;
        try {
            omabook.graph.link(thing.id, target.id, relation, {book: book.id, note: note});
        } catch (error) {
            throw new Error(thing.name + " is in the knowledge graph of another collection than this notebook's: put the notebook in "
                + "that collection to tie them.");
        }
    }

    // A thing made for the notebook goes when nothing is tied to it any more.
    function tidy(id, notebookId) {
        const thing = omabook.graph.node(id);
        if (thing && thing.data && thing.data.notebook === notebookId && omabook.graph.around(id, 1).edges.length === 0)
            omabook.graph.remove(id);
    }

    // Says in the graph what the notebook's mentions say: each thing tied to
    // its book with the pages it is on, and no other.
    function tie(notebookId) {
        const book = bookOf(notebookId);
        const target = bookNode(book);
        const existing = omabook.graph.around(target.id, 1).edges.filter(function (edge) {
            return edge.target === target.id && edge.kind === relation;
        });
        const want = wanted(notebookId);
        const tied = {};
        Object.keys(want).forEach(function (key) {
            const thing = nodeOf(want[key].mention);
            if (!thing)
                return;
            link(thing, book, target, pagesNote(want[key].numbers), existing);
            tied[thing.id] = true;
        });
        existing.filter(function (edge) { return !tied[edge.source]; }).forEach(function (edge) {
            omabook.graph.unlink(edge.id);
            tidy(edge.source, notebookId);
        });
        return Object.keys(tied).length;
    }

    // Whether any page of a notebook is said to be about something.
    function within(notebookId) {
        const pages = {};
        Store.pages(notebookId).forEach(function (page) { pages[page.id] = true; });
        return Store.mentions().some(function (one) { return pages[one.page]; });
    }

    // After a page moved, was filed or went: the notebooks it touched that
    // say something in the graph say it again (all of them with `always`).
    // The graph may not be there to say it to (no book yet); the next
    // mention says it all.
    function follow(notebookIds, always) {
        notebookIds.filter(function (id) { return id && (always || within(id)); }).forEach(function (id) {
            try {
                tie(id);
            } catch (error) {
                // Said again with the notebook's next mention.
            }
        });
    }

    function entry(one) { return {id: one.id, kind: one.kind, name: one.name, scope: one.scope || "", made: one.made === true}; }

    // What a page was said to be about: [{id, kind, name, scope, made}].
    function ofPage(pageId) { return Store.mentions(String(pageId)).map(entry); }

    function shown(node) {
        return {node: node.id, kind: node.kind, name: node.name, summary: Util.text(node.summary).slice(0, 200), scope: node.scope || ""};
    }

    // The things of the graph a page's words name, not said yet either way:
    // [{node, kind, name, summary, scope}]. The words asked of the graph are
    // the page's own, those written with a capital first.
    function suggest(pageId) {
        pageId = String(pageId);
        Store.pageThing(pageId);
        const text = Finder.text(pageId);
        const said = Store.dismissed(pageId);
        ofPage(pageId).forEach(function (one) { said[keyOf(one.kind, one.name)] = true; });
        const words = {};
        (text.match(/[A-ZÀ-ÞΑ-ΩЀ-Я][^\s.,;:!?"'()]{2,}/g) || []).forEach(function (word) { words[word] = true; });
        const out = [];
        const seen = {};
        Object.keys(words).slice(0, asked).forEach(function (word) {
            omabook.graph.find(word, {limit: 10}).forEach(function (node) {
                if (seen[node.id] || kinds.indexOf(node.kind) < 0 || said[keyOf(node.kind, node.name)])
                    return;
                seen[node.id] = true;
                if (called(node).some(function (name) { return Finder.names(text, name); }))
                    out.push(shown(node));
            });
        });
        return out.slice(0, most);
    }

    // The things of the graph some words find, for saying by hand what a page is about.
    function lookup(words) {
        if (!Util.text(words))
            return [];
        return omabook.graph.find(Util.text(words), {limit: 30}).filter(function (node) { return kinds.indexOf(node.kind) >= 0; })
            .slice(0, 15).map(shown);
    }

    // A new thing, met on the page in the notebook's book.
    function make(page, book, what) {
        const kind = Util.text(what.kind).toLowerCase() || "topic";
        if (kinds.indexOf(kind) < 0)
            throw new Error("A thing written about is one of " + kinds.join(", ") + "; not \"" + kind + "\".");
        const name = Util.text(what.name).slice(0, 120);
        if (!name)
            throw new Error("Say what the page is about: a name.");
        const at = Store.pages(page.notebook).map(function (one) { return one.id; }).indexOf(page.id);
        const thing = {kind: kind, name: name, book: book.id, section: Math.max(0, at), fraction: 0, data: {notebook: page.notebook}};
        if (Util.text(what.summary))
            thing.summary = Util.text(what.summary).slice(0, 500);
        return omabook.graph.node(omabook.graph.upsert(thing));
    }

    // Says that a page is about a thing: `{node}` (one of the graph's, by
    // its number) or `{kind, name, summary}` (found by them, or made). The
    // page's mentions again.
    function confirm(pageId, what) {
        what = Util.object(what);
        const page = Store.pageEntry(String(pageId));
        if (!page.notebook)
            throw new Error("A loose note isn't in the library: file it into a notebook to tie it to the knowledge graph.");
        const book = bookOf(page.notebook);
        let thing = what.node ? omabook.graph.node(Number(what.node)) : nodeOf({kind: Util.text(what.kind).toLowerCase() || "topic", name: Util.text(what.name)});
        if (what.node && !thing)
            throw new Error("That thing isn't in the knowledge graph any more; find it again.");
        const made = !thing;
        thing = thing || make(page, book, what);
        if (ofPage(page.id).some(function (one) { return keyOf(one.kind, one.name) === keyOf(thing.kind, thing.name); }))
            return ofPage(page.id);
        const id = Util.id("m");
        Store.keepMention(id, {page: page.id, kind: thing.kind, name: thing.name, scope: thing.scope || "", node: thing.id, made: made, created: Util.now()});
        try {
            tie(page.notebook);
        } catch (error) {
            Store.removeMention(id);
            if (made)
                tidy(thing.id, page.notebook);
            throw error;
        }
        return ofPage(page.id);
    }

    // Takes back that a page is about a thing; the page's mentions again.
    function forget(mentionId) {
        const one = Store.mentions().filter(function (each) { return each.id === String(mentionId); })[0];
        if (!one)
            throw new Error("There is no such mention; it may have been taken away on another computer.");
        Store.removeMention(one.id);
        follow([Store.pageEntry(one.page).notebook], true);
        return ofPage(one.page);
    }

    // Says that a page isn't about a thing it names, so it isn't suggested again.
    function dismiss(pageId, what) {
        what = Util.object(what);
        Store.pageThing(String(pageId));
        Store.dismiss(String(pageId), keyOf(what.kind, what.name));
        return suggest(pageId);
    }

    // Before a notebook goes: what it said in the graph goes first.
    function untie(notebookId) {
        Store.pages(notebookId).forEach(function (page) {
            Store.mentions(page.id).forEach(function (one) { Store.removeMention(one.id); });
        });
        follow([notebookId], true);
    }

    return {ofPage: ofPage, suggest: suggest, lookup: lookup, confirm: confirm, forget: forget, dismiss: dismiss,
            tie: tie, within: within, follow: follow, untie: untie, relation: relation, kinds: kinds};
})();
