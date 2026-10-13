"""HTTP-Dienst um den Parser: POST /parse mit den Bild-Bytes als Body.

Antwort 200: {"status": "ok" | "uncertain", "result": {...}, "problems": [...]}
Antwort 4xx/5xx: {"error": "..."}
Nimmt Anfragen parallel an (damit /health auch während eines Laufs antwortet), lässt aber nur
einen Parse-Auftrag gleichzeitig ans Modell. Die Warteschlange liegt beim Aufrufer.
"""

import base64
import json
import os
import signal
import sys
import threading
import urllib.error
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from parse import ParseError, log, parse_image

PORT = int(os.environ.get("PORT", "8080"))
MAX_BYTES = 20 * 1024 * 1024
PARSE_LOCK = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def send_json(self, code: int, data: dict) -> None:
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            # Aufrufer hat aufgegeben (z. B. App-Neustart während eines Laufs)
            log("Antwort verworfen: Aufrufer hat die Verbindung bereits geschlossen")

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_json(200, {"ok": True})
        else:
            self.send_json(404, {"error": "Nicht gefunden"})

    def do_POST(self) -> None:
        if self.path != "/parse":
            self.send_json(404, {"error": "Nicht gefunden"})
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            self.send_json(400, {"error": "Kein Bild im Body"})
            return
        if length > MAX_BYTES:
            self.send_json(413, {"error": "Bild zu groß"})
            return
        image_b64 = base64.b64encode(self.rfile.read(length)).decode()
        try:
            with PARSE_LOCK:
                result, problems = parse_image(image_b64)
        except ParseError as e:
            self.send_json(422, {"error": str(e)})
            return
        except urllib.error.URLError as e:
            self.send_json(502, {"error": f"Ollama nicht erreichbar: {e}"})
            return
        except Exception as e:  # noqa: BLE001 – Fehler an den Aufrufer melden statt abstürzen
            log(f"Unerwarteter Fehler: {e!r}")
            self.send_json(500, {"error": f"Interner Fehler: {e}"})
            return
        self.send_json(200, {
            "status": "uncertain" if problems else "ok",
            "result": result,
            "problems": problems,
        })

    def log_message(self, fmt: str, *args) -> None:
        if self.path != "/health":
            log(fmt % args)


if __name__ == "__main__":
    # Als PID 1 im Container ignoriert Python SIGTERM sonst, docker stop würde 10 s warten
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    log(f"Parser-Dienst lauscht auf Port {PORT}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
