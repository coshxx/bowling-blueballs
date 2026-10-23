import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../common/prisma.service';
import { config } from '../config';
import { ParserClient } from './parser.client';

const IDLE_POLL_MS = 30_000;
const RETRY_AFTER_ERROR_MS = 10_000;

/** Arbeitet wartende Einträge strikt nacheinander ab (die DB ist die Warteschlange). */
@Injectable()
export class WorkerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerService.name);
  private stopped = false;
  private wakeUp: (() => void) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly parser: ParserClient,
  ) {}

  async onApplicationBootstrap() {
    // Unterbrochene Läufe (z. B. durch Neustart) erneut einreihen
    const { count } = await this.prisma.entry.updateMany({
      where: { status: 'running' },
      data: { status: 'pending' },
    });
    if (count > 0) {
      this.logger.log(`${count} unterbrochene(n) Eintrag/Einträge erneut eingereiht`);
    }
    void this.loop();
  }

  onApplicationShutdown() {
    this.stopped = true;
    this.wake();
  }

  /** Neuer Upload: Worker sofort wecken statt auf das nächste Polling zu warten. */
  wake() {
    this.wakeUp?.();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.wake(), ms);
      this.wakeUp = () => {
        clearTimeout(timer);
        this.wakeUp = null;
        resolve();
      };
    });
  }

  private async loop() {
    while (!this.stopped) {
      try {
        const next = await this.prisma.entry.findFirst({
          where: { status: 'pending' },
          orderBy: { createdAt: 'asc' },
        });
        if (!next) {
          await this.sleep(IDLE_POLL_MS);
          continue;
        }
        // Wartend sind nur hochgeladene Fotos, importierte Einträge sind sofort freigegeben
        await this.process(next.id, next.imageFile!, next.imageType!);
      } catch (e) {
        this.logger.error(`Worker-Fehler: ${(e as Error).message}`);
        await this.sleep(RETRY_AFTER_ERROR_MS);
      }
    }
  }

  private async process(id: number, imageFile: string, imageType: string) {
    await this.prisma.entry.update({ where: { id }, data: { status: 'running' } });
    this.logger.log(`Verarbeite Eintrag ${id} ...`);
    const started = Date.now();
    try {
      const image = await readFile(join(config.imagesDir, imageFile));
      const res = await this.parser.parse(image, imageType);
      await this.prisma.entry.update({
        where: { id },
        data: {
          status: 'review',
          uncertain: res.status === 'uncertain',
          result: JSON.stringify(res.result),
          scores: JSON.stringify(res.scores ?? []),
          problems: res.problems.length ? JSON.stringify(res.problems) : null,
          error: null,
          processedAt: new Date(),
        },
      });
      this.logger.log(`Eintrag ${id}: ${res.status} nach ${Math.round((Date.now() - started) / 1000)}s`);
    } catch (e) {
      if (this.stopped) {
        // Abbruch durch Herunterfahren: bleibt "running" und wird beim Start neu eingereiht
        return;
      }
      const message = (e as Error).message;
      await this.prisma.entry.update({
        where: { id },
        data: { status: 'failed', error: message, processedAt: new Date() },
      });
      this.logger.warn(`Eintrag ${id} fehlgeschlagen: ${message}`);
    }
  }
}
