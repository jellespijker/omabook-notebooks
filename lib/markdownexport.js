// MarkdownExport: a notebook, or some of its pages, as Markdown (#9).
//
// What a page says in words, to read and keep anywhere: its text blocks
// and pictures from the top of the page down (a block's Markdown as it is,
// plain text as words that read the same), then the words read from its
// handwriting, what was said while it was written, each piece at its moment,
// and its place references, each a link to its passage
// (`omabook://book/<global id>/section/<n>`, References.link) with the
// words it refers to. The ink itself, which Markdown can't hold, is in the
// PDF (PdfExport). Pictures are files beside the Markdown, linked from where
// they lie on the page; or, in a Markdown saved where the person chose
// (Exports.choose), in it, as `data:` addresses, since Omabook's save dialog
// writes one file.
var MarkdownExport = (function () {
    "use strict";

    const extensions = {"image/png": "png", "image/jpeg": "jpg"};

    function time(ms) {
        const s = Math.floor((Number(ms) || 0) / 1000);
        return Math.floor(s / 60) + ":" + ("0" + s % 60).slice(-2);
    }

    function quoted(text) { return "> " + String(text).trim().replace(/\n/g, "\n> "); }

    function byPlace(a, b) { return a.y - b.y || a.x - b.x; }

    // A picture's file, by its order in the export: what to write and where it is linked from.
    function pictureOf(item, files, inline) {
        const address = /^data:([^;]+);base64,(.*)$/.exec(Content.picture(item.id));
        const title = Typed.asMarkdown(item.title || "A picture");
        if (!address || !extensions[address[1]])
            return "*" + title + " (still on its way from another computer)*";
        if (inline)
            return "![" + title + "](" + address[0] + ")";
        const name = "pictures/" + ("00" + (files.length + 1)).slice(-3) + "." + extensions[address[1]];
        files.push({path: name, base64: address[2]});
        return "![" + title + "](" + name + ")";
    }

    function contentOf(pageId, files, inline) {
        return Content.list(pageId).items.slice().sort(byPlace).map(function (item) {
            if (item.kind === "picture")
                return pictureOf(item, files, inline);
            if (!Util.text(item.text))
                return "";
            return item.format === "plain" ? Typed.asMarkdown(item.text) : Typed.clean(item.text, "markdown").trim();
        }).filter(Boolean);
    }

    function spokenOf(pieces) {
        const said = pieces.filter(function (one) { return one.kind === "transcript"; });
        if (!said.length)
            return [];
        return ["**Said while writing**", said.map(function (one) { return "- **" + time(one.at) + "** " + Typed.asMarkdown(one.text.trim()); }).join("\n")];
    }

    function referencesOf(pageId) {
        const all = References.ofPage(pageId);
        if (!all.length)
            return [];
        return ["**Refers to**", all.map(function (one) {
            const name = Typed.asMarkdown(one.title + ", " + one.chapter);
            const address = References.link(one);
            const link = address ? "[" + name + "](" + address + ")" : name;
            const words = one.quote ? ": “" + Typed.asMarkdown(one.quote) + "”" : one.ahead ? " (past where you have read to)" : "";
            return "- " + link + (one.lost ? " (not found in this edition)" : "") + words;
        }).join("\n")];
    }

    // One page: its heading and what it holds, a paragraph each.
    function pageOf(pageId, number, loose, files, inline) {
        const pieces = Finder.pieces(pageId);
        const read = pieces.filter(function (one) { return one.kind === "recognised"; });
        const parts = ["## " + (loose ? "Note " : "Page ") + number].concat(contentOf(pageId, files, inline));
        if (read.length)
            parts.push("**Handwriting**", quoted(Typed.asMarkdown(read[0].text)));
        const all = parts.concat(spokenOf(pieces), referencesOf(pageId));
        return all.length > 1 ? all : all.concat(["*" + Paper.title(Store.pageEntry(pageId).paper) + "; nothing written in words.*"]);
    }

    // {text, files: [{path, base64}]}: the Markdown of `pages` ([{id,
    // number}]) under the notebook's title, and the pictures it links to;
    // none with `inline`, which puts the pictures in the text.
    function build(title, pages, loose, inline) {
        const files = [];
        const parts = ["# " + Typed.asMarkdown(title), "*Exported from Notebooks on " + Util.now().slice(0, 10) + "; "
                       + pages.length + (pages.length === 1 ? " page" : " pages") + ".*"];
        pages.forEach(function (page) { Array.prototype.push.apply(parts, pageOf(page.id, page.number, loose, files, inline === true)); });
        return {text: parts.join("\n\n") + "\n", files: files};
    }

    return {build: build};
})();
