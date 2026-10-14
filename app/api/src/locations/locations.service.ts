import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { cleanName, nameKey } from '../common/names';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const locations = await this.prisma.location.findMany({ orderBy: { name: 'asc' } });
    return locations.map((l) => ({ id: l.id, name: l.name }));
  }

  /** Legt eine Location an; gibt es den Namen schon, kommt die vorhandene zurück. */
  async create(name: string) {
    const key = nameKey(name);
    const location = await this.prisma.location.upsert({
      where: { nameKey: key },
      create: { name: cleanName(name), nameKey: key },
      update: {},
    });
    return { id: location.id, name: location.name };
  }

  /** Karte einer Location; ausgeblendete Artikel nur auf Wunsch (Kartenpflege). */
  async menu(locationId: number, includeHidden: boolean) {
    await this.getLocation(locationId);
    const items = await this.prisma.menuItem.findMany({
      where: { locationId, ...(includeHidden ? {} : { hidden: false }) },
      include: { _count: { select: { consumptions: true } } },
      orderBy: { name: 'asc' },
    });
    return items.map((i) => ({
      id: i.id,
      name: i.name,
      priceCents: i.priceCents,
      hidden: i.hidden,
      uses: i._count.consumptions,
    }));
  }

  async updateItem(id: number, data: { name?: string; priceCents?: number; hidden?: boolean }) {
    await this.getItem(id);
    try {
      await this.prisma.menuItem.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: cleanName(data.name), nameKey: nameKey(data.name) } : {}),
          priceCents: data.priceCents,
          hidden: data.hidden,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Einen Artikel mit diesem Namen gibt es auf der Karte schon.');
      }
      throw e;
    }
  }

  /** Löscht einen Artikel; wurde er schon verzehrt, wird er nur ausgeblendet. */
  async deleteItem(id: number): Promise<{ hidden: boolean }> {
    await this.getItem(id);
    if (await this.prisma.consumption.count({ where: { menuItemId: id } })) {
      await this.prisma.menuItem.update({ where: { id }, data: { hidden: true } });
      return { hidden: true };
    }
    await this.prisma.menuItem.delete({ where: { id } });
    return { hidden: false };
  }

  private async getLocation(id: number) {
    const location = await this.prisma.location.findUnique({ where: { id } });
    if (!location) {
      throw new NotFoundException('Location nicht gefunden.');
    }
    return location;
  }

  private async getItem(id: number) {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Artikel nicht gefunden.');
    }
    return item;
  }
}
