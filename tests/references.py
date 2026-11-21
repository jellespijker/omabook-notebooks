"""Place references (#8): a page, or strokes on it, referring to a passage of a book: made at a place
or on words chosen there, listed per page and per book, followed, found again by their words when the
book's file changes (or lost when they are gone), kept back past one's place in a shared notebook,
written into the notebook's file, and taken to another computer.

The book is a FictionBook file added to the scratch library; a new edition of it is that file written anew
where the library keeps it. The reader is not open on a command line, so a place is given as
{book, section, fraction}, as the view gives the reader's.
"""

import os
import shutil

import strokes
from bench import Bench

CHAPTERS = [
    (
        "The harbour",
        "Morning came grey over the harbour and the gulls were loud above the boats. "
        "Mara counted the ropes twice before she trusted the knots. The old ferryman watched her from the pier.",
    ),
    (
        "The crossing",
        "The wind turned in the afternoon and the sail filled with a sound like a door slamming. "
        "Mara held the tiller with both hands while the island grew out of the haze. Nobody on board spoke.",
    ),
    (
        "The island",
        "On the island the houses were shut and the wells were dry. "
        "She found the lighthouse keeper asleep beside a lamp that had not been lit for years.",
    ),
]
QUOTE = "Mara held the tiller with both hands"


def fictionbook(chapters):
    """The book as a FictionBook file: a section for each chapter, as an edition of it would have."""
    sections = "".join(f"<section><title><p>{title}</p></title><p>{text}</p></section>" for title, text in chapters)
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">'
        "<description><title-info><author><first-name>Ada</first-name><last-name>Reed</last-name></author>"
        "<book-title>The Crossing</book-title><lang>en</lang></title-info></description>"
        f"<body>{sections}</body></FictionBook>\n"
    )


def add_book(bench, chapters):
    folder = os.path.join(bench.scratch, "books")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "the-crossing.fb2")
    with open(path, "w", encoding="utf-8") as file:
        file.write(fictionbook(chapters))
    bench.omabook("add", path)
    book = [one for one in bench.json("list") if not one.get("generated")][-1]
    return book["id"]


def section_of(bench, book, words):
    toc = bench.json("toc", book)
    for at in range(len(toc.get("contents", toc) if isinstance(toc, dict) else toc) + 3):
        done = bench.omabook("text", book, "--section", at, check=False)
        if done.returncode == 0 and words in " ".join(done.stdout.split()):
            return at
    raise AssertionError(f"no section holds {words!r}")


def library_file(bench, book):
    shown = bench.json("show", book)
    files = shown.get("files") or {}
    return list(files.values())[0] if isinstance(files, dict) else files[0]["path"]


def making(bench, step, book, sections):
    crossing = sections["crossing"]
    made = bench.ok("makeNotebook", "Reading The Crossing", {"kind": "lined", "size": "A5"})
    page = bench.ok("notebooks")["notebooks"][-1]["pages"][0]["id"]
    at = bench.ok("refer", page, {"book": book, "section": crossing, "fraction": 0})
    [one] = bench.ok("references", page)
    assert one["id"] == at and one["book"] == book and one["section"] == crossing and one["fraction"] == 0, one
    assert "The wind turned in the afternoon" in one["quote"] and len(one["quote"].split()) == 12, one
    assert one["chapter"] == "The crossing" and not one["ahead"] and not one["lost"] and one["here"], one
    step("a page refers to a place in a book: the words that start there, its chapter, kept with the page")

    chosen = bench.ok(
        "refer", page, {"book": book, "section": crossing, "fraction": 0.5, "quote": "  mara HELD the\ntiller with both hands "}
    )
    two = [one for one in bench.ok("references", page) if one["id"] == chosen][0]
    assert two["quote"] == QUOTE and 0.3 < two["fraction"] < 0.6, two
    assert "in this chapter" in bench.refused("refer", page, {"book": book, "section": crossing, "quote": "words that are nowhere"})
    assert "not to a notebook" in bench.refused("refer", page, {"book": made["book"], "section": 0})
    assert "Open a book" in bench.refused("refer", page, {})
    step("a reference on words chosen in the reader keeps them as the book has them; words not there, a notebook, or no book are refused")

    ink = strokes.batch(strokes.line(20, 60, length=40))
    bench.ok("ink", page, ink)
    tied = bench.ok("refer", page, {"book": book, "section": sections["harbour"], "fraction": 0.2, "strokes": list(ink["add"])})
    three = [one for one in bench.ok("references", page) if one["id"] == tied][0]
    assert three["strokes"] == list(ink["add"]) and three["x"] > 59 and 58 < three["y"] < 61, three
    step("a reference tied to strokes stands beside them on the page")

    second = bench.ok(
        "addPage", made["notebook"], {"kind": "lined", "size": "A5"}, None, {"book": book, "section": sections["island"], "fraction": 0}
    )
    [new] = bench.ok("references", second)
    assert "On the island the houses" in new["quote"], new
    assert bench.ok("references", bench.ok("addPage", made["notebook"], {})) == [], "no reader, no reference"
    step("a new page written beside a book refers to where the reader is")
    return made, page, {"start": at, "words": chosen, "tied": tied, "second": second}


