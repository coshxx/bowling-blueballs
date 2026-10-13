import { Injectable } from '@nestjs/common';
import type { SessionUser } from '../auth/session';
import { AccessService } from '../common/access.service';
import { countFrames } from '../common/bowling';
import { PrismaService } from '../common/prisma.service';

export const LEADERBOARD_MIN_GAMES = 3;

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

  /** Statistik einer Gruppe aus allen freigegebenen, vollständigen Spielen. */
  async forGroup(user: SessionUser, groupId: number) {
    await this.access.member(user, groupId);
    const games = await this.prisma.game.findMany({
      where: { complete: true, player: { groupId }, entry: { status: 'approved' } },
      include: { player: true },
      orderBy: { playedOn: 'asc' },
    });

    const byPlayer = new Map<number, { name: string; scores: number[]; strikes: number; spares: number; opens: number; frames: number }>();
    const byDay = new Map<string, Map<number, number[]>>();
    for (const g of games) {
      const p = byPlayer.get(g.playerId) ?? { name: g.player.name, scores: [], strikes: 0, spares: 0, opens: 0, frames: 0 };
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

    return { players, timeline, leaderboardMinGames: LEADERBOARD_MIN_GAMES };
  }
}
