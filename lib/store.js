// Store: notebooks and pages as they live, in Omabook's change log.
//
// Live data is operations in the log (Omabook's ADR 0002), which go to the
// person's other computers at a sync and merge there: of a field the one
// written later stays, and what two computers added to a set is all kept.
// So the shape here is chosen for merging:
//
//   notebook <id>   fields {title, created, private, paper}
//   page <id>       fields {notebook, order, paper, created}
//                   sets   strokes, text, pictures, recordings (what is on it)
//
// A page says which notebook it is in, and where in it (`order`, a number),
// rather than a notebook holding a list of its pages: a page added on the
// laptop and one added on the desktop are then both there, and a page moved
// on one and another moved on the other both move. A page whose `notebook`
// is "" is a loose note; so is one whose notebook was removed on another
// computer while it was being written here, so nothing written is lost.
var Store = (function () {
    "use strict";

    const sets = ["strokes", "text", "pictures", "recordings"];

    function notebookOf(thing) {
        const fields = thing.fields;
        return {id: thing.id, title: Util.text(fields.title) || "Untitled notebook", created: fields.created || "",
                private: fields.private !== false, paper: Paper.normal(fields.paper), updated: thing.updated};
    }

    function pageOf(thing, known) {
        const fields = thing.fields;
        const notebook = Util.text(fields.notebook);
        return {id: thing.id, notebook: known && !known[notebook] ? "" : notebook, order: Number(fields.order) || 0,
                paper: Paper.normal(fields.paper), created: fields.created || "", updated: thing.updated};
    }

    function byCreated(a, b) { return a.created < b.created ? -1 : a.created > b.created ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0; }
    function byOrder(a, b) { return a.order - b.order || byCreated(a, b); }

    function notebooks() {
        return omabook.log.list("notebook").map(notebookOf).sort(byCreated);
    }

    function known() {
        const ids = {};
        notebooks().forEach(function (one) { ids[one.id] = true; });
        return ids;
    }

    function notebook(id) {
        const thing = omabook.log.read("notebook", String(id));
        if (!thing)
            throw new Error("There is no such notebook; it may have been removed on another computer.");
        return notebookOf(thing);
    }

    // Every page, or the pages of one notebook in their order; "" for the
    // loose notes.
    function pages(notebookId) {
        const ids = known();
        const all = omabook.log.list("page").map(function (thing) { return pageOf(thing, ids); });
        if (notebookId === undefined)
            return all;
        return all.filter(function (one) { return one.notebook === notebookId; }).sort(byOrder);
    }

    function pageThing(id) {
        const thing = omabook.log.read("page", String(id));
        if (!thing)
            throw new Error("There is no such page; it may have been removed on another computer.");
        return thing;
    }

    // A page with what is on it, as the notebook file keeps it.
    function page(id) {
        const thing = pageThing(id);
        const whole = pageOf(thing, known());
        sets.forEach(function (name) { whole[name] = Util.copy(Util.object(thing.sets[name])); });
        return whole;
    }

    function makeNotebook(details) {
        details = details || {};
        const id = Util.id("n");
        omabook.log.set("notebook", id, {title: Util.text(details.title) || "Untitled notebook", created: Util.now(),
                                         private: details.private !== false, paper: Paper.normal(details.paper)});
        return id;
    }

    function changeNotebook(id, details) {
        notebook(id);
        const fields = {};
        if (details.title !== undefined)
            fields.title = Util.text(details.title) || "Untitled notebook";
        if (details.paper !== undefined)
            fields.paper = Paper.normal(details.paper);
        if (details.private !== undefined)
            fields.private = !!details.private;
        omabook.log.set("notebook", id, fields);
        return notebook(id);
    }

    // A notebook goes with its pages. A page another computer adds to it
    // before it hears of this comes back as a loose note (see above).
    function removeNotebook(id) {
        notebook(id);
        pages(id).forEach(function (one) { omabook.log.remove("page", one.id); });
        omabook.log.remove("notebook", id);
    }

    // Where a page goes to stand at `index` among `others` (in order): half
    // way between its neighbours, so only its own order changes. When two
    // neighbours have come too close to tell apart, the notebook's pages are
    // numbered afresh first.
    function orderAt(others, index) {
        index = Math.max(0, Math.min(others.length, index === undefined || index === null ? others.length : Number(index)));
        const before = index > 0 ? others[index - 1].order : null;
        const after = index < others.length ? others[index].order : null;
        if (before !== null && after !== null && after - before < 1e-6) {
            others.forEach(function (one, at) { one.order = at + 1; omabook.log.set("page", one.id, {order: at + 1}); });
            return orderAt(others, index);
        }
        if (before === null && after === null)
            return 1;
        if (before === null)
            return after - 1;
        return after === null ? before + 1 : (before + after) / 2;
    }

    function addPage(notebookId, details) {
        details = details || {};
        notebookId = Util.text(notebookId);
        const paper = details.paper || (notebookId ? notebook(notebookId).paper : undefined);
        const id = Util.id("p");
        omabook.log.set("page", id, {notebook: notebookId, order: orderAt(pages(notebookId), details.at), paper: Paper.normal(paper),
                                     created: Util.now()});
        return id;
    }

    function movePage(id, index) {
        const one = page(id);
        const others = pages(one.notebook).filter(function (other) { return other.id !== one.id; });
        omabook.log.set("page", one.id, {order: orderAt(others, index)});
    }

    // Files a page (a loose note, or one of another notebook) into a
    // notebook, at `index` or last; "" takes it out again, as a loose note.
    function filePage(id, notebookId, index) {
        const one = page(id);
        notebookId = Util.text(notebookId);
        if (notebookId)
            notebook(notebookId);
        const others = pages(notebookId).filter(function (other) { return other.id !== one.id; });
        omabook.log.set("page", one.id, {notebook: notebookId, order: orderAt(others, index)});
        return one.notebook;
    }

    function setPaper(id, paper) {
        pageThing(id);
        omabook.log.set("page", String(id), {paper: Paper.normal(paper)});
    }

    function removePage(id) {
        const one = page(id);
        omabook.log.remove("page", one.id);
        return one.notebook;
    }

    return {notebooks: notebooks, notebook: notebook, pages: pages, page: page, sets: sets,
            makeNotebook: makeNotebook, changeNotebook: changeNotebook, removeNotebook: removeNotebook,
            addPage: addPage, movePage: movePage, filePage: filePage, setPaper: setPaper, removePage: removePage};
})();
