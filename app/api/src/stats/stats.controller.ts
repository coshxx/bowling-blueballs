import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/session';
import { StatsService } from './stats.service';

@Controller()
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('groups/:groupId/stats')
  forGroup(
    @CurrentUser() user: SessionUser,
    @Param('groupId', ParseIntPipe) groupId: number,
    @Query('year', new ParseIntPipe({ optional: true })) year?: number,
  ) {
    return this.stats.forGroup(user, groupId, year);
  }
}
