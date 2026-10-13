/** Anzeige-Symbole pro Frame wie auf der Bahn: X = Strike, / = Spare, - = kein Pin. */
export function frameSymbols(frame: number[]): string[] {
  const symbols: string[] = [];
  let open = 0; // Pins, die nach den bisherigen Würfen im aktuellen Satz noch stehen (0 = frisch aufgestellt)
  for (const roll of frame) {
    if (open === 0) {
      symbols.push(roll === 10 ? 'X' : roll === 0 ? '-' : String(roll));
      open = roll === 10 ? 0 : 10 - roll;
    } else {
      symbols.push(roll === open ? '/' : roll === 0 ? '-' : String(roll));
      open = 0;
    }
  }
  return symbols;
}

/** Kumulierte Punkte pro Frame; offene Boni zählen mit den bisher vorhandenen Würfen. */
export function runningScores(frames: number[][]): number[] {
  const flat = frames.flat();
  const scores: number[] = [];
  let total = 0;
  let pos = 0;
  frames.forEach((f, i) => {
    const pins = f.reduce((a, b) => a + b, 0);
    let score = pins;
    if (i < 9 && f[0] === 10) {
      score = 10 + sum(flat.slice(pos + 1, pos + 3));
    } else if (i < 9 && pins === 10) {
      score = 10 + sum(flat.slice(pos + 2, pos + 3));
    }
    total += score;
    scores.push(total);
    pos += f.length;
  });
  return scores;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
