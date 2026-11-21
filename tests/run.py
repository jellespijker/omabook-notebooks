#!/usr/bin/env python3
"""The plugin's tests in a scratch library: notebooks, pages, paper, ink, text blocks, pictures, recognised text,
recordings, search, the knowledge graph, place references, exports and the AI reading notebooks.

    python3 tests/run.py            # needs `omabook` on the PATH, or OMABOOK=/path/to/omabook
    python3 tests/run.py --keep     # leave the scratch folder behind, to look at

Everything happens in a scratch folder: HOME and the XDG folders (state too) point into
it, so no real settings, plugins or library are read or written. The plugin
is copied into the scratch config's plugin folder, where an installed plugin
lives, so that `omabook toc` and `omabook text` read its notebooks too.

Each step drives the plugin the way a person at a terminal would:

    omabook plugin run notebooks <function | event:name> '<json>' --library <scratch>

and then looks at what is on disk: the library, and the notebook files.
The live data is in the library's change log, which the plugin alone
reads; what it answers is checked against the file written from it.
"""

import json
import os
import shutil
import subprocess
import sys

import asking
import content
import exports
import ink
import knowledge
import paper
import recognition
import recordings
import references
from bench import NAME, OMABOOK, ROOT, Bench

SAMPLE = os.path.join(ROOT, "tests", "data", "sample.omanotebook")


def ids(pages):
    return [page["id"] for page in pages]


def notebook_named(bench, title):
    return [one for one in bench.ok("notebooks")["notebooks"] if one["title"] == title][0]


def setup(bench, step):
    check = bench.json("plugin", "check", NAME, "--folder", bench.plugins)
    assert check["ok"], check
    registered = json.dumps(check["registered"])
    for expected in ("Notebook", "notebooks", "book.opened", "book.removed"):
        assert expected in registered, (expected, registered)
    assert [one["id"] for one in check["registered"]["launchers"]] == ["notebooks"], check["registered"]
    step("the plugin loads and registers its format, its view, its entry on the shelf and its events")


def making(bench, step):
    made = bench.ok("makeNotebook", "Physics", {"kind": "squared", "size": "A4"})
    book, notebook = made["book"], made["notebook"]
    listed = bench.books()[book]
    assert listed["title"] == "Physics" and listed["identifiers"] == {"generated": NAME, "notebook": notebook}, listed
    shown = notebook_named(bench, "Physics")
    assert shown["id"] == notebook and shown["book"] == book and shown["private"] is True, shown
    assert [page["paper"] for page in shown["pages"]] == [{"kind": "squared", "size": "A4"}], shown
    assert bench.snapshot(notebook)["notebook"]["title"] == "Physics"
    assert "Page 1" in bench.omabook("toc", book).stdout
    assert book in [entry["id"] for entry in bench.json("search", "Physics")]
    step("a notebook is made with its first page, as a private book of the plugin's on the shelf and in search")

    first = shown["pages"][0]["id"]
    two = bench.ok("addPage", notebook, {"kind": "lined", "ruling": "wide", "size": "A4"})
    three = bench.ok("addPage", notebook, {"kind": "staves", "size": "A4"})
    zero = bench.ok("addPage", notebook, {"kind": "dotted", "size": "A4"}, 0)
    assert ids(notebook_named(bench, "Physics")["pages"]) == [zero, first, two, three]
    bench.ok("movePage", three, 1)
    bench.ok("movePage", zero, 3)
    bench.ok("movePage", first, 0)
    order = [first, three, two, zero]
    assert ids(notebook_named(bench, "Physics")["pages"]) == order
    assert ids(bench.snapshot(notebook)["pages"]) == order, "the file follows the log"
    assert bench.omabook("toc", book).stdout.count("Page ") == 4
    text = bench.omabook("text", book, "--section", 1).stdout
    assert "Music staves, A4" in text, text
    step("pages are added (last or at a place) and reordered, and the notebook's file and book follow")

    for _ in range(40):
        bench.ok("movePage", order[-1], 1)
        order.insert(1, order.pop())
    assert ids(notebook_named(bench, "Physics")["pages"]) == order
    step("a page moved back and forth many times between the same two keeps its place")

    bench.ok("setPaper", two, {"kind": "cornell", "size": "A4"})
    assert [page["paper"] for page in notebook_named(bench, "Physics")["pages"] if page["id"] == two] == [{"kind": "cornell", "size": "A4"}]
    assert 'no paper called "graph"' in bench.refused("setPaper", two, {"kind": "graph"})
    assert "A4, A5 or Letter" in bench.refused("addPage", notebook, {"kind": "lined", "size": "B5"})
    step("a page's paper is changed; a paper or a size there isn't is refused, saying what there is")

    bench.ok("removePage", two)
    order.remove(two)
    assert ids(notebook_named(bench, "Physics")["pages"]) == order and ids(bench.snapshot(notebook)["pages"]) == order
    assert "no such page" in bench.refused("page", two)
    step("a page is removed from its notebook and its file")
    return {"book": book, "notebook": notebook, "order": order}


