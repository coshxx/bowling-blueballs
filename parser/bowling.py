"""Umrechnung der Anzeige-Symbole (X, /, -, Ziffern) in Pinzahlen und Punkteprüfung."""


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


def matches_scores(frames: list[list[int]], shown: list[int]) -> bool:
    computed = running_scores(frames)
    return len(shown) <= len(computed) and all(s == c for s, c in zip(shown, computed))


def parse_symbols(symbols: str) -> list[list[int]]:
    frames = split_frames(symbols_to_rolls(symbols))
    validate_frames(frames)
    return frames


def repair(symbols: str, shown: list[int]) -> list[list[int]] | None:
    """Sucht Varianten mit genau einem eingefügten, gelöschten oder ersetzten Symbol, die zu
    allen angezeigten Zwischenständen passen. Ergebnis nur, wenn das eindeutig ist."""
    seq = symbols.replace(" ", "").upper()
    alphabet = "X/-123456789"
    candidates = set()
    for i in range(len(seq) + 1):
        for ch in alphabet:
            candidates.add(seq[:i] + ch + seq[i:])
        if i < len(seq):
            candidates.add(seq[:i] + seq[i + 1:])
            for ch in alphabet:
                candidates.add(seq[:i] + ch + seq[i + 1:])
    found = set()
    for cand in candidates:
        try:
            frames = parse_symbols(cand)
        except ValueError:
            continue
        if matches_scores(frames, shown):
            found.add(tuple(tuple(f) for f in frames))
    if len(found) == 1:
        return [list(f) for f in found.pop()]
    return None
