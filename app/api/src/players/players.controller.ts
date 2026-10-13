import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/session';
import { CreatePlayerDto, MergePlayerDto, UpdatePlayerDto } from './players.dto';
import { PlayersService } from './players.service';

@Controller()
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  /** Für alle Mitglieder: nötig für die Spielerzuordnung bei der Freigabe */
  @Get('groups/:groupId/players')
  list(@CurrentUser() user: SessionUser, @Param('groupId', ParseIntPipe) groupId: number) {
    return this.players.list(user, groupId);
  }

  @AdminOnly()
  @Post('groups/:groupId/players')
  create(@Param('groupId', ParseIntPipe) groupId: number, @Body() dto: CreatePlayerDto) {
    return this.players.create(groupId, dto.name);
  }

  @AdminOnly()
  @Patch('players/:id')
  @HttpCode(204)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePlayerDto) {
    return this.players.update(id, dto);
  }

  @AdminOnly()
  @Post('players/:id/merge')
  @HttpCode(204)
  merge(@Param('id', ParseIntPipe) id: number, @Body() dto: MergePlayerDto) {
    return this.players.merge(id, dto.intoPlayerId);
  }

  @AdminOnly()
  @Delete('players/:id')
  @HttpCode(204)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.players.delete(id);
  }

  @AdminOnly()
  @Delete('aliases/:id')
  @HttpCode(204)
  deleteAlias(@Param('id', ParseIntPipe) id: number) {
    return this.players.deleteAlias(id);
  }
}
