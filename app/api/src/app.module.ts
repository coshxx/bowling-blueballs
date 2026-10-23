import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { AvatarsController } from './avatars/avatars.controller';
import { AvatarsService } from './avatars/avatars.service';
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
import { EveningsController } from './evenings/evenings.controller';
import { EveningsService } from './evenings/evenings.service';
import { LocationsController } from './locations/locations.controller';
import { LocationsService } from './locations/locations.service';
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
  controllers: [
    AuthController,
    AdminController,
    AvatarsController,
    EntriesController,
    PlayersController,
    StatsController,
    LocationsController,
    EveningsController,
  ],
  providers: [
    PrismaService,
    AccessService,
    AuthService,
    AvatarsService,
    AdminService,
    EntriesService,
    ParserClient,
    WorkerService,
    PlayersService,
    StatsService,
    LocationsService,
    EveningsService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
