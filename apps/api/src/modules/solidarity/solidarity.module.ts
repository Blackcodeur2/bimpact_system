import { Body, Controller, Get, HttpCode, HttpStatus, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { RequirePermissions } from '../../common/access/access.decorators';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SolidarityService } from './solidarity.service';

export class JoinSolidarityDto {
  /** Version du règlement lue et acceptée par le membre. */
  @IsString()
  @Length(1, 20)
  rulesVersion: string;
}

@ApiTags('solidarity')
@ApiBearerAuth()
@Controller('solidarity')
export class SolidarityController {
  constructor(private readonly solidarity: SolidarityService) {}

  @RequirePermissions('solidarity.manage.self')
  @Get('me')
  me(@CurrentAuth() auth: AuthContext) {
    return this.solidarity.status(auth.userId);
  }

  @RequirePermissions('solidarity.manage.self')
  @Post('join')
  @HttpCode(HttpStatus.OK)
  join(@CurrentAuth() auth: AuthContext, @Body() dto: JoinSolidarityDto, @Ctx() ctx: RequestContext) {
    return this.solidarity.join(auth.userId, dto.rulesVersion, ctx);
  }

  @RequirePermissions('solidarity.manage.self')
  @Post('leave')
  @HttpCode(HttpStatus.OK)
  leave(@CurrentAuth() auth: AuthContext, @Ctx() ctx: RequestContext) {
    return this.solidarity.leave(auth.userId, ctx);
  }
}

@ApiTags('admin / solidarity')
@ApiBearerAuth()
@Controller('admin/solidarity')
export class AdminSolidarityController {
  constructor(private readonly solidarity: SolidarityService) {}

  @RequirePermissions('admin.accidents.read')
  @Get()
  overview() {
    return this.solidarity.overview();
  }
}

@Module({
  imports: [LedgerModule, NotificationsModule],
  controllers: [SolidarityController, AdminSolidarityController],
  providers: [SolidarityService],
  exports: [SolidarityService],
})
export class SolidarityModule {}
