"""Umrechnung der Anzeige-Symbole (X, /, -, Ziffern) in Pinzahlen und Punkteprüfung."""

from functools import lru_cache
from typing import NamedTuple


def symbols_to_rolls(symbols: str) -> list[int]:
    """'9/' -> [9, 1], 'X' -> [10], '-7' -> [0, 7], 'XX9' -> [10, 10, 9]."""
    rolls: list[int] = []
    for ch in symbols.replace(" ", "").upper():
        if ch == "X":
            rolls.append(10)
        elif ch == "/":
            if not rolls or rolls[-1] == 10:
                raise ValueError(f"Spare ohne vorherigen Wurf: {symbols!r}")
            rolls.append(10 - rolls[-1])
        elif ch in "-0":
            rolls.append(0)
        elif ch.isdigit():
            rolls.append(int(ch))
        else:
            raise ValueError(f"Unbekanntes Symbol {ch!r} in {symbols!r}")
    return rolls


def split_frames(rolls: list[int]) -> list[list[int]]:
    """Teilt eine Wurfliste nach Bowling-Regeln in Frames auf (Frame 10 nimmt den Rest)."""
    frames: list[list[int]] = []
    i = 0
    while i < len(rolls) and len(frames) < 9:
        if rolls[i] == 10:
            frames.append([10])
            i += 1
        else:
            frames.append(rolls[i:i + 2])
            i += 2
    if i < len(rolls):
        frames.append(rolls[i:])
    return frames


def validate_frames(frames: list[list[int]]) -> None:
    if len(frames) > 10:
        raise ValueError(f"{len(frames)} Frames, maximal 10 erlaubt")
    for i, f in enumerate(frames, 1):
        if not f:
            raise ValueError(f"Frame {i} ist leer")
        if any(r < 0 or r > 10 for r in f):
            raise ValueError(f"Frame {i}: ungültige Pinzahl {f}")
        if i < 10:
            if f[0] == 10 and len(f) != 1:
                raise ValueError(f"Frame {i}: Strike mit weiteren Würfen {f}")
            if len(f) > 2 or sum(f) > 10:
                raise ValueError(f"Frame {i}: ungültig {f}")
        else:
            if len(f) > 3:
                raise ValueError(f"Frame 10: zu viele Würfe {f}")
            if len(f) >= 2 and f[0] < 10 and f[0] + f[1] > 10:
                raise ValueError(f"Frame 10: ungültig {f}")
            if len(f) == 3 and f[0] + f[1] < 10:
                raise ValueError(f"Frame 10: dritter Wurf ohne Strike/Spare {f}")
        if i < len(frames) and i < 10 and f[0] != 10 and len(f) != 2:
            raise ValueError(f"Frame {i}: unvollständig, obwohl danach weitergespielt wurde")


def running_scores(frames: list[list[int]]) -> list[int]:
    """Kumulierte Punkte pro Frame; offene Boni zählen mit den bisher vorhandenen Würfen
    (so zeigt es auch die Anzeige während des Spiels an)."""
    flat = [r for f in frames for r in f]
    scores, total, pos = [], 0, 0
    for i, f in enumerate(frames):
        if i < 9 and f[0] == 10:
            frame_score = 10 + sum(flat[pos + 1:pos + 3])
        elif i < 9 and sum(f) == 10:
            frame_score = 10 + sum(flat[pos + 2:pos + 3])
        else:
            frame_score = sum(f)
        total += frame_score
        scores.append(total)
        pos += len(f)
    return scores


def parse_symbols(symbols: str) -> list[list[int]]:
    frames = split_frames(symbols_to_rolls(symbols))
    validate_frames(frames)
    return frames


def frames_to_symbols(frames: list[list[int]]) -> str:
    """Schreibweise der Anzeige: X = Strike, / = Spare, - = 0 (z. B. [[10], [7, 3]] -> 'X7/')."""
    out = []
    for frame in frames:
        open_pins = 0  # 0 = frisch aufgestellt, sonst noch stehende Pins nach dem ersten Wurf
        for roll in frame:
            if open_pins == 0:
                out.append("X" if roll == 10 else "-" if roll == 0 else str(roll))
                open_pins = 0 if roll == 10 else 10 - roll
            else:
                out.append("/" if roll == open_pins else "-" if roll == 0 else str(roll))
                open_pins = 0
    return "".join(out)


def frame_ok(rolls: list[int], i: int) -> bool:
    """Ob ein einzelner Frame (i = 0..9) nach den Regeln möglich ist, auch angefangen."""
    try:
        validate_frames([[10]] * i + [rolls])
    except ValueError:
        return False
    return True


def split_symbols(symbols: str) -> list[str]:
    """Teilt die gelesenen Symbole ohne Prüfung in Frame-Texte auf (X allein, sonst je zwei,
    Frame 10 nimmt den Rest) – auch wenn dabei Unsinn wie "98" herauskommt."""
    seq = symbols.replace(" ", "").upper()
    texts: list[str] = []
    i = 0
    while i < len(seq) and len(texts) < 9:
        n = 1 if seq[i] == "X" else 2
        texts.append(seq[i:i + n])
        i += n
    if i < len(seq):
        texts.append(seq[i:])
    return texts


class Solution(NamedTuple):
    frames: list[list[int]]
    unsure: list[int]  # Frame-Indizes (0-basiert), für die es gleich gute Alternativen gibt
    cost: float


