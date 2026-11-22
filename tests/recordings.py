"""Recordings tied to the ink, with transcripts (#5): a recording kept on its page with the moment in
it of each stroke written while it ran, the ink under a point found at its moment, the transcript
heard by a stand-in transcription server, nothing sent to a hosted one unless chosen, and the
recording taken to another computer with the plugin's data/ folder at a sync.

From a command line nobody can say yes to the microphone, so recording itself is refused here, as
it must be; a recording comes in as the recorder leaves it, an Opus file under data/recordings/
(opus.py), kept with the recorder's summary, which is what the plugin does when a recording stops.
"""

import os
import shutil
from datetime import UTC, datetime

import opus
import strokes
from bench import Bench, not_chosen
from fakeserver import FakeServer

HOSTED = "https://hosted.invalid/v1"
STARTED = "2026-11-21T09:00:00.000Z"
T0 = int(datetime(2026, 11, 21, 9, 0, tzinfo=UTC).timestamp() * 1000)
# Recorded for ten seconds, paused for ten, and on for fifty more: a minute of sound.
PARTS = [{"at": 0, "started": STARTED}, {"at": 10_000, "started": "2026-11-21T09:00:20.000Z"}]
NO_WHISPER = "/nonexistent/whisper-cli"
NO_VOXTYPE = "/nonexistent/voxtype"
# voxtype's command, standing in as Omabook's own tests have it: what it does, then the text after an
# empty line, with no moment for any word. And ffmpeg's, which makes the recording the WAV voxtype reads.
VOXTYPE = 'echo "Loading audio file"\necho\necho "Good morning, from voxtype."\n'
FFMPEG = 'for last; do :; done\nprintf RIFF > "$last"\n'


def serve(bench, url, hosted=False):
    bench.configure(
        ai_provider="openai",
        ai_endpoint={"preset": "custom", "base_url": url},
        recognition={"whisper_program": NO_WHISPER, "voxtype_program": NO_VOXTYPE, "hosted": hosted},
    )


def stand_in(bench, name, script):
    """A program on the PATH for a step alone: in a folder of its own, gone after it."""
    folder = os.path.join(bench.scratch, "speech")
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, name)
    with open(path, "w") as file:
        file.write("#!/bin/sh\n" + script)
    os.chmod(path, 0o755)
    return path


def put(bench, name, data):
    folder = os.path.join(bench.plugin, "data", "recordings")
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, name), "wb") as file:
        file.write(data)
    return "data/recordings/" + name


def written(bench, page):
    """Strokes begun before, during, in the pause of, and after the recording: {when: id}."""
    moments = {"before": -1_000, "early": 2_000, "paused": 12_000, "after the pause": 25_000, "after": 75_000}
    ids = {}
    for at, (when, ms) in enumerate(moments.items()):
        one = strokes.batch(strokes.line(10, 20 + 10 * at, began=T0 + ms))
        bench.ok("ink", page, one)
        ids[when] = next(iter(one["add"]))
    return ids


def refusing(bench, step, page):
    assert "only in the window" in bench.refused("record", page)
    assert bench.ok("recording") is None and bench.ok("stopRecording") is None
    step("recording from a command line is refused in plain words: nobody is there to say yes to the microphone")


def keeping(bench, step, notebook, page, ids):
    file = put(bench, "rtest1.opus", opus.recording(STARTED, 60_000))
    recording = bench.ok("keepRecording", page, {"file": file, "started": STARTED, "parts": PARTS})
    line = bench.ok("recordings", page)
    assert [(one["id"], one["duration"], one["here"]) for one in line["recordings"]] == [(recording, 60_000, True)], line
    at = {when: line["moments"].get(ids[when], {}).get("at") for when in ids}
    assert at == {"before": None, "early": 2_000, "paused": 10_000, "after the pause": 15_000, "after": None}, at
    assert {one["recording"] for one in line["moments"].values()} == {recording}
    step("a recording is kept on its page, each stroke written while it ran stamped with its moment in it, a pause left out")

    found = bench.ok("momentAt", page, 20, 40)
    assert found == {"stroke": ids["paused"], "recording": recording, "at": 10_000}, found
    assert bench.ok("momentAt", page, 20, 20) is None and bench.ok("momentAt", page, 150, 150) is None
    assert "No ink there was written while recording" in bench.refused("playFrom", page, 150, 150)
    step("the ink under a point says when in the recording it was written, so a tap there plays from that moment")

    entry = bench.snapshot(notebook)["pages"][0]["recordings"][recording]
    assert entry == {"file": file, "started": STARTED, "duration": 60_000}, entry
    assert not any(file.endswith(".opus") for file in os.listdir(os.path.join(bench.plugin, "data", "notebooks")))
    step("the notebook's file names the recording, its moment and length; the sound stays in the plugin's data/")

    assert "an Opus file under data/recordings/" in bench.refused("keepRecording", page, {"file": "data/notes.txt"})
    assert "There is no recording" in bench.refused("keepRecording", page, {"file": "data/recordings/gone.opus"})
    assert bench.refused("keepRecording", page, {"file": put(bench, "bad.opus", b"not a recording")})
    os.remove(os.path.join(bench.plugin, "data", "recordings", "bad.opus"))
    assert "no such page" in bench.refused("keepRecording", "p-gone", {"file": file})
    step("what isn't a recording under data/recordings/, or for a page there isn't, is refused with a reason")
    return recording


