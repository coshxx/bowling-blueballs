import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../auth/decorators';
import type { SessionUser } from '../auth/session';
import { AddMemberDto, GroupNameDto, UpdateMemberDto, UpdateUserDto } from './admin.dto';
import { AdminService } from './admin.service';

@AdminOnly()
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers() {
    return this.admin.listUsers();
  }

  @Patch('users/:id')
  updateUser(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.admin.updateUser(id, dto);
  }

  @Delete('users/:id')
  @HttpCode(204)
  deleteUser(@CurrentUser() me: SessionUser, @Param('id', ParseIntPipe) id: number) {
    return this.admin.deleteUser(me, id);
  }

  @Get('groups')
  listGroups() {
    return this.admin.listGroups();
  }

  @Post('groups')
  createGroup(@Body() dto: GroupNameDto) {
    return this.admin.createGroup(dto.name);
  }

  @Patch('groups/:id')
  renameGroup(@Param('id', ParseIntPipe) id: number, @Body() dto: GroupNameDto) {
    return this.admin.renameGroup(id, dto.name);
  }

  @Delete('groups/:id')
  @HttpCode(204)
  deleteGroup(@Param('id', ParseIntPipe) id: number) {
    return this.admin.deleteGroup(id);
  }

  @Get('groups/:id/members')
  listMembers(@Param('id', ParseIntPipe) id: number) {
    return this.admin.listMembers(id);
  }

  @Post('groups/:id/members')
  addMember(@Param('id', ParseIntPipe) id: number, @Body() dto: AddMemberDto) {
    return this.admin.addMember(id, dto.username);
  }

  @Patch('groups/:id/members/:userId')
  updateMember(
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.admin.updateMember(id, userId, dto.canUpload);
  }

  @Delete('groups/:id/members/:userId')
  removeMember(@Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number) {
    return this.admin.removeMember(id, userId);
  }
}
