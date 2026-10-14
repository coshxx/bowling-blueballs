import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/session';
import { AddConsumptionDto, CreateEveningDto, UpdateConsumptionDto, UpdateEveningDto } from './evenings.dto';
import { EveningsService } from './evenings.service';

@Controller()
export class EveningsController {
  constructor(private readonly evenings: EveningsService) {}

  @Get('groups/:groupId/evenings')
  list(@CurrentUser() user: SessionUser, @Param('groupId', ParseIntPipe) groupId: number) {
    return this.evenings.list(user, groupId);
  }

  @Post('groups/:groupId/evenings')
  create(@CurrentUser() user: SessionUser, @Param('groupId', ParseIntPipe) groupId: number, @Body() dto: CreateEveningDto) {
    return this.evenings.create(user, groupId, dto);
  }

  @Get('evenings/:id')
  get(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.evenings.get(user, id);
  }

  @Patch('evenings/:id')
  update(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEveningDto) {
    return this.evenings.update(user, id, dto);
  }

  @Delete('evenings/:id')
  @HttpCode(204)
  delete(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.evenings.delete(user, id);
  }

  @Post('evenings/:id/consumptions')
  addConsumption(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AddConsumptionDto) {
    return this.evenings.addConsumption(user, id, dto);
  }

  @Patch('consumptions/:id')
  updateConsumption(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateConsumptionDto) {
    return this.evenings.updateConsumption(user, id, dto);
  }

  @Delete('consumptions/:id')
  deleteConsumption(@CurrentUser() user: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.evenings.deleteConsumption(user, id);
  }
}