def transcribing(bench, step, server, page, recording, book):
    serve(bench, HOSTED)
    told = bench.ok("transcript", recording)
    assert told["status"] == "unavailable" and told["why"].startswith("Recordings aren't transcribed here: "), told
    assert told["why"].endswith(" The recording is kept either way.") and "hosted.invalid is someone else's computer" in told["why"], told
    assert bench.ok("transcribe", recording, {"background": True})["status"] == "unavailable"
    assert "someone else's computer" in bench.refused("transcribe", recording, {})
    step("with no way of one's own to transcribe, the recording says why in Omabook's words, and asking is refused")

    serve(bench, server.url)
    assert bench.ok("transcript", recording)["status"] == "untranscribed"
    server.hear([("Kelsier", 1.5, 2.0), ("pushes", 2.1, 2.6), ("steel.", 2.7, 3.2), ("Then", 9.8, 10.2), ("lands.", 10.3, 11.0)])
    heard = bench.ok("transcribe", recording, {"background": True})
    assert heard["status"] == "current" and heard["text"] == "Kelsier pushes steel. Then lands.", heard
    assert [one["text"] for one in heard["segments"]] == ["Kelsier pushes steel.", "Then lands."], heard["segments"]
    assert heard["segments"][1]["words"][0] == ["Then", 9_800, 10_200] and heard["segments"][0]["start"] == 1_500, heard
    assert heard["timed"] is True, heard
    sent = server.transcriptions()
    assert len(sent) == 1 and b'filename="rtest1.opus"' in sent[0] and b"OggS" in sent[0], "the recording went as a file"
    bench.ok("transcribe", recording, {"background": True})
    assert len(server.transcriptions()) == 1, "a recording transcribed already isn't sent again"
    assert [one["id"] for one in bench.ok("transcripts", page)] == [recording]
    step("a recording is transcribed by the server, each word with its moment in milliseconds, and kept with it")

    text = bench.omabook("text", book, "--section", 0).stdout
    assert "Kelsier pushes steel." in text, text
    step("what was said is read with its page in the notebook's book, where search can find it")

    hits = [one for one in bench.ok("find", "then land") if one["kind"] == "transcript"]
    assert [(one["page"], one["recording"], one["at"], one["timed"]) for one in hits] == [(page, recording, 9_800, True)], hits
    step("find has what was said too, at the moment in the recording the words were said")


def private(bench, step, server, notebook, recording):
    serve(bench, HOSTED, hosted=True)
    assert not_chosen(bench.refused("transcribe", recording, {"again": True}))
    bench.ok("setNotebookRecognition", notebook, {"hosted": True})
    assert not_chosen(bench.refused("transcribe", recording, {"again": True})), "handwriting's choice isn't speech's"
    serve(bench, HOSTED, hosted=False)
    chosen = bench.ok("setNotebookRecognition", notebook, {"hosted": False, "speechHosted": True})
    assert chosen["speechHosted"] is True and chosen["hosted"] is False, chosen
    assert bench.ok("transcript", recording)["hosted"] is True
    assert "unless you allow hosted servers" in bench.refused("transcribe", recording, {"again": True})
    bench.ok("setNotebookRecognition", notebook, {"speechHosted": False})
    assert len(server.transcriptions()) == 1, "nothing went anywhere else"
    step("a hosted server hears a recording only when the settings allow it and the notebook chose it for speech")

    serve(bench, server.url)
    server.replies.append((500, {"error": {"message": "out of memory"}}))
    assert "out of memory" in bench.refused("transcribe", recording, {"again": True})
    told = bench.ok("transcript", recording)
    assert told["status"] == "current" and told["text"].startswith("Kelsier"), "what was heard before stays"
    step("a server's failure is said in plain words, and the transcript heard before stays")


