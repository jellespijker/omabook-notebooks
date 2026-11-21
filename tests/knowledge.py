"""The notebook in the knowledge graph and in search (#7): a page's words, typed, read from the ink and
said, found by `find` with where they are and read in the notebook's book; and what a page is about
tied by the person to things of the graph, in the notebook's tenant, found by `knows:` on the shelf,
and kept out of every space while the notebook is private.

The graph here is filled by hand (`omabook graph add`), as no model reads anything in the tests: a
book of the library, Mistborn, with Vin and Luthadel met in it.
"""

import json
import os


def add_book(bench):
    path = os.path.join(bench.scratch, "mistborn.md")
    with open(path, "w", encoding="utf-8") as file:
        file.write("# Mistborn\n\n## Chapter 1\n\nVin hides in Luthadel.\n")
    bench.omabook("add", path)
    return [one["id"] for one in bench.json("list") if one["title"].lower() == "mistborn"][0]


def thing(bench, kind, name, book):
    made = bench.json("graph", "add", "--kind", kind, "--name", name, "--book", book, "--section", 0)
    return made["node"]["id"]


def finds(bench, words):
    return [one["id"] for one in bench.json("search", words)]


def edges_of(bench, node):
    shown = bench.json("graph", "node", node)
    return [edge for edge in shown.get("edges", []) if edge.get("kind") == "written about in"]


def words(bench, step):
    made = bench.ok("makeNotebook", "Field notes", {"kind": "lined", "size": "A5"})
    first = bench.ok("notebooks")["notebooks"][-1]["pages"][0]["id"]
    second = bench.ok("addPage", made["notebook"], {"kind": "blank", "size": "A5"})
    block = bench.ok("addText", first, {"text": "Vin met Kelsier in Luthadel, by the Lumière ford."})
    bench.ok("correctRecognised", second, "Elend reads by the window")
    hits = bench.ok("find", "kelsier ford")
    assert [(one["page"], one["kind"], one["block"], one["number"]) for one in hits] == [(first, "typed", block, 1)], hits
    assert hits[0]["notebook"] == made["notebook"] and "Kelsier" in hits[0]["text"], hits
    assert [one["kind"] for one in bench.ok("find", "elend WIND")] == ["recognised"], "by the start of a word, case aside"
    assert [one["page"] for one in bench.ok("find", "lumie")] == [first], "accents aside"
    assert bench.ok("find", "ford elend") == [] and bench.ok("find", "  ") == [], "every word, in one place"
    step("find has the words of a page, typed or read from the ink, each hit with its page and text block")

    assert bench.snapshot(made["notebook"])["pages"][1]["recognised"] == "Elend reads by the window"
    text = bench.omabook("text", made["book"], "--section", 1).stdout
    assert "Elend reads by the window" in text, text
    step("the words read from the ink are in the notebook's file and its book, where Find and the book's text have them")
    return made, first, second


def mentioning(bench, step, made, first, second, mistborn):
    vin = thing(bench, "character", "Vin", mistborn)
    luthadel = thing(bench, "place", "Luthadel", mistborn)
    thing(bench, "place", "Kredik Shaw", mistborn)
    offered = bench.ok("suggestMentions", first)
    assert sorted(one["name"] for one in offered) == ["Luthadel", "Vin"], offered
    assert bench.ok("mentions", first) == [] and edges_of(bench, vin) == [], "nothing goes into the graph unasked"
    step("the things of the graph a page names are offered, and nothing is tied until the person says so")

    said = bench.ok("mention", first, {"node": vin})
    assert [(one["kind"], one["name"], one["made"]) for one in said] == [("character", "Vin", False)], said
    tied = edges_of(bench, vin)
    assert len(tied) == 1 and tied[0]["note"] == "Page 1", tied
    assert made["book"] in finds(bench, "knows:vin") and made["book"] in finds(bench, "vin"), "the shelf finds the notebook"
    assert made["book"] not in finds(bench, "knows:luthadel")
    left = bench.ok("dismissMention", first, {"kind": "place", "name": "Luthadel"})
    assert left == [] and bench.ok("suggestMentions", first) == [], "said either way, it isn't offered again"
    assert edges_of(bench, luthadel) == []
    step("said yes to, a thing is tied to the notebook's book with its page, and knows: on the shelf finds the notebook")

    bench.ok("mention", second, {"node": vin})
    assert edges_of(bench, vin)[0]["note"] == "Pages 1 and 2"
    said = bench.ok("mention", second, {"kind": "topic", "name": "Allomancy"})
    allomancy = [one for one in said if one["name"] == "Allomancy"][0]
    assert allomancy["made"] is True, said
    assert [one["name"] for one in bench.ok("findThings", "allo")] == ["Allomancy"]
    bench.ok("movePage", second, 0)
    assert edges_of(bench, vin)[0]["note"] == "Pages 1 and 2"
    bench.ok("forgetMention", [one for one in bench.ok("mentions", first) if one["name"] == "Vin"][0]["id"])
    assert edges_of(bench, vin)[0]["note"] == "Page 1", "the page moved first, and its number with it"
    step("a thing the graph doesn't know is made in the notebook's book; the note follows the pages it is on, moved or taken back")

    bench.ok("forgetMention", allomancy["id"])
    assert bench.ok("findThings", "allomancy") == [], "a thing made for the notebook goes when nothing is tied to it"
    bench.ok("removePage", second)
    assert edges_of(bench, vin) == [] and made["book"] not in finds(bench, "knows:vin")
    assert [one["name"] for one in bench.json("graph", "find", "Vin")["nodes"]] == ["Vin"], "the library's thing stays"
    note = bench.ok("makeLooseNote", {})
    assert "file it into a notebook" in bench.refused("mention", note, {"node": vin})
    bench.ok("removePage", note)
    step("a page removed takes what it said with it, the library's things stay, and a loose note says to file it first")
    return vin


def tenants(bench, step, made, first, vin, mistborn):
    bench.omabook("collections", "add", "Fiction")
    bench.omabook("collections", "include", "Fiction", mistborn)
    refused = bench.refused("mention", first, {"node": vin})
    assert "another collection" in refused and "put the notebook in that collection" in refused, refused
    assert bench.ok("mentions", first) == [] and edges_of(bench, vin) == []
    bench.omabook("collections", "include", "Fiction", made["book"])
    bench.ok("mention", first, {"node": vin})
    assert edges_of(bench, vin)[0]["note"] == "Page 1"
    step("a page is tied only to things of its notebook's own collection's graph, and says so plainly when not")

    kept = bench.json("spaces", "private")
    listed = json.dumps(kept)
    assert str(made["book"]) in listed and "omanotebook" in listed, kept
    step("a notebook is a book Notebooks keeps private, which Omabook keeps out of every shared or published space")
    bench.ok("removeNotebook", made["notebook"])
    assert edges_of(bench, vin) == []


def check(bench, step):
    # The search looks in the graph only where the graph is on; no model is set up to grow it.
    bench.configure(graph="ask")
    try:
        mistborn = add_book(bench)
        made, first, second = words(bench, step)
        vin = mentioning(bench, step, made, first, second, mistborn)
        tenants(bench, step, made, first, vin, mistborn)
        bench.omabook("collections", "remove", "Fiction")
        bench.omabook("remove", mistborn)
    finally:
        bench.configure(graph="off")
