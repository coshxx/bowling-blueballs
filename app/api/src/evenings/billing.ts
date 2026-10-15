/** Abrechnung eines Abends: wer zahlt wie viel. Reine Funktionen, ohne Datenbank. */

export interface BillItem {
  id: number;
  /** null = geteilte Position */
  playerId: number | null;
  totalCents: number;
  /** Einzelposition, die in dieser geteilten Position steckt (z. B. Leihschuhe in "Bowling") */
  containedInId: number | null;
  /** Bei geteilten Positionen: wer mitzahlt */
  shareIds: number[];
}

export interface Bill {
  /** Betrag pro Spieler-ID */
  amounts: Map<number, number>;
  /** Bei geteilten Positionen: Betrag nach Abzug der enthaltenen Einzelpositionen */
  netCents: Map<number, number>;
  /** Was die Abrechnung unmöglich macht (z. B. Abzüge größer als die geteilte Position) */
  problems: string[];
}

/**
 * Einzelpositionen zählen voll für ihren Spieler. Geteilte Positionen werden nach Abzug der darin
 * enthaltenen Einzelpositionen gleichmäßig verteilt; Rest-Cent bekommt `preferredPlayerId`
 * (der Besitzer bzw. Empfänger), wenn er mitzahlt, sonst je ein Cent der Reihe nach.
 */
export function computeBill(items: BillItem[], preferredPlayerId: number | null, names: (id: number) => string): Bill {
  const amounts = new Map<number, number>();
  const netCents = new Map<number, number>();
  const problems: string[] = [];
  const add = (playerId: number, cents: number) => amounts.set(playerId, (amounts.get(playerId) ?? 0) + cents);

  for (const item of items) {
    if (item.playerId !== null) add(item.playerId, item.totalCents);
  }
  for (const item of items) {
    if (item.playerId !== null) continue;
    const deducted = items.filter((i) => i.containedInId === item.id).reduce((sum, i) => sum + i.totalCents, 0);
    const net = item.totalCents - deducted;
    netCents.set(item.id, net);
    if (net < 0) {
      problems.push(`${names(item.id)}: Die enthaltenen Positionen sind teurer als die Position selbst.`);
      continue;
    }
    if (item.shareIds.length === 0) {
      problems.push(`${names(item.id)}: Niemand zahlt mit.`);
      continue;
    }
    const ordered = [...item.shareIds].sort((a, b) => a - b);
    const base = Math.floor(net / ordered.length);
    let rest = net - base * ordered.length;
    for (const playerId of ordered) add(playerId, base);
    if (preferredPlayerId !== null && ordered.includes(preferredPlayerId)) {
      add(preferredPlayerId, rest);
    } else {
      for (const playerId of ordered) {
        if (rest-- <= 0) break;
        add(playerId, 1);
      }
    }
  }
  return { amounts, netCents, problems };
}
