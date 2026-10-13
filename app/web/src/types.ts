export type EntryStatus = 'pending' | 'running' | 'done' | 'uncertain' | 'failed';

export interface Player {
  name: string;
  frames: number[][];
}

export interface Entry {
  id: number;
  status: EntryStatus;
  createdAt: string;
  processedAt: string | null;
  imageUrl: string;
  result: { players: Player[] } | null;
  problems: string[];
  error: string | null;
}
