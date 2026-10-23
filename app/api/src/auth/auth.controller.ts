import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  Logger,
  Patch,
  Post,
  Put,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { AvatarsService } from '../avatars/avatars.service';
import { ChangePasswordDto, LoginDto, RegisterDto, UpdateProfileDto } from './auth.dto';
import { config } from '../config';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { clearSession, readSession, SessionUser, writeSession } from './session';

// req.ip ist dank „trust proxy“ die echte Client-IP aus dem X-Forwarded-For von Tailscale
function client(req: Request): string {
  return `${req.ip} (${req.get('user-agent') ?? 'unbekannt'})`;
}

function reason(e: unknown): string {
  return e instanceof HttpException ? e.message : String(e);
}

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger('Zugriff');

  constructor(
    private readonly auth: AuthService,
    private readonly avatars: AvatarsService,
  ) {}

  /** Öffentlich: Das Login-Formular fragt beim Öffnen, ob es ein Feld für den Einladungscode braucht.
   *  Damit landet jeder Aufruf der Login-Seite im Log. */
  @Public()
  @Get('options')
  options(@Req() req: Request) {
    this.logger.log(`Login-Seite aufgerufen von ${client(req)}`);
    return { inviteCodeRequired: config.registerCode !== null };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    let user;
    try {
      user = await this.auth.register(dto.username, dto.password, dto.inviteCode);
    } catch (e) {
      this.logger.warn(`Registrierung fehlgeschlagen für ${JSON.stringify(dto.username)} von ${client(req)}: ${reason(e)}`);
      throw e;
    }
    this.logger.log(`Registrierung ${user.username} von ${client(req)}`);
    writeSession(res, user.id, user.sessionVersion);
    return this.auth.me({ id: user.id, username: user.username, isAdmin: user.isAdmin });
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    let user;
    try {
      user = await this.auth.login(dto.username, dto.password);
    } catch (e) {
      this.logger.warn(`Login fehlgeschlagen für ${JSON.stringify(dto.username)} von ${client(req)}`);
      throw e;
    }
    this.logger.log(`Login ${user.username} von ${client(req)}`);
    writeSession(res, user.id, user.sessionVersion);
    return this.auth.me({ id: user.id, username: user.username, isAdmin: user.isAdmin });
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = readSession(req);
    if (session) {
      this.logger.log(`Logout Benutzer #${session.uid} von ${client(req)}`);
    }
    clearSession(res);
  }

  // Wird vom Frontend beim App-Start aufgerufen (und nach Admin-Änderungen erneut)
  @Get('me')
  me(@CurrentUser() user: SessionUser, @Req() req: Request) {
    this.logger.log(`App geöffnet: ${user.username} von ${client(req)}`);
    return this.auth.me(user);
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch('password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: SessionUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    let updated;
    try {
      updated = await this.auth.changePassword(user, dto.currentPassword, dto.newPassword);
    } catch (e) {
      this.logger.warn(`Passwortänderung fehlgeschlagen für ${user.username} von ${client(req)}: ${reason(e)}`);
      throw e;
    }
    this.logger.log(`Passwort geändert: ${user.username} von ${client(req)}`);
    // Andere Geräte sind über die neue sessionVersion abgemeldet, dieses bleibt eingeloggt
    writeSession(res, updated.id, updated.sessionVersion);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: SessionUser, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(user, dto);
  }

  @Put('avatar')
  @UseInterceptors(
    FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: config.maxAvatarBytes, files: 1 } }),
  )
  async setAvatar(@CurrentUser() user: SessionUser, @UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Kein Bild hochgeladen.');
    }
    await this.avatars.set(user.id, file.buffer);
    return this.auth.me(user);
  }

  @Delete('avatar')
  async removeAvatar(@CurrentUser() user: SessionUser) {
    await this.avatars.remove(user.id);
    return this.auth.me(user);
  }
}
