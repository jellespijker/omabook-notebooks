// StrokeCodec: a stroke's bytes as Omabook writes them, read and written.
//
// The codec is Omabook's (src/inkcodec.cpp): a version (1), flags (1
// pressure, 2 tilt, 4 highlighter), the colour (4 bytes, ARGB), the width and
// the moment it began, the number of points, then each point as the difference
// from the one before, every number a varint, zig-zag where it may be
// negative, positions and widths in eighths of an ink unit (a millimetre of a
// page), pressure in 1/255, tilt in degrees, moments in milliseconds.
var StrokeCodec = (function () {
    "use strict";

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const pressured = 1, tilted = 2, knownFlags = 7;

    function bytesOf(base64) {
        const out = [];
        let bits = 0;
        let held = 0;
        for (let i = 0; i < base64.length && base64[i] !== "="; i++) {
            held = held * 64 + alphabet.indexOf(base64[i]);
            bits += 6;
            if (bits >= 8) {
                bits -= 8;
                out.push(Math.floor(held / Math.pow(2, bits)) & 0xff);
                held %= Math.pow(2, bits);
            }
        }
        return out;
    }

    function base64Of(bytes) {
        let out = "";
        for (let i = 0; i < bytes.length; i += 3) {
            const three = bytes[i] * 65536 + (bytes[i + 1] || 0) * 256 + (bytes[i + 2] || 0);
            const letters = [alphabet[three >> 18], alphabet[(three >> 12) & 63], alphabet[(three >> 6) & 63], alphabet[three & 63]];
            const left = bytes.length - i;
            out += letters[0] + letters[1] + (left > 1 ? letters[2] : "=") + (left > 2 ? letters[3] : "=");
        }
        return out;
    }

    // Numbers past 32 bits (a moment in milliseconds) are kept whole by
    // multiplying, not shifting.
    function reader(bytes) {
        let at = 0;
        function varint() {
            let value = 0;
            for (let scale = 1; at < bytes.length; scale *= 128) {
                const b = bytes[at++];
                value += (b & 0x7f) * scale;
                if (b < 0x80)
                    return value;
            }
            throw new Error("A stroke cut short.");
        }
        function signed() {
            const value = varint();
            return value % 2 ? -(value + 1) / 2 : value / 2;
        }
        return {varint: varint, signed: signed, skip: function (n) { at += n; }};
    }

    function writer(out) {
        function varint(value) {
            while (value >= 128) {
                out.push(value % 128 + 128);
                value = Math.floor(value / 128);
            }
            out.push(value);
        }
        return {varint: varint, signed: function (value) { varint(value >= 0 ? value * 2 : -value * 2 - 1); }};
    }

    // What comes before a stroke's points: {flags, colour ("#aarrggbb"),
    // width, began, read (at the number of points)}, or null for a stroke of
    // a version or with flags this doesn't know.
    function header(base64) {
        const bytes = bytesOf(String(base64));
        if (bytes[0] !== 1 || (bytes[1] | knownFlags) !== knownFlags)
            return null;
        const hex = bytes.slice(2, 6).map(function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
        const read = reader(bytes);
        read.skip(6);
        const width = read.varint() / 8;
        return {flags: bytes[1], colour: "#" + hex, width: width, began: read.signed(), read: read};
    }

    // A stroke whole: {flags, colour, width, began, points: [{x, y, pressure
    // (0 to 255), xTilt, yTilt, ms}]}, x and y in millimetres; null for one
    // that can't be read, a stroke cut short included.
    function decode(base64) {
        try {
            const stroke = header(base64);
            if (!stroke)
                return null;
            const read = stroke.read;
            const now = {x: 0, y: 0, pressure: 0, xTilt: 0, yTilt: 0, ms: 0};
            stroke.points = [];
            for (let left = read.varint(); left > 0; left--) {
                now.x += read.signed();
                now.y += read.signed();
                if (stroke.flags & pressured)
                    now.pressure += read.signed();
                if (stroke.flags & tilted) {
                    now.xTilt += read.signed();
                    now.yTilt += read.signed();
                }
                now.ms += read.varint();
                stroke.points.push({x: now.x / 8, y: now.y / 8, pressure: now.pressure, xTilt: now.xTilt, yTilt: now.yTilt, ms: now.ms});
            }
            delete stroke.read;
            return stroke.points.length ? stroke : null;
        } catch (error) {
            return null;
        }
    }

    // A stroke as decode() has it, as its bytes again, in base64.
    function encode(stroke) {
        const argb = stroke.colour.slice(1);
        const out = [1, stroke.flags].concat([0, 2, 4, 6].map(function (at) { return parseInt(argb.slice(at, at + 2), 16); }));
        const write = writer(out);
        write.varint(Math.max(1, Math.round(stroke.width * 8)));
        write.signed(stroke.began);
        write.varint(stroke.points.length);
        let before = {x: 0, y: 0, pressure: 0, xTilt: 0, yTilt: 0, ms: 0};
        stroke.points.forEach(function (point) {
            const now = {x: Math.round(point.x * 8), y: Math.round(point.y * 8), pressure: Math.round(point.pressure),
                         xTilt: point.xTilt, yTilt: point.yTilt, ms: Math.max(before.ms, Math.round(point.ms))};
            write.signed(now.x - before.x);
            write.signed(now.y - before.y);
            if (stroke.flags & pressured)
                write.signed(now.pressure - before.pressure);
            if (stroke.flags & tilted) {
                write.signed(now.xTilt - before.xTilt);
                write.signed(now.yTilt - before.yTilt);
            }
            write.varint(now.ms - before.ms);
            before = now;
        });
        return base64Of(out);
    }

    return {header: header, decode: decode, encode: encode};
})();
