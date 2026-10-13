"""Liest ein Foto einer Bowling-Anzeige per lokalem Vision-LLM (Ollama) aus und schreibt out.json."""

import base64
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from typing import NamedTuple

from bowling import matches_scores, parse_symbols, repair, running_scores

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL = os.environ.get("MODEL", "qwen2.5vl:7b")
MAX_ATTEMPTS = int(os.environ.get("MAX_ATTEMPTS", "3"))
INPUT = os.environ.get("INPUT", "/data/input.jpg")
OUTPUT = os.environ.get("OUTPUT", "/out/out.json")

PROMPT = """This is a photo of a bowling alley score display.
Read the scoreboard that is fully visible. Ignore other screens that are cut off at the image border.

Every player has two lines:
- upper line: the roll symbols, left to right
- lower line: the running totals (numbers), left to right

Roll symbols: "X" = strike, "/" = spare, "-" = zero pins, digits = pins knocked down.
A digit drawn inside a small box (split marker) is just that digit.

For each player (top to bottom) return:
- "name": the player name
- "rolls": all roll symbols of the upper line in order, separated by single spaces (e.g. "X 3 / 6 3 - 7")
- "scores": all numbers of the lower line in order
Only transcribe what is displayed, do not calculate anything."""

SCHEMA = {
    "type": "object",
    "properties": {
        "players": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "rolls": {"type": "string"},
                    "scores": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["name", "rolls", "scores"],
            },
        }
    },
    "required": ["players"],
}


def log(msg: str) -> None:
    print(f"[parser] {msg}", file=sys.stderr, flush=True)


def api(path: str, payload: dict | None = None, timeout: float = 30):
    req = urllib.request.Request(
        OLLAMA_URL + path,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={"Content-Type": "application/json"},
    )
    return urllib.request.urlopen(req, timeout=timeout)


def ensure_model() -> None:
    with api("/api/tags") as r:
        names = {m["name"] for m in json.load(r)["models"]}
    if MODEL in names or f"{MODEL}:latest" in names:
        return
    log(f"Lade Modell {MODEL} herunter (einmalig, kann dauern) ...")
    last = 0.0
    with api("/api/pull", {"model": MODEL, "stream": True}, timeout=3600) as r:
        for line in r:
            status = json.loads(line)
            if "error" in status:
                raise RuntimeError(status["error"])
            if time.time() - last > 10 and status.get("total"):
                pct = 100 * status.get("completed", 0) / status["total"]
                log(f"  {status['status']}: {pct:.0f}%")
                last = time.time()
    log("Modell bereit.")


def ask_model(image_b64: str, temperature: float) -> dict:
    payload = {
        "model": MODEL,
        "stream": False,
        "format": SCHEMA,
        "options": {"temperature": temperature, "num_ctx": 8192},
        "messages": [{"role": "user", "content": PROMPT, "images": [image_b64]}],
    }
    with api("/api/chat", payload, timeout=1800) as r:
        return json.loads(json.load(r)["message"]["content"])


class PlayerResult(NamedTuple):
    name: str
    frames: list[list[int]] | None  # None = Transkription nicht verwertbar
    problems: list[str]
    scores: list[int]  # vom Modell gelesene Zwischenstände

    def rank(self) -> tuple[bool, int]:
        """Kleiner = besser: erst verwertbare Frames, dann wenige Abweichungen."""
        return (self.frames is None, len(self.problems))


