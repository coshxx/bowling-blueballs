/** Bowling-Regeln für die Prüfung freigegebener Ergebnisse und die Statistik. */

export type Frames = number[][];

/** Wirft einen Fehlertext, wenn die Frames gegen die Regeln verstoßen. Unvollständige Spiele sind erlaubt. */
export function validateFrames(frames: Frames): void {
  if (!Array.isArray(frames) || frames.length === 0 || frames.length > 10) {
    throw new Error('Ein Spiel hat 1 bis 10 Frames.');
  }
  frames.forEach((f, idx) => {
    const n = idx + 1;
    if (!Array.isArray(f) || f.length === 0) {
      throw new Error(`Frame ${n} ist leer.`);
    }
    if (f.some((r) => !Number.isInteger(r) || r < 0 || r > 10)) {
      throw new Error(`Frame ${n}: ungültige Pinzahl.`);
    }
    if (n < 10) {
      if (f[0] === 10 && f.length !== 1) throw new Error(`Frame ${n}: nach einem Strike kein weiterer Wurf.`);
      if (f.length > 2 || f[0] + (f[1] ?? 0) > 10) throw new Error(`Frame ${n}: mehr als 10 Pins.`);
      if (n < frames.length && f[0] !== 10 && f.length !== 2) {
        throw new Error(`Frame ${n} ist unvollständig, obwohl danach weitergespielt wurde.`);
      }
    } else {
      if (f.length > 3) throw new Error('Frame 10: höchstens 3 Würfe.');
      if (f.length >= 2 && f[0] < 10 && f[0] + f[1] > 10) throw new Error('Frame 10: mehr als 10 Pins.');
      if (f.length >= 3) {
        if (f[0] + f[1] < 10) throw new Error('Frame 10: dritter Wurf nur nach Strike oder Spare.');
        // Nach Strike + Nicht-Strike stehen für den dritten Wurf nur die restlichen Pins
        if (f[0] === 10 && f[1] < 10 && f[1] + f[2] > 10) throw new Error('Frame 10: mehr als 10 Pins.');
      }
    }
  });
}

/** Kumulierte Punkte pro Frame; offene Boni zählen mit den bisher vorhandenen Würfen. */
export function runningScores(frames: Frames): number[] {
  const flat = frames.flat();
  const scores: number[] = [];
  let total = 0;
  let pos = 0;
  frames.forEach((f, i) => {
    const pins = sum(f);
    let score = pins;
    if (i < 9 && f[0] === 10) score = 10 + sum(flat.slice(pos + 1, pos + 3));
    else if (i < 9 && pins === 10) score = 10 + sum(flat.slice(pos + 2, pos + 3));
    total += score;
    scores.push(total);
    pos += f.length;
  });
  return scores;
}

/** Alle 10 Frames gespielt und Frame 10 abgeschlossen. */
export function isComplete(frames: Frames): boolean {
  if (frames.length !== 10) return false;
  const last = frames[9];
  const bonus = last[0] === 10 || last[0] + (last[1] ?? 0) === 10;
  return last.length === (bonus ? 3 : 2);
}

export interface FrameCounts {
  frames: number;
  strikes: number;
  spares: number;
  opens: number;
}

/** Zählt pro Frame (inkl. Frame 10, nur dessen erste Kugel bzw. erstes Paar) Strike/Spare/Open. */
export function countFrames(frames: Frames): FrameCounts {
  const c: FrameCounts = { frames: 0, strikes: 0, spares: 0, opens: 0 };
  for (const f of frames) {
    c.frames++;
    if (f[0] === 10) c.strikes++;
    else if (f[0] + (f[1] ?? 0) === 10) c.spares++;
    else c.opens++;
  }
  return c;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
