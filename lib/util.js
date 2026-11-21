// Small helpers every other file uses.
//
// A script plugin has no modules: `omabook.include("lib/util.js")` runs a
// file in the one engine the plugin has. So each file here makes exactly
// one global with `var`, holding its functions, and main.js includes them
// in the order they build on each other.
var Util = (function () {
    "use strict";

    // An id for a notebook or a page: short, sortable by when it was made,
    // safe in a file name and as a thing of the change log, and unlikely to
    // be made the same on two computers at once.
    function id(prefix) {
        return prefix + Date.now().toString(36) + ("00" + Math.floor(Math.random() * 46656).toString(36)).slice(-3);
    }

    function now() { return new Date().toISOString(); }

    function text(value) {
        return value === null || value === undefined ? "" : String(value).trim();
    }

    // Copies of the plain data the log answers, so changing what a caller is
    // given never changes what another was.
    function copy(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

    function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }

    // A short fingerprint of some text (FNV-1a, 32 bits, in hex): enough to
    // tell whether two lists are the same, never a secret.
    function hash(value) {
        value = String(value);
        let h = 0x811c9dc5;
        for (let i = 0; i < value.length; i++) {
            h ^= value.charCodeAt(i);
            h = Math.imul(h, 0x01000193) >>> 0;
        }
        return ("0000000" + h.toString(16)).slice(-8);
    }

    // Bytes from base64, as a typed array: what a picture's data address
    // holds, for reading its header and pixels (Images).
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const values = {};
    for (let i = 0; i < alphabet.length; i++)
        values[alphabet[i]] = i;

    function bytes(base64) {
        const clean = String(base64).replace(/[^A-Za-z0-9+/]/g, "");
        const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
        let at = 0;
        for (let i = 0; i + 1 < clean.length; i += 4) {
            const n = (values[clean[i]] << 18) | (values[clean[i + 1]] << 12) | ((values[clean[i + 2]] || 0) << 6) | (values[clean[i + 3]] || 0);
            out[at++] = n >> 16 & 0xff;
            if (i + 2 < clean.length)
                out[at++] = n >> 8 & 0xff;
            if (i + 3 < clean.length)
                out[at++] = n & 0xff;
        }
        return out.subarray(0, at);
    }

    // A title as a file's name: letters, digits and dashes, never empty.
    function slug(title) {
        const plain = String(title || "");
        const folded = (typeof plain.normalize === "function" ? plain.normalize("NFD") : plain).replace(/[\u0300-\u036f]/g, "");
        return folded.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "notebook";
    }

    // Runs `work(item, index)` for each item, each in a turn of its own
    // (omabook.after), so long work keeps within a call's five seconds:
    // a promise of what each answered, in order.
    function steps(items, work) {
        const answers = [];
        return items.reduce(function (before, item, index) {
            return before.then(function () {
                return new Promise(function (resolve, reject) {
                    omabook.after(0, function () {
                        try {
                            answers.push(work(item, index));
                            resolve();
                        } catch (error) {
                            reject(error);
                        }
                    });
                });
            });
        }, Promise.resolve()).then(function () { return answers; });
    }

    return {id: id, now: now, text: text, copy: copy, object: object, hash: hash, bytes: bytes, slug: slug, steps: steps};
})();
