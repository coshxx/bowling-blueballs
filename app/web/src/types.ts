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
  profile: {
    paypalMe: string | null;
    avatarUrl: string | null;
    /** Gruppen, in denen das Konto mit keinem Spieler verknüpft ist */
    unlinkedGroups: string[];
  };
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
  avatarUrl: string | null;
  frames: number[][];
  score: number;
  complete: boolean;
}

export interface Entry {
  id: number;
  groupId: number;
  status: EntryStatus;
  uncertain: boolean;
  isTeamGame: boolean;
  playedOn: string;
  createdAt: string;
  processedAt: string | null;
  approvedAt: string | null;
  uploader: string | null;
  approvedBy: string | null;
  /** Herkunft importierter Einträge (z. B. "import-2025"), null bei Fotos */
  source: string | null;
  /** null bei importierten Einträgen ohne Foto */
  imageUrl: string | null;
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
  isTeam: boolean;
  username: string | null;
  avatarUrl: string | null;
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
  avatarUrl: string | null;
  games: number;
  average: number;
  best: number;
  worst: number;
  strikeRate: number | null;
  spareRate: number | null;
  openRate: number | null;
}

export interface StatsSummary {
  players: PlayerStats[];
  timeline: { date: string; averages: Record<string, number> }[];
}

export interface GroupStats extends StatsSummary {
  /** Jahre mit Spielen, neuestes zuerst */
  years: number[];
  /** Teamspiele, getrennt von der Einzelstatistik */
  teams: StatsSummary;
  leaderboardMinGames: number;
}

export interface AdminUser {
  id: number;
  username: string;
  isAdmin: boolean;
  avatarUrl: string | null;
  createdAt: string;
  lastSeenAt: string | null;
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

export type EveningStatus = 'open' | 'billed' | 'settled';

export interface EveningItem {
  id: number;
  /** Geteilte Position: playerId/playerName sind null, wer mitzahlt steht in shares */
  shared: boolean;
  playerId: number | null;
  playerName: string | null;
  /** cents: Anteil an der Position, null solange sie nicht abrechenbar ist */
  shares: { playerId: number; playerName: string; cents: number | null }[];
  /** null bei geteilten Positionen, die nicht auf der Karte stehen */
  menuItemId: number | null;
  itemName: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
  /** Geteilte Position: Betrag nach Abzug der enthaltenen Einzelpositionen */
  netCents: number | null;
  /** Einzelposition, die in dieser geteilten Position steckt */
  containedInId: number | null;
}

export interface EveningAttendee {
  playerId: number;
  playerName: string;
  avatarUrl: string | null;
  hasAccount: boolean;
  isMe: boolean;
  isRecipient: boolean;
  amountCents: number;
  paid: boolean;
  paidAt: string | null;
  paidBy: string | null;
  paidCentsDiffer: boolean;
  canMarkPaid: boolean;
  /** Hat Positionen oder Anteile und lässt sich deshalb nicht entfernen */
  locked: boolean;
}

interface EveningBase {
  id: number;
  groupId: number;
  date: string;
  label: string | null;
  location: Location | null;
  status: EveningStatus;
  owner: string | null;
  isOwner: boolean;
  recipient: { playerId: number; playerName: string; avatarUrl: string | null; paypalMe: string | null } | null;
  billedAt: string | null;
  createdAt: string;
  totalCents: number;
  openCents: number;
  myOpenCents: number;
  can: { edit: boolean; delete: boolean; bill: boolean; reopen: boolean };
}

export interface EveningSummary extends EveningBase {
  /** Mit Bild zuerst, sonst alphabetisch */
  players: { name: string; avatarUrl: string | null }[];
  positions: number;
}

export interface Evening extends EveningBase {
  attendees: EveningAttendee[];
  items: EveningItem[];
  problems: string[];
}

export interface AddConsumption {
  playerId?: number;
  newPlayerName?: string;
  sharedWith?: number[];
  containedInId?: number;
  itemName: string;
  quantity: number;
  unitCents: number;
}