def listing(bench, step, book, made, page, ids):
    listed = bench.ok("bookReferences", book)
    assert [one["id"] for one in listed] == [ids["tied"], ids["start"], ids["words"], bench.ok("references", ids["second"])[0]["id"]], (
        listed
    )
    assert {one["notebookTitle"] for one in listed} == {"Reading The Crossing"} and {one["number"] for one in listed} == {1, 2}, listed
    assert all(one["global"] and one["global"] != str(book) for one in listed), "the book is named by its global id too"
    followed = bench.ok("followReference", ids["words"])
    assert followed["book"] == book and followed["moved"] is False and followed["section"] == listed[2]["section"], followed
    bench.ok("pageWritten", page)
    kept = bench.snapshot(made["notebook"])["pages"][0]["references"]
    assert kept[ids["words"]] == {
        "book": "The Crossing",
        "section": listed[2]["section"],
        "fraction": listed[2]["fraction"],
        "quote": QUOTE,
    }, kept
    text = bench.omabook("text", made["book"], "--section", 0).stdout
    assert "Refers to The Crossing" in text and QUOTE in text, text
    step("every reference to a book is listed in its order with its notebook and page; one is followed; the notebook's file has them")


def write_edition(bench, book, chapters):
    with open(library_file(bench, book), "w", encoding="utf-8") as file:
        file.write(fictionbook(chapters))


def opened(bench, book):
    heard = bench.run("event:book.opened", {"id": book, "generated": "", "identifiers": {}, "section": 0, "fraction": 0})
    assert not heard.get("error"), heard


def referred(bench, book, id):
    return [one for one in bench.ok("bookReferences", book) if one["id"] == id][0]


def new_edition(bench, step, book, crossing, ids):
    before = referred(bench, book, ids["words"])
    edited = [("A note on this edition", "This edition puts back a chapter the first printing left out. " * 3)] + list(CHAPTERS)
    edited[2] = (
        "The crossing",
        "Before the crossing Mara slept for an hour under the nets. " + CHAPTERS[1][1].replace("Nobody", "Not one soul"),
    )
    write_edition(bench, book, edited)
    followed = bench.ok("followReference", ids["words"])
    assert followed["moved"] is True and followed["section"] == before["section"] + 1, (before, followed)
    after = referred(bench, book, ids["words"])
    assert after["quote"] == QUOTE and after["chapter"] == "The crossing" and not after["lost"], after
    opened(bench, book)
    start = referred(bench, book, ids["start"])
    assert start["section"] == crossing + 1 and "The wind turned" in start["quote"], start
    step("when the book's file changes, a reference is found again by its words, in its chapter wherever that went")
    return edited


