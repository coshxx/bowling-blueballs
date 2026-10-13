import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { config } from '../config';
import { EntriesService } from './entries.service';

@Controller('entries')
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Get()
  list() {
    return this.entries.list();
  }

  @Post()
  @UseInterceptors(
    FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } }),
  )
  create(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Kein Bild hochgeladen.');
    }
    return this.entries.create(file.buffer);
  }

  @Get(':id/image')
  async image(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { path, mime } = await this.entries.image(id);
    res.type(mime).sendFile(path, { maxAge: '1y', immutable: true });
  }
}
