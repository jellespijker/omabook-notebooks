// Shapes: a rough line, arrow, circle, ellipse, rectangle or triangle drawn
// in one stroke, found and drawn neat. Geometry alone, in millimetres: it
// knows nothing of strokes' bytes or of notebooks.
//
// It would rather leave a stroke as it was drawn than guess: anything small
// (a letter, a dot) or not close to one of these shapes is no shape.
var Shapes = (function () {
    "use strict";

    // The smallest a shape is, across its box: less is writing.
    const smallest = 12;
    // How far, of the box's diagonal, a closed stroke may lie from the shape on average.
    const closeEnough = 0.03;
    // Within this many degrees of level or upright, a line or a side is made so.
    const level = 5;

    function distance(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
    function along(points) { return points.reduce(function (sum, p, i) { return i ? sum + distance(points[i - 1], p) : 0; }, 0); }

    function boxOf(points) {
        const xs = points.map(function (p) { return p.x; });
        const ys = points.map(function (p) { return p.y; });
        const left = Math.min.apply(null, xs), top = Math.min.apply(null, ys);
        return {x: left, y: top, width: Math.max.apply(null, xs) - left, height: Math.max.apply(null, ys) - top};
    }

    // How far a point is from the line from a to b, which ends there.
    function offSegment(p, a, b) {
        const dx = b.x - a.x, dy = b.y - a.y;
        const square = dx * dx + dy * dy;
        const t = square ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / square)) : 0;
        return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
    }

    function offPath(p, path) {
        let best = Infinity;
        for (let i = 1; i < path.length; i++)
            best = Math.min(best, offSegment(p, path[i - 1], path[i]));
        return best;
    }

    // The points of a path at even steps of `step` along it, its corners kept.
    function dense(path, step) {
        const out = [path[0]];
        for (let i = 1; i < path.length; i++) {
            const a = path[i - 1], b = path[i];
            const pieces = Math.max(1, Math.ceil(distance(a, b) / step));
            for (let j = 1; j <= pieces; j++)
                out.push({x: a.x + (b.x - a.x) * j / pieces, y: a.y + (b.y - a.y) * j / pieces});
        }
        return out;
    }

    // Evenly spaced points along a stroke, so that where the pen dawdled counts no more than elsewhere.
    function even(points, step) {
        const out = [points[0]];
        let walked = 0;
        for (let i = 1; i < points.length; i++) {
            const a = points[i - 1], b = points[i];
            const length = distance(a, b);
            while (length && walked + length >= step * out.length) {
                const t = (step * out.length - walked) / length;
                out.push({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t});
            }
            walked += length;
        }
        out.push(points[points.length - 1]);
        return out;
    }

    // The end of a line from `a`, made level or upright where it nearly is.
    function squared(a, b) {
        const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
        const nearest = Math.round(angle / 90) * 90;
        if (Math.abs(angle - nearest) > level)
            return b;
        return Math.abs(nearest) === 90 ? {x: a.x, y: b.y} : {x: b.x, y: a.y};
    }

    function straight(points) {
        const a = points[0], b = points[points.length - 1];
        const chord = distance(a, b);
        const stray = Math.max(1.2, 0.05 * chord);
        return chord >= smallest && along(points) <= 1.15 * chord && points.every(function (p) { return offSegment(p, a, b) <= stray; });
    }

    function line(points) {
        return straight(points) ? {kind: "line", points: [points[0], squared(points[0], points[points.length - 1])]} : null;
    }

    // A shaft from the start to the tip (the point farthest from it), then a
    // head drawn without lifting: strokes back on both sides of the shaft.
    function arrow(points) {
        const start = points[0];
        let far = 0;
        points.forEach(function (p) { far = Math.max(far, distance(start, p)); });
        const at = points.findIndex(function (p) { return distance(start, p) >= far - 1.5; });
        const shaft = points.slice(0, at + 1);
        if (at < 1 || !straight(shaft))
            return null;
        const tip = points.reduce(function (best, p) { return distance(start, p) > distance(start, best) ? p : best; }, start);
        const length = distance(start, tip);
        const ux = (tip.x - start.x) / length, uy = (tip.y - start.y) / length;
        const head = points.slice(at + 1).map(function (p) {
            return {back: (tip.x - p.x) * ux + (tip.y - p.y) * uy, side: (p.y - tip.y) * ux - (p.x - tip.x) * uy, reach: distance(tip, p)};
        });
        const barbs = [1, -1].map(function (way) {
            return head.filter(function (p) { return p.side * way >= 1.2 && p.back > 0; })
                .reduce(function (most, p) { return Math.max(most, p.reach); }, 0);
        });
        if (!barbs[0] || !barbs[1] || head.some(function (p) { return p.reach > 0.5 * length; }))
            return null;
        const end = squared(start, tip);
        const size = Math.max(2.5, Math.min(0.35 * length, (barbs[0] + barbs[1]) / 2));
        const back = Math.atan2(start.y - end.y, start.x - end.x);
        const barb = function (turn) { return {x: end.x + size * Math.cos(back + turn), y: end.y + size * Math.sin(back + turn)}; };
        return {kind: "arrow", points: [start, end, barb(Math.PI / 6), end, barb(-Math.PI / 6)]};
    }

    // The points a path needs to stay within `stray` of the stroke (Ramer, Douglas and Peucker).
    function simplified(points, stray) {
        const a = points[0], b = points[points.length - 1];
        let far = 0, at = 0;
        for (let i = 1; i < points.length - 1; i++) {
            const off = offSegment(points[i], a, b);
            if (off > far) {
                far = off;
                at = i;
            }
        }
        if (far <= stray)
            return [a, b];
        return simplified(points.slice(0, at + 1), stray).slice(0, -1).concat(simplified(points.slice(at), stray));
    }

    // How much the path turns at b on its way from a to c, in degrees.
    function turn(a, b, c) {
        const by = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
        return Math.abs(Math.atan2(Math.sin(by), Math.cos(by))) * 180 / Math.PI;
    }

    // The corners of a closed stroke, wherever on it the pen began.
    function corners(points, diagonal) {
        let opposite = 0;
        points.forEach(function (p, i) { if (distance(points[0], p) > distance(points[0], points[opposite])) opposite = i; });
        const stray = 0.07 * diagonal;
        const found = simplified(points.slice(0, opposite + 1), stray).slice(0, -1)
            .concat(simplified(points.slice(opposite).concat([points[0]]), stray).slice(0, -1));
        // Where the pen began, or ended, in the middle of a side is no corner, nor are two points at one.
        for (let i = 0; i < found.length && found.length > 2; i++) {
            const before = found[(i + found.length - 1) % found.length], after = found[(i + 1) % found.length];
            if (distance(found[i], after) < 0.12 * diagonal || turn(before, found[i], after) < 30) {
                found.splice(i, 1);
                i = -1;
            }
        }
        return found;
    }

    function turned(p, angle) {
        return {x: p.x * Math.cos(angle) - p.y * Math.sin(angle), y: p.x * Math.sin(angle) + p.y * Math.cos(angle)};
    }

    // A rectangle through four corners that are each about square, its sides
    // as far out as the stroke's points along them lie on average.
    function rectangle(points, found) {
        const square = found.every(function (p, i) { return Math.abs(turn(found[(i + 3) % 4], p, found[(i + 1) % 4]) - 90) <= 25; });
        if (!square)
            return null;
        // The sides' angle, each taken within a quarter turn, averaged round that quarter.
        let sine = 0, cosine = 0;
        found.forEach(function (p, i) {
            const next = found[(i + 1) % 4];
            const four = 4 * Math.atan2(next.y - p.y, next.x - p.x);
            sine += Math.sin(four) * distance(p, next);
            cosine += Math.cos(four) * distance(p, next);
        });
        let angle = Math.atan2(sine, cosine) / 4;
        if (Math.abs(angle) * 180 / Math.PI <= level + 2)
            angle = 0;
        const own = found.map(function (p) { return turned(p, -angle); });
        const xs = own.map(function (p) { return p.x; }).sort(function (a, b) { return a - b; });
        const ys = own.map(function (p) { return p.y; }).sort(function (a, b) { return a - b; });
        const left = (xs[0] + xs[1]) / 2, right = (xs[2] + xs[3]) / 2, top = (ys[0] + ys[1]) / 2, bottom = (ys[2] + ys[3]) / 2;
        const path = [{x: left, y: top}, {x: right, y: top}, {x: right, y: bottom}, {x: left, y: bottom}, {x: left, y: top}]
            .map(function (p) { return turned(p, angle); });
        return {kind: "rectangle", points: path};
    }

    function polygon(points, diagonal) {
        const found = corners(points, diagonal);
        if (found.length === 3)
            return {kind: "triangle", points: found.concat([found[0]])};
        return found.length === 4 ? rectangle(points, found) : null;
    }

    // The angle a stroke's points spread along most.
    function lean(points) {
        const n = points.length;
        const cx = points.reduce(function (sum, p) { return sum + p.x; }, 0) / n;
        const cy = points.reduce(function (sum, p) { return sum + p.y; }, 0) / n;
        let xx = 0, yy = 0, xy = 0;
        points.forEach(function (p) {
            xx += (p.x - cx) * (p.x - cx);
            yy += (p.y - cy) * (p.y - cy);
            xy += (p.x - cx) * (p.y - cy);
        });
        return Math.atan2(2 * xy, xx - yy) / 2;
    }

    // The ellipse that fills the stroke's box as it leans; a circle where it is nearly round.
    function ellipse(points) {
        let angle = lean(points);
        let box = boxOf(points.map(function (p) { return turned(p, -angle); }));
        const round = Math.min(box.width, box.height) / Math.max(box.width, box.height) > 0.82;
        if (round || Math.abs(Math.sin(2 * angle)) < Math.sin(2 * 10 * Math.PI / 180)) {
            angle = 0;
            box = boxOf(points);
        }
        const a = round ? (box.width + box.height) / 4 : box.width / 2;
        const b = round ? a : box.height / 2;
        const middle = {x: box.x + box.width / 2, y: box.y + box.height / 2};
        // It starts where the pen did, and goes once round.
        const first = turned(points[0], -angle);
        const from = Math.atan2((first.y - middle.y) / b, (first.x - middle.x) / a);
        const path = [];
        for (let i = 0; i <= 72; i++) {
            const t = from + i * Math.PI / 36;
            path.push(turned({x: middle.x + a * Math.cos(t), y: middle.y + b * Math.sin(t)}, angle));
        }
        return {kind: round ? "circle" : "ellipse", points: path};
    }

    // How far the stroke and a shape lie apart on average, both ways: a shape
    // with a side the pen never drew is not what it drew.
    function apart(points, path) {
        const drawn = dense(path, 1);
        const one = points.reduce(function (sum, p) { return sum + offPath(p, path); }, 0) / points.length;
        const other = drawn.reduce(function (sum, p) { return sum + offPath(p, points); }, 0) / drawn.length;
        return Math.max(one, other);
    }

    function closed(points, diagonal) {
        const sampled = even(points, Math.max(1, along(points) / 200));
        const shapes = [polygon(sampled, diagonal), ellipse(sampled)].filter(Boolean);
        let best = null, off = closeEnough * diagonal;
        shapes.forEach(function (shape) {
            const here = apart(sampled, shape.points);
            if (here <= off) {
                best = shape;
                off = here;
            }
        });
        return best;
    }

    // The neat shape of a stroke's points ([{x, y}]), {kind, points} with the
    // points close enough together to write as a stroke, or null for none.
    function neat(points) {
        if (points.length < 3)
            return null;
        const box = boxOf(points);
        const diagonal = Math.hypot(box.width, box.height);
        if (diagonal < smallest)
            return null;
        const length = along(points);
        const joined = distance(points[0], points[points.length - 1]) < 0.22 * diagonal && length > 2 * diagonal;
        const shape = joined ? closed(points, diagonal) : line(points) || arrow(points);
        return shape ? {kind: shape.kind, points: dense(shape.points, Math.max(1, along(shape.points) / 1500))} : null;
    }

    return {neat: neat, along: along};
})();
