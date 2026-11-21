"""A stand-in for an AI server, as Omabook's own tests have one (tests/fakeaiserver.h): a server of
the OpenAI-compatible API on this computer, which answers each request with the next reply in its
queue and keeps what it was sent. The scratch library's config.json is pointed at it, so
handwriting is "recognised" here and never leaves the computer.
"""

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class FakeServer:
    def __init__(self):
        self.replies = []
        self.received = []
        self.lock = threading.Lock()
        server = self

        class Handler(BaseHTTPRequestHandler):
            def answer(self):
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length) if length else b""
                with server.lock:
                    server.received.append({"line": f"{self.command} {self.path}", "body": body})
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
                if one["line"].startswith("POST") and one["body"] and "/audio/" not in one["line"]
            ]

    def transcriptions(self):
        """The recordings it was sent to transcribe: each request's form, as bytes."""
        with self.lock:
            return [one["body"] for one in self.received if one["line"].startswith("POST") and "/audio/transcriptions" in one["line"]]

    def close(self):
        self.http.shutdown()
        self.http.server_close()