def check_player(p: dict) -> PlayerResult:
    """Teilt die Transkription eines Spielers in Frames auf und prüft sie gegen die
    angezeigten Zwischenstände; korrigiert sie wenn möglich eindeutig."""
    name = p["name"].strip()
    shown = p["scores"]
    try:
        frames, error = parse_symbols(p["rolls"]), None
    except ValueError as e:
        frames, error = None, str(e)
    if frames is not None and matches_scores(frames, shown):
        return PlayerResult(name, frames, [], shown)

    fixed = repair(p["rolls"], shown)
    if fixed is not None:
        log(f"  {name}: Transkription korrigiert (eindeutig über Zwischenstände)")
        return PlayerResult(name, fixed, [], shown)
    if frames is None:
        return PlayerResult(name, None, [f"{name}: {error}"], shown)

    problems = []
    computed = running_scores(frames)
    if len(shown) > len(computed):
        problems.append(f"{name}: {len(shown)} Zwischenstände, aber nur {len(computed)} Frames")
    for i, (s, calc) in enumerate(zip(shown, computed), 1):
        if s != calc:
            problems.append(f"{name}: Frame {i} angezeigt {s}, berechnet {calc}")
    return PlayerResult(name, frames, problems, shown)


def format_json(data: dict) -> str:
    """Wie json.dumps(indent=2), aber jeder Frame in einer Zeile: [9, 1]."""
    text = json.dumps(data, ensure_ascii=False, indent=2)
    return re.sub(r"\[\s+(\d+(?:,\s+\d+)*)\s+\]",
                  lambda m: "[" + ", ".join(re.findall(r"\d+", m.group(1))) + "]", text)


class ParseError(Exception):
    pass


def parse_image(image_b64: str) -> tuple[dict, list[str], list[list[int]]]:
    """Liest das Bild bis zu MAX_ATTEMPTS-mal aus und übernimmt für jeden Spieler die beste
    Transkription aus allen Versuchen. Liefert das Ergebnis und die verbliebenen
    Abweichungen (leer = alle Zwischenstände stimmen) sowie die gelesenen Zwischenstände
    pro Spieler (gleiche Reihenfolge wie result["players"])."""
    ensure_model()

    best: list[PlayerResult] | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        temperature = 0.0 if attempt == 1 else 0.5
        log(f"Versuch {attempt}/{MAX_ATTEMPTS} mit {MODEL} (temperature={temperature}) ...")
        start = time.time()
        try:
            raw = ask_model(image_b64, temperature)
            log(f"  Antwort nach {time.time() - start:.0f}s: {json.dumps(raw, ensure_ascii=False)}")
            players = [check_player(p) for p in raw["players"]]
        except (KeyError, TypeError, AttributeError, json.JSONDecodeError) as e:
            log(f"  Unbrauchbare Antwort: {e!r}")
            continue
        if not players:
            log("  Keine Spieler erkannt.")
            continue

        # Spieler werden über ihre Position zugeordnet, Namen können zwischen Versuchen abweichen
        if best is None:
            best = players
        elif len(players) != len(best):
            log(f"  {len(players)} statt {len(best)} Spieler erkannt, Versuch wird nicht übernommen.")
        else:
            best = [new if new.rank() < old.rank() else old for old, new in zip(best, players)]

        open_problems = [p for r in best for p in r.problems]
        if not open_problems:
            log("  Alle Zwischenstände stimmen.")
            break
        for p in open_problems:
            log(f"  Offen: {p}")

    if best is None:
        raise ParseError("Kein verwertbares Ergebnis vom Modell")
    usable = [r for r in best if r.frames is not None]
    result = {"players": [{"name": r.name, "frames": r.frames} for r in usable]}
    return result, [p for r in best for p in r.problems], [r.scores for r in usable]


def main() -> int:
    if not os.path.isfile(INPUT):
        log(f"Kein Bild gefunden unter {INPUT} (IMAGE=... setzen)")
        return 1
    with open(INPUT, "rb") as fh:
        image_b64 = base64.b64encode(fh.read()).decode()

    try:
        result, problems, _ = parse_image(image_b64)
    except ParseError as e:
        log(str(e))
        return 1

    with open(OUTPUT, "w", encoding="utf-8") as fh:
        fh.write(format_json(result) + "\n")
    log(f"Geschrieben: {OUTPUT}")
    if problems:
        log("WARNUNG: Ergebnis passt nicht vollständig zu den angezeigten Zwischenständen.")
        return 2
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.URLError as e:
        log(f"Ollama nicht erreichbar: {e}")
        sys.exit(1)
