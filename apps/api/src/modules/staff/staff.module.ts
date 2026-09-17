import { Body, Controller, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../../common/access/access.decorators';
import { Ctx, RequestContext } from '../../common/request-context';
import { AuthModule } from '../auth/auth.module';
import { CreateStaffDto, RevokeStaffSessionsDto, StaffQueryDto, UpdateStaffDto } from './staff.dto';
import { StaffService } from './staff.service';

@ApiTags('admin / utilisateurs')
@ApiBearerAuth()
@Controller('admin')
export class AdminStaffController {
  constructor(private readonly staff: StaffService) {}

  @RequirePermissions('admin.users.manage')
  @Get('users')
  list(@Query() query: StaffQueryDto) {
    return this.staff.list(query);
  }

  @RequirePermissions('admin.users.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('users')
  create(@Body() dto: CreateStaffDto, @Ctx() ctx: RequestContext) {
    return this.staff.create(dto, ctx);
  }

  @RequirePermissions('admin.users.manage')
  @Get('users/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.staff.get(id);
  }

  @RequirePermissions('admin.users.manage')
  @Patch('users/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto, @Ctx() ctx: RequestContext) {
    return this.staff.update(id, dto, ctx);
  }

  @RequirePermissions('admin.users.manage')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.staff.resetPassword(id, ctx);
  }

  @RequirePermissions('admin.users.manage')
  @Post('users/:id/unlock')
  @HttpCode(HttpStatus.OK)
  unlock(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.staff.unlock(id, ctx);
  }

  @RequirePermissions('admin.users.manage')
  @Post('users/:id/revoke-session')
  @HttpCode(HttpStatus.OK)
  revokeSessions(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RevokeStaffSessionsDto, @Ctx() ctx: RequestContext) {
    return this.staff.revokeSessions(id, dto, ctx);
  }

  @RequirePermissions('admin.users.manage')
  @Get('roles')
  roles() {
    return this.staff.roles();
  }
}

@Module({
  imports: [AuthModule],
  controllers: [AdminStaffController],
  providers: [StaffService],
})
export class StaffModule {}
