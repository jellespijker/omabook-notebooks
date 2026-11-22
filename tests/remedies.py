"""A model missing for handwriting (#16): where the server lacks the model a page is to be read with, the
page's state says what Omabook offers (jellespijker/omabook#172): a model already on the server that reads
pictures, or a small one to download onto it; once the person presses for it, it is chosen and the page is
read again with it.

The server is the stand-in on this computer (fakeserver.py), here an Ollama server too, as in Omabook's own
tests: it lists its models, says what each does, and "downloads" one. An Omabook before 0.4.0 has no
`ai.remedy`, and these steps are skipped there: the page says why, as it always did.
"""

import json
import os

import strokes
from fakeserver import FakeServer


def serve(bench, url, model):
    bench.configure(
        ai_provider="openai", ai_endpoint={"preset": "custom", "base_url": url}, recognition={"ink_model": model, "hosted": False}
    )


def chosen(bench):
    with open(os.path.join(bench.config, "omabook", "config.json")) as file:
        return json.load(file)["recognition"]["ink_model"]


def using(bench, step, server, page):
    server.ollama = {"qwen3.8:27b": ["completion"], "gemma4:e2b": ["completion", "vision"]}
    serve(bench, server.url, "llava")
    told = bench.ok("recognise", page, {"background": True})
    assert told["status"] == "failed" and "llava" in told["why"], told
    offered = told["remedy"]
    assert offered and offered["action"] == "use" and offered["model"] == "gemma4:e2b", told
    assert offered["server"] == server.url.split("/")[2], offered
    step("a page the server has no model for says so, with the model on it that reads pictures, to use instead")

    server.read("Hello again", model="gemma4:e2b")
    read = bench.ok("mendRecognition", page)
    assert read["status"] == "current" and read["text"] == "Hello again" and read["remedy"] is None, read
    assert chosen(bench) == "gemma4:e2b" and server.asked()[-1]["model"] == "gemma4:e2b"
    step("pressing for it chooses that model for handwriting, and the page is read again with it")


def downloading(bench, step, server, page):
    server.ollama = {"qwen3.8:27b": ["completion"]}
    serve(bench, server.url, "llava")
    bench.ok("ink", page, strokes.batch(strokes.line(17, 77)))
    told = bench.ok("recognise", page, {"background": True})
    offered = told["remedy"]
    assert told["status"] == "failed" and offered and offered["action"] == "download" and offered["size"] > 0, told
    assert bench.ok("mending", "handwriting") == -1, "nothing is downloaded unasked"
    assert server.pulled() == []
    step("with nothing on the server that reads pictures, a small model to download onto it is offered, with its size")

    server.read("Downloaded", model=offered["model"])
    read = bench.ok("mendRecognition", page)
    assert server.pulled() == [offered["model"]] and chosen(bench) == offered["model"], server.pulled()
    assert read["status"] == "current" and read["text"] == "Downloaded", read
    step("pressing for it downloads that model onto the server, chooses it, and reads the page with it")


def check(bench, step):
    if "ai.remedy" not in bench.omabook("plugin", "api").stdout:
        return
    server = FakeServer()
    try:
        made = bench.ok("makeNotebook", "Missing model", {"kind": "lined", "size": "A5"})
        page = bench.ok("notebooks")["notebooks"][-1]["pages"][0]["id"]
        bench.ok("ink", page, strokes.batch(strokes.line(17, 23)))  # ink Omabook has read before is never sent again
        using(bench, step, server, page)
        downloading(bench, step, server, page)
        bench.ok("removeNotebook", made["notebook"])
    finally:
        server.close()
        bench.configure(ai_provider=None, ai_endpoint=None, recognition=None)
