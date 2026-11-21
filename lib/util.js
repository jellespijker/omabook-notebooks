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

    return {id: id, now: now, text: text, copy: copy, object: object, hash: hash};
})();