# Kosten beim Abgleich mit der Lesung: das Modell lässt "-" gern weg, das kostet kaum etwas
MISSING_DASH = 0.2
EDIT = 1.0


@lru_cache(maxsize=None)
def _align(candidate: str, read: str) -> float:
    """Editierabstand zwischen den Symbolen eines Kandidaten-Frames und einem Stück der Lesung."""
    prev = [j * EDIT for j in range(len(read) + 1)]
    for a in candidate:
        skip = MISSING_DASH if a == "-" else EDIT
        cur = [prev[0] + skip]
        for j, b in enumerate(read, 1):
            cur.append(min(prev[j] + skip, cur[j - 1] + EDIT, prev[j - 1] + (0 if a == b else EDIT)))
        prev = cur
    return prev[-1]


@lru_cache(maxsize=None)
def _frame_options(i: int, last: bool) -> tuple[tuple[tuple[int, ...], str], ...]:
    """Alle möglichen Frames an Position i (0-basiert) mit ihren Anzeige-Symbolen.
    Der letzte gespielte Frame darf angefangen sein."""
    opts: set[tuple[int, ...]] = set()
    for a in range(11):
        for b in range(11):
            for c in range(11):
                for f in ((a,), (a, b), (a, b, c)):
                    if (last or len(f) > 1 or a == 10) and frame_ok(list(f), i):
                        opts.add(f)
    if not last:
        # Vor dem letzten Frame nur fertige Frames
        opts = {f for f in opts if f == (10,) or len(f) == 2} if i < 9 else opts
    return tuple((f, frames_to_symbols([list(f)])) for f in sorted(opts))


def _frame_score(frames: list[tuple[int, ...]], k: int, i: int) -> tuple[int, bool]:
    """Punkte von frames[k] (Spielframe i) samt Bonus aus den folgenden Frames der Liste,
    und ob der Bonus schon vollständig ist."""
    f = frames[k]
    need = 0 if i == 9 else 2 if f[0] == 10 else 1 if sum(f) == 10 else 0
    bonus = [r for g in frames[k + 1:] for r in g][:need]
    return sum(f) + sum(bonus), len(bonus) == need


def solve(symbols: str, shown: list[int]) -> Solution | None:
    """Rekonstruiert die Frames aus den angezeigten Zwischenständen: unter allen Frame-Folgen,
    die genau zu allen Zwischenständen passen, die mit dem kleinsten Abstand zur gelesenen
    Wurfzeile. None, wenn keine Folge passt (dann sind die Zwischenstände selbst falsch gelesen)."""
    read = symbols.replace(" ", "").upper().replace("0", "-")
    n = len(shown)
    if not 0 < n <= 10:
        return None
    deltas = [s - p for s, p in zip(shown, [0] + shown[:-1])]

    # Zustand: (Position in der Lesung, Frames mit noch offenem Bonus samt allen danach)
    State = tuple[int, tuple[tuple[int, ...], ...]]
    forward: list[dict[State, float]] = [{(0, ()): 0.0}]
    edges: list[list[tuple[State, tuple[int, ...], State, float]]] = []
    for i in range(n):
        last = i == n - 1
        layer: dict[State, float] = {}
        layer_edges = []
        for (j, pending), cost in forward[i].items():
            first = i - len(pending)  # Spielframe-Nummer von pending[0]
            for frame, sym in _frame_options(i, last):
                seq = list(pending) + [frame]
                ok = True
                keep = 0  # ab hier bleiben Frames offen
                for k in range(len(seq)):
                    score, final = _frame_score(seq, k, first + k)
                    if final or last:
                        if score != deltas[first + k]:
                            ok = False
                            break
                        if keep == k:
                            keep = k + 1
                if not ok:
                    continue
                new_pending = tuple(seq[keep:])
                for end in range(j, min(len(read), j + len(sym) + 2) + 1):
                    inc = _align(sym, read[j:end])
                    if last:
                        inc += (len(read) - end) * EDIT  # übrig gebliebene Lesung
                    key = (end, new_pending)
                    layer_edges.append(((j, pending), frame, key, inc))
                    if cost + inc < layer.get(key, float("inf")):
                        layer[key] = cost + inc
        if not layer:
            return None
        forward.append(layer)
        edges.append(layer_edges)

    best = min(forward[n].values())
    backward: dict[State, float] = {k: 0.0 for k in forward[n]}
    optimal: list[list[tuple[State, tuple[int, ...], State]]] = [[] for _ in range(n)]
    for i in range(n - 1, -1, -1):
        prev_back: dict[State, float] = {}
        for src, frame, dst, inc in edges[i]:
            if dst in backward:
                rest = inc + backward[dst]
                if rest < prev_back.get(src, float("inf")):
                    prev_back[src] = rest
                if forward[i][src] + rest <= best + 1e-9:
                    optimal[i].append((src, frame, dst))
        backward = prev_back

    # Unter gleich guten Folgen die mit den höheren ersten Würfen (ein Fehlwurf ist beim
    # ersten Wurf seltener als beim zweiten)
    state: State = (0, ())
    frames: list[list[int]] = []
    for i in range(n):
        _, frame, state = max((e for e in optimal[i] if e[0] == state), key=lambda e: e[1])
        frames.append(list(frame))
    unsure = [i for i in range(n) if len({e[1] for e in optimal[i]}) > 1]
    return Solution(frames, unsure, best)
