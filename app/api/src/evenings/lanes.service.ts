import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { SessionUser } from '../auth/session';
import { AccessService } from '../common/access.service';
import { avatarUrl } from '../common/avatar';
import { PrismaService } from '../common/prisma.service';
import type { AssignLaneDto, Lane, RollLanesDto } from './lanes.dto';

const LANE_INCLUDE = {
  attendees: { include: { player: { include: { user: true } } } },
  laneRounds: {
    include: { createdBy: true, assignments: { include: { player: { include: { user: true } } } } },
    orderBy: { number: 'desc' },
  },
} as const;

/** Fisher-Yates mit kryptografischem Zufall */
function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Teilt zufällig in zwei Gruppen; bei ungerader Zahl bekommt eine zufällige Bahn den Überhang */
export function splitLanes(playerIds: number[]): Map<number, Lane> {
  const shuffled = shuffle(playerIds);
  const bigger: Lane = randomInt(2) === 0 ? 'left' : 'right';
  const biggerCount = Math.ceil(shuffled.length / 2);
  return new Map(shuffled.map((id, i): [number, Lane] => [id, i < biggerCount ? bigger : bigger === 'left' ? 'right' : 'left']));
}

@Injectable()
export class LanesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  private async load(user: SessionUser, id: number) {
    const evening = await this.prisma.evening.findUnique({ where: { id }, include: LANE_INCLUDE });
    if (!evening) throw new NotFoundException('Abend nicht gefunden.');
    await this.access.member(user, evening.groupId);
    return evening;
  }

  /** Auslosen und Verschieben: nur Teilnehmer mit eigenem Konto, solange der Abend läuft */
  private async loadForRoll(user: SessionUser, id: number) {
    const evening = await this.load(user, id);
    if (evening.status !== 'open') {
      throw new ConflictException('Der Abend ist schon zur Zahlung freigegeben, die Bahnen lassen sich nicht mehr ändern.');
    }
    if (!evening.attendees.some((a) => a.player.userId === user.id)) {
      throw new ForbiddenException('Nur Teilnehmer des Abends dürfen die Bahnen auslosen.');
    }
    return evening;
  }

  private toDto(evening: Awaited<ReturnType<LanesService['load']>>, user: SessionUser) {
    const attendeeIds = new Set(evening.attendees.map((a) => a.playerId));
    const person = (p: { id: number; name: string; user: { id: number; avatarFile: string | null } | null }) => ({
      playerId: p.id,
      playerName: p.name,
      avatarUrl: avatarUrl(p.user),
    });
    const byName = (a: { playerName: string }, b: { playerName: string }) => a.playerName.localeCompare(b.playerName);
    const rounds = evening.laneRounds.map((r) => {
      // Entfernte Teilnehmer verschwinden aus der Anzeige
      const players = r.assignments.filter((a) => attendeeIds.has(a.playerId));
      return {
        id: r.id,
        number: r.number,
        createdBy: r.createdBy?.username ?? null,
        createdAt: r.createdAt.toISOString(),
        left: players.filter((a) => a.lane === 'left').map((a) => person(a.player)).sort(byName),
        right: players.filter((a) => a.lane === 'right').map((a) => person(a.player)).sort(byName),
      };
    });
    const current = evening.laneRounds[0];
    const assigned = new Set(current?.assignments.map((a) => a.playerId));
    return {
      eveningId: evening.id,
      open: evening.status === 'open',
      canRoll: evening.status === 'open' && evening.attendees.some((a) => a.player.userId === user.id),
      attendees: evening.attendees.map((a) => person(a.player)).sort(byName),
      /** Teilnehmer, die in der aktuellen Runde noch keine Bahn haben (nur wenn schon gewürfelt wurde) */
      unassigned: current ? evening.attendees.filter((a) => !assigned.has(a.playerId)).map((a) => person(a.player)).sort(byName) : [],
      rounds,
    };
  }

  async get(user: SessionUser, id: number) {
    return this.toDto(await this.load(user, id), user);
  }

  async roll(user: SessionUser, id: number, dto: RollLanesDto) {
    const evening = await this.loadForRoll(user, id);
    const ids = [...new Set(dto.playerIds)];
    const attendeeIds = new Set(evening.attendees.map((a) => a.playerId));
    if (ids.length < 2) throw new BadRequestException('Zum Auslosen braucht es mindestens zwei Spieler.');
    if (ids.some((p) => !attendeeIds.has(p))) throw new BadRequestException('Nur Teilnehmer des Abends können mitspielen.');
    const lanes = splitLanes(ids);
    await this.prisma.laneRound.create({
      data: {
        eveningId: id,
        number: (evening.laneRounds[0]?.number ?? 0) + 1,
        createdById: user.id,
        assignments: { create: [...lanes].map(([playerId, lane]) => ({ playerId, lane })) },
      },
    });
    return this.get(user, id);
  }

  /** Setzt einen Spieler in der aktuellen Runde auf eine Bahn (auch nachträglich Hinzugekommene) */
  async assign(user: SessionUser, id: number, dto: AssignLaneDto) {
    const evening = await this.loadForRoll(user, id);
    const current = evening.laneRounds[0];
    if (!current) throw new BadRequestException('Es wurde noch nicht ausgelost.');
    if (!evening.attendees.some((a) => a.playerId === dto.playerId)) {
      throw new BadRequestException('Der Spieler nimmt nicht an diesem Abend teil.');
    }
    await this.prisma.laneAssignment.upsert({
      where: { roundId_playerId: { roundId: current.id, playerId: dto.playerId } },
      create: { roundId: current.id, playerId: dto.playerId, lane: dto.lane },
      update: { lane: dto.lane },
    });
    return this.get(user, id);
  }
}
