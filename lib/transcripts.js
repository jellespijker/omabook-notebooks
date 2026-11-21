// Transcripts: the words a recording was found to hold, each with its moment.
//
// Omabook transcribes (#84, `omabook.recognize.audio`): through the
// transcription server's OpenAI-compatible `/audio/transcriptions` (the AI
// server's, or one set up for speech), else whisper.cpp on this computer;
// in the background, waiting while the server can't be reached. What it
// heard is kept here with the recording (Store, `transcript <id>`): its text
// for the page and for search, and its segments, each word with its moment
// in milliseconds, in pieces each a write of the log.
//
// Private by default: a recording goes only to the person's own servers
// (this computer, the tailnet). A hosted one is asked only for a notebook
// that chose it for speech (`speechHosted`), apart from its handwriting, and
// Omabook asks it only when hosted servers are allowed in its settings too.
var Transcripts = (function () {
    "use strict";

    // A field of the log holds at most 64 KiB: the text, and each piece of the segments.
    const longest = 30000;
    const piece = 30000;
    const unavailable = "Recordings aren't transcribed here: there is no server of your own that transcribes speech, " +
        "and whisper.cpp isn't installed. Set one up in Omabook's settings (AI); the recording is kept either way.";

    // What runs now, per recording, and what was said of it: in this engine only.
    const running = {};
    const waiting = {};
    const failed = {};

    function how(recordingId) {
        const pageId = Store.recording(recordingId).fields.page;
        let notebookId = "";
        try {
            notebookId = Store.pageEntry(pageId).notebook;
        } catch (error) {
            // The page went on another computer: its recording is a loose note's.
        }
        const notebook = notebookId ? Store.notebook(notebookId) : {speechHosted: false, language: ""};
        const options = {hosted: notebook.speechHosted === true};
        if (notebook.language)
            options.language = notebook.language;
        return options;
    }

    function available(recordingId) { return omabook.recognize.available("audio") || how(recordingId).hosted; }

    // The segments as the log keeps them, small: [{start, end, text, words: [[text, start, end]]}].
    function compact(segments) {
        return (Array.isArray(segments) ? segments : []).map(function (one) {
            return {start: Number(one.start) || 0, end: Number(one.end) || 0, text: Util.text(one.text),
                    words: (Array.isArray(one.words) ? one.words : []).map(function (word) {
                        return [Util.text(word.text), Number(word.start) || 0, Number(word.end) || 0];
                    })};
        });
    }

    function piecesOf(segments) {
        const words = JSON.stringify(segments);
        const out = {};
        for (let at = 0, n = 0; at < words.length; at += piece, n++)
            out[("00" + n).slice(-3)] = words.slice(at, at + piece);
        return out;
    }

    // The segments again, or null while some of their pieces are still on their way.
    function segmentsOf(kept) {
        const keys = Object.keys(kept.segments).sort();
        if (keys.length !== (Number(kept.fields.pieces) || 0))
            return null;
        try {
            return JSON.parse(keys.map(function (key) { return kept.segments[key]; }).join(""));
        } catch (error) {
            return null;
        }
    }

    function statusOf(id, kept, here) {
        if (running[id])
            return waiting[id] ? {status: "waiting", why: waiting[id]} : {status: "transcribing", why: "Listening to the recording…"};
        if (kept)
            return {status: "current", why: ""};
        if (failed[id])
            return {status: "failed", why: failed[id]};
        if (!here)
            return {status: "away", why: "This recording hasn't come from your other computer yet; it comes with the next sync."};
        if (!available(id))
            return {status: "unavailable", why: unavailable};
        return {status: "untranscribed", why: ""};
    }

    // A recording's transcript and where it stands: {text, segments, model,
    // server, language, at, hosted, status, why}. `status` is "untranscribed",
    // "transcribing", "waiting" (for the server; `why`), "current", "failed",
    // "away" (its sound not here yet) or "unavailable" (no server may be asked).
    function state(id) {
        id = String(id);
        const one = Store.recording(id);
        const kept = Store.transcript(id);
        const fields = kept ? kept.fields : {};
        const out = {id: id, text: Util.text(fields.text), segments: kept ? segmentsOf(kept) : [], model: Util.text(fields.model),
                     server: Util.text(fields.server), language: Util.text(fields.language), at: Util.text(fields.at),
                     hosted: how(id).hosted};
        return Object.assign(out, statusOf(id, kept, omabook.files.exists(one.fields.file)));
    }

    function keep(id, result) {
        delete failed[id];
        const segments = compact(result.segments);
        const pieces = piecesOf(segments);
        Store.keepTranscript(id, {text: String(result.text || "").trim().slice(0, longest), model: Util.text(result.model),
                                  server: Util.text(result.server), language: Util.text(result.language), at: Util.now(),
                                  pieces: Object.keys(pieces).length}, pieces);
    }

    // Transcribes a recording and keeps what was heard; a promise of its
    // state. `{background: true}`: only one not transcribed yet, and a
    // failure said in the state rather than thrown. `{again: true}`: anew.
    function transcribe(id, options) {
        id = String(id);
        options = Util.object(options);
        const background = options.background === true;
        const before = state(id);
        if (background && (before.status === "current" || before.status === "unavailable" || before.status === "away" || failed[id]))
            return Promise.resolve(before);
        if (before.status === "away")
            throw new Error(before.why);
        if (running[id])
            return running[id].then(function () { return state(id); }, function () { return state(id); });
        const file = Store.recording(id).fields.file;
        const promise = omabook.recognize.audio(file, Object.assign(how(id), {again: options.again === true,
                                                                               onWaiting: function (why) { waiting[id] = why; }}));
        running[id] = promise;
        function done() {
            delete running[id];
            delete waiting[id];
        }
        return promise.then(function (result) {
            done();
            keep(id, result);
            return state(id);
        }, function (error) {
            done();
            failed[id] = error && error.message ? error.message : String(error);
            if (background)
                return state(id);
            throw new Error(failed[id]);
        });
    }

    // The transcripts of a page's recordings, oldest first.
    function ofPage(pageId) { return Store.recordings(String(pageId)).map(function (one) { return state(one.id); }); }

    return {state: state, transcribe: transcribe, ofPage: ofPage};
})();
