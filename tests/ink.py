"""Ink on pages (#3): strokes added, erased whole and in part, undone, kept per page in the
change log, written into the notebook's file, and two computers' strokes on one page merged.

The strokes are ones the ink surface could have sent (strokes.py): a pen moved over the page,
with its pressure and its moments, in Omabook's codec. tests/run.py calls check() with its bench;
the merge makes a second bench, another computer, and syncs the two over a stand-in for ssh.
"""

import shutil

import strokes
from bench import Bench


def page_of(bench, title):
    notebook = [one for one in bench.ok("notebooks")["notebooks"] if one["title"] == title][0]
    return notebook, notebook["pages"][0]["id"]


def writing(bench, step):
    made = bench.ok("makeNotebook", "Sketches", {"kind": "dotted", "size": "A5"})
    notebook, first = page_of(bench, "Sketches")
    second = bench.ok("addPage", made["notebook"], {"kind": "blank", "size": "A5"})
    assert bench.ok("strokes", first) == {}

    pause = strokes.batch(strokes.line(10, 20), strokes.line(10, 30), strokes.line(10, 40, colour=0xFF2F5FB3, width=0.8))
    assert bench.ok("ink", first, pause) == 3
    assert bench.ok("strokes", first) == pause["add"]
    assert bench.ok("ink", second, strokes.batch(strokes.line(5, 5))) == 1
    assert len(bench.ok("strokes", first)) == 3 and len(bench.ok("strokes", second)) == 1
    step("a pause of the pen's strokes is kept on its page as one write, each page's strokes its own")

    ids = sorted(pause["add"])
    assert bench.ok("ink", first, {"add": {}, "remove": [ids[0]]}) == 2
    left, right = strokes.line(10, 30, length=12), strokes.line(25, 30, length=15)
    cut = strokes.batch(left, right, remove=[ids[1]])
    assert bench.ok("ink", first, cut) == 3
    kept = bench.ok("strokes", first)
    assert ids[0] not in kept and ids[1] not in kept and ids[2] in kept
    assert sorted(value for key, value in kept.items() if key != ids[2]) == sorted([left, right])
    step("the eraser takes a whole stroke out, or part of one: it removed, the pieces left added, in one write")

    assert bench.ok("ink", first, {"add": {ids[1]: pause["add"][ids[1]]}, "remove": list(cut["add"])}) == 2
    assert bench.ok("strokes", first) == {ids[1]: pause["add"][ids[1]], ids[2]: pause["add"][ids[2]]}
    step("undoing the cut brings the stroke back as it was, by its id, and takes the pieces away")

    bench.ok("pageWritten", first)
    pages = bench.snapshot(made["notebook"])["pages"]
    assert pages[0]["strokes"] == bench.ok("strokes", first) and len(pages[1]["strokes"]) == 1
    assert "2 strokes" in bench.omabook("text", made["book"], "--section", 0).stdout
    step("done with a page, its notebook's file holds its strokes as the log has them, and its book says so")

    marker = strokes.batch(strokes.line(10, 20, colour=0x66F5D90A, width=5))
    assert bench.ok("ink", first, marker) == 3
    assert {key: bench.ok("strokes", first)[key] for key in marker["add"]} == marker["add"]
    tools = bench.ok("inkTools")
    assert [pen["id"] for pen in tools["pens"]] == ["pen", "highlighter"] and len(tools["colours"]["pen"]) >= 3
    assert all(colour["value"].startswith("#") and len(colour["value"]) == 9 for colour in tools["colours"]["highlighter"])
    step("the highlighter is a broad pen whose colour shows through, kept as any stroke is; the tools are listed")
    return notebook, first


def refusing(bench, step, first):
    good = strokes.line(1, 1)
    assert "isn't one the ink surface wrote" in bench.refused("ink", first, {"add": {"has space": good}})
    assert "isn't one the ink surface wrote" in bench.refused("ink", first, {"add": {"abc": "not base64!"}})
    assert "lists the strokes it removes" in bench.refused("ink", first, {"add": {}, "remove": "abc"})
    assert "by their ids" in bench.refused("ink", first, {"add": {}, "remove": [7]})
    assert "at most 1000" in bench.refused("ink", first, {"add": {}, "remove": [f"s{n}" for n in range(1001)]})
    assert "no such page" in bench.refused("ink", "p-gone", strokes.batch(good))
    assert len(bench.ok("strokes", first)) == 3, "nothing of a refused batch is kept"
    step("a batch that isn't one the ink surface could send, or for a page there isn't, is refused and nothing kept")


def merging(bench, step):
    other = Bench()
    try:
        there = bench.reach(other)
        made = bench.ok("makeNotebook", "Shared page", {})
        _, page = page_of(bench, "Shared page")
        here_first = strokes.batch(strokes.line(10, 10), strokes.line(10, 20))
        bench.ok("ink", page, here_first)
        bench.omabook("sync", there)
        assert other.ok("strokes", page) == here_first["add"], "the page and its ink reach the other computer"

        both = sorted(here_first["add"])
        laptop = strokes.batch(strokes.line(10, 30), remove=[both[0]])
        desktop = strokes.batch(strokes.line(40, 30), strokes.line(40, 40), remove=[both[1]])
        bench.ok("ink", page, laptop)
        other.ok("ink", page, desktop)
        bench.omabook("sync", there)
        merged = dict(laptop["add"], **desktop["add"])
        assert bench.ok("strokes", page) == merged, bench.ok("strokes", page)
        assert other.ok("strokes", page) == merged, other.ok("strokes", page)
        step("strokes written on one page on two computers at once merge: all both added, none either erased")
        bench.ok("removeNotebook", made["notebook"])
    finally:
        shutil.rmtree(other.scratch, ignore_errors=True)


def check(bench, step):
    notebook, first = writing(bench, step)
    refusing(bench, step, first)
    bench.ok("removeNotebook", notebook["id"])
    merging(bench, step)
