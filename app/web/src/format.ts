const dateTime = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Berlin',
});

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}
