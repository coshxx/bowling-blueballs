import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { hashPassword } from '../auth/password';
import type { SessionUser } from '../auth/session';
import { PrismaService } from '../common/prisma.service';
import { config } from '../config';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Benutzer ----

  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { usernameKey: 'asc' },
      include: { memberships: { include: { group: true } } },
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      isAdmin: u.isAdmin,
      createdAt: u.createdAt.toISOString(),
      groups: u.memberships.map((m) => m.group.name).sort(),
    }));
  }

  async updateUser(id: number, data: { isAdmin?: boolean; password?: string }) {
    const user = await this.getUser(id);
    if (data.isAdmin === false && user.isAdmin) {
      await this.ensureNotLastAdmin();
    }
    await this.prisma.user.update({
      where: { id },
      data: {
        isAdmin: data.isAdmin,
        ...(data.password
          ? // Neues Passwort meldet den Benutzer überall ab
            { passwordHash: await hashPassword(data.password), sessionVersion: { increment: 1 } }
          : {}),
      },
    });
    return (await this.listUsers()).find((u) => u.id === id);
  }

  async deleteUser(me: SessionUser, id: number) {
    if (id === me.id) {
      throw new BadRequestException('Du kannst dein eigenes Konto hier nicht löschen.');
    }
    const user = await this.getUser(id);
    if (user.isAdmin) {
      await this.ensureNotLastAdmin();
    }
    // Uploads, Freigaben und verknüpfte Spieler bleiben erhalten (Verweis wird geleert)
    await this.prisma.user.delete({ where: { id } });
  }

  private async getUser(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Benutzer nicht gefunden.');
    }
    return user;
  }

  private async ensureNotLastAdmin() {
    if ((await this.prisma.user.count({ where: { isAdmin: true } })) <= 1) {
      throw new BadRequestException('Es muss mindestens ein Admin bleiben.');
    }
  }

  // ---- Gruppen ----

  async listGroups() {
    const groups = await this.prisma.group.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { memberships: true, entries: true, players: true } } },
    });
    const approved = await this.prisma.entry.groupBy({
      by: ['groupId'],
      where: { status: 'approved' },
      _count: true,
    });
    const approvedByGroup = new Map(approved.map((a) => [a.groupId, a._count]));
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      createdAt: g.createdAt.toISOString(),
      members: g._count.memberships,
      entries: g._count.entries,
      approvedEntries: approvedByGroup.get(g.id) ?? 0,
      players: g._count.players,
    }));
  }

  async createGroup(name: string) {
    try {
      const g = await this.prisma.group.create({ data: { name: name.trim() } });
      return { id: g.id, name: g.name };
    } catch (e) {
      throw this.uniqueNameError(e);
    }
  }

  async renameGroup(id: number, name: string) {
    await this.getGroup(id);
    try {
      const g = await this.prisma.group.update({ where: { id }, data: { name: name.trim() } });
      return { id: g.id, name: g.name };
    } catch (e) {
      throw this.uniqueNameError(e);
    }
  }

  async deleteGroup(id: number) {
    await this.getGroup(id);
    if (await this.prisma.entry.count({ where: { groupId: id, status: 'approved' } })) {
      throw new BadRequestException('Die Gruppe hat freigegebene Einträge und kann nicht gelöscht werden.');
    }
    const entries = await this.prisma.entry.findMany({ where: { groupId: id }, select: { imageFile: true } });
    await this.prisma.group.delete({ where: { id } });
    await Promise.all(entries.map((e) => unlink(join(config.imagesDir, e.imageFile)).catch(() => undefined)));
  }

  private async getGroup(id: number) {
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException('Gruppe nicht gefunden.');
    }
    return group;
  }

  private uniqueNameError(e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException('Eine Gruppe mit diesem Namen gibt es schon.');
    }
    return e;
  }

  // ---- Mitglieder ----

  async listMembers(groupId: number) {
    await this.getGroup(groupId);
    const members = await this.prisma.membership.findMany({
      where: { groupId },
      include: { user: true },
      orderBy: { user: { usernameKey: 'asc' } },
    });
    return members.map((m) => ({
      userId: m.userId,
      username: m.user.username,
      isAdmin: m.user.isAdmin,
      canUpload: m.canUpload,
      since: m.createdAt.toISOString(),
    }));
  }

  async addMember(groupId: number, username: string) {
    await this.getGroup(groupId);
    const user = await this.prisma.user.findUnique({ where: { usernameKey: username.trim().toLowerCase() } });
    if (!user) {
      throw new NotFoundException(`Benutzer „${username}“ nicht gefunden.`);
    }
    try {
      await this.prisma.membership.create({ data: { groupId, userId: user.id } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`${user.username} ist schon Mitglied.`);
      }
      throw e;
    }
    return this.listMembers(groupId);
  }

  async updateMember(groupId: number, userId: number, canUpload: boolean) {
    await this.getMembership(groupId, userId);
    await this.prisma.membership.update({ where: { userId_groupId: { userId, groupId } }, data: { canUpload } });
    return this.listMembers(groupId);
  }

  async removeMember(groupId: number, userId: number) {
    await this.getMembership(groupId, userId);
    // Uploads und Spiele des Mitglieds bleiben in der Gruppe
    await this.prisma.membership.delete({ where: { userId_groupId: { userId, groupId } } });
    return this.listMembers(groupId);
  }

  private async getMembership(groupId: number, userId: number) {
    const m = await this.prisma.membership.findUnique({ where: { userId_groupId: { userId, groupId } } });
    if (!m) {
      throw new NotFoundException('Mitgliedschaft nicht gefunden.');
    }
    return m;
  }
}
