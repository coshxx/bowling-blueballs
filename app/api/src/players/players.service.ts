import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SessionUser } from '../auth/session';
import { AccessService } from '../common/access.service';
import { PrismaService } from '../common/prisma.service';

/** Anzeigenamen vergleichen wir ohne Rücksicht auf Groß-/Kleinschreibung und Leerzeichen. */
export function normalizeAlias(displayName: string): string {
  return displayName.trim().replace(/\s+/g, ' ').toUpperCase();
}

@Injectable()
export class PlayersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async list(user: SessionUser, groupId: number) {
    await this.access.member(user, groupId);
    const players = await this.prisma.player.findMany({
      where: { groupId },
      include: { aliases: { orderBy: { alias: 'asc' } }, user: true, _count: { select: { games: true } } },
      orderBy: { name: 'asc' },
    });
    return players.map((p) => ({
      id: p.id,
      name: p.name,
      userId: p.userId,
      username: p.user?.username ?? null,
      games: p._count.games,
      aliases: p.aliases.map((a) => ({ id: a.id, alias: a.alias })),
    }));
  }

  async create(groupId: number, name: string) {
    await this.ensureGroup(groupId);
    try {
      const p = await this.prisma.player.create({ data: { groupId, name: name.trim() } });
      return { id: p.id, name: p.name };
    } catch (e) {
      throw this.uniqueNameError(e);
    }
  }

  async update(id: number, data: { name?: string; userId?: number | null }) {
    await this.getPlayer(id);
    if (data.userId != null && !(await this.prisma.user.findUnique({ where: { id: data.userId } }))) {
      throw new BadRequestException('Benutzer nicht gefunden.');
    }
    try {
      await this.prisma.player.update({ where: { id }, data: { name: data.name?.trim(), userId: data.userId } });
    } catch (e) {
      throw this.uniqueNameError(e);
    }
  }

  /** Legt zwei Spieler zusammen: Spiele, Aliase und Verzehr wandern zum Ziel, der Quellspieler verschwindet. */
  async merge(id: number, intoPlayerId: number) {
    if (id === intoPlayerId) {
      throw new BadRequestException('Ein Spieler kann nicht mit sich selbst zusammengelegt werden.');
    }
    const source = await this.getPlayer(id);
    const target = await this.getPlayer(intoPlayerId);
    if (source.groupId !== target.groupId) {
      throw new BadRequestException('Nur Spieler derselben Gruppe lassen sich zusammenlegen.');
    }
    await this.prisma.$transaction([
      this.prisma.game.updateMany({ where: { playerId: id }, data: { playerId: intoPlayerId } }),
      this.prisma.playerAlias.updateMany({ where: { playerId: id }, data: { playerId: intoPlayerId } }),
      this.prisma.consumption.updateMany({ where: { playerId: id }, data: { playerId: intoPlayerId } }),
      this.prisma.player.update({ where: { id: intoPlayerId }, data: { userId: target.userId ?? source.userId } }),
      this.prisma.player.delete({ where: { id } }),
    ]);
  }

  async delete(id: number) {
    await this.getPlayer(id);
    if (await this.prisma.game.count({ where: { playerId: id } })) {
      throw new BadRequestException('Der Spieler hat freigegebene Spiele. Zusammenlegen statt löschen.');
    }
    if (await this.prisma.consumption.count({ where: { playerId: id } })) {
      throw new BadRequestException('Der Spieler hat eingetragenen Verzehr. Zusammenlegen statt löschen.');
    }
    await this.prisma.player.delete({ where: { id } });
  }

  async deleteAlias(id: number) {
    if (!(await this.prisma.playerAlias.findUnique({ where: { id } }))) {
      throw new NotFoundException('Alias nicht gefunden.');
    }
    await this.prisma.playerAlias.delete({ where: { id } });
  }

  private async getPlayer(id: number) {
    const player = await this.prisma.player.findUnique({ where: { id } });
    if (!player) {
      throw new NotFoundException('Spieler nicht gefunden.');
    }
    return player;
  }

  private async ensureGroup(id: number) {
    if (!(await this.prisma.group.findUnique({ where: { id } }))) {
      throw new NotFoundException('Gruppe nicht gefunden.');
    }
  }

  private uniqueNameError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('Einen Spieler mit diesem Namen gibt es in der Gruppe schon.');
    }
    return e;
  }
}
