// Pdf: a PDF file written: pages of lines, text and pictures.
//
// Omabook gives a plugin no PDF of its own to write, so this writes one
// (PDF 1.4): every line drawn as a line, so ink stays sharp at any zoom and
// prints as it was written; text in Helvetica, which every PDF reader has,
// so the words can be found and copied; pictures as the PDF keeps them
// (Images); and links to places. Positions are in millimetres from the top
// left of a page, as everything in a notebook is; the PDF's points are
// worked out here. It knows nothing of notebooks.
//
// Helvetica is read in Windows' Latin encoding: a letter it has no glyph
// for is written without its accent where it has one, else as "?".
var Pdf = (function () {
    "use strict";

    const point = 72 / 25.4;

    // Helvetica's widths of the characters from the space to "~", in thousandths of the size.
    const widths = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556,
                    556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667,
                    556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556,
                    556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722,
                    500, 500, 500, 334, 260, 334, 584];
    // The characters past Latin-1 that Windows' Latin encoding has, by where it puts them.
    const windows = {0x20ac: 128, 0x201a: 130, 0x0192: 131, 0x201e: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x02c6: 136,
                     0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017d: 142, 0x2018: 145, 0x2019: 146, 0x201c: 147,
                     0x201d: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x02dc: 152, 0x2122: 153, 0x0161: 154, 0x203a: 155,
                     0x0153: 156, 0x017e: 158, 0x0178: 159};

    function number(value) {
        const rounded = Math.round(value * 100) / 100;
        return String(rounded === 0 ? 0 : rounded);
    }

    function codeOf(c) {
        if ((c >= 32 && c < 127) || (c >= 160 && c <= 255))
            return c;
        return windows[c] || 0;
    }

    // Text as the bytes of Windows' Latin encoding, a character each.
    function encoded(text) {
        let out = "";
        for (const character of String(text).replace(/[\t\r\n]/g, " ")) {
            let code = codeOf(character.charCodeAt(0));
            if (!code && typeof character.normalize === "function")
                code = codeOf(character.normalize("NFD").charCodeAt(0));
            out += String.fromCharCode(code || 63);
        }
        return out;
    }

    function literal(bytes) { return "(" + bytes.replace(/([\\()])/g, "\\$1") + ")"; }

    // How wide some text is set at `size` millimetres, in millimetres.
    function width(text, size, bold) {
        const bytes = encoded(text);
        let sum = 0;
        for (let i = 0; i < bytes.length; i++) {
            const c = bytes.charCodeAt(i);
            sum += c >= 32 && c < 127 ? widths[c - 32] : 556;
        }
        return sum / 1000 * size * (bold ? 1.06 : 1);
    }

    // "#rrggbb" or "#aarrggbb", as Qt writes a colour: {rgb: "r g b", alpha}.
    function colour(value) {
        const hex = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(value)) ? String(value).slice(1) : "000000";
        const alpha = hex.length === 8 ? parseInt(hex.slice(0, 2), 16) / 255 : 1;
        const rgb = hex.slice(-6);
        return {rgb: [0, 2, 4].map(function (at) { return number(parseInt(rgb.slice(at, at + 2), 16) / 255); }).join(" "), alpha: alpha};
    }

    // Bytes of a string whose characters are all below 256.
    function latin(text) {
        const out = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++)
            out[i] = text.charCodeAt(i);
        return out;
    }

    // A page being drawn on. `document` keeps what the page uses: a state of see-through (alpha) for a colour.
    function sheet(document, width, height) {
        const ops = [];
        const links = [];
        function x(value) { return number(value * point); }
        function y(value) { return number((height - value) * point); }
        function paint(value, stroking) {
            const chosen = colour(value);
            ops.push(chosen.rgb + (stroking ? " RG" : " rg"));
            ops.push("/" + document.alphaState(chosen.alpha) + " gs");
        }
        return {
            // A line through points [{x, y}], `size` mm wide, with round ends and corners.
            path: function (points, size, ink) {
                if (!points.length)
                    return;
                paint(ink, true);
                ops.push(number(size * point) + " w 1 J 1 j");
                ops.push(points.map(function (p, i) { return x(p.x) + " " + y(p.y) + (i ? " l" : " m"); }).join(" ")
                         + (points.length === 1 ? " " + x(points[0].x) + " " + y(points[0].y) + " l" : "") + " S");
            },
            rectangle: function (left, top, w, h, fill, edge) {
                if (fill)
                    paint(fill, false);
                if (edge) {
                    paint(edge, true);
                    ops.push(number(0.2 * point) + " w");
                }
                ops.push(x(left) + " " + y(top + h) + " " + number(w * point) + " " + number(h * point) + " re " + (fill && edge ? "B" : fill ? "f" : "S"));
            },
            // Text with its baseline at `top`, `size` mm high; unseen (to find and copy) when `hidden`.
            text: function (left, top, size, words, options) {
                options = options || {};
                paint(options.colour || "#1d1d1f", false);
                ops.push("BT /" + (options.bold ? "F2" : "F1") + " " + number(size * point) + " Tf " + (options.hidden ? "3" : "0") + " Tr "
                         + x(left) + " " + y(top) + " Td " + literal(encoded(words)) + " Tj ET");
            },
            picture: function (name, left, top, w, h) {
                ops.push("q " + number(w * point) + " 0 0 " + number(h * point) + " " + x(left) + " " + y(top + h) + " cm /" + name + " Do Q");
            },
            link: function (left, top, w, h, address) {
                links.push("<</Type /Annot /Subtype /Link /Border [0 0 0] /Rect [" + [x(left), y(top + h), x(left + w), y(top)].join(" ")
                           + "] /A <</S /URI /URI " + literal(encoded(address)) + ">>>>");
            },
            done: function () { document.finish(width, height, ops.join("\n"), links); }
        };
    }

    // A new PDF: `page(width, height)` to draw on, `picture(image)` for the
    // name a picture is drawn by (Images.forPdf), and `bytes()` when done.
    function document(title) {
        const objects = [null, null, null];
        const pages = [];
        const states = {};
        const pictures = [];
        function add(body) {
            objects.push(body);
            return objects.length - 1;
        }
        function stream(dictionary, data) {
            const bytes = typeof data === "string" ? latin(data) : data;
            return ["<<" + dictionary + " /Length " + bytes.length + ">>\nstream\n", bytes, "\nendstream"];
        }
        const fonts = {F1: add(["<</Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding>>"]),
                       F2: add(["<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding>>"])};
        const self = {
            alphaState: function (alpha) {
                const key = number(alpha);
                if (!states[key])
                    states[key] = {name: "A" + Object.keys(states).length, id: add(["<</Type /ExtGState /CA " + key + " /ca " + key + ">>"])};
                return states[key].name;
            },
            finish: function (width, height, content, links) {
                pages.push({width: width, height: height, content: add(stream("", content)),
                            links: links.map(function (one) { return add([one]); })});
            },
            page: function (width, height) { return sheet(self, width, height); },
            picture: function (image) {
                let dictionary = "/Type /XObject /Subtype /Image /Width " + image.width + " /Height " + image.height + " /BitsPerComponent " + image.bits;
                dictionary += image.palette ? " /ColorSpace [/Indexed /DeviceRGB " + (image.palette.length / 3 - 1) + " " + add(stream("", image.palette)) + " 0 R]"
                                            : " /ColorSpace /" + image.space;
                if (image.filter)
                    dictionary += " /Filter /" + image.filter + (image.parms ? " /DecodeParms " + image.parms : "");
                if (image.alpha)
                    dictionary += " /SMask " + add(stream("/Type /XObject /Subtype /Image /Width " + image.width + " /Height " + image.height
                                                          + " /BitsPerComponent 8 /ColorSpace /DeviceGray", image.alpha)) + " 0 R";
                pictures.push({name: "P" + pictures.length, id: add(stream(dictionary, image.data))});
                return pictures[pictures.length - 1].name;
            },
            bytes: function () { return written(objects, pages, {fonts: fonts, states: states, pictures: pictures, title: title}); }
        };
        return self;
    }

    // The resources every page may use: the fonts, the states of alpha and the pictures.
    function resources(used) {
        const fonts = Object.keys(used.fonts).map(function (name) { return "/" + name + " " + used.fonts[name] + " 0 R"; }).join(" ");
        const states = Object.keys(used.states).map(function (key) { return "/" + used.states[key].name + " " + used.states[key].id + " 0 R"; }).join(" ");
        const pictures = used.pictures.map(function (one) { return "/" + one.name + " " + one.id + " 0 R"; }).join(" ");
        return "<</Font <<" + fonts + ">> /ExtGState <<" + states + ">> /XObject <<" + pictures + ">>>>";
    }

    // The file: its objects in order, then where each starts (the xref), so a reader finds them.
    function written(objects, pages, used) {
        const resourcesId = objects.push([resources(used)]) - 1;
        const kids = pages.map(function (one) {
            return objects.push(["<</Type /Page /Parent 2 0 R /MediaBox [0 0 " + number(one.width * point) + " " + number(one.height * point)
                                 + "] /Resources " + resourcesId + " 0 R /Contents " + one.content + " 0 R"
                                 + (one.links.length ? " /Annots [" + one.links.map(function (id) { return id + " 0 R"; }).join(" ") + "]" : "") + ">>"]) - 1;
        });
        objects[1] = ["<</Type /Catalog /Pages 2 0 R>>"];
        objects[2] = ["<</Type /Pages /Kids [" + kids.map(function (id) { return id + " 0 R"; }).join(" ") + "] /Count " + kids.length + ">>"];
        const infoId = objects.push(["<</Title " + literal(encoded(used.title || "")) + " /Producer (Omabook Notebooks)>>"]) - 1;
        const parts = [latin("%PDF-1.4\n%âãÏÓ\n")];
        let length = parts[0].length;
        const offsets = [];
        for (let id = 1; id < objects.length; id++) {
            offsets.push(length);
            [id + " 0 obj\n"].concat(objects[id], ["\nendobj\n"]).forEach(function (part) {
                const bytes = typeof part === "string" ? latin(part) : part;
                parts.push(bytes);
                length += bytes.length;
            });
        }
        const table = "xref\n0 " + objects.length + "\n0000000000 65535 f \n"
            + offsets.map(function (at) { return ("000000000" + at).slice(-10) + " 00000 n \n"; }).join("")
            + "trailer\n<</Size " + objects.length + " /Root 1 0 R /Info " + infoId + " 0 R>>\nstartxref\n" + length + "\n%%EOF\n";
        parts.push(latin(table));
        const out = new Uint8Array(length + parts[parts.length - 1].length);
        let at = 0;
        parts.forEach(function (bytes) {
            out.set(bytes, at);
            at += bytes.length;
        });
        return out;
    }

    return {document: document, width: width};
})();
