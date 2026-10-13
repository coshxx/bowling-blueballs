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

/** Eingabe eines Frames in Anzeige-Schreibweise ("9/", "X", "-7", "XX9") → Würfe. Wirft bei Unsinn. */
export function parseFrame(text: string): number[] {
  const rolls: number[] = [];
  let open = 0; // 0 = frisch aufgestellt, sonst noch stehende Pins
  for (const ch of text.toUpperCase().replace(/\s+/g, '')) {
    if (ch === 'X') {
      if (open !== 0) throw new Error('„X“ geht nur bei vollen Pins, sonst „/“.');
      rolls.push(10);
    } else if (ch === '/') {
      if (open === 0) throw new Error('„/“ braucht einen ersten Wurf davor.');
      rolls.push(open);
      open = 0;
    } else if (ch === '-' || /^[0-9]$/.test(ch)) {
      const pins = ch === '-' ? 0 : Number(ch);
      if (open === 0) {
        rolls.push(pins);
        open = 10 - pins;
      } else {
        if (pins > open) throw new Error(`Nur noch ${open} Pins übrig.`);
        rolls.push(pins);
        open = 0;
      }
    } else {
      throw new Error(`Unbekanntes Zeichen „${ch}“.`);
    }
  }
  return rolls;
}

/** Fehlertext, wenn die Frames gegen die Regeln verstoßen, sonst null. Unvollständige Spiele sind erlaubt. */
export function frameError(frames: number[][]): string | null {
  if (frames.length === 0) return 'Mindestens ein Frame ist nötig.';
  if (frames.length > 10) return 'Höchstens 10 Frames.';
  for (const [idx, f] of frames.entries()) {
    const n = idx + 1;
    if (f.length === 0) return `Frame ${n} fehlt.`;
    if (n < 10) {
      if (f[0] === 10 && f.length !== 1) return `Frame ${n}: nach einem Strike kein weiterer Wurf.`;
      if (f.length > 2) return `Frame ${n}: höchstens 2 Würfe.`;
      if (n < frames.length && f[0] !== 10 && f.length !== 2) return `Frame ${n} ist unvollständig.`;
    } else {
      if (f.length > 3) return 'Frame 10: höchstens 3 Würfe.';
      if (f.length === 3 && f[0] + f[1] < 10) return 'Frame 10: dritter Wurf nur nach Strike oder Spare.';
    }
  }
  return null;
}

export function isComplete(frames: number[][]): boolean {
  if (frames.length !== 10) return false;
  const last = frames[9];
  const bonus = last[0] === 10 || last[0] + (last[1] ?? 0) === 10;
  return last.length === (bonus ? 3 : 2);
}

/** Wie im Backend: Anzeigenamen ohne Rücksicht auf Groß-/Kleinschreibung und Leerzeichen vergleichen. */
export function normalizeAlias(displayName: string): string {
  return displayName.trim().replace(/\s+/g, ' ').toUpperCase();
}
