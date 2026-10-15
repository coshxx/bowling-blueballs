import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { SessionUser } from '../auth/session';
import { AccessService, GroupAccess } from '../common/access.service';
import { cleanName, nameKey } from '../common/names';
import { PrismaService } from '../common/prisma.service';
import { computeBill } from './billing';
import type {
  AddAttendeeDto,
  AddConsumptionDto,
  BillDto,
  CreateEveningDto,
  UpdateConsumptionDto,
  UpdateEveningDto,
} from './evenings.dto';

export type EveningStatus = 'open' | 'billed' | 'settled';

const EVENING_INCLUDE = {
  location: true,
  createdBy: true,
  recipient: { include: { user: true } },
  attendees: { include: { player: true, paidBy: true } },
  consumptions: {
    include: { player: true, menuItem: true, shares: { include: { player: true } } },
    orderBy: { createdAt: 'asc' },
  },
} as const;

type EveningWithRelations = Prisma.EveningGetPayload<{ include: typeof EVENING_INCLUDE }>;
type Tx = Prisma.TransactionClient;

/** Einzelpositionen heißen wie ihr Kartenartikel, geteilte tragen ihren Namen selbst */
function itemName(c: { name: string | null; menuItem: { name: string } | null }): string {
  return c.menuItem?.name ?? c.name ?? '';
}

@Injectable()
export class EveningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  private toDto(e: EveningWithRelations, user: SessionUser, access: GroupAccess) {
    const isOwner = e.createdById === user.id;
    const ownerPlayerId = e.attendees.find((a) => a.player.userId !== null && a.player.userId === e.createdById)?.playerId ?? null;
    // Rest-Cent und "bezahlt" hängen am Empfänger; solange keiner gewählt ist, am Besitzer
    const recipientId = e.recipientId ?? ownerPlayerId;
    const itemNames = new Map(e.consumptions.map((c) => [c.id, itemName(c)]));
    const bill = computeBill(
      e.consumptions.map((c) => ({
        id: c.id,
        playerId: c.playerId,
        totalCents: c.quantity * c.unitCents,
        containedInId: c.containedInId,
        shareIds: c.shares.map((s) => s.playerId),
      })),
      recipientId,
      (id) => itemNames.get(id) ?? `Position ${id}`,
    );

    const billed = e.status === 'billed';
    const attendees = e.attendees
      .map((a) => {
        const amountCents = bill.amounts.get(a.playerId) ?? 0;
        const isRecipient = a.playerId === recipientId;
        const isMe = a.player.userId === user.id;
        return {
          playerId: a.playerId,
          playerName: a.player.name,
          hasAccount: a.player.userId !== null,
          isMe,
          isRecipient,
          amountCents,
          // Der Empfänger zahlt an sich selbst, Teilnehmer ohne Betrag schulden nichts
          paid: isRecipient || amountCents === 0 || a.paidAt !== null,
          paidAt: a.paidAt?.toISOString() ?? null,
          paidBy: a.paidBy?.username ?? null,
          /** Nach dem Abhaken wurde der Abend noch einmal geändert */
          paidCentsDiffer: a.paidAt !== null && a.paidCents !== null && a.paidCents !== amountCents,
          canMarkPaid: billed && !isRecipient && amountCents > 0 && (isMe || isOwner || user.isAdmin),
          locked: e.consumptions.some((c) => c.playerId === a.playerId || c.shares.some((s) => s.playerId === a.playerId)),
        };
      })
      .sort((a, b) => a.playerName.localeCompare(b.playerName));

    const settled = billed && attendees.every((a) => a.paid);
    const status: EveningStatus = settled ? 'settled' : billed ? 'billed' : 'open';
    const anyPaid = e.attendees.some((a) => a.paidAt !== null);
    const recipient = e.recipient
      ? { playerId: e.recipient.id, playerName: e.recipient.name, paypalMe: e.recipient.user?.paypalMe ?? null }
      : null;

