import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Consumption, Evening, Location, MenuItem, Player, User } from '@prisma/client';
import type { SessionUser } from '../auth/session';
import { AccessService, GroupAccess } from '../common/access.service';
import { cleanName, nameKey } from '../common/names';
import { PrismaService } from '../common/prisma.service';
import type { AddConsumptionDto, CreateEveningDto, UpdateConsumptionDto, UpdateEveningDto } from './evenings.dto';

type EveningWithRelations = Evening & {
  location: Location | null;
  createdBy: User | null;
  consumptions: (Consumption & { player: Player; menuItem: MenuItem })[];
};

const EVENING_INCLUDE = {
  location: true,
  createdBy: true,
  consumptions: { include: { player: true, menuItem: true }, orderBy: { createdAt: 'asc' } },
} as const;

@Injectable()
export class EveningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  private toDto(e: EveningWithRelations, access: GroupAccess) {
    const items = e.consumptions.map((c) => ({
      id: c.id,
      playerId: c.playerId,
      playerName: c.player.name,
      menuItemId: c.menuItemId,
      itemName: c.menuItem.name,
      quantity: c.quantity,
      unitCents: c.unitCents,
      totalCents: c.quantity * c.unitCents,
    }));
    const perPlayer = new Map<number, { playerId: number; playerName: string; totalCents: number }>();
    for (const i of items) {
      const t = perPlayer.get(i.playerId) ?? { playerId: i.playerId, playerName: i.playerName, totalCents: 0 };
      t.totalCents += i.totalCents;
      perPlayer.set(i.playerId, t);
    }
    return {
      id: e.id,
      groupId: e.groupId,
      date: e.date,
      label: e.label,
      location: e.location ? { id: e.location.id, name: e.location.name } : null,
      createdBy: e.createdBy?.username ?? null,
      createdAt: e.createdAt.toISOString(),
      items,
      totals: [...perPlayer.values()].sort((a, b) => b.totalCents - a.totalCents || a.playerName.localeCompare(b.playerName)),
      totalCents: items.reduce((sum, i) => sum + i.totalCents, 0),
      can: {
        edit: access.canUpload,
        delete: access.canUpload && items.length === 0,
      },
    };
  }

  /** Lädt einen Abend und prüft die Mitgliedschaft; mit write zusätzlich das Upload-Recht. */
  private async load(user: SessionUser, id: number, write = false) {
    const evening = await this.prisma.evening.findUnique({ where: { id }, include: EVENING_INCLUDE });
    if (!evening) {
      throw new NotFoundException('Abend nicht gefunden.');
    }
    const access = write ? await this.access.uploader(user, evening.groupId) : await this.access.member(user, evening.groupId);
    return { evening, access };
  }

  async list(user: SessionUser, groupId: number) {
    const access = await this.access.member(user, groupId);
    const evenings = await this.prisma.evening.findMany({
      where: { groupId },
      include: EVENING_INCLUDE,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    // Für die Liste reichen die Summen, die einzelnen Positionen bleiben weg
    return evenings.map((e) => {
      const { items, totals, ...rest } = this.toDto(e, access);
      return { ...rest, players: totals.length, positions: items.length };
    });
  }

  async get(user: SessionUser, id: number) {
    const { evening, access } = await this.load(user, id);
    return this.toDto(evening, access);
  }

  async create(user: SessionUser, groupId: number, dto: CreateEveningDto) {
    const access = await this.access.uploader(user, groupId);
    if (dto.locationId !== undefined) await this.ensureLocation(dto.locationId);
    const evening = await this.prisma.evening.create({
      data: {
        groupId,
        date: dto.date,
        locationId: dto.locationId,
        label: cleanName(dto.label ?? '') || null,
        createdById: user.id,
      },
      include: EVENING_INCLUDE,
    });
    return this.toDto(evening, access);
  }

  async update(user: SessionUser, id: number, dto: UpdateEveningDto) {
    const { evening } = await this.load(user, id, true);
    if (dto.locationId !== undefined && dto.locationId !== evening.locationId) {
      // Die Artikel gehören zur Karte der bisherigen Location
      if (evening.consumptions.length) {
        throw new ConflictException('Die Location lässt sich nur ändern, solange kein Verzehr eingetragen ist.');
      }
      if (dto.locationId !== null) await this.ensureLocation(dto.locationId);
    }
    await this.prisma.evening.update({
      where: { id },
      data: {
        date: dto.date,
        locationId: dto.locationId,
        ...(dto.label !== undefined ? { label: cleanName(dto.label ?? '') || null } : {}),
      },
    });
    return this.get(user, id);
  }

  async delete(user: SessionUser, id: number) {
    const { evening } = await this.load(user, id, true);
    if (evening.consumptions.length) {
      throw new ConflictException('Ein Abend lässt sich nur löschen, solange kein Verzehr eingetragen ist.');
    }
    await this.prisma.evening.delete({ where: { id } });
  }

  /** Trägt Verzehr ein. Neue Artikel landen auf der Karte, der Preis wird zum neuen Vorschlag.
   *  Gleicher Spieler, Artikel und Preis erhöhen die Menge einer vorhandenen Position. */
  async addConsumption(user: SessionUser, eveningId: number, dto: AddConsumptionDto) {
    const { evening } = await this.load(user, eveningId, true);
    const locationId = evening.locationId;
    if (locationId === null) {
      throw new BadRequestException('Bitte zuerst eine Location für den Abend wählen.');
    }
    if ((dto.playerId === undefined) === (dto.newPlayerName === undefined)) {
      throw new BadRequestException('Bitte genau einen Spieler zuordnen.');
    }
    if (dto.playerId !== undefined) {
      const player = await this.prisma.player.findUnique({ where: { id: dto.playerId } });
      if (player?.groupId !== evening.groupId) {
        throw new BadRequestException('Spieler gehört nicht zu dieser Gruppe.');
      }
    }
    const itemName = cleanName(dto.itemName);

    await this.prisma.$transaction(async (tx) => {
      let playerId = dto.playerId;
      if (playerId === undefined) {
        const name = cleanName(dto.newPlayerName!);
        // Gleichnamigen Spieler wiederverwenden, wie bei der Freigabe
        const groupPlayers = await tx.player.findMany({ where: { groupId: evening.groupId } });
        playerId =
          groupPlayers.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id ??
          (await tx.player.create({ data: { groupId: evening.groupId, name } })).id;
      }
      const item = await tx.menuItem.upsert({
        where: { locationId_nameKey: { locationId, nameKey: nameKey(itemName) } },
        create: { locationId, name: itemName, nameKey: nameKey(itemName), priceCents: dto.unitCents },
        update: { priceCents: dto.unitCents, hidden: false },
      });
      const same = await tx.consumption.findFirst({
        where: { eveningId, playerId, menuItemId: item.id, unitCents: dto.unitCents },
      });
      if (same) {
        await tx.consumption.update({ where: { id: same.id }, data: { quantity: Math.min(99, same.quantity + dto.quantity) } });
      } else {
        await tx.consumption.create({
          data: { eveningId, playerId, menuItemId: item.id, quantity: dto.quantity, unitCents: dto.unitCents },
        });
      }
    });
    return this.get(user, eveningId);
  }

  async updateConsumption(user: SessionUser, id: number, dto: UpdateConsumptionDto) {
    const consumption = await this.getConsumption(id);
    await this.load(user, consumption.eveningId, true);
    await this.prisma.$transaction([
      this.prisma.consumption.update({ where: { id }, data: { quantity: dto.quantity, unitCents: dto.unitCents } }),
      // Ein geänderter Preis wird auch zum Vorschlag auf der Karte
      ...(dto.unitCents !== undefined
        ? [this.prisma.menuItem.update({ where: { id: consumption.menuItemId }, data: { priceCents: dto.unitCents } })]
        : []),
    ]);
    return this.get(user, consumption.eveningId);
  }

  async deleteConsumption(user: SessionUser, id: number) {
    const consumption = await this.getConsumption(id);
    await this.load(user, consumption.eveningId, true);
    await this.prisma.consumption.delete({ where: { id } });
    return this.get(user, consumption.eveningId);
  }

  private async getConsumption(id: number) {
    const consumption = await this.prisma.consumption.findUnique({ where: { id } });
    if (!consumption) {
      throw new NotFoundException('Position nicht gefunden.');
    }
    return consumption;
  }

  private async ensureLocation(id: number) {
    if (!(await this.prisma.location.findUnique({ where: { id } }))) {
      throw new BadRequestException('Location nicht gefunden.');
    }
  }
}
