// Recordings: what was said while a page was written, tied to its ink.
//
// Omabook records (#79, `omabook.audio`): Opus into a file under the
// plugin's data/ folder, once the person said yes in the window, with a mark
// at the top of the window while it runs. A recording is made on a page;
// each stroke written on that page while it runs is stamped with its moment
// in the recording (Store, `recording <id>`, set `strokes`), from the moment
// the stroke began, so a tap on the ink plays what was said as it was
// written, and playing shows the ink as it was then.
//
// A recording's moments are its parts: the stretches between pauses, each
// `at` milliseconds into the recording and begun at `started` (a moment of
// the day). A stroke begun during a pause belongs where the sound goes on.
// When a recording stops, the summary's parts are the true ones, and every
// stroke of the page begun within it is stamped from them: the ones the pen
// wrote, and the pieces an eraser left, which begin when their stroke did.
//
// The sound goes to the person's other computers with the plugin's data/
// folder at a sync (#131), and never into a space; until it has come, a
// recording says so and plays nothing.
var Recordings = (function () {
    "use strict";

    const folder = "data/recordings/";
    const filePattern = /^data\/recordings\/([A-Za-z0-9_-]{1,64})\.opus$/;
    // A tap on ink plays from a little before it was written, so the words that led to it are heard.
    const leadIn = 1500;
    // How far from a stroke a tap still finds it, in millimetres.
    const reach = 2;

    // In this engine only: the recording under way, and what plays.
    let current = null;
    let starting = false;
    let playing = null;

    function epoch(value) {
        const ms = Date.parse(value);
        return isNaN(ms) ? null : ms;
    }

    // The parts as numbers, [{at, from}], `from` in milliseconds since 1970.
    function partsOf(parts, started) {
        const list = (Array.isArray(parts) ? parts : []).map(function (part) {
            return {at: Number(part && part.at) || 0, from: epoch(part && part.started)};
        }).filter(function (part) { return part.from !== null; });
        return list.length ? list : [{at: 0, from: epoch(started)}];
    }

    // The moment in a recording, in milliseconds, of something begun at
    // `when` (ms since 1970), or null when it was before or after it.
    function momentIn(parts, when, duration) {
        if (when === null)
            return null;
        let found = -1;
        parts.forEach(function (part, at) { if (part.from !== null && part.from <= when) found = at; });
        if (found < 0)
            return null;
        let ms = parts[found].at + (when - parts[found].from);
        if (found + 1 < parts.length)
            ms = Math.min(ms, parts[found + 1].at);
        if (duration !== undefined && ms > duration)
            return null;
        return Math.max(0, Math.round(ms));
    }

    // The moments of the page's strokes that began within the recording.
    function momentsOf(pageId, fields) {
        const parts = partsOf(fields.parts, fields.started);
        const duration = Number(fields.duration) || 0;
        const strokes = Ink.strokes(pageId);
        const out = {};
        Object.keys(strokes).forEach(function (id) {
            const ms = momentIn(parts, Ink.began(strokes[id]), duration);
            if (ms !== null)
                out[id] = ms;
        });
        return out;
    }

    // What the window shows of it: the recording under way (or why the last
    // one stopped, when it stopped by itself), and what plays.
    function show(problem) {
        const said = typeof problem === "string" && problem ? {problem: problem} : null;
        omabook.ui.set("recording", current ? {page: current.page, id: current.id, elapsed: current.recording.elapsed(),
                                               level: current.recording.level(), paused: current.recording.paused()} : said);
        omabook.ui.set("playing", playing ? {page: playing.page, id: playing.id, at: playing.at, playing: playing.player.playing(),
                                             duration: playing.duration} : null);
    }

    function idOf(file) {
        const match = filePattern.exec(String(file || ""));
        if (!match)
            throw new Error("A recording is an Opus file under data/recordings/, such as data/recordings/monday.opus.");
        return match[1];
    }

    // Keeps a recording on a page from what the recorder said of it when it
    // stopped (`{file, started, duration, bytes, parts}`), or from the file
    // alone (one cut short when Omabook quit while it recorded), and stamps
    // the page's ink written during it. Answers its id.
    function keep(pageId, summary) {
        summary = Util.object(summary);
        const id = idOf(summary.file);
        Store.pageThing(pageId);
        if (!omabook.files.exists(summary.file))
            throw new Error("There is no recording " + summary.file + " in the plugin's folder.");
        const info = omabook.audio && omabook.audio.info(summary.file);
        if (!info)
            throw new Error(summary.file + " isn't a recording Omabook can play.");
        const fields = {page: String(pageId), file: summary.file, started: Util.text(summary.started) || info.started,
                        duration: Number(summary.duration) || info.duration, bytes: Number(summary.bytes) || info.bytes,
                        parts: Array.isArray(summary.parts) ? summary.parts : [{at: 0, started: Util.text(summary.started) || info.started}]};
        if (!epoch(fields.started))
            throw new Error(summary.file + " doesn't say when it was recorded, so its ink can't be found.");
        Store.keepRecording(id, Object.assign({created: Util.now()}, fields));
        Store.stampRecording(id, momentsOf(String(pageId), fields));
        return id;
    }

    // The recorder stopped, by the plugin or otherwise (the person, the microphone gone).
    function finished(summary, whenKept) {
        const was = current;
        current = null;
        if (was && summary && summary.file === was.file) {
            keep(was.page, summary);
            if (whenKept)
                whenKept(was.id);
        }
        show(summary && summary.problem ? "The recording stopped: " + summary.problem : "");
    }

    // Starts recording on a page; a promise of the recording under way.
    // `whenKept(id)` hears when it stopped and was kept.
    function start(pageId, whenKept) {
        pageId = String(pageId);
        Store.pageThing(pageId);
        if (!omabook.audio || !omabook.audio.record)
            throw new Error("Notebooks can't record here: this Omabook has no microphone for plugins, or Notebooks may not use it.");
        if (current || starting)
            throw new Error("A recording is under way already; stop it first.");
        const id = Util.id("r");
        const file = folder + id + ".opus";
        starting = true;
        return omabook.audio.record({file: file, onLevel: function () { show(); }, onStopped: function (summary) { finished(summary, whenKept); }})
            .then(function (recording) {
                starting = false;
                current = {id: id, page: pageId, file: file, recording: recording, parts: [{at: 0, from: epoch(recording.started)}]};
                Store.keepRecording(id, {page: pageId, file: file, started: recording.started, duration: 0, created: Util.now()});
                show();
                return under();
            }, function (error) {
                starting = false;
                throw error;
            });
    }

    function stop(whenKept) {
        if (current)
            finished(current.recording.stop(), whenKept);
        return under();
    }

    // Pauses the recording under way, or goes on with it: a new part begins.
    function pause(paused) {
        if (!current)
            throw new Error("Nothing is being recorded.");
        if (paused) {
            current.recording.pause();
        } else if (current.recording.paused()) {
            current.recording.resume();
            current.parts.push({at: current.recording.elapsed(), from: Date.now()});
        }
        show();
        return under();
    }

    function under() {
        return current ? {page: current.page, id: current.id, elapsed: current.recording.elapsed(), paused: current.recording.paused()} : null;
    }

    // Strokes the pen wrote on a page (an ink batch's `add`), stamped with
    // their moment in the recording under way there.
    function inked(pageId, added) {
        if (!current || current.page !== pageId)
            return;
        const moments = {};
        Object.keys(Util.object(added)).forEach(function (id) {
            const ms = momentIn(current.parts, Ink.began(added[id]));
            if (ms !== null)
                moments[id] = ms;
        });
        if (Object.keys(moments).length)
            Store.stampRecording(current.id, moments);
    }

    // A page's recordings, and the moment of each stroke written during
    // one: {recordings: [{id, file, started, duration, here}], moments:
    // {strokeId: {recording, at}}}. `here` is false while its sound is
    // still on its way from another computer.
    function timeline(pageId) {
        const strokes = Ink.strokes(pageId);
        const moments = {};
        const list = Store.recordings(String(pageId)).map(function (one) {
            Object.keys(one.strokes).forEach(function (stroke) {
                if (stroke in strokes)
                    moments[stroke] = {recording: one.id, at: Number(one.strokes[stroke]) || 0};
            });
            const here = omabook.files.exists(one.fields.file);
            const live = !!current && current.id === one.id;
            let duration = Number(one.fields.duration) || 0;
            if (!duration && here && !live && omabook.audio) {
                const info = omabook.audio.info(one.fields.file);
                duration = info ? info.duration : 0;
            }
            return {id: one.id, file: one.fields.file, started: one.fields.started, duration: duration, here: here,
                    recording: live};
        });
        return {recordings: list, moments: moments};
    }

    // The moment of the ink under a point of the page (millimetres):
    // {stroke, recording, at}, or null when no ink there was written while recording.
    function momentAt(pageId, x, y) {
        const line = timeline(pageId);
        const lying = Ink.bounds(pageId, Object.keys(line.moments));
        let best = null;
        Object.keys(lying).forEach(function (stroke) {
            const b = lying[stroke];
            const dx = Math.max(b.x - x, 0, x - b.x - b.width);
            const dy = Math.max(b.y - y, 0, y - b.y - b.height);
            const off = Math.sqrt(dx * dx + dy * dy);
            if (off <= reach && (!best || off < best.off))
                best = {off: off, stroke: stroke};
        });
        return best ? Object.assign({stroke: best.stroke}, line.moments[best.stroke]) : null;
    }

    // Plays a recording from `at` milliseconds in; what plays is shown as it goes.
    function play(id, at) {
        const one = Store.recording(id);
        if (!omabook.files.exists(one.fields.file))
            throw new Error("This recording hasn't come from your other computer yet; it comes with the next sync.");
        if (playing)
            playing.player.stop();
        const player = omabook.audio.play(one.fields.file, {
            at: Math.max(0, Number(at) || 0),
            onPosition: function (ms) { if (playing && playing.player === player) { playing.at = ms; show(); } },
            onEnded: function () { if (playing && playing.player === player) { playing = null; show(); } }
        });
        playing = {id: one.id, page: one.fields.page, player: player, at: Math.max(0, Number(at) || 0), duration: player.duration};
        show();
        return {id: one.id, at: playing.at, duration: player.duration};
    }

    // A tap on the ink: what was said as it was written.
    function playFrom(pageId, x, y) {
        const found = momentAt(pageId, Number(x), Number(y));
        if (!found)
            throw new Error("No ink there was written while recording.");
        return play(found.recording, found.at - leadIn);
    }

    // Pauses what plays, goes on with it, moves it to `at`, or lets it go.
    function control(how, at) {
        if (!playing)
            return null;
        if (how === "pause")
            playing.player.pause();
        else if (how === "play")
            playing.player.play();
        else if (how === "seek")
            playing.player.seek(Math.max(0, Number(at) || 0));
        else {
            playing.player.stop();
            playing = null;
        }
        show();
        return playing ? {id: playing.id, at: playing.at} : null;
    }

    function remove(id) {
        if (current && current.id === id)
            throw new Error("This recording is under way; stop it first.");
        if (playing && playing.id === id)
            control("stop");
        Store.removeRecording(id);
    }

    return {start: start, stop: stop, pause: pause, under: under, inked: inked, keep: keep, timeline: timeline,
            momentAt: momentAt, play: play, playFrom: playFrom, control: control, remove: remove, momentIn: momentIn};
})();
