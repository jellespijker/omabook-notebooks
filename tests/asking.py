"""The AI reading a notebook (#9): a question about it, or a summary, answered by the model Omabook's
settings chose (a stand-in server on this computer, fakeserver.py), from the notebook's own words alone.

Whether that model is the person's own or someone else's is Omabook's to say (`ai.status`, #11): a model
that runs elsewhere (`...:cloud`) stands for a hosted one here. Nothing is sent with the AI off, nor to a
hosted model for a notebook the person didn't let it read; what was said while writing goes to a hosted
model only when its recordings may go too; their own model reads it all. Of a book the notebook refers to,
only the passages up to where the person has read are told, never what lies further on.
"""

import references
from exports import serve


def serve_hosted(bench, url):
    """The stand-in server, with a main model that runs elsewhere: someone else's computer, as Omabook sees it."""
    serve(bench, url)
    bench.configure(ai_models={"openai:" + url: {"main": "chat-model:cloud", "quick": "chat-model"}})


def chats(server):
    return [one for one in server.asked() if any(m.get("role") == "system" for m in one.get("messages", []))]


def refusing(bench, step, server, made):
    serve_hosted(bench, server.url)
    before = len(server.asked())
    reach = bench.ok("askReach", made["notebook"])
    assert reach["available"] is False and reach["why"] == "hosted-not-chosen" and "private" in reach["message"], reach
    assert "private" in bench.refused("askNotebook", made["notebook"], "What did I write about tides?")
    bench.ok("setNotebookReading", made["notebook"], True)
    assert bench.ok("askReach", made["notebook"])["available"] is True
    bench.configure(ai_provider="off")
    assert "no AI to ask" in bench.refused("askNotebook", made["notebook"], "What did I write about tides?")
    assert bench.ok("askReach", made["notebook"])["why"] == "ai-off"
    assert "alone" in bench.refused("askNotebook", "", "anything")
    assert len(server.asked()) == before, "nothing was sent"
    step("a private notebook is never sent to a hosted AI, nor any with the AI off; asking says why in plain words")


def answering(bench, step, server, made):
    serve_hosted(bench, server.url)
    server.answer("You wrote that the sea rises twice a day (page 1).")
    told = bench.ok("askNotebook", made["notebook"], "What did I write about tides?")
    expected = {"answer": "You wrote that the sea rises twice a day (page 1).", "pages": 2, "cut": False, "said": False, "hosted": True}
    assert told == expected, told
    sent = chats(server)[-1]
    system = sent["messages"][0]["content"]
    asked = sent["messages"][1]["content"]
    assert sent["model"] == "chat-model:cloud" and "notebook alone" in system, sent
    assert asked.startswith("What did I write about tides?") and "## Page 1" in asked and "The **sea** rises" in asked, asked
    assert "Handwriting: Gulls over the harbour" in asked and references.QUOTE in asked, asked
    assert "Kelsier" not in asked, "what was said goes only when the notebook's recordings may"
    assert "lighthouse" not in asked and "The island" not in asked and "past where they have read to" in asked, asked
    assert "Morning came grey" not in asked, "nothing of the book but the passages referred to"
    step("a question is answered from the notebook's words, and of its books only what the person has read to")

    bench.ok("setNotebookRecognition", made["notebook"], {"speechHosted": True})
    server.answer("<b>Tides</b> and gulls; a crossing.")
    summary = bench.ok("askNotebook", made["notebook"], "", {"pages": [made["pages"][1]]})
    assert summary["answer"] == "Tides and gulls; a crossing." and summary["pages"] == 1 and summary["said"], summary
    asked = chats(server)[-1]["messages"][1]["content"]
    assert asked.startswith("Summarise") and "Kelsier pushes steel." in asked and "Gulls" not in asked, asked
    step("with nothing asked it summarises the pages chosen, what was said too once allowed; HTML is taken out of the answer")

    server.replies.append((500, {"error": {"message": "out of memory"}}))
    assert "couldn't answer" in bench.refused("askNotebook", made["notebook"], "anything")
    bench.ok("setNotebookReading", made["notebook"], False)
    before = len(server.asked())
    assert "private" in bench.refused("askNotebook", made["notebook"], "anything") and len(server.asked()) == before
    step("a server's failure is said in plain words; taken back, the notebook is private again")


def own(bench, step, server, made):
    """The person's own model (the stand-in server, on this computer) reads a notebook not let go, all of it."""
    serve(bench, server.url)
    bench.ok("setNotebookRecognition", made["notebook"], {"hosted": False, "speechHosted": False})
    reach = bench.ok("askReach", made["notebook"])
    assert reach["available"] is True and reach["hosted"] is False and reach["speech"] is True, reach
    server.answer("Tides, gulls and steel.")
    told = bench.ok("askNotebook", made["notebook"], "What happened?")
    assert told["answer"] == "Tides, gulls and steel." and told["said"] is True and told["hosted"] is False, told
    sent = chats(server)[-1]
    assert sent["model"] == "chat-model" and "Kelsier pushes steel." in sent["messages"][1]["content"], sent
    step("the person's own AI reads a private notebook, and what was said in it: nothing goes to anyone else's")


def check(bench, step, made, server):
    try:
        refusing(bench, step, server, made)
        answering(bench, step, server, made)
        own(bench, step, server, made)
    finally:
        server.close()
        bench.ok("removeNotebook", made["notebook"])
        bench.configure(ai_provider=None, ai_endpoint=None, ai_models=None, recognition=None)
