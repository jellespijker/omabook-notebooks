// Store: notebooks and pages as they live, in Omabook's change log.
//
// Live data is operations in the log (Omabook's ADR 0002), which go to the
// person's other computers at a sync and merge there: of a field the one
// written later stays, and what two computers added to a set is all kept.
// So the shape here is chosen for merging:
//
//   notebook <id>     fields {title, created, private, paper, hosted, speechHosted, language}
//   page <id>         fields {notebook, order, paper, created}
//                     sets   strokes (what is on it)
//   block <id>        fields {page, x, y, width, height, layer, z, created, text, format}
//   picture <id>      fields {page, x, y, width, height, layer, z, created, type, bytes, parts, title}
//   picturebytes <id> sets   parts {"000": base64, ...} (the picture of that id)
//   recognised <id>   fields {text, ink, hand, model, server, language, at} (the page of that id)
//   recording <id>    fields {page, file, started, duration, bytes, parts, created}
//                     sets   strokes {strokeId: ms into the recording} (the ink written during it)
//   transcript <id>   fields {text, model, server, language, at, pieces} (the recording of that id)
//                     sets   segments {"000": a piece of the segments' JSON, ...}
//
// A page says which notebook it is in, and where in it (`order`, a number),
// rather than a notebook holding a list of its pages: a page added on the
// laptop and one added on the desktop are then both there, and a page moved
// on one and another moved on the other both move. A page whose `notebook`
// is "" is a loose note; so is one whose notebook was removed on another
// computer while it was being written here, so nothing written is lost.
//
// A text block and a picture name their page the same way, each a thing of
// its own rather than an item of a set of the page: of an item the latest
// word holds whole, so a block moved on one computer and typed in on the
// other would lose one of the two; as fields, both hold, and of its words
// the latest change stays. A picture's bytes are a thing apart, in pieces
// one write each, so that listing a page's pictures doesn't read them.
//
// A page's recognised text is a thing apart too, of the page's id: it is
// rewritten whenever the ink is read again, and `ink` says which strokes it
// was read from (Recognised), so it never makes the page's own write larger.
//
// A recording names its page as a text block does, and keeps the moment in
// it of each stroke written while it ran (Recordings); its sound is a file
// under data/recordings/, which Omabook takes to the person's other
// computers at a sync (#131). Its transcript is a thing of the recording's
// id, its words' moments in pieces, each a write of its own (Transcripts).
var Store = (function () {
    "use strict";

    const sets = ["strokes", "text", "pictures", "recordings"];
    // What is on a page as things of their own, by the set of the page they are kept as in a snapshot.
    const placed = {text: "block", pictures: "picture"};

    function notebookOf(thing) {
        const fields = thing.fields;
        return {id: thing.id, title: Util.text(fields.title) || "Untitled notebook", created: fields.created || "",
                private: fields.private !== false, paper: Paper.normal(fields.paper), hosted: fields.hosted === true,
                speechHosted: fields.speechHosted === true, language: Util.text(fields.language), updated: thing.updated};
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

    // The text blocks or the pictures of a page ("text", "pictures"), {id: fields}.
    function onPage(set, pageId) {
        const found = {};
        omabook.log.list(placed[set]).forEach(function (thing) {
            if (thing.fields.page === pageId)
                found[thing.id] = Util.copy(thing.fields);
        });
        return found;
    }

    // The recordings made on a page, oldest first: [{id, fields, strokes}].
    function recordings(pageId) {
        return omabook.log.list("recording").filter(function (thing) { return thing.fields.page === pageId; })
            .map(function (thing) { return {id: thing.id, fields: Util.copy(thing.fields), strokes: Util.copy(Util.object(thing.sets.strokes))}; })
            .sort(function (a, b) { return String(a.fields.started) < String(b.fields.started) ? -1 : 1; });
    }

    // A recording as the notebook file names it: where its sound is, and what was said.
    function recordingEntry(one) {
        const entry = {file: Util.text(one.fields.file), started: Util.text(one.fields.started), duration: Number(one.fields.duration) || 0};
        const said = transcript(one.id);
        if (said && Util.text(said.fields.text))
            entry.transcript = said.fields.text;
        return entry;
    }

    // A page with what is on it, as the notebook file keeps it.
    function page(id) {
        const thing = pageThing(id);
        const whole = pageOf(thing, known());
        sets.forEach(function (name) {
            whole[name] = placed[name] ? onPage(name, thing.id) : Util.copy(Util.object(thing.sets[name]));
        });
        recordings(thing.id).forEach(function (one) { whole.recordings[one.id] = recordingEntry(one); });
        return whole;
    }

    function recording(id) {
        const thing = omabook.log.read("recording", String(id));
        if (!thing)
            throw new Error("There is no such recording; it may have been removed on another computer.");
        return {id: thing.id, fields: Util.copy(thing.fields), strokes: Util.copy(Util.object(thing.sets.strokes))};
    }

    function keepRecording(id, fields) { omabook.log.set("recording", String(id), fields); }

    // The moments of strokes in a recording, {strokeId: ms}, in writes the log takes.
    function stampRecording(id, moments) {
        const keys = Object.keys(moments);
        for (let at = 0; at < keys.length; at += 1000) {
            const some = {};
            keys.slice(at, at + 1000).forEach(function (key) { some[key] = moments[key]; });
            omabook.log.add("recording", String(id), "strokes", some, []);
        }
    }

    function transcript(id) {
        const thing = omabook.log.read("transcript", String(id));
        return thing ? {fields: Util.copy(thing.fields), segments: Util.copy(Util.object(thing.sets.segments))} : null;
    }

    // A transcript kept anew: its fields, then its pieces each a write, and what is left of a longer one before goes.
    function keepTranscript(id, fields, pieces) {
        const before = transcript(id);
        omabook.log.set("transcript", String(id), fields);
        Object.keys(pieces).forEach(function (key) {
            const piece = {};
            piece[key] = pieces[key];
            omabook.log.add("transcript", String(id), "segments", piece, []);
        });
        const stale = before ? Object.keys(before.segments).filter(function (key) { return !(key in pieces); }) : [];
        if (stale.length)
            omabook.log.add("transcript", String(id), "segments", {}, stale);
    }

    // A recording goes with its transcript, and its sound with it, here and on the other computers.
    function removeRecording(id) {
        const one = recording(id);
        if (omabook.log.read("transcript", one.id))
            omabook.log.remove("transcript", one.id);
        omabook.log.remove("recording", one.id);
        const file = Util.text(one.fields.file);
        if (file && omabook.files.exists(file))
            omabook.files.remove(file);
    }

    // A text block or a picture, by its id: {set, id, fields}, or the reason there is none.
    function content(id) {
        id = String(id);
        for (const set in placed) {
            const thing = omabook.log.read(placed[set], id);
            if (thing)
                return {set: set, id: id, fields: Util.copy(thing.fields)};
        }
        throw new Error("There is no such text block or picture; it may have been removed on another computer.");
    }

    // Puts a text block or a picture on a page (`fields.page`), or changes some of its fields.
    function place(set, id, fields) { omabook.log.set(placed[set], String(id), fields); }

    function unplace(id) {
        const one = content(id);
        omabook.log.remove(placed[one.set], one.id);
        if (one.set === "pictures" && omabook.log.read("picturebytes", one.id))
            omabook.log.remove("picturebytes", one.id);
        return one;
    }

    // A picture's bytes, in pieces ({"000": base64}), each its own write.
    function keepPictureBytes(id, pieces) {
        Object.keys(pieces).forEach(function (key) {
            const piece = {};
            piece[key] = pieces[key];
            omabook.log.add("picturebytes", String(id), "parts", piece, []);
        });
    }

    function pictureBytes(id) {
        const thing = omabook.log.read("picturebytes", String(id));
        return thing ? Util.object(thing.sets.parts) : {};
    }

    // Everything on a page goes with it.
    function removeThing(pageId) {
        for (const set in placed)
            Object.keys(onPage(set, pageId)).forEach(unplace);
        if (omabook.log.read("recognised", pageId))
            omabook.log.remove("recognised", pageId);
        recordings(pageId).forEach(function (one) { removeRecording(one.id); });
        omabook.log.remove("page", pageId);
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
        if (details.hosted !== undefined)
            fields.hosted = details.hosted === true;
        if (details.speechHosted !== undefined)
            fields.speechHosted = details.speechHosted === true;
        if (details.language !== undefined)
            fields.language = Util.text(details.language).slice(0, 35);
        omabook.log.set("notebook", id, fields);
        return notebook(id);
    }

    // A notebook goes with its pages. A page another computer adds to it
    // before it hears of this comes back as a loose note (see above).
    function removeNotebook(id) {
        notebook(id);
        pages(id).forEach(function (one) { removeThing(one.id); });
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

    // What is in one set of a page ("strokes": {id: base64}), and a change to
    // it: items added and keys removed in one write, as an ink batch is. Of
    // two computers' changes to a set, all that both added is kept.
    function items(id, set) {
        return Util.copy(Util.object(pageThing(id).sets[set]));
    }

    function changeItems(id, set, added, removed) {
        pageThing(id);
        omabook.log.add("page", String(id), set, added, removed);
    }

    // A page as the overview lists it, without what is on it.
    function pageEntry(id) { return pageOf(pageThing(id), known()); }

    // A page's recognised text as it was kept, {text, ink, hand, ...}, or null.
    function recognised(pageId) {
        const thing = omabook.log.read("recognised", String(pageId));
        return thing ? Util.copy(thing.fields) : null;
    }

    function keepRecognised(pageId, fields) {
        pageThing(pageId);
        omabook.log.set("recognised", String(pageId), fields);
    }

    function removePage(id) {
        const one = pageOf(pageThing(id), known());
        removeThing(one.id);
        return one.notebook;
    }

    return {notebooks: notebooks, notebook: notebook, pages: pages, page: page, sets: sets,
            makeNotebook: makeNotebook, changeNotebook: changeNotebook, removeNotebook: removeNotebook,
            addPage: addPage, movePage: movePage, filePage: filePage, setPaper: setPaper, removePage: removePage,
            items: items, changeItems: changeItems, pageThing: pageThing, pageEntry: pageEntry,
            recognised: recognised, keepRecognised: keepRecognised,
            recordings: recordings, recording: recording, keepRecording: keepRecording, stampRecording: stampRecording,
            removeRecording: removeRecording, transcript: transcript, keepTranscript: keepTranscript,
            onPage: onPage, content: content, place: place, unplace: unplace, keepPictureBytes: keepPictureBytes,
            pictureBytes: pictureBytes};
})();
