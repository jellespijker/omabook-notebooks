"""Recognised text from handwriting (#6): a page's ink read in the background, kept with the strokes
it came from, read again when they change, corrected by hand, turned into a text block, and never
sent to a hosted server unless both the settings and the notebook say so.

The AI server is a stand-in on this computer (fakeserver.py), as in Omabook's own tests: the
scratch config.json points Omabook at it, and it "reads" whatever it was told to. A hosted
server is an address that is never asked (`hosted.invalid`): Omabook refuses before it would.
"""

import strokes
from fakeserver import FakeServer

HOSTED = "https://hosted.invalid/v1"


def serve(bench, url, hosted=False):
    bench.configure(
        ai_provider="openai", ai_endpoint={"preset": "custom", "base_url": url}, recognition={"ink_model": "llava", "hosted": hosted}
    )


def state(bench, page):
    return bench.ok("recognised", page)


def without_a_server(bench, step, page):
    serve(bench, HOSTED)
    told = state(bench, page)
    assert told["status"] == "unavailable" and "no AI server" in told["why"] and "the ink is kept" in told["why"], told
    assert bench.ok("recognise", page, {"background": True})["status"] == "unavailable"
    assert "someone else's computer" in bench.refused("recognise", page, {}), "Omabook says why"
    step("with no AI server of one's own the page says so plainly, the pen resting asks nothing, and asking is refused")


def reading(bench, step, server, page):
    assert state(bench, page)["status"] == "unread"
    server.read("Hello\nworld")
    read = bench.ok("recognise", page, {"background": True})
    assert read["text"] == "Hello\nworld" and read["status"] == "current" and read["model"] == "llava" and not read["hand"], read
    asked = server.asked()
    assert len(asked) == 1 and asked[0]["model"] == "llava", asked
    assert "image_url" in str(asked[0]["messages"]), "the model is shown the ink as a picture"
    assert state(bench, page)["text"] == "Hello\nworld"
    bench.ok("recognise", page, {"background": True})
    assert len(server.asked()) == 1, "ink read already isn't sent again"
    step("the pen resting has the page's ink read by the AI server, kept with the strokes it came from")

    bench.ok("ink", page, strokes.batch(strokes.line(10, 40)))
    assert state(bench, page)["status"] == "changed" and state(bench, page)["text"] == "Hello\nworld"
    server.read("Hello\nworld\nagain")
    assert bench.ok("recognise", page, {"background": True})["text"] == "Hello\nworld\nagain"
    server.read("Hullo\nworld\nagain")
    assert bench.ok("recognise", page, {"again": True})["text"] == "Hullo\nworld\nagain"
    assert len(server.asked()) == 3
    step("when the ink changes the text is behind it until it is read again; it can be read anew on request")


def correcting(bench, step, server, page):
    fixed = bench.ok("correctRecognised", page, "Hello\nworld\nagain")
    assert fixed["hand"] and fixed["status"] == "current" and fixed["text"] == "Hello\nworld\nagain", fixed
    bench.ok("ink", page, strokes.batch(strokes.line(10, 50)))
    told = bench.ok("recognise", page, {"background": True})
    assert told["status"] == "changed" and told["hand"] and "corrected this by hand" in told["why"], told
    assert told["text"] == "Hello\nworld\nagain" and len(server.asked()) == 3, "the person's words aren't written over unasked"
    server.read("Hello\nworld\nagain\nmore")
    replaced = bench.ok("recognise", page, {})
    assert replaced["text"].endswith("more") and not replaced["hand"], replaced
    step("words corrected by hand are kept, and stay when the ink changes until the person asks for it to be read again")


