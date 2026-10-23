import { Injectable, NotFoundException, UnsupportedMediaTypeException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../common/prisma.service';
import { config } from '../config';
import { detectImageType } from '../entries/image-type';

const AVATAR_SIZE = 256;

@Injectable()
export class AvatarsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Schneidet das Bild mittig quadratisch zu und speichert es als WebP; Metadaten (EXIF, GPS) fallen dabei weg. */
  async set(userId: number, file: Buffer) {
    if (!detectImageType(file)) {
      throw new UnsupportedMediaTypeException('Nur JPG-, PNG- oder WebP-Bilder sind erlaubt.');
    }
    let image: Buffer;
    try {
      image = await sharp(file)
        // Handyfotos liegen oft gedreht vor und tragen die Ausrichtung nur im EXIF
        .rotate()
        .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover', position: 'centre' })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new UnsupportedMediaTypeException('Das Bild ließ sich nicht lesen.');
    }
    await mkdir(config.avatarsDir, { recursive: true });
    const avatarFile = `${randomUUID()}.webp`;
    await writeFile(join(config.avatarsDir, avatarFile), image);
    const old = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarFile: true } });
    await this.prisma.user.update({ where: { id: userId }, data: { avatarFile } });
    await this.deleteFile(old.avatarFile);
  }

  async remove(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarFile: true } });
    if (!user) {
      throw new NotFoundException('Benutzer nicht gefunden.');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { avatarFile: null } });
    await this.deleteFile(user.avatarFile);
  }

  async file(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { avatarFile: true } });
    if (!user?.avatarFile) {
      throw new NotFoundException('Kein Avatar vorhanden.');
    }
    return { name: user.avatarFile, path: join(config.avatarsDir, user.avatarFile) };
  }

  async deleteFile(name: string | null) {
    if (name) {
      await unlink(join(config.avatarsDir, name)).catch(() => undefined);
    }
  }
}
