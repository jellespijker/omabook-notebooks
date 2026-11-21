"""Exports (#9): a sample notebook (ink, typed Markdown and plain text, pictures, recognised handwriting,
a recording's transcript and place references) saved as a PDF and as Markdown, the whole of it or the pages
chosen, under the plugin's data/exports/; and read through Omabook's MCP tools, read-only.

The PDF is read here as a PDF reader would: its cross-reference table must lead to every object, and its
pages hold the paper and the ink as lines, the typed words as text, the handwriting's words as unseen text,
the pictures as images (a see-through one with its mask) and each place reference as a link. When qpdf or
pdftotext is on the computer, they read it too.
"""

import base64
import json
import os
import re
import shutil
import subprocess

import opus
import references
import strokes
from bench import OMABOOK
from content import png
from fakeserver import FakeServer
from recordings import NO_WHISPER, STARTED, put

A5 = ("419.53", "595.28")


def serve(bench, url):
    bench.configure(
        ai_provider="openai",
        ai_endpoint={"preset": "custom", "base_url": url},
        ai_models={"openai:" + url: {"main": "chat-model", "quick": "chat-model"}},
        recognition={"ink_model": "llava", "whisper_program": NO_WHISPER, "hosted": False},
    )


def sample(bench, server):
    """The notebook every export is checked against: {notebook, book, pages, crossing, island, picture}."""
    serve(bench, server.url)
    book = references.add_book(bench, references.CHAPTERS)
    crossing = references.section_of(bench, book, references.QUOTE)
    island = references.section_of(bench, book, "lighthouse keeper")
    made = bench.ok("makeNotebook", "Field trip", {"kind": "lined", "ruling": "college", "size": "A5"})
    first = bench.ok("notebooks")["notebooks"][-1]["pages"][0]["id"]
    second = bench.ok("addPage", made["notebook"], {"kind": "dotted", "size": "A5"})
    bench.ok("ink", first, strokes.batch(strokes.line(20, 40), strokes.line(20, 50, colour=0x662F5FB3, width=5)))
    bench.ok("addText", first, {"x": 22, "y": 60, "width": 100, "text": "# Tides\nThe **sea** rises *twice* a day.\n- low at noon"})
    bench.ok("addText", second, {"x": 20, "y": 30, "width": 90, "text": "Plain *stars* & (brackets)", "format": "plain"})
    picture = png(40, 30)
    bench.ok(
        "addPicture", first, {"data": picture, "pixels": {"width": 40, "height": 30}, "title": "red.png", "x": 20, "y": 120, "width": 40}
    )
    server.read("Gulls over the harbour")
    assert bench.ok("recognise", first, {})["text"] == "Gulls over the harbour"
    recording = bench.ok("keepRecording", second, {"file": put(bench, "rexport.opus", opus.recording(STARTED, 4_000))})
    server.hear([("Kelsier", 1.5, 2.0), ("pushes", 2.1, 2.6), ("steel.", 2.7, 3.2)])
    assert bench.ok("transcribe", recording, {})["text"] == "Kelsier pushes steel."
    bench.ok("refer", first, {"book": book, "section": crossing, "fraction": 0, "quote": references.QUOTE})
    bench.ok("refer", second, {"book": book, "section": island, "fraction": 0.2})
    bench.omabook("progress", book, "--section", crossing, "--fraction", 0.9)
    return {
        "notebook": made["notebook"],
        "book": book,
        "notebook_book": made["book"],
        "pages": [first, second],
        "crossing": crossing,
        "island": island,
        "picture": picture,
    }


def objects(data):
    """The PDF's objects by number, each found where its cross-reference table says it starts."""
    start = int(re.search(rb"startxref\s+(\d+)\s+%%EOF\s*$", data).group(1))
    assert data[start:].startswith(b"xref"), "startxref points at the table"
    rows = re.findall(rb"(\d{10}) (\d{5}) ([nf]) ?\r?\n", data[start:])
    found = {}
    for number, (offset, _, kind) in enumerate(rows):
        if kind == b"n":
            at = int(offset)
            assert data[at:].startswith(f"{number} 0 obj".encode()), (number, data[at : at + 20])
            found[number] = data[at : data.index(b"endobj", at)]
    return found


def contents(found):
    """The pages' content streams, as text."""
    out = []
    for body in found.values():
        if b"stream\n" in body and b"/Subtype" not in body and b"/Type" not in body[: body.index(b"stream\n")]:
            out.append(body[body.index(b"stream\n") + 7 : body.rindex(b"\nendstream")].decode("latin-1"))
    return out


def drawn_right(found, made):
    """What the pages draw: lines for paper and ink, the typed words and the handwriting's, the picture, the link."""
    drawn = contents(found)
    assert len(drawn) == 2, len(drawn)
    one, two = drawn
    assert one.count(" l S") > 40, "the paper's rules and the ink are lines"
    assert "1 J 1 j" in one and "0.18 0.37 0.7 RG" in one, "ink keeps its colour, with round ends"
    for words in ("(Tides) Tj", "(The sea rises twice a day.) Tj", "(\x95 low at noon) Tj"):
        assert words in one, (words, one)
    assert "/F2" in one, "a heading is bold"
    assert "3 Tr" in one and "(Gulls over the harbour) Tj" in one, "the handwriting's words are there, unseen"
    assert "(Plain *stars* & \\(brackets\\)) Tj" in two, two
    assert "/P0 Do" in one, "the picture is drawn"
    images = [body for body in found.values() if b"/Subtype /Image" in body]
    assert any(b"/SMask" in body for body in images), "a see-through picture keeps its mask"
    assert any(b"/CA 0.4" in body for body in found.values()), "the highlighter is see-through"
    link = f"/URI (omabook://book/{made['book']}/section/{made['crossing']})".encode()
    assert any(link in body for body in found.values()), "a place reference is a link to its passage"


