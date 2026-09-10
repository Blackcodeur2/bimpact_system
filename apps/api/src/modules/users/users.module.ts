import { Body, Controller, Get, Module, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/access/access.decorators';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { ContributionsModule } from '../contributions/contributions.module';
import { DrawsModule } from '../draws/draws.module';
import { WalletModule } from '../wallet/wallet.module';
import { DashboardService } from './dashboard.service';
import { UpdateMeDto } from './users.dto';
import { UsersService } from './users.service';

@ApiTags('me')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly dashboard: DashboardService,
  ) {}

  @RequirePermissions('me.read')
  @Get()
  getMe(@CurrentAuth() auth: AuthContext) {
    return this.users.getMe(auth.userId);
  }

  @RequirePermissions('me.update')
  @Patch()
  updateMe(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateMeDto, @Ctx() ctx: RequestContext) {
    return this.users.updateMe(auth.userId, dto, ctx);
  }

  @RequirePermissions('dashboard.read.self')
  @Get('dashboard')
  getDashboard(@CurrentAuth() auth: AuthContext) {
    return this.dashboard.forMember(auth.userId);
  }
}

@Module({
  imports: [WalletModule, ContributionsModule, DrawsModule],
  controllers: [MeController],
  providers: [UsersService, DashboardService],
  exports: [UsersService],
})
export class UsersModule {}
