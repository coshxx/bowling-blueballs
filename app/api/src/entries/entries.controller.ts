import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/session';
import { config } from '../config';
import { ApproveDto, ListEntriesQuery, UploadDto } from './entries.dto';
import { EntriesService } from './entries.service';

@Controller()
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  @Get('groups/:groupId/entries')
  list(
    @CurrentUser() user: SessionUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Query() query: ListEntriesQuery,
  ) {
    return this.entries.list(user, groupId, query.filter);
  }

  @Post('groups/:groupId/entries')
  @UseInterceptors(
    FileInterceptor('image', { storage: memoryStorage(), limits: { fileSize: config.maxUploadBytes, files: 1 } }),
  )
  create(
    @CurrentUser() user: SessionUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Body() dto: UploadDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Kein Bild hochgeladen.');
    }
    return this.entries.create(user, groupId, file.buffer, dto.playedOn);
  }

  @Get('entries/:id')
  get(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.entries.get(user, id);
  }

  @Post('entries/:id/reprocess')
  reprocess(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.entries.reprocess(user, id);
  }

  @Post('entries/:id/approve')
  approve(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ApproveDto) {
    return this.entries.approve(user, id, dto);
  }

  @Post('entries/:id/unapprove')
  unapprove(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.entries.unapprove(user, id);
  }

  @Delete('entries/:id')
  @HttpCode(204)
  delete(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.entries.delete(user, id);
  }

  @Get('entries/:id/image')
  async image(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const { path, mime } = await this.entries.image(user, id);
    res.set('Cache-Control', 'private, max-age=31536000, immutable');
    res.type(mime).sendFile(path);
  }
}
