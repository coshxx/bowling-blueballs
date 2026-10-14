export type EntryStatus = 'pending' | 'running' | 'review' | 'approved' | 'failed';

export interface SessionUser {
  id: number;
  username: string;
  isAdmin: boolean;
}

export interface GroupRef {
  id: number;
  name: string;
  canUpload: boolean;
}

export interface MeResponse {
  user: SessionUser;
  groups: GroupRef[];
}

/** Markierung eines vom Parser gelesenen Frames: error = sicher falsch, unsure = bitte prüfen */
export type FrameMark = 'error' | 'unsure' | null;

export interface ResultPlayer {
  name: string;
  frames: number[][];
  /** 10 Frame-Texte, notfalls die rohe (ungültige) Lesung – fehlt bei älteren Analysen */
  texts?: string[];
  marks?: FrameMark[];
}

export interface GameRow {
  position: number;
  displayName: string;
  playerId: number;
  playerName: string;
  frames: number[][];
  score: number;
  complete: boolean;
}

export interface Entry {
  id: number;
  groupId: number;
  status: EntryStatus;
  uncertain: boolean;
  playedOn: string;
  createdAt: string;
  processedAt: string | null;
  approvedAt: string | null;
  uploader: string | null;
  approvedBy: string | null;
  imageUrl: string;
  result: { players: ResultPlayer[] } | null;
  scores: number[][];
  problems: string[];
  error: string | null;
  games: GameRow[];
  can: { reprocess: boolean; approve: boolean; delete: boolean; unapprove: boolean };
}

export interface Player {
  id: number;
  name: string;
  userId: number | null;
  username: string | null;
  games: number;
  aliases: { id: number; alias: string }[];
}

export interface ApprovePlayer {
  displayName: string;
  frames: number[][];
  playerId?: number;
  newPlayerName?: string;
}

export interface PlayerStats {
  playerId: number;
  name: string;
  games: number;
  average: number;
  best: number;
  worst: number;
  strikeRate: number | null;
  spareRate: number | null;
  openRate: number | null;
}

export interface GroupStats {
  players: PlayerStats[];
  timeline: { date: string; averages: Record<string, number> }[];
  leaderboardMinGames: number;
}

export interface AdminUser {
  id: number;
  username: string;
  isAdmin: boolean;
  createdAt: string;
  groups: string[];
}

export interface AdminGroup {
  id: number;
  name: string;
  createdAt: string;
  members: number;
  entries: number;
  approvedEntries: number;
  players: number;
}

export interface Member {
  userId: number;
  username: string;
  isAdmin: boolean;
  canUpload: boolean;
  since: string;
}

export interface Location {
  id: number;
  name: string;
}

export interface MenuItem {
  id: number;
  name: string;
  priceCents: number;
  hidden: boolean;
  /** Anzahl der Positionen, die auf den Artikel verweisen */
  uses: number;
}

export interface EveningItem {
  id: number;
  playerId: number;
  playerName: string;
  menuItemId: number;
  itemName: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
}

interface EveningBase {
  id: number;
  groupId: number;
  date: string;
  label: string | null;
  location: Location | null;
  createdBy: string | null;
  createdAt: string;
  totalCents: number;
  can: { edit: boolean; delete: boolean };
}

export interface EveningSummary extends EveningBase {
  players: number;
  positions: number;
}

export interface Evening extends EveningBase {
  items: EveningItem[];
  totals: { playerId: number; playerName: string; totalCents: number }[];
}

export interface AddConsumption {
  playerId?: number;
  newPlayerName?: string;
  itemName: string;
  quantity: number;
  unitCents: number;
}
