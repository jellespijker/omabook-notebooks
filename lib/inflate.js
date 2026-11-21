// Inflate: the bytes zlib's deflate packed (RFC 1950 and 1951), unpacked.
//
// A picture on a page is often a PNG that may be see-through (Pictures),
// and a PDF keeps a picture's see-through part apart from its colours, so
// the PDF of a page (PdfExport) needs the PNG's pixels, which deflate
// packed. The script engine has no inflate of its own, so it is here: each
// code read through a table of every code of its length at once, so a
// picture of a megabyte unpacks in well under a second.
var Inflate = (function () {
    "use strict";

    // RFC 1951's lengths and distances: where each code starts, and how many bits follow it.
    const lengthBase = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
    const lengthExtra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
    const distanceBase = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073,
                          4097, 6145, 8193, 12289, 16385, 24577];
    const distanceExtra = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
    // The order the lengths of the code lengths' own codes come in.
    const order = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

    function broken() { return new Error("This picture's data is damaged: it doesn't unpack."); }

    // Bits read from the lowest of each byte up; past the end they are
    // nothing, which a code then can't be, and `over` says so.
    function reader(input) {
        let at = 0;
        let held = 0;
        let count = 0;
        function peek(n) {
            while (count < n) {
                held |= (at < input.length ? input[at] : 0) << count;
                at++;
                count += 8;
            }
            return held & ((1 << n) - 1);
        }
        function drop(n) {
            held >>>= n;
            count -= n;
        }
        function take(n) {
            if (!n)
                return 0;
            const value = peek(n);
            drop(n);
            return value;
        }
        // A stored block starts at the next whole byte.
        function align() { drop(count & 7); }
        // A stored block's bytes, after its length.
        function copy(output, length) {
            while (count >= 8 && length > 0) {
                output.push(take(8));
                length--;
            }
            if (at + length > input.length)
                throw broken();
            output.append(input.subarray(at, at + length));
            at += length;
        }
        return {peek: peek, drop: drop, take: take, align: align, copy: copy, over: function () { return at - (count >> 3) > input.length; }};
    }

    // The bytes unpacked so far, in a buffer that grows.
    function writer(size) {
        let bytes = new Uint8Array(Math.max(1024, size));
        let length = 0;
        function room(more) {
            if (length + more <= bytes.length)
                return;
            const larger = new Uint8Array(Math.max(bytes.length * 2, length + more));
            larger.set(bytes.subarray(0, length));
            bytes = larger;
        }
        return {
            push: function (value) {
                room(1);
                bytes[length++] = value;
            },
            append: function (some) {
                room(some.length);
                bytes.set(some, length);
                length += some.length;
            },
            // `count` bytes from `distance` back; they may overlap what they make.
            repeat: function (distance, count) {
                if (distance > length)
                    throw broken();
                room(count);
                for (let i = 0; i < count; i++, length++)
                    bytes[length] = bytes[length - distance];
            },
            done: function () { return bytes.subarray(0, length); }
        };
    }

    // A canonical Huffman code as a table of every `longest` bits: each
    // entry its symbol and its length, so one look reads a code.
    function table(lengths) {
        const longest = Math.max.apply(null, lengths.concat([0]));
        const counts = new Array(16).fill(0);
        lengths.forEach(function (length) { counts[length]++; });
        counts[0] = 0;
        const next = [0];
        for (let bits = 1, code = 0; bits <= 15; bits++) {
            code = (code + counts[bits - 1]) << 1;
            next[bits] = code;
        }
        const entries = new Int32Array(1 << longest);
        lengths.forEach(function (length, symbol) {
            if (!length)
                return;
            const code = next[length]++;
            let reversed = 0;
            for (let i = 0; i < length; i++)
                reversed |= ((code >> i) & 1) << (length - 1 - i);
            for (let k = reversed; k < entries.length; k += 1 << length)
                entries[k] = (symbol << 4) | length;
        });
        return {entries: entries, longest: longest};
    }

    function decode(read, code) {
        const entry = code.entries[read.peek(code.longest)];
        if (!(entry & 15))
            throw broken();
        read.drop(entry & 15);
        return entry >> 4;
    }

    let fixedTables = null;

    function fixed() {
        if (fixedTables)
            return fixedTables;
        const lengths = [];
        for (let i = 0; i < 288; i++)
            lengths.push(i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8);
        fixedTables = {literals: table(lengths), distances: table(new Array(30).fill(5))};
        return fixedTables;
    }

    // A block's own codes, which its first bits say in codes of their own.
    function dynamic(read) {
        const literalCount = read.take(5) + 257;
        const distanceCount = read.take(5) + 1;
        const lengthCount = read.take(4) + 4;
        const own = new Array(19).fill(0);
        for (let i = 0; i < lengthCount; i++)
            own[order[i]] = read.take(3);
        const lengthCode = table(own);
        const lengths = [];
        while (lengths.length < literalCount + distanceCount) {
            const symbol = decode(read, lengthCode);
            if (symbol < 16) {
                lengths.push(symbol);
                continue;
            }
            if (symbol === 16 && !lengths.length)
                throw broken();
            const repeat = symbol === 16 ? 3 + read.take(2) : symbol === 17 ? 3 + read.take(3) : 11 + read.take(7);
            const value = symbol === 16 ? lengths[lengths.length - 1] : 0;
            for (let i = 0; i < repeat; i++)
                lengths.push(value);
        }
        return {literals: table(lengths.slice(0, literalCount)), distances: table(lengths.slice(literalCount, literalCount + distanceCount))};
    }

    function codes(read, output, tables) {
        for (;;) {
            const symbol = decode(read, tables.literals);
            if (symbol < 256) {
                output.push(symbol);
                continue;
            }
            if (symbol === 256)
                return;
            if (symbol > 285)
                throw broken();
            const length = lengthBase[symbol - 257] + read.take(lengthExtra[symbol - 257]);
            const far = decode(read, tables.distances);
            if (far > 29)
                throw broken();
            output.repeat(distanceBase[far] + read.take(distanceExtra[far]), length);
        }
    }

    // The bytes a zlib stream holds; `size`, when known, is how many.
    function inflate(input, size) {
        if (input.length < 2 || (input[0] & 15) !== 8 || ((input[0] << 8) | input[1]) % 31 !== 0)
            throw broken();
        const read = reader(input.subarray(2));
        const output = writer(size || input.length * 4);
        let last = 0;
        while (!last) {
            last = read.take(1);
            const kind = read.take(2);
            if (kind === 0) {
                read.align();
                const length = read.take(16);
                read.take(16);
                read.copy(output, length);
            } else if (kind === 1 || kind === 2) {
                codes(read, output, kind === 1 ? fixed() : dynamic(read));
            } else {
                throw broken();
            }
            if (read.over())
                throw broken();
        }
        return output.done();
    }

    return {inflate: inflate};
})();