def losing(bench, step, book, crossing, ids, edited):
    edited[2] = ("The crossing", "The wind dropped and they rowed the rest of the way in silence.")
    write_edition(bench, book, edited)
    assert "aren't in the book any more" in bench.refused("followReference", ids["words"])
    lost = referred(bench, book, ids["words"])
    assert lost["lost"] is True and lost["quote"] == QUOTE, lost
    step("a reference whose words are gone from the book is kept as lost, with its words, never guessed at")
    write_edition(bench, book, CHAPTERS)
    opened(bench, book)
    found = {one["id"]: one for one in bench.ok("bookReferences", book)}
    assert not found[ids["words"]]["lost"] and found[ids["words"]]["section"] == crossing, found
    assert found[ids["start"]]["section"] == crossing and found[ids["tied"]]["chapter"] == "The harbour", found
    step("opening the book finds its references again in the file it has now, a lost one too")


def shared(bench, step, book, made, page, ids):
    bench.ok("followReference", ids["start"])
    bench.omabook("progress", book, "--section", 0, "--fraction", 0.5)
    bench.ok("setNotebookShared", made["notebook"], True)
    listed = {one["id"]: one for one in bench.ok("references", page)}
    assert listed[ids["start"]]["ahead"] is True and listed[ids["start"]]["quote"] == "", listed
    assert listed[ids["tied"]]["ahead"] is False and listed[ids["tied"]]["quote"] != "", listed
    assert "past where you have read" in bench.refused("followReference", ids["start"])
    assert bench.ok("followReference", ids["start"], {"anyway": True})["book"] == book
    kept = bench.snapshot(made["notebook"])["pages"][0]["references"]
    assert all(one["quote"] == "" for one in kept.values()), kept
    bench.ok("setNotebookShared", made["notebook"], False)
    assert bench.ok("references", page)[0]["quote"] != ""
    step("in a shared notebook a reference never points past where one has read: its words are kept back, it opens only when asked")


def travelling(bench, step, book, page, ids):
    other = Bench()
    try:
        there = bench.reach(other)
        bench.omabook("sync", there)
        theirs = [one for one in other.json("list") if one.get("title") == "The Crossing"]
        if not theirs:
            add_book(other, CHAPTERS)
        on_other = {one["id"]: one for one in other.ok("references", page)}
        assert on_other[ids["tied"]]["here"] is True and on_other[ids["tied"]]["quote"] != "", on_other
        mine = {one["id"]: one for one in bench.ok("references", page)}[ids["tied"]]
        assert on_other[ids["tied"]]["global"] == mine["global"], (on_other, mine)
        other.ok("placeReference", ids["tied"], {"x": 5, "y": 100})
        bench.ok("removeReference", ids["start"])
        bench.omabook("sync", there)
        here = {one["id"]: one for one in bench.ok("references", page)}
        assert ids["start"] not in here and (here[ids["tied"]]["x"], here[ids["tied"]]["y"]) == (5, 100), here
        step("references go to another computer with their page and find the book there; moved on one and removed on the other, both hold")
    finally:
        shutil.rmtree(other.scratch, ignore_errors=True)


def check(bench, step):
    book = add_book(bench, CHAPTERS)
    sections = {
        "harbour": section_of(bench, book, "Morning came grey"),
        "crossing": section_of(bench, book, "The wind turned in the afternoon"),
        "island": section_of(bench, book, "On the island"),
    }
    crossing = sections["crossing"]
    made, page, ids = making(bench, step, book, sections)
    listing(bench, step, book, made, page, ids)
    losing(bench, step, book, crossing, ids, new_edition(bench, step, book, crossing, ids))
    shared(bench, step, book, made, page, ids)
    travelling(bench, step, book, page, ids)
    bench.ok("removePage", ids["second"])
    assert [one["page"] for one in bench.ok("bookReferences", book)] == [page, page]
    bench.ok("removeNotebook", made["notebook"])
    assert bench.ok("bookReferences", book) == []
    step("a page's references go with it, and a notebook's with the notebook")
    bench.omabook("remove", book)
