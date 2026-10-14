/** Freitext-Namen säubern: Ränder weg, mehrfache Leerzeichen zu einem. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Schlüssel für eindeutige Namen ohne Rücksicht auf Groß-/Kleinschreibung (Locations, Kartenartikel). */
export function nameKey(name: string): string {
  return cleanName(name).toLowerCase();
}
