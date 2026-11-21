// Ink: the strokes on a page, and the tools that write them.
//
// A page's ink is drawn on Omabook's ink surface (#78), which keeps its
// strokes in Omabook's own stroke model and codec: each stroke is an item of
// the page's set `strokes`, `{id: base64 of its bytes}`, and what the surface
// did since the pen last paused comes as one ink batch, `{add, remove}`,
// which is one write to the change log here. Erasing part of a stroke is
// its removal and its pieces' addition in that one write. Two computers'
// batches merge: what both added is kept, a stroke removed on either is gone.
//
// A stroke's points are in millimetres from the top left of the page, the
// unit its paper is drawn in (Paper), so the view scales ink and paper alike
// and the ink stays where it was written at any zoom and on any screen.
var Ink = (function () {
    "use strict";

    // The most items one write to the change log takes.
    const largestBatch = 1000;
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
        if (Object.keys(add).length + remove.length > largestBatch)
            throw new Error("An ink batch holds at most " + largestBatch + " strokes; the ink surface splits larger ones.");
        return {add: add, remove: remove};
    }

    // Keeps what the surface did, as one write; answers how many strokes the page has now.
    function write(pageId, batch) {
        const change = checked(batch);
        if (Object.keys(change.add).length || change.remove.length)
            Store.changeItems(pageId, "strokes", change.add, change.remove);
        return count(pageId);
    }

    return {strokes: strokes, count: count, write: write, tools: function () { return Util.copy(tools); }};
})();
