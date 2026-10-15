const dateTime = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Berlin',
});
const dateOnly = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'UTC' });

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

/** Grob relativ: „gerade eben“, „vor 3 Min.“, „vor 5 Std.“, „vor 2 Tagen“ */
export function formatAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 5) {
    return 'gerade eben';
  }
  if (minutes < 60) {
    return `vor ${minutes} Min.`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `vor ${hours} Std.`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? 'vor 1 Tag' : `vor ${days} Tagen`;
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

/** PayPal.Me-Link mit vorausgefülltem Betrag */
export function paypalLink(name: string, cents: number): string {
  return `https://paypal.me/${encodeURIComponent(name)}/${(cents / 100).toFixed(2)}EUR`;
}

export const EVENING_STATUS_LABELS = { open: 'läuft', billed: 'abgerechnet', settled: 'erledigt' } as const;
