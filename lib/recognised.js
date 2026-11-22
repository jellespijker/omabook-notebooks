// Recognised: the words found in a page's ink, kept with the strokes they
// were read from.
//
// Omabook reads handwriting (#84, `omabook.recognize.ink`): a vision model on
// the person's AI server is shown the strokes as a picture, in the
// background, one page at a time, and waits while the server can't be
// reached. What it read is kept by Omabook too, by the strokes' hash, so the
// same ink is read once on whichever computer. Here a page's recognised text
// is kept with the page (Store, `recognised <page>`), with `ink`, the
// fingerprint of the strokes it was read from: when the ink changes, the
// text is behind it and the view has it read again after the pen rests.
//
// Words corrected by hand are the person's: they are never written over
// unasked. When the ink changes after a correction, the text says so and
// waits to be read again on request.
//
// Where the server lacks the model for handwriting, the page's state says
// what Omabook can do about it (`remedy`, Ai.remedy), offered to the person
// in place of a dead end; on an older Omabook it says only why.
//
// Private by default: handwriting goes only to the person's own servers.
// A hosted one is asked only for a notebook that says so (`hosted`), and
// Omabook asks it only when hosted servers are allowed in its settings too.
var Recognised = (function () {
    "use strict";

    // A field of the log holds at most 64 KiB.
    const longest = 30000;
    const unavailable = "Handwriting isn't recognised here: there is no AI server set up that may read it. " +
        "Choose one of your own in Omabook's settings (AI); the ink is kept either way.";

    // What runs now, per page ({ink, promise}), and what was said of it: in
    // this engine only, gone when the plugin is loaded again.
    const running = {};
    const waiting = {};
    const failed = {};

    function fingerprint(ids) {
        const sorted = ids.slice().sort();
        return sorted.length + "-" + Util.hash(sorted.join(" "));
    }

    // How a notebook asks for its pages to be read: a loose note is in none,
    // so it goes only to one's own servers.
    function how(pageId) {
        const notebookId = Store.pageEntry(pageId).notebook;
        const notebook = notebookId ? Store.notebook(notebookId) : {hosted: false, language: ""};
        const options = {hosted: notebook.hosted === true};
        if (notebook.language)
            options.language = notebook.language;
        return options;
    }

    // Whether there is a server to ask. Omabook answers for one's own
    // servers only; a notebook that chose a hosted one is tried, and Omabook
    // says plainly when the settings don't allow it.
    function available(pageId) { return omabook.recognize.available("ink") || how(pageId).hosted; }

    function statusOf(pageId, ink, kept) {
        if (ink === "0-" + Util.hash(""))
            return {status: "empty", why: "Nothing is written on this page to recognise."};
        if (running[pageId] && running[pageId].ink === ink)
            return waiting[pageId] ? {status: "waiting", why: waiting[pageId]} : {status: "recognising", why: "Reading the handwriting…"};
        if (kept && kept.ink === ink)
            return {status: "current", why: ""};
        if (failed[pageId] && failed[pageId].ink === ink)
            return {status: "failed", why: failed[pageId].why};
        if (!available(pageId))
            return {status: "unavailable", why: unavailable};
        if (kept && kept.hand)
            return {status: "changed", why: "You corrected this by hand; the ink has changed since. Recognise again to replace it."};
        return kept ? {status: "changed", why: "The ink has changed; it is read again once the pen rests."} : {status: "unread", why: ""};
    }

    // A page's recognised text and where it stands: {text, hand, model,
    // server, at, status, why, hosted, remedy}. `status` is "empty" (no ink),
    // "unread", "recognising", "waiting" (for the server; `why`), "current",
    // "changed" (the ink changed since), "failed" or "unavailable"; for the
    // last two `remedy` is what Omabook offers for a missing model, or null.
    function state(pageId) {
        const ink = fingerprint(Object.keys(Ink.strokes(pageId)));
        const kept = Store.recognised(pageId) || {};
        const out = {text: typeof kept.text === "string" ? kept.text : "", hand: kept.hand === true, model: Util.text(kept.model),
                     server: Util.text(kept.server), at: Util.text(kept.at), hosted: how(pageId).hosted};
        Object.assign(out, statusOf(pageId, ink, kept.ink === undefined ? null : kept));
        out.remedy = out.status === "failed" || out.status === "unavailable" ? Ai.remedy("handwriting", out.hosted) : null;
        return out;
    }

    // The strokes asked for, by id, of the page's: all of them, or a selection.
    function chosen(pageId, ids) {
        const all = Ink.strokes(pageId);
        if (ids === undefined || ids === null)
            return all;
        if (!Array.isArray(ids))
            throw new Error("A selection lists the strokes it holds, by id.");
        const out = {};
        ids.forEach(function (id) {
            if (typeof all[id] === "string")
                out[id] = all[id];
        });
        if (!Object.keys(out).length)
            throw new Error("None of the chosen ink is on this page any more; choose it again.");
        return out;
    }

    // Omabook says why, in plain words, when no server may be asked.
    function read(strokes, pageId, options, onWaiting) {
        return omabook.recognize.ink(strokes, Object.assign(how(pageId), {again: options.again === true, onWaiting: onWaiting}));
    }

    function forget(pageId, promise) {
        if (running[pageId] && running[pageId].promise === promise) {
            delete running[pageId];
            delete waiting[pageId];
        }
    }

    function kept(pageId, ink, result) {
        delete failed[pageId];
        Store.keepRecognised(pageId, {text: String(result.text || "").slice(0, longest), ink: ink, hand: false,
                                      model: Util.text(result.model), server: Util.text(result.server),
                                      language: Util.text(result.language), at: Util.now()});
    }

    // Whether a pause of the pen leaves the page to be read: not when it is
    // read already, the person's words would be written over, it failed
    // for this very ink (they ask again), or there is no server to ask.
    function rests(pageId, ink) {
        const before = Store.recognised(pageId);
        if (before && (before.ink === ink || before.hand))
            return true;
        return (failed[pageId] && failed[pageId].ink === ink) || !available(pageId);
    }

    // Reads the page's ink, and keeps what was read with it; answers a
    // promise of the page's state. `{background: true}` is the pen resting:
    // only what needs reading is read, and a failure is said in the state
    // rather than thrown. `{again: true}` reads anew what was read before.
    function page(pageId, options) {
        const strokes = Ink.strokes(pageId);
        const ink = fingerprint(Object.keys(strokes));
        const background = options.background === true;
        if (!Object.keys(strokes).length || (background && rests(pageId, ink)))
            return Promise.resolve(state(pageId));
        const now = running[pageId];
        if (now && now.ink === ink && !options.again)
            return now.promise.then(function () { return state(pageId); }, function () { return state(pageId); });
        if (now)
            now.promise.cancel();
        const promise = read(strokes, pageId, options, function (why) { waiting[pageId] = why; });
        running[pageId] = {ink: ink, promise: promise};
        return promise.then(function (result) {
            forget(pageId, promise);
            kept(pageId, ink, result);
            return state(pageId);
        }, function (error) {
            const replaced = running[pageId] && running[pageId].promise !== promise;
            forget(pageId, promise);
            if (replaced)
                return state(pageId);
            failed[pageId] = {ink: ink, why: error && error.message ? error.message : String(error)};
            // Said once Omabook knows what it can do about a missing model.
            return Ai.remedyFound("handwriting", how(pageId).hosted).then(function () {
                if (background)
                    return state(pageId);
                throw new Error(failed[pageId].why);
            });
        });
    }

    // Reads a page's ink, or a selection of it (`strokes`: ids). A
    // selection's words are answered, not kept as the page's:
    // {text, strokes, model, server}.
    function recognise(pageId, options) {
        options = Util.object(options);
        if (options.strokes === undefined)
            return page(String(pageId), options);
        const strokes = chosen(String(pageId), options.strokes);
        return read(strokes, String(pageId), options, function () {}).then(function (result) {
            return {text: String(result.text || ""), strokes: Object.keys(strokes), model: Util.text(result.model),
                    server: Util.text(result.server)};
        });
    }

    // The person's own words for the page's ink: kept as they typed them,
    // for the ink as it is now, and never written over unasked.
    function correct(pageId, text) {
        const ink = fingerprint(Object.keys(Ink.strokes(pageId)));
        const before = Store.recognised(pageId) || {};
        Store.keepRecognised(pageId, {text: String(text === undefined || text === null ? "" : text).slice(0, longest), ink: ink,
                                      hand: true, model: Util.text(before.model), server: Util.text(before.server),
                                      language: Util.text(before.language), at: Util.now()});
        return state(pageId);
    }

    // A text block of recognised words (Content), where the ink lies: of the
    // page's text, or `text` (a selection's) of the strokes `strokes`. With
    // `replace`, the ink it was read from goes, in its place.
    function toText(pageId, options) {
        options = Util.object(options);
        const strokes = chosen(pageId, options.strokes);
        const text = options.text === undefined ? state(pageId).text : String(options.text);
        if (!text.trim())
            throw new Error("There is no recognised text to make a text block of yet.");
        const ids = Object.keys(strokes);
        const where = Ink.around(Ink.bounds(pageId, ids));
        const details = {text: text, format: "plain"};
        if (where) {
            const lines = text.split("\n").length;
            Object.assign(details, {x: where.x, y: where.y, width: Math.max(where.width, 30),
                                    height: Math.max(where.height, lines * Paper.layout(Store.pageEntry(pageId).paper).typing.step)});
        }
        const block = Content.addText(pageId, details);
        if (options.replace === true)
            Ink.erase(pageId, ids);
        return {block: block, strokes: Ink.count(pageId)};
    }

    return {state: state, recognise: recognise, correct: correct, toText: toText, fingerprint: fingerprint};
})();