def read_by_tools(path):
    """qpdf and pdftotext, where the computer has them, read it too."""
    if shutil.which("qpdf"):
        checked = subprocess.run(["qpdf", "--check", path], capture_output=True, text=True)
        assert checked.returncode == 0, checked.stdout + checked.stderr
    if shutil.which("pdftotext"):
        text = subprocess.run(["pdftotext", path, "-"], capture_output=True, text=True).stdout
        assert "Tides" in text and "Gulls over the harbour" in text, text


def pdf_whole(bench, step, made):
    told = bench.ok("exportNotebook", made["notebook"], {"format": "pdf"})
    assert told["file"] == "data/exports/field-trip.pdf" and told["pages"] == 2 and told["missed"] == 0, told
    assert told["path"] == os.path.join(bench.plugin, "data", "exports", "field-trip.pdf"), told
    with open(told["path"], "rb") as file:
        data = file.read()
    assert data.startswith(b"%PDF-1.4") and len(data) == told["bytes"]
    found = objects(data)
    pages = [body for body in found.values() if b"/Type /Page " in body]
    assert len(pages) == 2 and all(f"/MediaBox [0 0 {A5[0]} {A5[1]}]".encode() in one for one in pages), pages
    drawn_right(found, made)
    read_by_tools(told["path"])
    step("a notebook exports as a PDF at its paper's size: paper and ink as lines, typed words and handwriting as text, pictures, links")


def pdf_chosen(bench, step, made):
    told = bench.ok("exportNotebook", made["notebook"], {"format": "pdf", "pages": [made["pages"][1]], "name": "Second page"})
    assert told["file"] == "data/exports/second-page.pdf" and told["pages"] == 1, told
    with open(told["path"], "rb") as file:
        found = objects(file.read())
    assert len([body for body in found.values() if b"/Type /Page " in body]) == 1
    assert "isn't in this notebook" in bench.refused("exportNotebook", made["notebook"], {"pages": ["p-gone"]})
    assert 'not "docx"' in bench.refused("exportNotebook", made["notebook"], {"format": "docx"})
    assert "no such notebook" in bench.refused("exportNotebook", "n-gone", {})
    step("the pages chosen export alone, by the name given; a page or a format there isn't is refused")


def markdown(bench, step, made):
    told = bench.ok("exportNotebook", made["notebook"], {"format": "markdown"})
    assert told["file"] == "data/exports/field-trip/field-trip.md" and told["pictures"] == 1, told
    with open(told["path"], encoding="utf-8") as file:
        text = file.read()
    assert text.startswith("# Field trip\n") and "## Page 1" in text and "## Page 2" in text, text
    assert "# Tides\nThe **sea** rises *twice* a day.\n- low at noon" in text, "a block's Markdown is kept as it is"
    assert "Plain \\*stars\\* & (brackets)" in text, "plain text reads as the same words"
    assert "![red.png](pictures/001.png)" in text and text.index("Tides") < text.index("red.png"), "pictures where they lie"
    with open(os.path.join(told["folder"], "pictures", "001.png"), "rb") as file:
        assert file.read() == base64.b64decode(made["picture"].split(",", 1)[1]), "the picture's own bytes"
    assert "**Handwriting**\n\n> Gulls over the harbour" in text, text
    assert "**Said while writing**\n\n- **0:01** Kelsier pushes steel." in text, text
    link = f"[The Crossing, The crossing](omabook://book/{made['book']}/section/{made['crossing']}): “{references.QUOTE}"
    assert link in text, text
    step("a notebook exports as Markdown: typed text, handwriting, what was said, pictures as files, references as links")

    bench.ok("removeContent", [one for one in bench.ok("content", made["pages"][0])["items"] if one["kind"] == "picture"][0]["id"])
    again = bench.ok("exportNotebook", made["notebook"], {"format": "markdown"})
    left = os.path.join(again["folder"], "pictures")
    assert again["pictures"] == 0 and not (os.path.isdir(left) and os.listdir(left)), "no picture of before is left"
    step("exported again, the Markdown takes the place of the one before, with no picture of it left behind")


def mcp(bench, step, made):
    """Omabook's MCP tools read a notebook as the book it is: its words, and nothing to change it with."""
    hello = {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "tests", "version": "1"}}
    asked = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": hello},
        {"jsonrpc": "2.0", "id": 2, "method": "resources/read", "params": {"uri": f"omabook://book/{made['notebook_book']}/section/0"}},
    ]
    done = subprocess.run(
        [OMABOOK, "mcp", "--library", bench.library],
        input="\n".join(json.dumps(one) for one in asked) + "\n",
        env=bench.env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    answers = [json.loads(line) for line in done.stdout.splitlines() if line.strip()]
    read = json.dumps([one for one in answers if one.get("id") == 2])
    assert "Tides" in read and "Gulls over the harbour" in read, read
    step("Omabook's MCP tools read a notebook's words as a book's section, without the plugin")


def check(bench, step):
    server = FakeServer()
    made = sample(bench, server)
    pdf_whole(bench, step, made)
    pdf_chosen(bench, step, made)
    markdown(bench, step, made)
    mcp(bench, step, made)
    return made, server
