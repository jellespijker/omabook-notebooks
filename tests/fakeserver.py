"""A stand-in for an AI server, as Omabook's own tests have one (tests/fakeaiserver.h): a server of
the OpenAI-compatible API on this computer, which answers each request with the next reply in its
queue and keeps what it was sent. The scratch library's config.json is pointed at it, so
handwriting is "recognised" here and never leaves the computer.

With `ollama` set ({model: what it does}), it is an Ollama server too, as Omabook's tests/fakeollama.h is:
it lists its models (/api/tags), says what each does (/api/show), downloads one (/api/pull, in steps),
and refuses a chat with a model it hasn't, as Ollama does. None of that takes a reply from the queue.
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class FakeServer:
    def __init__(self):
        self.replies = []
        self.received = []
        self.lock = threading.Lock()
        self.ollama = None
        server = self

        class Handler(BaseHTTPRequestHandler):
            def answer(self):
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length) if length else b""
                with server.lock:
                    server.received.append({"line": f"{self.command} {self.path}", "body": body})
                    own = server.as_ollama(self.path, body)
                    if own is not None:
                        status, reply = own
                    else:
                        status, reply = server.replies.pop(0) if server.replies else (500, {"error": {"message": "nothing queued"}})
                # A chat answer comes as server-sent events, as a server streams it (answer()).
                streamed = isinstance(reply, bytes)
                data = reply if streamed else json.dumps(reply).encode()
                self.send_response(status)
                self.send_header("Content-Type", "text/event-stream" if streamed else "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(data)

            do_GET = answer
            do_POST = answer

            def log_message(self, *_):
                pass

        self.http = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.http.serve_forever, daemon=True)
        self.thread.start()

    def as_ollama(self, path, body):
        """What Ollama answers itself, by the path: None for what the queue answers."""
        if self.ollama is None:
            return None
        asked = json.loads(body) if body else {}
        if path == "/api/tags":
            models = [{"name": name, "size": 1_000_000, "details": {"family": name.split(":")[0]}} for name in self.ollama]
            return 200, {"models": models}
        if path == "/api/show":
            known = asked.get("model") in self.ollama
            return (200, {"capabilities": self.ollama[asked["model"]]}) if known else (404, {"error": "not found"})
        if path == "/api/pull":
            self.ollama[asked["model"]] = ["completion", "vision"]
            steps = [{"status": "pulling", "total": 100, "completed": done} for done in (0, 50, 100)] + [{"status": "success"}]
            return 200, "".join(json.dumps(one) + "\n" for one in steps).encode()
        if path.endswith("/chat/completions") and asked.get("model") not in self.ollama:
            return 404, {"error": {"message": f'model "{asked.get("model")}" not found, try pulling it first'}}
        return None

    @property
    def url(self):
        return f"http://127.0.0.1:{self.http.server_address[1]}/v1"

    def read(self, text, model="llava"):
        """Queues what the vision model 'reads' in the next picture of ink it is shown."""
        with self.lock:
            self.replies.append((200, {"model": model, "choices": [{"message": {"role": "assistant", "content": text}}]}))

    def answer(self, text, model="chat-model"):
        """Queues the next answer to a chat, streamed in two pieces as `data:` events and `[DONE]`."""
        half = len(text) // 2
        events = [{"model": model, "choices": [{"delta": {"content": piece}}]} for piece in (text[:half], text[half:])]
        body = "".join(f"data: {json.dumps(one)}\n\n" for one in events) + "data: [DONE]\n\n"
        with self.lock:
            self.replies.append((200, body.encode()))

    def hear(self, words, model="whisper-1"):
        """Queues what the transcription endpoint 'hears' in the next recording: words of (text, start s, end s),
        answered as verbose_json is, with segments split at each word that ends a sentence."""
        segments, words_out, open_at = [], [], 0
        for at, (text, start, end) in enumerate(words):
            words_out.append({"word": text, "start": start, "end": end})
            if text.endswith((".", "?", "!")) or at == len(words) - 1:
                said = " ".join(one[0] for one in words[open_at : at + 1])
                segments.append({"start": words[open_at][1], "end": end, "text": " " + said})
                open_at = at + 1
        reply = {"text": " " + " ".join(one[0] for one in words), "language": "english", "segments": segments, "words": words_out}
        with self.lock:
            self.replies.append((200, reply))

    def asked(self):
        """The chat requests it was sent, as JSON."""
        with self.lock:
            return [
                json.loads(one["body"])
                for one in self.received
                if one["line"].startswith("POST") and one["body"] and "/audio/" not in one["line"] and "/api/" not in one["line"]
            ]

    def transcriptions(self):
        """The recordings it was sent to transcribe: each request's form, as bytes."""
        with self.lock:
            return [one["body"] for one in self.received if one["line"].startswith("POST") and "/audio/transcriptions" in one["line"]]

    def pulled(self):
        """The models it was asked to download, by name."""
        with self.lock:
            return [json.loads(one["body"])["model"] for one in self.received if one["line"] == "POST /api/pull"]

    def close(self):
        self.http.shutdown()
        self.http.server_close()