def turning_into_text(bench, step, server, page):
    lying = bench.ok("strokeBounds", page)
    first = [key for key, box in lying.items() if abs(box["y"] - 20) < 1][0]
    box = lying[first]
    assert abs(box["x"] - 9.75) < 0.2 and abs(box["width"] - 30.5) < 0.2, box
    server.read("Hello")
    picked = bench.ok("recognise", page, {"strokes": [first]})
    assert picked["text"] == "Hello" and picked["strokes"] == [first], picked
    assert state(bench, page)["text"].endswith("more"), "a selection's words aren't the page's"
    assert "choose it again" in bench.refused("recognise", page, {"strokes": ["gone"]})
    step("a selection of the ink is read on its own, by where its strokes lie, without changing the page's text")

    before = len(bench.ok("strokes", page))
    made = bench.ok("recognisedToText", page, {"text": picked["text"], "strokes": [first], "replace": True})
    blocks = [one for one in bench.ok("content", page)["items"] if one["id"] == made["block"]]
    assert blocks and blocks[0]["text"] == "Hello" and blocks[0]["format"] == "plain", blocks
    assert abs(blocks[0]["x"] - box["x"]) < 0.5 and made["strokes"] == before - 1 and first not in bench.ok("strokes", page)
    whole = bench.ok("recognisedToText", page, {})
    assert [one["text"] for one in bench.ok("content", page)["items"] if one["id"] == whole["block"]] == [state(bench, page)["text"]]
    assert len(bench.ok("strokes", page)) == before - 1, "the ink stays unless the person asks for it to go"
    step("recognised words become a text block where the ink lies, in place of the ink when the person wants")


def private(bench, step, server, notebook, page):
    serve(bench, HOSTED, hosted=True)
    assert "only where you chose it" in bench.refused("recognise", page, {"again": True})
    serve(bench, HOSTED, hosted=False)
    chosen = bench.ok("setNotebookRecognition", notebook, {"hosted": True, "language": "en"})
    assert chosen["hosted"] is True and chosen["language"] == "en", chosen
    assert "unless you allow hosted servers" in bench.refused("recognise", page, {"again": True})
    assert state(bench, page)["hosted"] is True
    bench.ok("setNotebookRecognition", notebook, {"hosted": False})
    loose = bench.ok("makeLooseNote", {})
    bench.ok("ink", loose, strokes.batch(strokes.line(5, 5)))
    serve(bench, HOSTED, hosted=True)
    assert "only where you chose it" in bench.refused("recognise", loose, {})
    assert len(server.asked()) == 5, "nothing went anywhere else"
    bench.ok("removePage", loose)
    step("a hosted server reads handwriting only when the settings allow it and the notebook chose it; a loose note never")


def failing(bench, step, server, page):
    serve(bench, server.url)
    bench.ok("ink", page, strokes.batch(strokes.line(10, 60)))
    server.replies.append((500, {"error": {"message": "out of memory"}}))
    told = bench.ok("recognise", page, {"background": True})
    assert told["status"] == "failed" and "out of memory" in told["why"] and told["text"].endswith("more"), told
    server.replies.append((500, {"error": {"message": "out of memory"}}))
    assert "answered: out of memory" in bench.refused("recognise", page, {})
    step("a server's failure is said in plain words, in the page's state when the pen rested, and nothing is lost")


def check(bench, step):
    server = FakeServer()
    try:
        made = bench.ok("makeNotebook", "Handwriting", {"kind": "lined", "size": "A5"})
        page = bench.ok("notebooks")["notebooks"][-1]["pages"][0]["id"]
        assert state(bench, page)["status"] == "empty"
        bench.ok("ink", page, strokes.batch(strokes.line(10, 20), strokes.line(10, 30)))
        without_a_server(bench, step, page)
        serve(bench, server.url)
        reading(bench, step, server, page)
        correcting(bench, step, server, page)
        turning_into_text(bench, step, server, page)
        private(bench, step, server, made["notebook"], page)
        failing(bench, step, server, page)
        bench.ok("removeNotebook", made["notebook"])
    finally:
        server.close()
        bench.configure(ai_provider=None, ai_endpoint=None, recognition=None)
