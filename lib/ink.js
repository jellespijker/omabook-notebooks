// Ink: the strokes on a page, and the tools that write them.
//
// A page's ink is drawn on Omabook's ink surface (#78), which keeps its
// strokes in Omabook's own stroke model and codec: each stroke is an item of
// the page's set `strokes`, `{id: base64 of its bytes}`, and what the surface
// did since the pen last paused comes as one ink batch, `{add, remove}`,
// which is one write to the change log here. Erasing part of a stroke is
// its removal and its pieces' addition in that one write; so is what the
// lasso did (#129): a stroke moved or recoloured is taken out and put back
// as a new one, a stroke cut is taken out, one pasted put in. Two computers'
// batches merge: what both added is kept, a stroke removed on either is gone,
// so a stroke moved on both is there twice, never lost.
//
// A stroke's points are in millimetres from the top left of the page, the
// unit its paper is drawn in (Paper), so the view scales ink and paper alike
// and the ink stays where it was written at any zoom and on any screen.
var Ink = (function () {
    "use strict";

    // The most items one write to the change log takes, and one batch (the
    // lasso moving a page's every stroke), which then goes in several.
    const largestBatch = 1000;
    const largestWrite = 60000;
    const largestInk = 10000;
    const idPattern = /^[A-Za-z0-9_-]{1,256}$/;
    const bytesPattern = /^[A-Za-z0-9+/]+={0,2}$/;

    // The tools, in millimetres. The highlighter is a broad, see-through pen:
    // its colour carries its alpha, so the stroke is kept that way.
    const tools = {
        pens: [
            {id: "pen", title: "Pen", key: "P", widths: [0.35, 0.5, 0.8, 1.2], width: 0.5},
            {id: "highlighter", title: "Highlighter", key: "H", widths: [3, 5, 8], width: 5}
        ],
        colours: {
            pen: [{title: "Black", value: "#1d1d1f"}, {title: "Blue", value: "#2f5fb3"}, {title: "Red", value: "#c0392b"},
                  {title: "Green", value: "#2e7d4f"}],
            highlighter: [{title: "Yellow", value: "#66f5d90a"}, {title: "Green", value: "#5586e07a"},
                          {title: "Pink", value: "#55f07fb0"}, {title: "Blue", value: "#5579b8f0"}]
        },
        // The eraser takes out what it covers, or whole strokes it touches; in pixels of the screen.
        eraser: {key: "E", widths: [12, 24, 48], width: 24}
    };

    function strokes(pageId) { return Store.items(pageId, "strokes"); }

    function count(pageId) { return Object.keys(strokes(pageId)).length; }

    // A batch as the surface sends it, checked: it may have come a long way
    // (another computer, the command line), and the log keeps what it is given.
    function checked(batch) {
        batch = Util.object(batch);
        const add = Util.object(batch.add);
        const remove = batch.remove === undefined || batch.remove === null ? [] : batch.remove;
        if (!Array.isArray(remove))
            throw new Error("An ink batch lists the strokes it removes, by id.");
        Object.keys(add).forEach(function (id) {
            if (!idPattern.test(id) || typeof add[id] !== "string" || !bytesPattern.test(add[id]))
                throw new Error("A stroke of this ink batch isn't one the ink surface wrote (" + String(id).slice(0, 40) + ").");
        });
        remove.forEach(function (id) {
            if (typeof id !== "string" || !idPattern.test(id))
                throw new Error("An ink batch removes strokes by their ids, not " + JSON.stringify(id) + ".");
        });
        if (Object.keys(add).length + remove.length > largestInk)
            throw new Error("An ink batch holds at most " + largestInk + " strokes; select fewer with the lasso at a time.");
        return {add: add, remove: remove};
    }

    // Keeps what the surface did, as one write, or as several where it is
    // more than one takes (a thousand items, 64 KiB): what it added first, so
    // that nothing is lost if it stops half way. Answers how many strokes the
    // page has now.
    function write(pageId, batch) {
        const change = checked(batch);
        const added = Object.keys(change.add);
        const size = added.reduce(function (sum, id) { return sum + id.length + change.add[id].length + 8; }, 0);
        if (added.length + change.remove.length <= largestBatch && size <= largestWrite) {
            if (added.length || change.remove.length)
                Store.changeItems(pageId, "strokes", change.add, change.remove);
            return count(pageId);
        }
        let some = {};
        let held = 0;
        added.forEach(function (id) {
            const one = id.length + change.add[id].length + 8;
            if (Object.keys(some).length && (Object.keys(some).length >= largestBatch || held + one > largestWrite)) {
                Store.changeItems(pageId, "strokes", some, []);
                some = {};
                held = 0;
            }
            some[id] = change.add[id];
            held += one;
        });
        if (Object.keys(some).length)
            Store.changeItems(pageId, "strokes", some, []);
        return erase(pageId, change.remove);
    }

    // Where a stroke lies (StrokeCodec reads it); a stroke that can't be
    // read has no place, and the surface still draws it.
    function boundsOf(base64) {
        const stroke = StrokeCodec.decode(base64);
        if (!stroke)
            return null;
        const half = stroke.width / 2;
        const xs = stroke.points.map(function (p) { return p.x; });
        const ys = stroke.points.map(function (p) { return p.y; });
        const left = Math.min.apply(null, xs), top = Math.min.apply(null, ys);
        const right = Math.max.apply(null, xs), bottom = Math.max.apply(null, ys);
        return {x: left - half, y: top - half, width: right - left + 2 * half, height: bottom - top + 2 * half};
    }

    // A stroke as it is drawn: {colour ("#aarrggbb"), width, points: [{x,
    // y, width}]} in millimetres, each point as wide as the pen pressed
    // there (as Omabook's ink surface draws it: src/inkstroke.cpp); null for
    // one that can't be read.
    function shape(base64) {
        const stroke = StrokeCodec.decode(base64);
        if (!stroke)
            return null;
        const points = stroke.points.map(function (p) {
            const pressed = Math.min(1, Math.max(0, p.pressure / 255));
            return {x: p.x, y: p.y, width: stroke.flags & 1 ? stroke.width * (0.4 + 1.2 * pressed) : stroke.width};
        });
        return {colour: stroke.colour, width: stroke.width, points: points};
    }

    // Every stroke of a page that can be read, as shape() has it.
    function shapes(pageId) {
        const all = strokes(pageId);
        return Object.keys(all).sort().map(function (id) { return shape(all[id]); }).filter(Boolean);
    }

    // The moment a stroke began, in milliseconds since 1970 as the surface
    // stamped it, or null for one this can't read.
    function began(base64) {
        try {
            const stroke = StrokeCodec.header(base64);
            return stroke ? stroke.began : null;
        } catch (error) {
            return null;
        }
    }

    // Where each of a page's strokes lies, {id: {x, y, width, height}} in
    // millimetres; of the ones in `ids` only, when given.
    function bounds(pageId, ids) {
        const all = strokes(pageId);
        const out = {};
        (ids || Object.keys(all)).forEach(function (id) {
            if (typeof all[id] !== "string")
                return;
            // A stroke cut short has no place; it is still kept and drawn.
            const found = boundsOf(all[id]);
            if (found)
                out[id] = found;
        });
        return out;
    }

    // The rectangle around some rectangles, or null when there are none.
    function around(rectangles) {
        const list = Object.keys(rectangles).map(function (id) { return rectangles[id]; });
        if (!list.length)
            return null;
        const left = Math.min.apply(null, list.map(function (r) { return r.x; }));
        const top = Math.min.apply(null, list.map(function (r) { return r.y; }));
        const right = Math.max.apply(null, list.map(function (r) { return r.x + r.width; }));
        const bottom = Math.max.apply(null, list.map(function (r) { return r.y + r.height; }));
        return {x: left, y: top, width: right - left, height: bottom - top};
    }

    // Takes strokes out by id, in writes the log takes.
    function erase(pageId, ids) {
        for (let at = 0; at < ids.length; at += largestBatch)
            Store.changeItems(pageId, "strokes", {}, ids.slice(at, at + largestBatch));
        return count(pageId);
    }

    return {strokes: strokes, count: count, write: write, bounds: bounds, around: around, erase: erase, began: began, shapes: shapes,
            tools: function () { return Util.copy(tools); }};
})();
