// Neat: strokes just drawn, made neat: along the ruler's edge where they were
// drawn beside it, or as the shape they roughly are (Shapes). It keeps
// nothing: the view asks, shows what is answered in place of what was drawn,
// and writes it as the pen's ink batch (Ink).
//
// A stroke made neat keeps its id (so undo takes it away, and a recording
// knows its moment), its colour, width and beginning; pressed harder here and
// lighter there, a shape is drawn as hard as it was on average.
var Neat = (function () {
    "use strict";

    // How far from the ruler's edge a stroke may lie to be drawn along it, in
    // millimetres, and how far along the edge it goes at the least.
    const reach = 5;
    const shortest = 3;

    // The ruler as the view says it: {x, y (its middle), angle (degrees),
    // length, width}, in millimetres; null for none.
    function rulerOf(value) {
        if (!value)
            return null;
        const ruler = {};
        ["x", "y", "angle", "length", "width"].forEach(function (key) {
            ruler[key] = Number(value[key]);
            if (!isFinite(ruler[key]))
                throw new Error("A ruler says where it is (x, y), how it is turned (angle), and its length and width.");
        });
        return ruler;
    }

    // The points laid on the edge of the ruler they were all drawn beside,
    // each keeping its pressure and moment; null for a stroke that wasn't
    // drawn along it (writing near it, or across it, stays as written).
    function ruled(points, width, ruler) {
        const angle = ruler.angle * Math.PI / 180;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        const own = points.map(function (p) {
            return {along: (p.x - ruler.x) * dx + (p.y - ruler.y) * dy, off: (p.y - ruler.y) * dx - (p.x - ruler.x) * dy};
        });
        const side = own.reduce(function (sum, p) { return sum + p.off; }, 0) < 0 ? -1 : 1;
        const edge = ruler.width / 2;
        const beside = own.every(function (p) {
            return Math.abs(p.off * side - edge) <= reach && Math.abs(p.along) <= ruler.length / 2 + reach;
        });
        const places = own.map(function (p) { return p.along; });
        const offs = own.map(function (p) { return p.off; });
        const run = Math.max.apply(null, places) - Math.min.apply(null, places);
        if (!beside || run < shortest || run < 2 * (Math.max.apply(null, offs) - Math.min.apply(null, offs)))
            return null;
        // Half the line's width out, so the whole of it lies beside the edge.
        const at = side * (edge + width / 2);
        return points.map(function (p, i) {
            return Object.assign({}, p, {x: ruler.x + places[i] * dx - at * dy, y: ruler.y + places[i] * dy + at * dx});
        });
    }

    // A shape's points as a stroke's: the pen's average pressure and its
    // first tilt, its moments spread over the time the stroke took.
    function pressed(shape, points) {
        const first = points[0];
        const pressure = points.reduce(function (sum, p) { return sum + p.pressure; }, 0) / points.length;
        const took = points[points.length - 1].ms;
        const length = Shapes.along(shape) || 1;
        let walked = 0;
        return shape.map(function (p, i) {
            if (i)
                walked += Math.hypot(p.x - shape[i - 1].x, p.y - shape[i - 1].y);
            return {x: p.x, y: p.y, pressure: pressure, xTilt: first.xTilt, yTilt: first.yTilt, ms: took * walked / length};
        });
    }

    function one(base64, ruler, shapes) {
        const stroke = StrokeCodec.decode(base64);
        if (!stroke)
            return null;
        let points = ruler ? ruled(stroke.points, stroke.width, ruler) : null;
        if (!points && shapes) {
            const shape = Shapes.neat(stroke.points);
            points = shape ? pressed(shape.points, stroke.points) : null;
        }
        if (!points)
            return null;
        stroke.points = points;
        return StrokeCodec.encode(stroke);
    }

    // Of strokes just drawn ({id: base64}), those to be made neat, as they
    // are then: {id: base64}. `options` {shapes: true, ruler: {...}}.
    function strokes(drawn, options) {
        options = Util.object(options);
        const ruler = rulerOf(options.ruler);
        const out = {};
        const all = Util.object(drawn);
        Object.keys(all).forEach(function (id) {
            const made = one(all[id], ruler, options.shapes === true);
            if (made)
                out[id] = made;
        });
        return out;
    }

    return {strokes: strokes};
})();
