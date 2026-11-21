// Typed: the words of a text block, as they are kept and shown.
//
// A text block is plain text or Markdown, never HTML: it is shown by Qt's
// Markdown reader, read by search and the reader as a chapter's Markdown,
// and may have come from another computer or the command line. So what is
// kept is cleaned here first: no tags or comments of HTML (what is between
// tags stays, as words), no pictures fetched from anywhere (a picture of the
// page is a picture, not a link in its text), links only to the web and to
// mail, and none of the control characters, or those that turn text round,
// that would make it read as other than it is.
var Typed = (function () {
    "use strict";

    // The most characters a block holds: well inside the 64 KiB the change
    // log takes of one value, whatever the characters are.
    const longest = 16000;
    const formats = ["markdown", "plain"];

    // Controls but the tab and the line's end, and the marks that turn text round.
    const controls = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
    const tag = /<\/?[A-Za-z][^<>]*>|<[!?][^<>]*>|<!--[\s\S]*?(?:-->|$)/g;
    const safeLink = /^<?(?:https?:|mailto:)/i;

    function format(value) {
        const chosen = Util.text(value) || "markdown";
        if (formats.indexOf(chosen) < 0)
            throw new Error("A text block is Markdown or plain text, not \"" + chosen + "\".");
        return chosen;
    }

    function plain(value) {
        const text = (value === null || value === undefined ? "" : String(value)).replace(/\r\n?/g, "\n").replace(controls, "");
        if (text.length > longest)
            throw new Error("A text block holds at most " + longest + " characters; this one has " + text.length + ". Split it in two.");
        return text;
    }

    // Takes tags out until none is left, so that one put together from the
    // pieces of two (`<<b>b>`) goes too.
    function untagged(text) {
        let before;
        do {
            before = text;
            text = text.replace(tag, "");
        } while (text !== before);
        return text;
    }

    function markdown(value) {
        let text = plain(value);
        // An address in angle brackets is Markdown's, not a tag: kept as the address.
        text = text.replace(/<((?:https?|mailto):[^<>\s]+)>/gi, "$1");
        text = untagged(text);
        text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1");
        text = text.replace(/\[([^\]]*)\]\(\s*([^)\s]*)(?:\s+"[^"]*")?\s*\)/g, function (whole, words, address) {
            return safeLink.test(address) ? whole : words;
        });
        return text.replace(/^ {0,3}\[[^\]]+\]:[ \t]*(\S+).*$/gm, function (whole, address) {
            return safeLink.test(address) ? whole : "";
        });
    }

    // The words as they are kept, in the format they are in.
    function clean(value, chosen) { return format(chosen) === "plain" ? plain(value) : markdown(value); }

    // Plain text as Markdown that reads as the same words, for a chapter of the
    // notebook's book (Snapshot): what Markdown would take for its own is escaped.
    function asMarkdown(text) {
        return String(text).replace(/([\\`*_[\]<>#|~!])/g, "\\$1").replace(/^(\s*)([-+])(\s)/gm, "$1\\$2$3")
            .replace(/^(\s*\d+)\.(\s)/gm, "$1\\.$2");
    }

    return {clean: clean, format: format, asMarkdown: asMarkdown, longest: longest};
})();
