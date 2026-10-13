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
