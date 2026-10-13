import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { config } from '../config';
import { DUMMY_HASH, hashPassword, verifyPassword } from './password';
import type { SessionUser } from './session';

export interface MeResponse {
  user: SessionUser;
  groups: { id: number; name: string; canUpload: boolean }[];
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(username: string, password: string): Promise<User> {
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
    if (user.isAdmin) {
      // Admins sehen alle Gruppen und dürfen überall hochladen
      const groups = await this.prisma.group.findMany({ orderBy: { name: 'asc' } });
      return { user, groups: groups.map((g) => ({ id: g.id, name: g.name, canUpload: true })) };
    }
    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id },
      include: { group: true },
      orderBy: { group: { name: 'asc' } },
    });
    return {
      user,
      groups: memberships.map((m) => ({ id: m.group.id, name: m.group.name, canUpload: m.canUpload })),
    };
  }
}
