import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/session';
import { AssignLaneDto, RollLanesDto } from './lanes.dto';
import { LanesService } from './lanes.service';

@Controller()
export class LanesController {
  constructor(private readonly lanes: LanesService) {}

  @Get('evenings/:id/lanes')
  get(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.lanes.get(user, id);
  }

  @Post('evenings/:id/lanes/roll')
  @HttpCode(200)
  roll(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RollLanesDto) {
    return this.lanes.roll(user, id, dto);
  }

  @Put('evenings/:id/lanes/assignment')
  assign(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AssignLaneDto) {
    return this.lanes.assign(user, id, dto);
  }
}