def loose(bench, step, physics):
    note = bench.ok("makeLooseNote", {"kind": "blank", "size": "A5"})
    overview = bench.ok("notebooks")
    assert ids(overview["loose"]) == [note] and note not in ids(notebook_named(bench, "Physics")["pages"])
    assert len(bench.books()) == 1, "a loose note is not a book"
    bench.ok("filePage", note, physics["notebook"], 1)
    physics["order"].insert(1, note)
    assert bench.ok("notebooks")["loose"] == [] and ids(notebook_named(bench, "Physics")["pages"]) == physics["order"]
    assert ids(bench.snapshot(physics["notebook"])["pages"]) == physics["order"]
    step("a loose note is made outside any notebook, and filed into one later, at a place")

    other = bench.ok("makeNotebook", "Recipes")
    bench.ok("filePage", note, other["notebook"])
    physics["order"].remove(note)
    assert ids(notebook_named(bench, "Physics")["pages"]) == physics["order"]
    assert ids(notebook_named(bench, "Recipes")["pages"])[-1] == note and len(bench.snapshot(other["notebook"])["pages"]) == 2
    bench.ok("filePage", note, "")
    assert ids(bench.ok("notebooks")["loose"]) == [note] and len(bench.snapshot(other["notebook"])["pages"]) == 1
    bench.ok("removePage", note)
    assert bench.ok("notebooks")["loose"] == []
    step("a page moves from one notebook to another and back out as a loose note, each file following")

    bench.ok("renameNotebook", other["notebook"], "Recipes, mostly soup")
    assert bench.books()[other["book"]]["title"] == "Recipes, mostly soup"
    assert bench.snapshot(other["notebook"])["notebook"]["title"] == "Recipes, mostly soup"
    step("a notebook is renamed, in its book and its file")
    return other


def removing(bench, step, physics, other):
    stray = bench.ok("makeLooseNote", {})
    bench.ok("removeNotebook", physics["notebook"])
    assert physics["book"] not in bench.books()
    assert physics["notebook"] not in [one["id"] for one in bench.ok("notebooks")["notebooks"]]
    assert not os.path.exists(bench.snapshot_file(physics["notebook"]))
    assert ids(bench.ok("notebooks")["loose"]) == [stray], "a loose note stays when a notebook goes"
    assert "no such notebook" in bench.refused("addPage", physics["notebook"], {})
    step("a notebook is removed with its pages, its file and its book")

    listed = bench.books()[other["book"]]
    bench.omabook("remove", other["book"])
    heard = bench.run("event:book.removed", {"id": other["book"], "book": listed})
    assert not heard.get("error"), heard
    assert bench.ok("notebooks")["notebooks"] == [] and not os.path.exists(bench.snapshot_file(other["notebook"]))
    step("a notebook's book removed with Omabook's own Remove takes the notebook with it")
    bench.ok("removePage", stray)


def snapshots(bench, step):
    with open(SAMPLE, encoding="utf-8") as file:
        written = file.read()
    read = bench.ok("readSnapshot", written)
    assert read == json.loads(written), "read back as written"
    assert bench.ok("snapshotText", read) == written, "and written again byte for byte"
    opened = bench.ok("format:Notebook", SAMPLE)
    titles = [chapter["title"] for chapter in opened["chapters"]]
    assert opened["title"] == "Field notes: Scadrial" and titles == ["Page 1", "Page 2", "Page 3"], opened
    whole = json.dumps(opened)
    assert "Steel pushes" in whole and whole.index("Cue: who is Kelsier") < whole.index("Summary: the Lord Ruler"), whole
    step("the sample notebook file reads back as written, and its format reads its pages and their typed text in order")

    newer = json.loads(written)
    newer["version"] = 2
    assert "newer Notebooks" in bench.refused("readSnapshot", json.dumps(newer))
    assert "isn't a notebook file" in bench.refused("readSnapshot", "{}")
    assert "isn't a notebook file" in bench.refused("readSnapshot", "not json")
    step("a file of a newer version, or no notebook file at all, is refused with a reason")

    made = bench.ok("makeNotebook", "Round trip", {"kind": "dotted", "size": "Letter"})
    bench.ok("addPage", made["notebook"], {"kind": "cornell", "size": "A5"})
    with open(bench.snapshot_file(made["notebook"]), encoding="utf-8") as file:
        on_disk = file.read()
    assert bench.ok("readSnapshot", on_disk) == bench.ok("snapshot", made["notebook"]) == json.loads(on_disk)
    step("a notebook's file holds what the log holds, and reads back the same")


def main():
    if not OMABOOK:
        sys.exit("omabook was not found: put it on the PATH or set OMABOOK=/path/to/omabook.")
    bench = Bench()
    passed = []

    def step(title):
        passed.append(title)
        print(f"ok {len(passed):2d}  {title}", flush=True)

    try:
        setup(bench, step)
        paper.check(bench, step)
        physics = making(bench, step)
        other = loose(bench, step, physics)
        removing(bench, step, physics, other)
        snapshots(bench, step)
        ink.check(bench, step)
        content.check(bench, step)
        recognition.check(bench, step)
        recordings.check(bench, step)
        knowledge.check(bench, step)
        references.check(bench, step)
        asking.check(bench, step, *exports.check(bench, step))
        print(f"\nAll {len(passed)} steps passed.")
        if "--keep" in sys.argv:
            print("The scratch folder is kept: " + bench.scratch)
        else:
            shutil.rmtree(bench.scratch, ignore_errors=True)
        return 0
    except AssertionError as error:
        import traceback

        line = traceback.extract_tb(error.__traceback__)[-1]
        print(f"\nFAILED after {len(passed)} steps, at line {line.lineno} ({line.line}): {error}")
        print("The scratch folder is kept: " + bench.scratch)
        return 1
    except subprocess.TimeoutExpired as error:
        print(f"\nFAILED after {len(passed)} steps: Omabook did not come back: {error}")
        print("The scratch folder is kept: " + bench.scratch)
        return 1


if __name__ == "__main__":
    sys.exit(main())
