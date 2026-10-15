import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../common/prisma.service';
import { ADMIN_ONLY, IS_PUBLIC } from './decorators';
import { AuthedRequest, readSession } from './session';

/** „Zuletzt online“ wird höchstens so oft geschrieben, damit nicht jede Anfrage in die DB schreibt */
const LAST_SEEN_INTERVAL_MS = 5 * 60_000;

/** Globaler Guard: lädt den Benutzer bei jeder Anfrage frisch aus der DB, damit entzogene
 *  Rechte und Passwort-Resets sofort wirken. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const session = readSession(req);
    const user = session ? await this.prisma.user.findUnique({ where: { id: session.uid } }) : null;
    if (!user || user.sessionVersion !== session!.v) {
      throw new UnauthorizedException('Bitte anmelden.');
    }
    req.user = { id: user.id, username: user.username, isAdmin: user.isAdmin };

    const now = new Date();
    if (!user.lastSeenAt || now.getTime() - user.lastSeenAt.getTime() > LAST_SEEN_INTERVAL_MS) {
      await this.prisma.user.update({ where: { id: user.id }, data: { lastSeenAt: now } });
    }

    if (this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY, targets) && !user.isAdmin) {
      throw new ForbiddenException('Nur für Admins.');
    }
    return true;
  }
}
