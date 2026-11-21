// Paper: what a page is printed with before anything is written on it, and
// what that is at each size, in millimetres.
//
// A page's paper is plain data, `{kind, ruling, size}`, kept on the page in
// the change log and in the notebook file. What it draws is worked out here,
// once, as lines and a grid of dots in millimetres from the top left of the
// page, so the view, a later export to PDF and the tests all draw the same
// thing: the view only scales it to its pixels.
var Paper = (function () {
    "use strict";

    // Width and height of a sheet, portrait.
    const sizes = {
        A4: {width: 210, height: 297},
        A5: {width: 148, height: 210},
        Letter: {width: 215.9, height: 279.4}
    };

    // Lined paper's rulings, as they are sold: narrow (1/4 inch), college
    // (9/32 inch) and wide (11/32 inch) between the lines.
    const rulings = {narrow: 6.35, college: 7.1, wide: 8.7};

    // Squares and dots are 5 mm apart, as in an engineer's pad.
    const pitch = 5;

    // A staff is five lines 2 mm apart; staves are 12 mm apart.
    const staff = {lines: 5, gap: 2, between: 12};

    const kinds = ["lined", "squared", "dotted", "blank", "staves", "cornell"];
    const titles = {
        lined: "Lined", squared: "Squared", dotted: "Dotted", blank: "Blank", staves: "Music staves", cornell: "Cornell"
    };
    const fallback = {kind: "lined", ruling: "college", size: "A5"};

    // A paper as it is kept: only what the kind uses, every part known, or
    // the reason it can't be.
    function normal(paper) {
        paper = paper || {};
        const kind = paper.kind || fallback.kind;
        const size = paper.size || fallback.size;
        if (kinds.indexOf(kind) < 0)
            throw new Error("There is no paper called \"" + kind + "\"; it is one of " + kinds.join(", ") + ".");
        if (!sizes[size])
            throw new Error("There is no size of paper called \"" + size + "\"; it is A4, A5 or Letter.");
        if (kind !== "lined")
            return {kind: kind, size: size};
        const ruling = paper.ruling || fallback.ruling;
        if (!rulings[ruling])
            throw new Error("Lined paper is narrow, college or wide, not \"" + ruling + "\".");
        return {kind: kind, ruling: ruling, size: size};
    }

    function title(paper) {
        paper = normal(paper);
        const ruling = paper.ruling ? ", " + paper.ruling : "";
        return titles[paper.kind] + ruling + ", " + paper.size;
    }

    function round(value) { return Math.round(value * 100) / 100; }

    function line(x1, y1, x2, y2, role) {
        return {x1: round(x1), y1: round(y1), x2: round(x2), y2: round(y2), role: role};
    }

    // Lines `step` apart from `top` down to `bottom`, from x `left` to `right`.
    function rules(top, bottom, step, left, right, role) {
        const lines = [];
        for (let y = top; y <= bottom + 0.001; y += step)
            lines.push(line(left, y, right, y, role));
        return lines;
    }

    // Where a grid of `step` starts so that it sits centred on a side of
    // `length`, and how many steps fit.
    function centred(length, step) {
        const count = Math.floor(length / step);
        return {start: (length - count * step) / 2, count: count};
    }

    // The margins of every ruled paper scale with the sheet, so an A5 page
    // looks like an A4 one, smaller.
    function margins(sheet) {
        return {top: round(sheet.height * 0.08), bottom: round(sheet.height * 0.04), left: round(sheet.width * 0.15)};
    }

    function lined(sheet, paper) {
        const edge = margins(sheet);
        return {
            lines: rules(edge.top, sheet.height - edge.bottom, rulings[paper.ruling], 0, sheet.width, "rule")
                .concat([line(edge.left, 0, edge.left, sheet.height, "margin")])
        };
    }

    function squared(sheet) {
        const across = centred(sheet.width, pitch);
        const down = centred(sheet.height, pitch);
        const lines = [];
        for (let i = 0; i <= across.count; i++)
            lines.push(line(across.start + i * pitch, down.start, across.start + i * pitch, down.start + down.count * pitch, "grid"));
        for (let j = 0; j <= down.count; j++)
            lines.push(line(across.start, down.start + j * pitch, across.start + across.count * pitch, down.start + j * pitch, "grid"));
        return {lines: lines};
    }

    function dotted(sheet) {
        const across = centred(sheet.width, pitch);
        const down = centred(sheet.height, pitch);
        return {
            lines: [],
            dots: {x: round(across.start), y: round(down.start), pitch: pitch, columns: across.count + 1, rows: down.count + 1}
        };
    }

    // As many staves as fit between the margins, the block of them centred.
    function staves(sheet) {
        const side = round(sheet.width * 0.06);
        const height = (staff.lines - 1) * staff.gap;
        const room = sheet.height * 0.9;
        const count = Math.floor((room + staff.between) / (height + staff.between));
        const top = (sheet.height - (count * height + (count - 1) * staff.between)) / 2;
        const lines = [];
        for (let s = 0; s < count; s++) {
            const first = top + s * (height + staff.between);
            for (let l = 0; l < staff.lines; l++)
                lines.push(line(side, first + l * staff.gap, sheet.width - side, first + l * staff.gap, "staff"));
        }
        return {lines: lines};
    }

    // Cornell notes: a title band, a cue column on the left (3/10 of the
    // width, as 2.5 inches of a Letter page) and a summary across the foot
    // (the lowest fifth), ruled college through the notes and the summary.
    function cornell(sheet) {
        const edge = margins(sheet);
        const cue = round(sheet.width * 0.3);
        const summary = round(sheet.height * 0.8);
        const step = rulings.college;
        return {
            lines: [line(0, edge.top, sheet.width, edge.top, "cue"),
                    line(cue, edge.top, cue, summary, "cue"),
                    line(0, summary, sheet.width, summary, "cue")]
                .concat(rules(edge.top + step, summary - step / 2, step, 0, sheet.width, "rule"))
                .concat(rules(summary + step, sheet.height - edge.bottom, step, 0, sheet.width, "rule"))
        };
    }

    const draws = {lined: lined, squared: squared, dotted: dotted, blank: function () { return {lines: []}; },
                   staves: staves, cornell: cornell};

    // What a paper draws: `{paper, width, height, lines: [{x1, y1, x2, y2,
    // role}], dots: {x, y, pitch, columns, rows} or null}`, in millimetres.
    // `role` says how a line is drawn: rule, margin, grid, staff or cue.
    function layout(paper) {
        paper = normal(paper);
        const sheet = sizes[paper.size];
        const drawn = draws[paper.kind](sheet, paper);
        return {paper: paper, title: title(paper), width: sheet.width, height: sheet.height, lines: drawn.lines, dots: drawn.dots || null};
    }

    // What can be chosen, for the view and the command line.
    function choices() {
        return {kinds: kinds.map(function (kind) { return {id: kind, title: titles[kind]}; }),
                rulings: Object.keys(rulings), sizes: Object.keys(sizes), fallback: fallback};
    }

    return {normal: normal, title: title, layout: layout, choices: choices, sizes: sizes, rulings: rulings};
})();
