import type { Entry } from './types';

async function check<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Fehler ${res.status}`;
    try {
      const json = await res.json();
      message = json.message ?? message;
    } catch {
      // keine JSON-Antwort
    }
    if (res.status === 413) {
      message = 'Das Bild ist zu groß (maximal 20 MB).';
    }
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  listEntries: async () => check<Entry[]>(await fetch('/api/entries')),
  upload: async (file: File) => {
    const body = new FormData();
    body.append('image', file);
    return check<Entry>(await fetch('/api/entries', { method: 'POST', body }));
  },
};
