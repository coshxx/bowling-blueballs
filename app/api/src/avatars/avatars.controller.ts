import { BadRequestException, Controller, Get, Param, ParseIntPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AvatarsService } from './avatars.service';

@Controller('users/:id/avatar')
export class AvatarsController {
  constructor(private readonly avatars: AvatarsService) {}

  @Get()
  async get(@Param('id', ParseIntPipe) id: number, @Query('f') f: string | undefined, @Res() res: Response) {
    if (f !== undefined && typeof f !== 'string') {
      throw new BadRequestException();
    }
    const { name, path } = await this.avatars.file(id);
    // Veraltete URL (Avatar inzwischen ersetzt): aktuelles Bild liefern, aber nicht dauerhaft cachen
    res.set('Cache-Control', f === name ? 'private, max-age=31536000, immutable' : 'private, no-cache');
    res.type('image/webp').sendFile(path);
  }
}
