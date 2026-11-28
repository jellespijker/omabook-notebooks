import QtQuick

// Shapes and the ruler on a page (#10), over its ink surface. With neat shapes
// on (O), a line, arrow, circle, ellipse, rectangle or triangle drawn roughly
// in one stroke with the pen or the highlighter is drawn neat once the pen
// lifts; with the ruler out (U, PageRuler), a line drawn beside its edge is
// laid on the edge. The script says which strokes become what (`neaten()`);
// they keep their ids, are shown in place of what was drawn, and are what is
// written. Only strokes just drawn: what undo brings back, the eraser leaves
// or the lasso moves is left as it is.
//
// The ruler is a tool in the hand, not something on the page: it is not kept,
// and it stays where it was put from page to page.
Item {
    id: shapes

    required property var page
    // The page's ink surface.
    required property var ink
    // Pixels to a millimetre of the page.
    property real unit: 1

    property bool neat: false
    property bool ruled: false
    // Whether the pen in hand writes: the ruler lies out, and strokes are made neat.
    readonly property bool writing: !page.resting && page.tool !== "eraser" && page.tool !== "lasso"
    readonly property bool active: writing && (neat || ruled)
    readonly property bool rulerShown: ruled && !page.resting
    // The ruler is under a finger, the pen or the mouse: the page keeps still.
    readonly property bool holding: rulerShown && ruler.holding

    // The strokes the page has had, so only a new one is made neat; and what
    // those made neat became, for when redo draws one again.
    property var known: ({})
    property var made: ({})

    function toggleNeat() { ink.flush(); neat = !neat }
    // Taking it out takes the pen in hand, where the tool was one that doesn't draw.
    function toggleRuler() {
        ink.flush()
        if (!ruled && page.resting) page.choose("pen")
        ruled = !ruled
    }
    // The strokes of the page as they were loaded.
    function loaded(strokes) { for (const id in strokes) known[id] = true }

    // An ink batch as it is to be kept: what was just drawn made neat, and shown so.
    function kept(batch) {
        const drawn = {}
        const changed = {}
        const adds = batch.add || {}
        // A batch that takes strokes away is the eraser's or the lasso's, never a stroke just drawn.
        const fresh = active && !(batch.remove && batch.remove.length)
        let any = false
        for (const id in adds) {
            if (made[id] !== undefined) changed[id] = made[id]
            else if (fresh && !known[id]) { drawn[id] = adds[id]; any = true }
            known[id] = true
        }
        if (any) {
            const options = {shapes: neat, ruler: rulerShown ? ruler.measures() : null}
            const answered = backend.scripts.call(page.plugin, "neaten", [drawn, options]) || {}
            for (const id in answered) { made[id] = answered[id]; changed[id] = answered[id] }
        }
        if (Object.keys(changed).length === 0) return batch
        ink.apply({add: changed, remove: []})
        return {add: Object.assign({}, adds, changed), remove: batch.remove || []}
    }

    // The keys for the event pressed: with the ruler out the arrows move it
    // (Shift: further), and with Alt they turn it (Shift: finer).
    function keys(event) {
        const keys = {}
        keys[Qt.Key_O] = shapes.toggleNeat
        keys[Qt.Key_U] = shapes.toggleRuler
        if (!rulerShown) return keys
        const shift = !!(event.modifiers & Qt.ShiftModifier)
        const alt = !!(event.modifiers & Qt.AltModifier)
        const by = shift ? 10 : 1
        const turn = shift ? 1 : 5
        keys[Qt.Key_Left] = function () { if (alt) ruler.turn(-turn); else ruler.move(-by, 0) }
        keys[Qt.Key_Right] = function () { if (alt) ruler.turn(turn); else ruler.move(by, 0) }
        keys[Qt.Key_Up] = function () { ruler.move(0, -by) }
        keys[Qt.Key_Down] = function () { ruler.move(0, by) }
        return keys
    }

    PageRuler {
        id: ruler
        visible: shapes.rulerShown
        unit: shapes.unit
        onPutAway: { shapes.toggleRuler(); shapes.page.takeFocus() }
    }
}
