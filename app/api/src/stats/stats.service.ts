import { Injectable } from '@nestjs/common';
import type { Game, Player, User } from '@prisma/client';
import type { SessionUser } from '../auth/session';
import { AccessService } from '../common/access.service';
import { avatarUrl } from '../common/avatar';
import { countFrames } from '../common/bowling';
import { PrismaService } from '../common/prisma.service';

export const LEADERBOARD_MIN_GAMES = 3;

type StatsGame = Game & { player: Player & { user: User | null } };

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function percent(part: number, whole: number): number | null {
  return whole ? round1((100 * part) / whole) : null;
}

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  /** Statistik einer Gruppe aus allen freigegebenen, vollständigen Spielen; Teams werden getrennt ausgewertet.
   *  Mit year nur die Spiele dieses Jahres, years nennt alle Jahre mit Spielen (neuestes zuerst). */
  async forGroup(user: SessionUser, groupId: number, year?: number) {
    await this.access.member(user, groupId);
    const games = await this.prisma.game.findMany({
      where: { complete: true, player: { groupId }, entry: { status: 'approved' } },
      include: { player: { include: { user: true } } },
      orderBy: { playedOn: 'asc' },
    });
    const years = [...new Set(games.map((g) => Number(g.playedOn.slice(0, 4))))].sort((a, b) => b - a);
    const selected = year === undefined ? games : games.filter((g) => g.playedOn.startsWith(`${year}-`));
    return {
      years,
      ...summarize(selected.filter((g) => !g.player.isTeam)),
      teams: summarize(selected.filter((g) => g.player.isTeam)),
      leaderboardMinGames: LEADERBOARD_MIN_GAMES,
    };
  }
}

/** Kennzahlen pro Spieler (bzw. Team) und Tagesschnitt für den Verlauf. */
function summarize(games: StatsGame[]) {
  const byPlayer = new Map<number, { name: string; avatarUrl: string | null; scores: number[]; strikes: number; spares: number; opens: number; frames: number }>();
  const byDay = new Map<string, Map<number, number[]>>();
  for (const g of games) {
    const p = byPlayer.get(g.playerId) ?? { name: g.player.name, avatarUrl: avatarUrl(g.player.user), scores: [], strikes: 0, spares: 0, opens: 0, frames: 0 };
    const c = countFrames(JSON.parse(g.frames) as number[][]);
    p.scores.push(g.score);
    p.strikes += c.strikes;
    p.spares += c.spares;
    p.opens += c.opens;
    p.frames += c.frames;
    byPlayer.set(g.playerId, p);

    const day = byDay.get(g.playedOn) ?? new Map<number, number[]>();
    day.set(g.playerId, [...(day.get(g.playerId) ?? []), g.score]);
    byDay.set(g.playedOn, day);
  }

  const players = [...byPlayer.entries()]
    .map(([playerId, p]) => ({
      playerId,
      name: p.name,
      avatarUrl: p.avatarUrl,
      games: p.scores.length,
      average: round1(p.scores.reduce((a, b) => a + b, 0) / p.scores.length),
      best: Math.max(...p.scores),
      worst: Math.min(...p.scores),
      // Strike-Quote: Anteil Frames mit Strike; Spare-Quote: Spares pro Frame ohne Strike
      strikeRate: percent(p.strikes, p.frames),
      spareRate: percent(p.spares, p.frames - p.strikes),
      openRate: percent(p.opens, p.frames),
    }))
    .sort((a, b) => b.average - a.average);

  const timeline = [...byDay.entries()].map(([date, day]) => ({
    date,
    averages: Object.fromEntries(
      [...day.entries()].map(([playerId, scores]) => [playerId, round1(scores.reduce((a, b) => a + b, 0) / scores.length)]),
    ),
  }));

  return { players, timeline };
}
