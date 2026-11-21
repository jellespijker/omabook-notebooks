// Pictures: the bytes of a picture on a page, checked, kept and read back.
//
// A picture comes from a file the person picked or dropped on the page. The
// view reads it, scales it to at most `largestSide` pixels and writes it
// again as PNG (when it may be see-through) or JPEG, which also leaves out
// what the file said of where and with what it was taken; it hands over the
// result as a data address (`data:image/jpeg;base64,...`).
//
// The bytes are kept in the change log (Store, `picturebytes`), in pieces
// one write each, so a picture goes to the person's other computers at a
// sync with the page it is on. A plugin's files (its data/ folder) stay on
// the computer they were written on, and the script can write only text
// there, so the log is the one place a picture can travel. That is why a
// picture has a cap: `largest` bytes.
var Pictures = (function () {
    "use strict";

    const largest = 1024 * 1024;
    const largestSide = 1600;
    // Base64 characters in one write: under the log's 64 KiB with the write's own JSON around it.
    const piece = 60000;
    const types = {
        "image/png": {title: "PNG", starts: "iVBORw0KGgo"},
        "image/jpeg": {title: "JPEG", starts: "/9j/"}
    };
    const address = /^data:(image\/[a-z]+);base64,([A-Za-z0-9+/]+={0,2})$/;

    function bytesOf(base64) { return Math.floor(base64.length * 3 / 4) - (base64.match(/=*$/)[0].length); }

    function megabytes(bytes) { return (Math.round(bytes / 104857.6) / 10) + " MB"; }

    // A data address as the view writes it: {type, base64, bytes}, or the
    // reason it can't be kept. The command line, whose words are at most
    // 128 KiB, may give it as a list of pieces.
    function checked(data) {
        const whole = Array.isArray(data) ? data.map(Util.text).join("") : Util.text(data);
        const found = address.exec(whole);
        if (!found)
            throw new Error("A picture comes as a data address of PNG or JPEG (data:image/png;base64,...).");
        const kind = types[found[1]];
        if (!kind)
            throw new Error("A picture is kept as PNG or JPEG, not " + found[1] + ".");
        if (found[2].indexOf(kind.starts) !== 0)
            throw new Error("This picture isn't the " + kind.title + " it says it is.");
        const bytes = bytesOf(found[2]);
        if (bytes > largest)
            throw new Error("This picture is " + megabytes(bytes) + "; a picture on a page is at most " + megabytes(largest)
                            + ". Pick a smaller one, or scale it down first.");
        return {type: found[1], base64: found[2], bytes: bytes};
    }

    // The pieces a picture is kept in, by keys that sort in their order.
    function pieces(base64) {
        const out = {};
        for (let at = 0, n = 0; at < base64.length; at += piece, n++)
            out[("00" + n).slice(-3)] = base64.slice(at, at + piece);
        return out;
    }

    // The picture again as a data address, or "" while not all of it is here
    // (its pieces still on their way from another computer).
    function joined(fields, parts) {
        const keys = Object.keys(parts).sort();
        if (!types[fields.type] || keys.length !== Number(fields.parts))
            return "";
        const base64 = keys.map(function (key) { return parts[key]; }).join("");
        return bytesOf(base64) === Number(fields.bytes) ? "data:" + fields.type + ";base64," + base64 : "";
    }

    return {checked: checked, pieces: pieces, joined: joined, largest: largest, largestSide: largestSide};
})();
