// Content: text blocks and pictures on a page, placed, moved, resized,
// layered with the ink, and removed.
//
// Each is a thing of its own in the change log that names its page (Store),
// placed in millimetres from the page's top left as ink is, so it stays
// where it was put at any zoom and on any screen. A text block is set on
// the paper's lines (Paper's `typing`): its top is a line's height above a
// line, its height whole lines. It lies above the ink or below it (`layer`),
// and within that over or under the others (`z`): a picture comes below,
// to be written over, a text block above.
var Content = (function () {
    "use strict";

    const layers = ["below", "above"];
    const smallest = 5;

    function round(value) { return Math.round(value * 100) / 100; }

    function number(value, fallback) {
        const n = Number(value);
        return value === null || value === undefined || value === "" || !isFinite(n) ? fallback : n;
    }

    function within(value, low, high) { return Math.max(low, Math.min(high, value)); }

    function sheetOf(pageId) { return Paper.layout(Store.pageThing(pageId).fields.paper); }

    // The top of a block on the line nearest `y`: its first line of words is
    // written on the line after, as on lined paper by hand.
    function onLine(sheet, y) {
        const typing = sheet.typing;
        const lines = Math.max(0, Math.round((y - typing.top) / typing.step));
        return round(within(typing.top + lines * typing.step, 0, sheet.height - typing.step));
    }

    // A place on the sheet, `{x, y, width, height}` of what `asked` says and
    // `was` was, within the page and no smaller than `smallest` millimetres.
    function rectangle(sheet, asked, was, text) {
        const width = within(number(asked.width, was.width), smallest, sheet.width);
        let height = within(number(asked.height, was.height), smallest, sheet.height);
        if (text)
            height = Math.max(1, Math.round(height / sheet.typing.step)) * sheet.typing.step;
        const x = within(number(asked.x, was.x), 0, sheet.width - smallest);
        let y = within(number(asked.y, was.y), 0, sheet.height - smallest);
        if (text && asked.y !== undefined)
            y = onLine(sheet, y);
        return {x: round(x), y: round(y), width: round(width), height: round(Math.min(height, sheet.height))};
    }

    function layer(value, fallback) {
        const chosen = Util.text(value) || fallback;
        if (layers.indexOf(chosen) < 0)
            throw new Error("Content lies above the ink or below it, not \"" + chosen + "\".");
        return chosen;
    }

    function all(pageId) {
        const out = [];
        ["text", "pictures"].forEach(function (set) {
            const found = Store.onPage(set, pageId);
            Object.keys(found).forEach(function (id) { out.push({set: set, id: id, fields: found[id]}); });
        });
        return out;
    }

    function topmost(pageId) {
        return all(pageId).reduce(function (most, one) { return Math.max(most, number(one.fields.z, 0)); }, 0);
    }

    function byLayer(a, b) {
        return layers.indexOf(a.layer) - layers.indexOf(b.layer) || a.z - b.z || (a.created < b.created ? -1 : a.created > b.created ? 1 : 0)
            || (a.id < b.id ? -1 : 1);
    }

    function entry(one) {
        const f = one.fields;
        const out = {id: one.id, kind: one.set === "text" ? "text" : "picture", x: number(f.x, 0), y: number(f.y, 0),
                     width: number(f.width, 40), height: number(f.height, 10), layer: layers.indexOf(f.layer) < 0 ? "above" : f.layer,
                     z: number(f.z, 0), created: Util.text(f.created)};
        if (one.set === "text") {
            out.text = typeof f.text === "string" ? f.text : "";
            out.format = f.format === "plain" ? "plain" : "markdown";
        } else {
            out.title = Util.text(f.title);
            out.type = Util.text(f.type);
        }
        return out;
    }

    // What is on a page but its ink, lowest first: below the ink, then above it.
    function list(pageId) {
        Store.pageThing(pageId);
        return {typing: sheetOf(pageId).typing, items: all(pageId).map(entry).sort(byLayer)};
    }

    // A new text block: where it was asked for (on the line nearest), or
    // below what is on the page already; as wide as the page leaves.
    function addText(pageId, details) {
        details = Util.object(details);
        const sheet = sheetOf(pageId);
        const typing = sheet.typing;
        const lowest = all(pageId).reduce(function (most, one) { return Math.max(most, number(one.fields.y, 0) + number(one.fields.height, 0)); }, 0);
        const x = number(details.x, typing.left + 2);
        const width = number(details.width, sheet.width - x - Math.max(6, typing.left / 2));
        const place = rectangle(sheet, {x: x, y: number(details.y, lowest ? lowest + typing.step : typing.top),
                                        width: width, height: number(details.height, typing.step * 2)}, {}, true);
        const format = Typed.format(details.format);
        const id = Util.id("t");
        Store.place("text", id, {page: String(pageId), x: place.x, y: place.y, width: place.width, height: place.height,
                                 layer: layer(details.layer, "above"), z: topmost(pageId) + 1, created: Util.now(),
                                 text: Typed.clean(details.text, format), format: format});
        return id;
    }

    // A block's words, or its format ("markdown", "plain"), or both. Of two
    // computers' words, the later change stays.
    function changeText(id, details) {
        details = Util.object(details);
        const one = Store.content(id);
        if (one.set !== "text")
            throw new Error("A picture has no words to change.");
        const format = Typed.format(details.format === undefined ? one.fields.format : details.format);
        const fields = {format: format};
        fields.text = Typed.clean(details.text === undefined ? one.fields.text : details.text, format);
        Store.place("text", one.id, fields);
        return entry({set: one.set, id: one.id, fields: Object.assign(one.fields, fields)});
    }

    // Moves or resizes a text block or a picture: any of {x, y, width, height}.
    function place(id, asked) {
        const one = Store.content(id);
        const sheet = sheetOf(one.fields.page);
        const was = {x: number(one.fields.x, 0), y: number(one.fields.y, 0), width: number(one.fields.width, 40),
                     height: number(one.fields.height, 10)};
        const fields = rectangle(sheet, Util.object(asked), was, one.set === "text");
        Store.place(one.set, one.id, fields);
        return entry({set: one.set, id: one.id, fields: Object.assign(one.fields, fields)});
    }

    // "above" or "below" the ink; "front" or "back" of the others there.
    function arrange(id, how) {
        const one = Store.content(id);
        const others = all(one.fields.page).filter(function (other) { return other.id !== one.id; });
        const zs = others.map(function (other) { return number(other.fields.z, 0); });
        const fields = {};
        if (how === "front")
            fields.z = (zs.length ? Math.max.apply(null, zs) : 0) + 1;
        else if (how === "back")
            fields.z = (zs.length ? Math.min.apply(null, zs) : 0) - 1;
        else
            fields.layer = layer(how);
        Store.place(one.set, one.id, fields);
        return entry({set: one.set, id: one.id, fields: Object.assign(one.fields, fields)});
    }

    function remove(id) { return Store.unplace(id).fields.page; }

    // A picture from a data address (Pictures): its bytes first, so that
    // where it is placed it is whole, then its place, as wide as asked (or
    // three quarters of the page) and as high as its pixels say.
    function addPicture(pageId, details) {
        details = Util.object(details);
        const sheet = sheetOf(pageId);
        const picture = Pictures.checked(details.data);
        const pixels = Util.object(details.pixels);
        const ratio = number(pixels.height, 3) / Math.max(1, number(pixels.width, 4));
        const width = Math.min(number(details.width, sheet.width * 0.75), sheet.width, sheet.height / ratio);
        const place = rectangle(sheet, {x: number(details.x, (sheet.width - width) / 2), y: number(details.y, sheet.typing.top),
                                        width: width, height: width * ratio}, {}, false);
        const pieces = Pictures.pieces(picture.base64);
        const id = Util.id("i");
        Store.keepPictureBytes(id, pieces);
        Store.place("pictures", id, {page: String(pageId), x: place.x, y: place.y, width: place.width, height: place.height,
                                     layer: layer(details.layer, "below"), z: topmost(pageId) + 1, created: Util.now(),
                                     type: picture.type, bytes: picture.bytes, parts: Object.keys(pieces).length,
                                     title: Util.text(details.title).slice(0, 200)});
        return id;
    }

    // A picture as a data address for the view, or "" while it is on its way.
    function picture(id) {
        const one = Store.content(id);
        if (one.set !== "pictures")
            throw new Error("A text block is no picture.");
        return Pictures.joined(one.fields, Store.pictureBytes(one.id));
    }

    return {list: list, addText: addText, changeText: changeText, place: place, arrange: arrange, remove: remove,
            addPicture: addPicture, picture: picture};
})();
