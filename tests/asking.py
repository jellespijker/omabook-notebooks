"""The AI reading a notebook (#9): a question about it, or a summary, answered by the model Omabook's
settings chose (a stand-in server on this computer, fakeserver.py), from the notebook's own words alone.

Nothing is sent with the AI off, nor for a notebook the person didn't let the AI read; what was said while
writing goes only when its recordings may go too; and of a book the notebook refers to, only the passages up
to where the person has read are told, never what lies further on.
"""

import references


def chats(server):
    return [one for one in server.asked() if any(m.get("role") == "system" for m in one.get("messages", []))]


def refusing(bench, step, server, made):
    before = len(server.asked())
    assert "private" in bench.refused("askNotebook", made["notebook"], "What did I write about tides?")
    bench.ok("setNotebookReading", made["notebook"], True)
    bench.configure(ai_provider="off")
    assert "no AI to ask" in bench.refused("askNotebook", made["notebook"], "What did I write about tides?")
    assert "alone" in bench.refused("askNotebook", "", "anything")
    assert len(server.asked()) == before, "nothing was sent"
    step("a private notebook, or any with the AI off, is never sent; asking says why in plain words")


def answering(bench, step, server, made):
    from exports import serve

    serve(bench, server.url)
    server.answer("You wrote that the sea rises twice a day (page 1).")
    told = bench.ok("askNotebook", made["notebook"], "What did I write about tides?")
    assert told == {"answer": "You wrote that the sea rises twice a day (page 1).", "pages": 2, "cut": False, "said": False}, told
    sent = chats(server)[-1]
    system = sent["messages"][0]["content"]
    asked = sent["messages"][1]["content"]
    assert sent["model"] == "chat-model" and "notebook alone" in system, sent
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


def check(bench, step, made, server):
    try:
        refusing(bench, step, server, made)
        answering(bench, step, server, made)
    finally:
        server.close()
        bench.ok("removeNotebook", made["notebook"])
        bench.configure(ai_provider=None, ai_endpoint=None, ai_models=None, recognition=None)
