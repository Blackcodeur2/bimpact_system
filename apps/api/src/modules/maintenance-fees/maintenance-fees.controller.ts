import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/access/access.decorators';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { AdminPayMaintenanceFeeDto, PayMaintenanceFeeDto } from './maintenance-fees.dto';
import { MaintenanceFeesService } from './maintenance-fees.service';

@ApiTags('maintenance-fees')
@ApiBearerAuth()
@Controller('maintenance-fees')
export class MaintenanceFeesController {
  constructor(private readonly fees: MaintenanceFeesService) {}

  @RequirePermissions('me.read')
  @Get('status')
  status(@CurrentAuth() auth: AuthContext) {
    return this.fees.status(auth.userId);
  }

  @RequirePermissions('me.read')
  @Get('history')
  history(@CurrentAuth() auth: AuthContext) {
    return this.fees.listForMember(auth.userId);
  }

  @RequirePermissions('wallet.read.self')
  @Post('pay')
  @HttpCode(HttpStatus.OK)
  pay(@Body() dto: PayMaintenanceFeeDto, @CurrentAuth() auth: AuthContext, @Ctx() ctx: RequestContext) {
    return this.fees.pay(auth.userId, dto.month, ctx, { source: 'WALLET', actorId: auth.userId });
  }
}

@ApiTags('admin / members')
@ApiBearerAuth()
@Controller('admin/members/:id/maintenance-fees')
export class AdminMaintenanceFeesController {
  constructor(private readonly fees: MaintenanceFeesService) {}

  @RequirePermissions('admin.drivers.read')
  @Get()
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.fees.listForMember(id);
  }

  @RequirePermissions('admin.drivers.read')
  @Get('status')
  status(@Param('id', ParseUUIDPipe) id: string) {
    return this.fees.status(id);
  }

  @RequirePermissions('admin.drivers.update_status')
  @Post('pay')
  @HttpCode(HttpStatus.OK)
  pay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdminPayMaintenanceFeeDto,
    @CurrentAuth() auth: AuthContext,
    @Ctx() ctx: RequestContext,
  ) {
    return this.fees.pay(id, dto.month, ctx, {
      source: dto.source ?? 'WALLET',
      notes: dto.notes,
      actorId: auth.userId,
    });
  }
}
