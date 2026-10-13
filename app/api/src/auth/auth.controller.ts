import { Body, Controller, Get, HttpCode, Post, Res, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { LoginDto, RegisterDto } from './auth.dto';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './decorators';
import { clearSession, SessionUser, writeSession } from './session';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.register(dto.username, dto.password);
    writeSession(res, user.id, user.sessionVersion);
    return this.auth.me({ id: user.id, username: user.username, isAdmin: user.isAdmin });
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.login(dto.username, dto.password);
    writeSession(res, user.id, user.sessionVersion);
    return this.auth.me({ id: user.id, username: user.username, isAdmin: user.isAdmin });
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    clearSession(res);
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser) {
    return this.auth.me(user);
  }
}
