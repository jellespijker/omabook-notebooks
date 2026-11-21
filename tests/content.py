"""Text blocks and pictures on a page (#4): placed on the paper's lines, moved, resized, typed in
as plain text or Markdown (never HTML), pictures kept in pieces in the change log and capped,
layered above or below the ink, written into the notebook's file, and merged between two computers.

tests/run.py calls check() with its bench; the merge makes a second bench, another computer, and
syncs the two over a stand-in for ssh, as the ink's does.
"""

import base64
import os
import shutil
import struct
import zlib

from bench import Bench

# Lined, college, A5: lines 7.1 mm apart from 16.8 mm down (Paper).
TOP, STEP = 16.8, 7.1


def png(width, height, noise=False):
    """A PNG of `width` by `height` see-through pixels: of noise, which doesn't compress, or of one colour."""
    row = (lambda: os.urandom(width * 4)) if noise else (lambda: bytes([200, 40, 40, 128]) * width)
    raw = b"".join(b"\x00" + row() for _ in range(height))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    return "data:image/png;base64," + base64.b64encode(data).decode()


def near(a, b):
    return abs(a - b) < 0.011


def items(bench, page):
    return bench.ok("content", page)["items"]


def item(bench, page, ident):
    return [one for one in items(bench, page) if one["id"] == ident][0]


def blocks(bench, step):
    made = bench.ok("makeNotebook", "Typed", {"kind": "lined", "ruling": "college", "size": "A5"})
    page = bench.ok("notebooks")["notebooks"][-1]["pages"][0]["id"]
    listed = bench.ok("content", page)
    assert listed["items"] == [] and near(listed["typing"]["top"], TOP) and near(listed["typing"]["step"], STEP), listed

    first = bench.ok("addText", page, {"x": 30, "y": TOP + 2.2 * STEP, "text": "# Allomancy\n\nSteel *pushes*."})
    one = item(bench, page, first)
    assert one["kind"] == "text" and one["format"] == "markdown" and one["layer"] == "above", one
    assert near(one["y"], TOP + 2 * STEP) and near(one["height"], 2 * STEP) and one["x"] == 30, one
    second = bench.ok("addText", page, {"text": "plain words", "format": "plain"})
    assert item(bench, page, second)["y"] > one["y"] + one["height"], "a block with no place comes below the others"
    step("a text block is placed where asked, set on the paper's lines; one with no place comes below the rest")

    moved = bench.ok("place", first, {"x": 12.345, "y": TOP + 5.4 * STEP, "width": 80, "height": 3.2 * STEP})
    assert moved["x"] == 12.35 and near(moved["y"], TOP + 5 * STEP) and moved["width"] == 80 and near(moved["height"], 3 * STEP), moved
    edge = bench.ok("place", first, {"x": 900, "y": -40, "width": 1})
    assert edge["x"] == 143 and near(edge["y"], TOP) and edge["width"] == 5, "kept on the page, on a line, no smaller than 5 mm"
    bench.ok("place", first, {"x": 20, "y": TOP})
    step("a text block is moved and resized, onto the lines again and never off the page")

    changed = bench.ok("changeText", first, {"text": "Iron *pulls*."})
    assert changed["text"] == "Iron *pulls*." and item(bench, page, first)["text"] == "Iron *pulls*."
    assert bench.ok("changeText", first, {"format": "plain"})["format"] == "plain"
    assert bench.ok("changeText", first, {"format": "markdown"})["text"] == "Iron *pulls*."
    assert "Markdown or plain text" in bench.refused("changeText", first, {"format": "html"})
    assert "at most 16000" in bench.refused("changeText", first, {"text": "x" * 16001})
    step("a text block's words and its format are changed in place; a format there isn't, or too many words, refused")
    return made, page, first, second


def cleaning(bench, step, page):
    dirty = (
        "Hello <b>bold</b> <script>alert(1)</script><!-- hidden -->\n"
        "<<b>b>x ![a cat](https://example.org/cat.png) [web](https://example.org) [bad](javascript:alert(1))\n"
        "<https://example.org/auto> ‮evil\u0007\n"
        "[ref]: file:///etc/passwd"
    )
    block = bench.ok("addText", page, {"text": dirty})
    kept = item(bench, page, block)["text"]
    for gone in ("<b>", "<script>", "hidden", "cat.png", "javascript:", "‮", "\u0007", "file:"):
        assert gone not in kept, (gone, kept)
    for stays in ("Hello bold", "alert(1)", "a cat", "[web](https://example.org)", "bad", "https://example.org/auto", "evil"):
        assert stays in kept, (stays, kept)
    assert "<" not in kept and ">" not in kept, kept
    plain = bench.ok("addText", page, {"text": "1 < 2 and <b>stays</b>‮", "format": "plain"})
    assert item(bench, page, plain)["text"] == "1 < 2 and <b>stays</b>", "plain text is shown as it is, never as HTML"
    step("Markdown is kept without HTML, outside pictures, unsafe links or controls; plain text keeps its words as typed")
    bench.ok("removeContent", block)
    return plain