def travelling(bench, step, page, recording):
    other = Bench()
    try:
        there = bench.reach(other)
        bench.omabook("sync", there)
        line = other.ok("recordings", page)
        assert [(one["id"], one["here"]) for one in line["recordings"]] == [(recording, True)], line
        mine = os.path.join(bench.plugin, "data", "recordings", "rtest1.opus")
        theirs = os.path.join(other.plugin, "data", "recordings", "rtest1.opus")
        with open(mine, "rb") as a, open(theirs, "rb") as b:
            assert a.read() == b.read()
        assert line["moments"] == bench.ok("recordings", page)["moments"]
        assert other.ok("transcript", recording)["text"] == "Kelsier pushes steel. Then lands."
        step("a recording, its ink's moments and its transcript reach one's other computer at a sync, the sound with them")

        bench.ok("removeRecording", recording)
        assert not os.path.exists(mine) and bench.ok("recordings", page)["recordings"] == []
        assert "no such recording" in bench.refused("transcript", recording)
        bench.omabook("sync", there)
        assert other.ok("recordings", page)["recordings"] == [] and not os.path.exists(theirs)
        step("a recording removed goes with its transcript and its sound, here and on the other computer")
    finally:
        shutil.rmtree(other.scratch, ignore_errors=True)


def untimed(bench, step, page, recording):
    """voxtype on this computer, first where nothing else was chosen (jellespijker/omabook#146), gives no moments."""
    voxtype = stand_in(bench, "voxtype", VOXTYPE)
    stand_in(bench, "ffmpeg", FFMPEG)
    path = bench.env["PATH"]
    bench.env["PATH"] = os.path.dirname(voxtype) + os.pathsep + path
    try:
        bench.configure(recognition={"voxtype_program": voxtype})
        heard = bench.ok("transcribe", recording, {})
        assert heard["status"] == "current" and heard["text"] == "Good morning, from voxtype." and heard["timed"] is False, heard
        assert [(one["start"], one["words"]) for one in heard["segments"]] == [(0, [])], heard["segments"]
        hits = [one for one in bench.ok("find", "morning") if one["kind"] == "transcript"]
        assert [(one["recording"], one["at"], one["timed"]) for one in hits] == [(recording, 0, False)], hits
        step("a transcript without each word's moment says so, and a word found in it plays from its sentence's start")
    finally:
        bench.env["PATH"] = path
        shutil.rmtree(os.path.dirname(voxtype), ignore_errors=True)


def check(bench, step):
    server = FakeServer()
    try:
        made = bench.ok("makeNotebook", "Lecture", {"kind": "lined", "size": "A4"})
        page = bench.ok("notebooks")["notebooks"][-1]["pages"][0]["id"]
        refusing(bench, step, page)
        ids = written(bench, page)
        recording = keeping(bench, step, made["notebook"], page, ids)
        transcribing(bench, step, server, page, recording, made["book"])
        private(bench, step, server, made["notebook"], recording)
        travelling(bench, step, page, recording)
        again = bench.ok("keepRecording", page, {"file": put(bench, "rtest2.opus", opus.recording(STARTED, 4_000))})
        assert bench.ok("recordings", page)["moments"][ids["early"]] == {"recording": again, "at": 2_000}
        moved = strokes.batch(strokes.line(50, 30, began=T0 + 2_000), remove=[ids["early"]])
        bench.ok("ink", page, moved)
        moments = bench.ok("recordings", page)["moments"]
        assert ids["early"] not in moments and moments[next(iter(moved["add"]))] == {"recording": again, "at": 2_000}, moments
        step("a stroke moved with the lasso keeps its moment in the recording, so it still plays what was said")
        untimed(bench, step, page, again)
        bench.ok("removeNotebook", made["notebook"])
        assert not os.path.exists(os.path.join(bench.plugin, "data", "recordings", "rtest2.opus"))
        step("a recording kept from its file alone is stamped from the moment it says; it goes when its notebook does")
    finally:
        server.close()
        bench.configure(ai_provider=None, ai_endpoint=None, recognition=None)
