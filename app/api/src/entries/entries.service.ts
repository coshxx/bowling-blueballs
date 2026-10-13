import { ConflictException, Injectable, NotFoundException, UnsupportedMediaTypeException } from '@nestjs/common';
import type { Entry } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PrismaService } from '../common/prisma.service';
import { config } from '../config';
import { detectImageType } from './image-type';
import { WorkerService } from './worker.service';

export type EntryStatus = 'pending' | 'running' | 'done' | 'uncertain' | 'failed';

export interface EntryDto {
  id: number;
  status: EntryStatus;
  createdAt: string;
  processedAt: string | null;
  imageUrl: string;
  result: unknown;
  problems: string[];
  error: string | null;
}

function toDto(e: Entry): EntryDto {
  return {
    id: e.id,
    status: e.status as EntryStatus,
    createdAt: e.createdAt.toISOString(),
    processedAt: e.processedAt?.toISOString() ?? null,
    imageUrl: `/api/entries/${e.id}/image`,
    result: e.result ? JSON.parse(e.result) : null,
    problems: e.problems ? JSON.parse(e.problems) : [],
    error: e.error,
  };
}

@Injectable()
export class EntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly worker: WorkerService,
  ) {}

  async list(): Promise<EntryDto[]> {
    const entries = await this.prisma.entry.findMany({ orderBy: { createdAt: 'desc' } });
    return entries.map(toDto);
  }

  async create(file: Buffer): Promise<EntryDto> {
    const type = detectImageType(file);
    if (!type) {
      throw new UnsupportedMediaTypeException('Nur JPG-, PNG- oder WebP-Bilder sind erlaubt.');
    }
    await mkdir(config.imagesDir, { recursive: true });
    const imageFile = `${randomUUID()}.${type.ext}`;
    await writeFile(join(config.imagesDir, imageFile), file);
    const entry = await this.prisma.entry.create({ data: { imageFile, imageType: type.mime } });
    this.worker.wake();
    return toDto(entry);
  }

  /** Reiht einen abgeschlossenen Eintrag erneut ein; das alte Ergebnis wird verworfen. */
  async reprocess(id: number): Promise<EntryDto> {
    const { count } = await this.prisma.entry.updateMany({
      where: { id, status: { in: ['done', 'uncertain', 'failed'] } },
      data: { status: 'pending', result: null, problems: null, error: null, processedAt: null },
    });
    if (count === 0) {
      const exists = await this.prisma.entry.findUnique({ where: { id }, select: { id: true } });
      if (!exists) {
        throw new NotFoundException('Eintrag nicht gefunden');
      }
      throw new ConflictException('Der Eintrag wartet bereits oder wird gerade verarbeitet.');
    }
    this.worker.wake();
    return toDto(await this.prisma.entry.findUniqueOrThrow({ where: { id } }));
  }

  async image(id: number): Promise<{ path: string; mime: string }> {
    const entry = await this.prisma.entry.findUnique({ where: { id } });
    if (!entry) {
      throw new NotFoundException('Eintrag nicht gefunden');
    }
    return { path: join(config.imagesDir, entry.imageFile), mime: entry.imageType };
  }
}
