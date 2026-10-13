import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { AccessService } from './common/access.service';
import { PrismaService } from './common/prisma.service';
import { config } from './config';
import { EntriesController } from './entries/entries.controller';
import { EntriesService } from './entries/entries.service';
import { ParserClient } from './entries/parser.client';
import { WorkerService } from './entries/worker.service';
import { PlayersController } from './players/players.controller';
import { PlayersService } from './players/players.service';
import { StatsController } from './stats/stats.controller';
import { StatsService } from './stats/stats.service';

// In Prod liefert Nest den Vue-Build aus, in Dev macht das der Vite-Server
const staticModules = config.webDist
  ? [
      ServeStaticModule.forRoot({
        rootPath: config.webDist,
        exclude: ['/api/{*path}'],
      }),
    ]
  : [];

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]), ...staticModules],
  controllers: [AuthController, AdminController, EntriesController, PlayersController, StatsController],
  providers: [
    PrismaService,
    AccessService,
    AuthService,
    AdminService,
    EntriesService,
    ParserClient,
    WorkerService,
    PlayersService,
    StatsService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