    return {
      id: e.id,
      groupId: e.groupId,
      date: e.date,
      label: e.label,
      location: e.location ? { id: e.location.id, name: e.location.name } : null,
      status,
      owner: e.createdBy?.username ?? null,
      isOwner,
      recipient,
      billedAt: e.billedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
      attendees,
      items: e.consumptions.map((c) => ({
        id: c.id,
        shared: c.playerId === null,
        playerId: c.playerId,
        playerName: c.player?.name ?? null,
        shares: c.shares.map((s) => ({ playerId: s.playerId, playerName: s.player.name })),
        menuItemId: c.menuItemId,
        itemName: itemName(c),
        quantity: c.quantity,
        unitCents: c.unitCents,
        totalCents: c.quantity * c.unitCents,
        /** Geteilte Position: Betrag nach Abzug der enthaltenen Einzelpositionen */
        netCents: bill.netCents.get(c.id) ?? null,
        containedInId: c.containedInId,
      })),
      problems: bill.problems,
      totalCents: e.consumptions.filter((c) => c.containedInId === null).reduce((sum, c) => sum + c.quantity * c.unitCents, 0),
      openCents: attendees.filter((a) => !a.paid).reduce((sum, a) => sum + a.amountCents, 0),
      myOpenCents: billed ? attendees.filter((a) => a.isMe && !a.paid).reduce((sum, a) => sum + a.amountCents, 0) : 0,
      can: {
        edit: access.canUpload && e.status === 'open',
        // Leere Abende darf jeder mit Upload-Recht löschen, laufende mit Positionen nur Besitzer und Admins
        delete: access.canUpload && e.status === 'open' && (e.consumptions.length === 0 || isOwner || user.isAdmin),
        bill: (isOwner || user.isAdmin) && e.status === 'open',
        reopen: e.status === 'billed' && (user.isAdmin || (isOwner && !anyPaid)),
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

  /** Wie load(write), verlangt aber zusätzlich, dass der Abend noch läuft. */
  private async loadOpen(user: SessionUser, id: number) {
    const loaded = await this.load(user, id, true);
    if (loaded.evening.status !== 'open') {
      throw new ConflictException('Der Abend ist schon zur Zahlung freigegeben und lässt sich nicht mehr ändern.');
    }
    return loaded;
  }

  async list(user: SessionUser, groupId: number) {
    const access = await this.access.member(user, groupId);
    const evenings = await this.prisma.evening.findMany({
      where: { groupId },
      include: EVENING_INCLUDE,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    // Für die Liste reichen die Summen
    return evenings.map((e) => {
      const { items, attendees, problems, ...rest } = this.toDto(e, user, access);
      return { ...rest, players: attendees.length, positions: items.length };
    });
  }

  async get(user: SessionUser, id: number) {
    const { evening, access } = await this.load(user, id);
    return this.toDto(evening, user, access);
  }

  async create(user: SessionUser, groupId: number, dto: CreateEveningDto) {
    await this.access.uploader(user, groupId);
    if (dto.locationId !== undefined) await this.ensureLocation(dto.locationId);
    // Der Besitzer ist von Anfang an Teilnehmer, wenn sein Konto mit einem Spieler verknüpft ist
    const ownPlayer = await this.prisma.player.findFirst({ where: { groupId, userId: user.id } });
    const evening = await this.prisma.evening.create({
      data: {
        groupId,
        date: dto.date,
        locationId: dto.locationId,
        label: cleanName(dto.label ?? '') || null,
        createdById: user.id,
        ...(ownPlayer ? { attendees: { create: { playerId: ownPlayer.id } } } : {}),
      },
    });
    return this.get(user, evening.id);
  }

  async update(user: SessionUser, id: number, dto: UpdateEveningDto) {
    const { evening } = await this.loadOpen(user, id);
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
    const { evening, access } = await this.loadOpen(user, id);
    if (!this.toDto(evening, user, access).can.delete) {
      throw new ForbiddenException('Einen Abend mit Positionen kann nur sein Besitzer oder ein Admin löschen.');
    }
    // Positionen, Anteile und Teilnehmer hängen per Cascade am Abend
    await this.prisma.evening.delete({ where: { id } });
  }

  // --- Teilnehmer ---

  async addAttendee(user: SessionUser, id: number, dto: AddAttendeeDto) {
    const { evening } = await this.loadOpen(user, id);
    await this.prisma.$transaction(async (tx) => {
      const playerId = await this.resolvePlayer(tx, evening.groupId, dto);
      await this.ensureAttendee(tx, id, playerId);
    });
    return this.get(user, id);
  }

  async removeAttendee(user: SessionUser, id: number, playerId: number) {
    const { evening } = await this.loadOpen(user, id);
    if (evening.consumptions.some((c) => c.playerId === playerId || c.shares.some((s) => s.playerId === playerId))) {
      throw new ConflictException('Wer schon Positionen oder Anteile hat, lässt sich nicht entfernen.');
    }
    await this.prisma.eveningAttendee.deleteMany({ where: { eveningId: id, playerId } });
    return this.get(user, id);
  }

  // --- Positionen ---

  /** Trägt eine Position ein. Bei Einzelpositionen landen neue Artikel auf der Karte und der Preis wird zum
   *  neuen Vorschlag; gleicher Spieler, Artikel, Preis und "steckt in" erhöhen die Menge.
   *  Geteilte Positionen (z. B. Bahnen) bleiben der Karte fern, ihr Preis ist jedes Mal anders. */
  async addConsumption(user: SessionUser, eveningId: number, dto: AddConsumptionDto) {
    const { evening } = await this.loadOpen(user, eveningId);
    const locationId = evening.locationId;
    if (locationId === null) {
      throw new BadRequestException('Bitte zuerst eine Location für den Abend wählen.');
    }
    const shared = dto.sharedWith !== undefined;
    const singleTargets = [dto.playerId, dto.newPlayerName].filter((v) => v !== undefined).length;
    if (shared ? singleTargets > 0 : singleTargets !== 1) {
      throw new BadRequestException('Bitte genau eine Person wählen oder die Position teilen.');
    }
    if (shared) this.checkShares(evening, dto.sharedWith!);
    if (dto.containedInId !== undefined) {
      if (shared) throw new BadRequestException('Nur Einzelpositionen können in einer geteilten Position stecken.');
      this.checkContainer(evening, dto.containedInId);
    }
    const name = cleanName(dto.itemName);

    await this.prisma.$transaction(async (tx) => {
      if (shared) {
        await tx.consumption.create({
          data: {
            eveningId,
            name,
            quantity: dto.quantity,
            unitCents: dto.unitCents,
            shares: { create: [...new Set(dto.sharedWith)].map((playerId) => ({ playerId })) },
          },
        });
        return;
      }
      const item = await tx.menuItem.upsert({
        where: { locationId_nameKey: { locationId, nameKey: nameKey(name) } },
        create: { locationId, name, nameKey: nameKey(name), priceCents: dto.unitCents },
        update: { priceCents: dto.unitCents, hidden: false },
      });
      // Wer eine Position bekommt, wird automatisch Teilnehmer
      const playerId = await this.resolvePlayer(tx, evening.groupId, dto);
      await this.ensureAttendee(tx, eveningId, playerId);
      const containedInId = dto.containedInId ?? null;
      const same = await tx.consumption.findFirst({
        where: { eveningId, playerId, menuItemId: item.id, unitCents: dto.unitCents, containedInId },
      });
      if (same) {
        await tx.consumption.update({ where: { id: same.id }, data: { quantity: Math.min(99, same.quantity + dto.quantity) } });
      } else {
        await tx.consumption.create({
          data: { eveningId, playerId, menuItemId: item.id, quantity: dto.quantity, unitCents: dto.unitCents, containedInId },
        });
      }
    });
    return this.get(user, eveningId);
  }

  async updateConsumption(user: SessionUser, id: number, dto: UpdateConsumptionDto) {
    const consumption = await this.getConsumption(id);
    const { evening } = await this.loadOpen(user, consumption.eveningId);
    const shared = consumption.playerId === null;
    if (dto.sharedWith !== undefined) {
      if (!shared) throw new BadRequestException('Nur geteilte Positionen haben Anteile.');
      this.checkShares(evening, dto.sharedWith);
    }
    if (dto.containedInId !== undefined && dto.containedInId !== null) {
      if (shared) throw new BadRequestException('Nur Einzelpositionen können in einer geteilten Position stecken.');
      this.checkContainer(evening, dto.containedInId);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.consumption.update({
        where: { id },
        data: { quantity: dto.quantity, unitCents: dto.unitCents, containedInId: dto.containedInId },
      });
      if (dto.sharedWith !== undefined) {
        await tx.consumptionShare.deleteMany({ where: { consumptionId: id } });
        await tx.consumptionShare.createMany({ data: [...new Set(dto.sharedWith)].map((playerId) => ({ consumptionId: id, playerId })) });
      }
      // Ein geänderter Preis wird auch zum Vorschlag auf der Karte (geteilte Positionen stehen nicht darauf)
      if (dto.unitCents !== undefined && consumption.menuItemId !== null) {
        await tx.menuItem.update({ where: { id: consumption.menuItemId }, data: { priceCents: dto.unitCents } });
      }
    });
    return this.get(user, consumption.eveningId);
  }

  /** Legt fest, welche Einzelpositionen in einer geteilten Position stecken (z. B. alle Leihschuhe in der Bahn). */
  async setContained(user: SessionUser, id: number, itemIds: number[]) {
    const consumption = await this.getConsumption(id);
    const { evening } = await this.loadOpen(user, consumption.eveningId);
    if (consumption.playerId !== null) {
      throw new BadRequestException('Nur in geteilten Positionen können andere Positionen stecken.');
    }
    const ids = [...new Set(itemIds)];
    if (ids.some((itemId) => !evening.consumptions.some((c) => c.id === itemId && c.playerId !== null))) {
      throw new BadRequestException('Nur Einzelpositionen dieses Abends können in einer geteilten Position stecken.');
    }
    await this.prisma.$transaction([
      this.prisma.consumption.updateMany({ where: { containedInId: id, id: { notIn: ids } }, data: { containedInId: null } }),
      this.prisma.consumption.updateMany({ where: { id: { in: ids } }, data: { containedInId: id } }),
    ]);
    return this.get(user, consumption.eveningId);
  }

  async deleteConsumption(user: SessionUser, id: number) {
    const consumption = await this.getConsumption(id);
    const { evening } = await this.loadOpen(user, consumption.eveningId);
    if (evening.consumptions.some((c) => c.containedInId === id)) {
      throw new ConflictException('In dieser Position stecken noch andere Positionen. Bitte diese zuerst lösen oder entfernen.');
    }
    await this.prisma.consumption.delete({ where: { id } });
    return this.get(user, consumption.eveningId);
  }

  // --- Abrechnung ---

  /** Gibt den Abend zur Zahlung frei; danach sind Positionen und Teilnehmer gesperrt. */
  async bill(user: SessionUser, id: number, dto: BillDto) {
    const { evening, access } = await this.load(user, id);
    if (!this.toDto(evening, user, access).can.bill) {
      throw evening.status === 'open'
        ? new ForbiddenException('Nur der Besitzer des Abends kann ihn zur Zahlung freigeben.')
        : new ConflictException('Der Abend ist schon zur Zahlung freigegeben.');
    }
    const recipientId =
      dto.recipientId ?? evening.attendees.find((a) => a.player.userId !== null && a.player.userId === evening.createdById)?.playerId;
    const recipient = evening.attendees.find((a) => a.playerId === recipientId);
    if (!recipient) {
      throw new BadRequestException('Bitte wählen, wer das Geld bekommt – es muss ein Teilnehmer sein.');
    }
    if (recipient.player.userId === null) {
      throw new BadRequestException('Das Geld kann nur jemand mit Benutzerkonto bekommen.');
    }
    if (evening.consumptions.length === 0) {
      throw new BadRequestException('Es ist noch nichts eingetragen.');
    }
    const { problems } = this.toDto(evening, user, access);
    if (problems.length) {
      throw new BadRequestException(problems.join(' '));
    }
    const { count } = await this.prisma.evening.updateMany({
      where: { id, status: 'open' },
      data: { status: 'billed', recipientId: recipient.playerId, billedAt: new Date() },
    });
    if (count === 0) {
      throw new ConflictException('Der Abend hat sich inzwischen geändert, bitte neu laden.');
    }
    return this.get(user, id);
  }

  /** Öffnet einen freigegebenen Abend wieder: der Besitzer, solange niemand bezahlt hat, Admins immer. */
  async reopen(user: SessionUser, id: number) {
    const { evening, access } = await this.load(user, id);
    if (!this.toDto(evening, user, access).can.reopen) {
      throw evening.status !== 'billed'
        ? new ConflictException('Der Abend ist nicht zur Zahlung freigegeben.')
        : new ForbiddenException('Wieder öffnen kann nur der Besitzer, solange noch niemand bezahlt hat (sonst ein Admin).');
    }
    // Bezahlt-Häkchen bleiben stehen; ändern sich Beträge, zeigt paidCentsDiffer das an
    await this.prisma.evening.update({ where: { id }, data: { status: 'open', billedAt: null } });
    return this.get(user, id);
  }

  /** Hakt einen Anteil als bezahlt ab oder nimmt das zurück: der Teilnehmer selbst oder der Besitzer. */
  async markPaid(user: SessionUser, id: number, playerId: number, paid: boolean) {
    const { evening, access } = await this.load(user, id);
    const attendee = this.toDto(evening, user, access).attendees.find((a) => a.playerId === playerId);
    if (!attendee) {
      throw new NotFoundException('Teilnehmer nicht gefunden.');
    }
    if (!attendee.canMarkPaid) {
      throw new ForbiddenException('Diesen Anteil kannst du nicht abhaken.');
    }
    await this.prisma.eveningAttendee.update({
      where: { eveningId_playerId: { eveningId: id, playerId } },
      data: paid
        ? { paidAt: new Date(), paidById: user.id, paidCents: attendee.amountCents }
        : { paidAt: null, paidById: null, paidCents: null },
    });
    return this.get(user, id);
  }

  // --- Hilfen ---

  /** Bestehender Spieler der Gruppe oder neuer mit diesem Namen (Gleichnamige werden wiederverwendet). */
  private async resolvePlayer(tx: Tx, groupId: number, dto: { playerId?: number; newPlayerName?: string }) {
    if ((dto.playerId === undefined) === (dto.newPlayerName === undefined)) {
      throw new BadRequestException('Bitte genau eine Person wählen.');
    }
    if (dto.playerId !== undefined) {
      const player = await tx.player.findUnique({ where: { id: dto.playerId } });
      if (player?.groupId !== groupId) {
        throw new BadRequestException('Spieler gehört nicht zu dieser Gruppe.');
      }
      return player.id;
    }
    const name = cleanName(dto.newPlayerName!);
    const groupPlayers = await tx.player.findMany({ where: { groupId } });
    return (
      groupPlayers.find((p) => p.name.toLowerCase() === name.toLowerCase())?.id ??
      (await tx.player.create({ data: { groupId, name } })).id
    );
  }

  private async ensureAttendee(tx: Tx, eveningId: number, playerId: number) {
    await tx.eveningAttendee.upsert({
      where: { eveningId_playerId: { eveningId, playerId } },
      create: { eveningId, playerId },
      update: {},
    });
  }

  private checkShares(evening: EveningWithRelations, playerIds: number[]) {
    if (playerIds.length === 0) {
      throw new BadRequestException('Mindestens eine Person muss mitzahlen.');
    }
    if (playerIds.some((id) => !evening.attendees.some((a) => a.playerId === id))) {
      throw new BadRequestException('Teilen geht nur unter Teilnehmern des Abends.');
    }
  }

  private checkContainer(evening: EveningWithRelations, containerId: number) {
    const container = evening.consumptions.find((c) => c.id === containerId);
    if (!container || container.playerId !== null) {
      throw new BadRequestException('„Steckt in“ geht nur bei einer geteilten Position dieses Abends.');
    }
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