def pictures(bench, step, page, text):
    small = png(40, 30)
    first = bench.ok("addPicture", page, {"data": small, "pixels": {"width": 40, "height": 30}, "title": "red.png"})
    one = item(bench, page, first)
    assert one["kind"] == "picture" and one["layer"] == "below" and one["title"] == "red.png", one
    assert near(one["width"], 148 * 0.75) and near(one["height"], one["width"] * 30 / 40), one
    assert bench.ok("picture", first) == small
    step("a picture is added from what the view read of a file, below the ink, as wide as three quarters of the page")

    big = png(260, 260, noise=True)
    large = bench.ok(
        "addPicture", page, {"data": bench.pieces(big), "pixels": {"width": 260, "height": 260}, "width": 50, "x": 10, "y": 100}
    )
    assert len(big) > 3 * 60000 and bench.ok("picture", large) == big, "kept in pieces and read back whole"
    assert item(bench, page, large)["width"] == 50
    limits = bench.ok("pictureLimits")
    assert limits == {"bytes": 1024 * 1024, "side": 1600}, limits
    step("a larger picture is kept in pieces, one write each, and read back whole")

    huge = png(520, 520, noise=True)
    assert "at most 1 MB" in bench.refused("addPicture", page, {"data": bench.pieces(huge)})
    assert "PNG or JPEG" in bench.refused("addPicture", page, {"data": "data:image/gif;base64,R0lGODlh"})
    assert "isn't the PNG" in bench.refused("addPicture", page, {"data": "data:image/png;base64,/9j/4AAQ"})
    assert "data address" in bench.refused("addPicture", page, {"data": "file:///home/someone/cat.png"})
    assert "no such page" in bench.refused("addPicture", "p-gone", {"data": small})
    assert "is no picture" in bench.refused("picture", text)
    assert "no words to change" in bench.refused("changeText", large, {"text": "words"})
    step("a picture over the cap, of another kind, not what it says it is, or for no page, is refused")
    return first, large


def layering(bench, step, page, text, picture):
    def order():
        return [one["id"] for one in items(bench, page) if one["id"] in (text, picture)]

    assert order() == [picture, text], "the picture below the ink, the text above it"
    assert bench.ok("arrange", picture, "above")["layer"] == "above"
    assert order() == [text, picture]
    bench.ok("arrange", picture, "back")
    assert order() == [picture, text]
    bench.ok("arrange", text, "below")
    assert order() == [text, picture], "below the ink is under what is above it"
    bench.ok("arrange", text, "above")
    bench.ok("arrange", picture, "below")
    assert "above the ink or below it" in bench.refused("arrange", text, "sideways")
    step("a text block or a picture is put above the ink or below it, and to the front or the back")


def snapshots(bench, step, made, page, first, second):
    bench.ok("pageWritten", page)
    kept = bench.snapshot(made["notebook"])["pages"][0]
    typed = {one["id"] for one in items(bench, page) if one["kind"] == "text"}
    assert set(kept["text"]) == typed and {first, second} <= typed
    assert kept["text"][first]["text"] == "Iron *pulls*." and all("data" not in one for one in kept["pictures"].values())
    assert len(kept["pictures"]) == 2 and kept["pictures"][next(iter(kept["pictures"]))]["parts"] >= 1
    text = bench.omabook("text", made["book"], "--section", 0).stdout
    assert "Iron" in text and "plain words" in text and "2 pictures" in text, text
    on_disk = bench.snapshot_file(made["notebook"])
    with open(on_disk, encoding="utf-8") as file:
        assert bench.ok("readSnapshot", file.read()) == bench.ok("snapshot", made["notebook"])
    step("the notebook's file holds a page's text blocks and where its pictures are, and its book reads the words")


def removing(bench, step, made, page, picture):
    second = bench.ok("addPage", made["notebook"], {})
    block = bench.ok("addText", second, {"text": "going"})
    bench.ok("removeContent", block)
    assert items(bench, second) == [] and "no such text block" in bench.refused("changeText", block, {"text": "back"})
    bench.ok("removePage", page)
    assert "no such text block or picture" in bench.refused("picture", picture)
    step("a text block is removed, and a page goes with its text blocks and pictures")


def merging(bench, step):
    other = Bench()
    try:
        there = bench.reach(other)
        made = bench.ok("makeNotebook", "Shared words", {})
        page = bench.ok("notebooks")["notebooks"][-1]["pages"][0]["id"]
        block = bench.ok("addText", page, {"text": "first draft"})
        bench.omabook("sync", there)
        assert item(other, page, block)["text"] == "first draft", "the block reaches the other computer"

        bench.ok("place", block, {"x": 40, "y": TOP + 3 * STEP})
        other.ok("changeText", block, {"text": "second draft"})
        picture = png(120, 90, noise=True)
        added = other.ok("addPicture", page, {"data": other.pieces(picture), "pixels": {"width": 120, "height": 90}})
        bench.omabook("sync", there)
        for side in (bench, other):
            merged = item(side, page, block)
            assert merged["x"] == 40 and near(merged["y"], TOP + 3 * STEP) and merged["text"] == "second draft", merged
            assert side.ok("picture", added) == picture
        step("a block moved on one computer and typed in on the other keeps both; a picture travels whole")

        bench.ok("changeText", block, {"text": "laptop's words"})
        other.ok("changeText", block, {"text": "desktop's words"})
        bench.omabook("sync", there)
        assert item(bench, page, block)["text"] == item(other, page, block)["text"] == "desktop's words"
        step("of a block's words changed on two computers, the later change stays on both")
        bench.ok("removeNotebook", made["notebook"])
    finally:
        shutil.rmtree(other.scratch, ignore_errors=True)


def check(bench, step):
    made, page, first, second = blocks(bench, step)
    cleaning(bench, step, page)
    picture, large = pictures(bench, step, page, first)
    layering(bench, step, page, first, picture)
    snapshots(bench, step, made, page, first, second)
    removing(bench, step, made, page, large)
    bench.ok("removeNotebook", made["notebook"])
    merging(bench, step)
