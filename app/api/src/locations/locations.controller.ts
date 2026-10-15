import { Body, Controller, Delete, Get, HttpCode, Param, ParseBoolPipe, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/session';
import { CreateLocationDto, UpdateMenuItemDto } from './locations.dto';
import { LocationsService } from './locations.service';

/** Locations und ihre Karten sind global: Lesen und Anlegen für alle, Kartenpflege nur für Admins. */
@Controller()
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get('locations')
  list() {
    return this.locations.list();
  }

  @Post('locations')
  create(@Body() dto: CreateLocationDto) {
    return this.locations.create(dto.name);
  }

  @Get('locations/:id/menu')
  menu(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseIntPipe) id: number,
    @Query('hidden', new ParseBoolPipe({ optional: true })) hidden?: boolean,
  ) {
    return this.locations.menu(id, user.isAdmin && hidden === true);
  }

  @Get('locations/:id/shared-names')
  sharedNames(@Param('id', ParseIntPipe) id: number) {
    return this.locations.sharedNames(id);
  }

  @AdminOnly()
  @Patch('menu-items/:id')
  @HttpCode(204)
  updateItem(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMenuItemDto) {
    return this.locations.updateItem(id, dto);
  }

  @AdminOnly()
  @Delete('menu-items/:id')
  deleteItem(@Param('id', ParseIntPipe) id: number) {
    return this.locations.deleteItem(id);
  }
}
