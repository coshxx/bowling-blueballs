import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import type { Entry, Game, Player, User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { SessionUser } from '../auth/session';
import { AccessService, GroupAccess } from '../common/access.service';
import { isComplete, runningScores, validateFrames } from '../common/bowling';
import { PrismaService } from '../common/prisma.service';
import { config } from '../config';
import { normalizeAlias } from '../players/players.service';
import type { ApproveDto } from './entries.dto';
import { detectImageType } from './image-type';
import { WorkerService } from './worker.service';

export type EntryStatus = 'pending' | 'running' | 'review' | 'approved' | 'failed';

type EntryWithRelations = Entry & {
  uploader: User | null;
  approvedBy: User | null;
  games: (Game & { player: Player })[];
};

const ENTRY_INCLUDE = {
  uploader: true,
  approvedBy: true,
  games: { include: { player: true }, orderBy: { position: 'asc' } },
} as const;

function parseJson<T>(value: string | null, fallback: T): T {
  return value ? (JSON.parse(value) as T) : fallback;
}

@Injectable()
export class EntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly worker: WorkerService,
  ) {}

  private toDto(e: EntryWithRelations, user: SessionUser, access: GroupAccess) {
    const status = e.status as EntryStatus;
    const isUploader = e.uploaderId === user.id;
    return {
      id: e.id,
      groupId: e.groupId,
      status,
      uncertain: e.uncertain,
      playedOn: e.playedOn,
      createdAt: e.createdAt.toISOString(),
      processedAt: e.processedAt?.toISOString() ?? null,
      approvedAt: e.approvedAt?.toISOString() ?? null,
      uploader: e.uploader?.username ?? null,
      approvedBy: e.approvedBy?.username ?? null,
      imageUrl: `/api/entries/${e.id}/image`,
      result: parseJson<{ players: { name: string; frames: number[][] }[] } | null>(e.result, null),
      scores: parseJson<number[][]>(e.scores, []),
      problems: parseJson<string[]>(e.problems, []),
      error: e.error,
      games: e.games.map((g) => ({
        position: g.position,
        displayName: g.displayName,
        playerId: g.playerId,
        playerName: g.player.name,
        frames: JSON.parse(g.frames) as number[][],
        score: g.score,
        complete: g.complete,
      })),
      can: {
        reprocess: access.canUpload && (status === 'review' || status === 'failed'),
        approve: status === 'review' && (user.isAdmin || !isUploader),
        delete: user.isAdmin || (isUploader && status !== 'approved'),
        unapprove: user.isAdmin && status === 'approved',
      },
    };
  }

  /** Lädt einen Eintrag und prüft, dass der Benutzer Mitglied der Gruppe ist. */
  private async load(user: SessionUser, id: number) {
    const entry = await this.prisma.entry.findUnique({ where: { id }, include: ENTRY_INCLUDE });
    if (!entry) {
      throw new NotFoundException('Eintrag nicht gefunden.');
    }
    const access = await this.access.member(user, entry.groupId);
    return { entry, access };
  }

  async list(user: SessionUser, groupId: number, filter?: 'review') {
    const access = await this.access.member(user, groupId);
    const entries = await this.prisma.entry.findMany({
      where: { groupId, ...(filter ? { status: filter } : {}) },
      include: ENTRY_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return entries.map((e) => this.toDto(e, user, access));
  }

  async get(user: SessionUser, id: number) {
    const { entry, access } = await this.load(user, id);
    return this.toDto(entry, user, access);
  }

  async create(user: SessionUser, groupId: number, file: Buffer, playedOn: string) {
    const access = await this.access.uploader(user, groupId);
    const type = detectImageType(file);
    if (!type) {
      throw new UnsupportedMediaTypeException('Nur JPG-, PNG- oder WebP-Bilder sind erlaubt.');
    }
    await mkdir(config.imagesDir, { recursive: true });
    const imageFile = `${randomUUID()}.${type.ext}`;
    await writeFile(join(config.imagesDir, imageFile), file);
    const entry = await this.prisma.entry.create({
      data: { groupId, uploaderId: user.id, imageFile, imageType: type.mime, playedOn },
      include: ENTRY_INCLUDE,
    });
    this.worker.wake();
    return this.toDto(entry, user, access);
  }

  async reprocess(user: SessionUser, id: number) {
    const { entry, access } = await this.load(user, id);
    if (!this.toDto(entry, user, access).can.reprocess) {
      throw access.canUpload
        ? new ConflictException('Nur Einträge, die zu prüfen oder fehlgeschlagen sind, lassen sich neu analysieren.')
        : new ForbiddenException('Du hast in dieser Gruppe kein Upload-Recht.');
    }
    const { count } = await this.prisma.entry.updateMany({
      where: { id, status: { in: ['review', 'failed'] } },
      data: { status: 'pending', uncertain: false, result: null, scores: null, problems: null, error: null, processedAt: null },
    });
    if (count === 0) {
      throw new ConflictException('Der Eintrag hat sich inzwischen geändert, bitte neu laden.');
    }
    this.worker.wake();
    return this.get(user, id);
  }

  async approve(user: SessionUser, id: number, dto: ApproveDto) {
    const { entry } = await this.load(user, id);
    if (entry.status !== 'review') {
      throw new ConflictException('Nur Einträge, die zu prüfen sind, lassen sich freigeben.');
    }
    if (!user.isAdmin && entry.uploaderId === user.id) {
      throw new ForbiddenException('Dein eigenes Foto muss jemand anderes freigeben.');
    }

    // Erst alles prüfen, dann in einer Transaktion schreiben
    const groupPlayers = await this.prisma.player.findMany({ where: { groupId: entry.groupId } });
    const rows = dto.players.map((p, idx) => {
      const label = `Zeile ${idx + 1} (${p.displayName})`;
      try {
        validateFrames(p.frames);
      } catch (e) {
        throw new BadRequestException(`${label}: ${(e as Error).message}`);
      }
      if ((p.playerId === undefined) === (p.newPlayerName === undefined)) {
        throw new BadRequestException(`${label}: Bitte genau einen Spieler zuordnen.`);
      }
      if (p.playerId !== undefined && !groupPlayers.some((gp) => gp.id === p.playerId)) {
        throw new BadRequestException(`${label}: Spieler gehört nicht zu dieser Gruppe.`);
      }
      const scores = runningScores(p.frames);
      return { ...p, displayName: p.displayName.trim(), score: scores.at(-1) ?? 0, complete: isComplete(p.frames) };
    });

    await this.prisma.$transaction(async (tx) => {
      const newPlayers = new Map<string, number>();
      for (const [position, row] of rows.entries()) {
        let playerId = row.playerId;
        if (playerId === undefined) {
          const name = row.newPlayerName!.trim();
          // Gleichnamigen Spieler wiederverwenden (z. B. zwei Zeilen mit demselben neuen Namen)
          const existing = newPlayers.get(name.toLowerCase()) ?? groupPlayers.find((gp) => gp.name.toLowerCase() === name.toLowerCase())?.id;
          playerId = existing ?? (await tx.player.create({ data: { groupId: entry.groupId, name } })).id;
          newPlayers.set(name.toLowerCase(), playerId);
        }
        const alias = normalizeAlias(row.displayName);
        await tx.playerAlias.upsert({
          where: { groupId_alias: { groupId: entry.groupId, alias } },
          create: { groupId: entry.groupId, alias, playerId },
          update: { playerId },
        });
        await tx.game.create({
          data: {
            entryId: id,
            playerId,
            position,
            displayName: row.displayName,
            frames: JSON.stringify(row.frames),
            score: row.score,
            complete: row.complete,
            playedOn: dto.playedOn,
          },
        });
      }
      const { count } = await tx.entry.updateMany({
        where: { id, status: 'review' },
        data: { status: 'approved', playedOn: dto.playedOn, approvedById: user.id, approvedAt: new Date() },
      });
      if (count === 0) {
        throw new ConflictException('Der Eintrag hat sich inzwischen geändert, bitte neu laden.');
      }
    });
    return this.get(user, id);
  }

  async unapprove(user: SessionUser, id: number) {
    const { entry } = await this.load(user, id);
    if (!user.isAdmin) {
      throw new ForbiddenException('Nur Admins können eine Freigabe zurückziehen.');
    }
    if (entry.status !== 'approved') {
      throw new ConflictException('Der Eintrag ist nicht freigegeben.');
    }
    await this.prisma.$transaction([
      this.prisma.game.deleteMany({ where: { entryId: id } }),
      this.prisma.entry.update({ where: { id }, data: { status: 'review', approvedById: null, approvedAt: null } }),
    ]);
    return this.get(user, id);
  }

  async delete(user: SessionUser, id: number) {
    const { entry, access } = await this.load(user, id);
    if (!this.toDto(entry, user, access).can.delete) {
      throw new ForbiddenException('Diesen Eintrag darfst du nicht löschen.');
    }
    await this.prisma.entry.delete({ where: { id } });
    await unlink(join(config.imagesDir, entry.imageFile)).catch(() => undefined);
  }

  async image(user: SessionUser, id: number): Promise<{ path: string; mime: string }> {
    const { entry } = await this.load(user, id);
    return { path: join(config.imagesDir, entry.imageFile), mime: entry.imageType };
  }
}
