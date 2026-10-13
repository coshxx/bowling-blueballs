import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { SessionUser } from '../auth/session';
import { PrismaService } from './prisma.service';

export interface GroupAccess {
  groupId: number;
  canUpload: boolean;
}

/** Zentrale Rechteprüfung pro Gruppe. Admins dürfen überall alles. */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async member(user: SessionUser, groupId: number): Promise<GroupAccess> {
    if (user.isAdmin) {
      if (!(await this.prisma.group.findUnique({ where: { id: groupId }, select: { id: true } }))) {
        throw new NotFoundException('Gruppe nicht gefunden.');
      }
      return { groupId, canUpload: true };
    }
    const m = await this.prisma.membership.findUnique({ where: { userId_groupId: { userId: user.id, groupId } } });
    if (!m) {
      // Bewusst 404 statt 403: Nicht-Mitglieder sollen nicht erfahren, dass die Gruppe existiert
      throw new NotFoundException('Gruppe nicht gefunden.');
    }
    return { groupId, canUpload: m.canUpload };
  }

  async uploader(user: SessionUser, groupId: number): Promise<GroupAccess> {
    const access = await this.member(user, groupId);
    if (!access.canUpload) {
      throw new ForbiddenException('Du hast in dieser Gruppe kein Upload-Recht.');
    }
    return access;
  }
}
