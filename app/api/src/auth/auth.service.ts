import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { User } from '@prisma/client';
import { avatarUrl } from '../common/avatar';
import { PrismaService } from '../common/prisma.service';
import { config } from '../config';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';
import type { SessionUser } from './session';

export interface MeResponse {
  user: SessionUser;
  groups: { id: number; name: string; canUpload: boolean }[];
  profile: {
    paypalMe: string | null;
    avatarUrl: string | null;
    /** Gruppen, in denen das Konto mit keinem Spieler verknüpft ist (dort erscheint der Avatar nicht) */
    unlinkedGroups: string[];
  };
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(username: string, password: string, inviteCode?: string): Promise<User> {
    if (config.registerCode !== null && !sameSecret(inviteCode?.trim() ?? '', config.registerCode)) {
      throw new ForbiddenException('Der Einladungscode stimmt nicht.');
    }
    const usernameKey = username.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { usernameKey } })) {
      throw new ConflictException('Der Benutzername ist schon vergeben.');
    }
    return this.prisma.user.create({
      data: {
        username,
        usernameKey,
        passwordHash: await hashPassword(password),
        isAdmin: config.adminUsers.includes(usernameKey),
      },
    });
  }

  async login(username: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { usernameKey: username.trim().toLowerCase() } });
    const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      throw new UnauthorizedException('Benutzername oder Passwort falsch.');
    }
    // In ADMIN_USERS eingetragene Benutzer werden beim Login nachträglich Admin
    if (!user.isAdmin && config.adminUsers.includes(user.usernameKey)) {
      return this.prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });
    }
    return user;
  }

  async me(user: SessionUser): Promise<MeResponse> {
    const { paypalMe, avatarFile } = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { paypalMe: true, avatarFile: true },
    });
    const unlinked = await this.prisma.membership.findMany({
      where: { userId: user.id, group: { players: { none: { userId: user.id } } } },
      include: { group: true },
      orderBy: { group: { name: 'asc' } },
    });
    const profile = {
      paypalMe,
      avatarUrl: avatarUrl({ id: user.id, avatarFile }),
      unlinkedGroups: unlinked.map((m) => m.group.name),
    };
    if (user.isAdmin) {
      // Admins sehen alle Gruppen und dürfen überall hochladen
      const groups = await this.prisma.group.findMany({ orderBy: { name: 'asc' } });
      return { user, groups: groups.map((g) => ({ id: g.id, name: g.name, canUpload: true })), profile };
    }
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id },
      include: { group: true },
      orderBy: { group: { name: 'asc' } },
    });
    return {
      user,
      groups: memberships.map((m) => ({ id: m.group.id, name: m.group.name, canUpload: m.canUpload })),
      profile,
    };
  }

  /** Prüft das aktuelle Passwort, setzt das neue und macht alle bestehenden Sessions ungültig. */
  async changePassword(user: SessionUser, currentPassword: string, newPassword: string): Promise<User> {
    const { passwordHash } = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true } });
    if (!(await verifyPassword(currentPassword, passwordHash))) {
      // 403 statt 401: Das Frontend würde bei 401 zum Login umleiten
      throw new ForbiddenException('Das aktuelle Passwort stimmt nicht.');
    }
    return this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 } },
    });
  }

  async updateProfile(user: SessionUser, data: { paypalMe?: string | null }): Promise<MeResponse> {
    await this.prisma.user.update({ where: { id: user.id }, data: { paypalMe: data.paypalMe || null } });
    return this.me(user);
  }
}

/** Vergleich in konstanter Zeit; die Hashes gleichen unterschiedliche Längen aus */
function sameSecret(a: string, b: string): boolean {
  const hash = (v: string) => createHash('sha256').update(v).digest();
  return timingSafeEqual(hash(a), hash(b));
}
