const dateTime = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Berlin',
});
const dateOnly = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** "2026-02-11" → "11.02.2026" (als reines Datum, ohne Zeitzonenverschiebung) */
export function formatDate(ymd: string): string {
  return dateOnly.format(new Date(`${ymd}T00:00:00Z`));
}

export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Datum aus Dateinamen wie "IMG-20260211-WA0005.jpg" oder "PXL_20260211_193000.jpg" */
export function dateFromFilename(name: string): string | null {
  const m = /(20\d{2})[-_]?(\d{2})[-_]?(\d{2})/.exec(name);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(`${y}-${mo}-${d}T00:00:00Z`);
  // Ungültige Daten (z. B. Monat 13) fallen beim Zurückformatieren auf
  return date.toISOString().slice(0, 10) === `${y}-${mo}-${d}` ? `${y}-${mo}-${d}` : null;
}

export function formatPercent(value: number | null): string {
  return value === null ? '–' : `${value.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export function formatEuro(cents: number): string {
  return euro.format(cents / 100);
}

/** Eingabe wie "4,80", "4.8" oder "5" → Cent; null bei Unsinn */
export function parseEuro(text: string): number | null {
  const m = /^\s*(\d{1,4})(?:[.,](\d{1,2}))?\s*(?:€)?\s*$/.exec(text);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '0').padEnd(2, '0'));
}

/** Cent als Eingabetext für Preisfelder: 480 → "4,80" */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}
