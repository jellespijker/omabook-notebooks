// Images: a PNG's or a JPEG's bytes, as a PDF takes a picture.
//
// A PDF reads a JPEG as it is, and a PNG's packed pixels as they are when
// it has no see-through part (the PNG's own way of packing rows is one a
// PDF knows). A PNG that may be see-through keeps its alpha in its pixels,
// which a PDF wants apart, as a mask: those are unpacked (Inflate), their
// rows undone, and split in two. What none of this reads (a PNG of 16 bits
// with alpha, or one drawn in interlaced passes) is answered as null, and
// the PDF shows a frame where it would be.
var Images = (function () {
    "use strict";

    function u32(bytes, at) { return ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3]; }

    function u16(bytes, at) { return (bytes[at] << 8) + bytes[at + 1]; }

    function joined(parts) {
        const out = new Uint8Array(parts.reduce(function (sum, one) { return sum + one.length; }, 0));
        let at = 0;
        parts.forEach(function (one) {
            out.set(one, at);
            at += one.length;
        });
        return out;
    }

    // A PNG's chunks: its header, its palette and its packed pixels.
    function chunks(bytes) {
        const found = {header: null, palette: null, data: []};
        for (let at = 8; at + 8 <= bytes.length;) {
            const length = u32(bytes, at);
            const kind = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
            const body = bytes.subarray(at + 8, at + 8 + length);
            if (kind === "IHDR")
                found.header = {width: u32(body, 0), height: u32(body, 4), depth: body[8], colour: body[9], interlaced: body[12] === 1};
            else if (kind === "PLTE")
                found.palette = body;
            else if (kind === "IDAT")
                found.data.push(body);
            else if (kind === "IEND")
                break;
            at += 12 + length;
        }
        return found;
    }

    function paeth(a, b, c) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
    }

    // One row's filter undone in place: `row` starts at `at` in `raw`, the row before at `above` (-1 for none).
    function unfilter(raw, at, above, width, step) {
        const kind = raw[at - 1];
        for (let i = 0; i < width; i++) {
            const left = i >= step ? raw[at + i - step] : 0;
            const up = above >= 0 ? raw[above + i] : 0;
            const corner = above >= 0 && i >= step ? raw[above + i - step] : 0;
            const add = kind === 1 ? left : kind === 2 ? up : kind === 3 ? (left + up) >> 1 : kind === 4 ? paeth(left, up, corner) : 0;
            raw[at + i] = (raw[at + i] + add) & 0xff;
        }
    }

    // A see-through PNG of 8 bits (grey and alpha, or colour and alpha) as its colours and its alpha apart.
    function split(header, packed) {
        const channels = header.colour === 6 ? 4 : 2;
        const row = header.width * channels;
        const raw = Inflate.inflate(packed, header.height * (row + 1));
        if (raw.length < header.height * (row + 1))
            throw new Error("This picture's data is cut short.");
        const colours = new Uint8Array(header.width * header.height * (channels - 1));
        const alpha = new Uint8Array(header.width * header.height);
        for (let y = 0, c = 0, a = 0; y < header.height; y++) {
            const at = y * (row + 1) + 1;
            unfilter(raw, at, y ? at - row - 1 : -1, row, channels);
            for (let i = 0; i < row; i += channels) {
                for (let k = 0; k < channels - 1; k++)
                    colours[c++] = raw[at + i + k];
                alpha[a++] = raw[at + i + channels - 1];
            }
        }
        return {width: header.width, height: header.height, space: channels === 4 ? "DeviceRGB" : "DeviceGray", bits: 8,
                filter: "", data: colours, alpha: alpha};
    }

    function png(bytes) {
        const found = chunks(bytes);
        const header = found.header;
        if (!header || !found.data.length || header.interlaced)
            return null;
        const packed = joined(found.data);
        if (header.colour === 4 || header.colour === 6)
            return header.depth === 8 ? split(header, packed) : null;
        const colours = header.colour === 2 ? 3 : 1;
        const out = {width: header.width, height: header.height, bits: header.depth, filter: "FlateDecode", data: packed,
                     parms: "<</Predictor 15 /Colors " + colours + " /BitsPerComponent " + header.depth + " /Columns " + header.width + ">>"};
        if (header.colour === 3) {
            if (!found.palette)
                return null;
            out.space = "DeviceRGB";
            out.palette = found.palette;
        } else {
            out.space = colours === 3 ? "DeviceRGB" : "DeviceGray";
        }
        return out;
    }

    // A JPEG's size and colours, from its frame's header.
    function jpeg(bytes) {
        for (let at = 2; at + 9 < bytes.length;) {
            if (bytes[at] !== 0xff)
                return null;
            const marker = bytes[at + 1];
            if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                const components = bytes[at + 9];
                const spaces = {1: "DeviceGray", 3: "DeviceRGB", 4: "DeviceCMYK"};
                return spaces[components] ? {width: u16(bytes, at + 7), height: u16(bytes, at + 5), space: spaces[components], bits: 8,
                                             filter: "DCTDecode", data: bytes} : null;
            }
            at += 2 + u16(bytes, at + 2);
        }
        return null;
    }

    // A picture's bytes as a PDF takes them: {width, height, space, bits,
    // filter, parms, palette, data, alpha}, or null for one it can't show.
    function forPdf(bytes, type) {
        try {
            if (type === "image/jpeg")
                return jpeg(bytes);
            return type === "image/png" && bytes[0] === 0x89 ? png(bytes) : null;
        } catch (error) {
            return null;
        }
    }

    return {forPdf: forPdf};
})();
