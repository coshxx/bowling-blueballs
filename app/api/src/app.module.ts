import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { PrismaService } from './common/prisma.service';
import { config } from './config';
import { EntriesController } from './entries/entries.controller';
import { EntriesService } from './entries/entries.service';
import { ParserClient } from './entries/parser.client';
import { WorkerService } from './entries/worker.service';

// Nest liefert den Vue-Build aus
const staticModules = config.webDist
  ? [
      ServeStaticModule.forRoot({
        rootPath: config.webDist,
        exclude: ['/api/{*path}'],
      }),
    ]
  : [];

@Module({
  imports: [...staticModules],
  controllers: [EntriesController],
  providers: [PrismaService, EntriesService, ParserClient, WorkerService],
})
export class AppModule {}
