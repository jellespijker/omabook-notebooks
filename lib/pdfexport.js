// PdfExport: a notebook, or some of its pages, as a PDF (#9).
//
// Each page is a page of the PDF at its paper's size, drawn as the view
// draws it: the paper's lines and dots, what lies below the ink, the ink,
// and what lies above it. Ink, paper and the frames of place references are
// lines, so they print sharp; a text block's words are text, set on the
// paper's lines; a picture is the picture. The words read from the ink are
// on the page too, unseen, where the ink is, so the PDF's words can be found
// and copied as the handwriting's. A place reference is a link to its
// passage (`omabook://book/<global id>/section/<n>`, which opens Omabook
// there on any of the person's computers, References.link).
//
// It is drawn a picture or a page at a time (Util.steps), so a notebook of
// many pages keeps within each call's five seconds.
var PdfExport = (function () {
    "use strict";

    const colours = {paper: "#fdfcf8", rule: "#b4c0d0", grid: "#d4dae4", staff: "#5a5a5a", margin: "#d98c8c", cue: "#d98c8c",
                     dot: "#9aa3b0", text: "#1d1d1f", chip: "#2f5fb3", frame: "#9aa3b0"};

    function drawPaper(sheet, layout) {
        sheet.rectangle(0, 0, layout.width, layout.height, colours.paper, null);
        layout.lines.forEach(function (line) {
            sheet.path([{x: line.x1, y: line.y1}, {x: line.x2, y: line.y2}], line.role === "staff" ? 0.15 : 0.1,
                       colours[line.role] || colours.rule);
        });
        const dots = layout.dots;
        if (!dots)
            return;
        for (let i = 0; i < dots.columns; i++)
            for (let j = 0; j < dots.rows; j++)
                sheet.path([{x: dots.x + i * dots.pitch, y: dots.y + j * dots.pitch}], 0.4, colours.dot);
    }

    // A stroke as runs of points of one width, a line each: pressure makes a pen line thicker and thinner.
    function drawStroke(sheet, stroke) {
        let run = [stroke.points[0]];
        let width = Math.round(stroke.points[0].width * 20) / 20;
        for (let i = 1; i < stroke.points.length; i++) {
            const point = stroke.points[i];
            const here = Math.round(point.width * 20) / 20;
            run.push(point);
            if (here !== width) {
                sheet.path(run, width, stroke.colour);
                run = [point];
                width = here;
            }
        }
        if (run.length > 1 || stroke.points.length === 1)
            sheet.path(run, width, stroke.colour);
    }

    // A text block's words as lines of plain text, each {words, bold}: Markdown's marks left out.
    function linesOf(block) {
        return String(block.text).split("\n").map(function (line) {
            if (block.format === "plain")
                return {words: line, bold: false};
            const heading = /^\s{0,3}#{1,6}\s+/.test(line);
            const words = line.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/^(\s*)[-*+]\s+/, "$1• ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
                .replace(/(\*\*|__|\*|_|`|~~)(\S(?:.*?\S)?)\1/g, "$2").replace(/\\([\\`*_[\]<>#|~!.+-])/g, "$1");
            return {words: words, bold: heading};
        });
    }

    // Words broken into lines no wider than `room`, a word longer than that broken where it must be.
    function wrapped(line, size, room) {
        const out = [];
        let current = "";
        line.words.split(/(\s+)/).forEach(function (word) {
            const tried = current + word;
            if (!current || Pdf.width(tried, size, line.bold) <= room) {
                current = tried;
                return;
            }
            out.push(current.replace(/\s+$/, ""));
            current = word.replace(/^\s+/, "");
            while (current.length > 1 && Pdf.width(current, size, line.bold) > room) {
                let cut = current.length - 1;
                while (cut > 1 && Pdf.width(current.slice(0, cut), size, line.bold) > room)
                    cut--;
                out.push(current.slice(0, cut));
                current = current.slice(cut);
            }
        });
        out.push(current);
        return out.map(function (words) { return {words: words, bold: line.bold}; });
    }

    function drawText(sheet, block, step) {
        const size = step * 0.58;
        let row = 0;
        linesOf(block).forEach(function (line) {
            wrapped(line, size, Math.max(5, block.width - 1)).forEach(function (one) {
                row++;
                if (Util.text(one.words))
                    sheet.text(block.x + 0.5, block.y + row * step - step * 0.22, size, one.words, {bold: one.bold});
            });
        });
    }

    function drawPicture(sheet, item, pictures) {
        const name = pictures[item.id];
        if (name) {
            sheet.picture(name, item.x, item.y, item.width, item.height);
            return 0;
        }
        // One whose bytes aren't here yet, or that a PDF can't show: a frame with its name, where it is.
        sheet.rectangle(item.x, item.y, item.width, item.height, null, colours.frame);
        sheet.text(item.x + 1, item.y + 4, 3, (item.title || "A picture") + " (not shown)", {colour: colours.frame});
        return 1;
    }

    function drawReferences(sheet, pageId) {
        References.ofPage(pageId).forEach(function (one) {
            const label = "» " + one.title + ", " + one.chapter;
            const width = Math.min(70, Pdf.width(label, 2.6, false) + 3);
            sheet.rectangle(one.x, one.y, width, 5, "#2a2f5fb3", colours.chip);
            sheet.text(one.x + 1.5, one.y + 3.5, 2.6, label, {colour: colours.chip});
            const address = References.link(one);
            if (address)
                sheet.link(one.x, one.y, width, 5, address);
        });
    }

    // The words read from the ink, unseen over it, to be found and copied.
    function drawRecognised(sheet, pageId, layout) {
        const read = Store.recognised(pageId);
        if (!read || !Util.text(read.text))
            return;
        const ink = Ink.around(Ink.bounds(pageId)) || {x: layout.typing.left, y: layout.typing.top, width: layout.width, height: layout.height};
        const lines = String(read.text).split("\n");
        const step = Math.max(3, Math.min(12, ink.height / Math.max(1, lines.length)));
        lines.forEach(function (line, at) {
            sheet.text(ink.x, ink.y + (at + 0.8) * step, step * 0.7, line, {hidden: true});
        });
    }

    // Draws one page; answers how many of its pictures it couldn't show.
    function drawPage(document, pageId, pictures) {
        const layout = Paper.layout(Store.pageEntry(pageId).paper);
        const sheet = document.page(layout.width, layout.height);
        const content = Content.list(pageId);
        let missed = 0;
        function drawItem(item) {
            if (item.kind === "text")
                drawText(sheet, item, content.typing.step);
            else
                missed += drawPicture(sheet, item, pictures);
        }
        drawPaper(sheet, layout);
        content.items.filter(function (one) { return one.layer === "below"; }).forEach(drawItem);
        Ink.shapes(pageId).forEach(function (stroke) { drawStroke(sheet, stroke); });
        content.items.filter(function (one) { return one.layer !== "below"; }).forEach(drawItem);
        drawRecognised(sheet, pageId, layout);
        drawReferences(sheet, pageId);
        sheet.done();
        return missed;
    }

    // The pictures of some pages, each read once into the document: {id: name}.
    function pictureJobs(pageIds) {
        const jobs = [];
        pageIds.forEach(function (pageId) {
            Content.list(pageId).items.forEach(function (item) {
                if (item.kind === "picture")
                    jobs.push(item.id);
            });
        });
        return jobs;
    }

    function addPicture(document, pictures, id) {
        const address = /^data:([^;]+);base64,(.*)$/.exec(Content.picture(id));
        const image = address ? Images.forPdf(Util.bytes(address[2]), address[1]) : null;
        if (image)
            pictures[id] = document.picture(image);
    }

    // A promise of the PDF of `pageIds` (in that order) as bytes, and how many pictures it couldn't show.
    function build(title, pageIds) {
        const document = Pdf.document(title);
        const pictures = {};
        return Util.steps(pictureJobs(pageIds), function (id) { addPicture(document, pictures, id); }).then(function () {
            return Util.steps(pageIds, function (pageId) { return drawPage(document, pageId, pictures); });
        }).then(function (missed) {
            return {bytes: document.bytes(), missed: missed.reduce(function (sum, one) { return sum + one; }, 0)};
        });
    }

    return {build: build};
})();
