import {
  Body,
  Controller,
  Get,
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../../common/access/access.decorators';
import { Idempotent } from '../../common/idempotency.interceptor';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { AppConfig } from '../../config/app-config';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminContributionsQueryDto, ContributionSettingsDto, PayContributionDto } from './contributions.dto';
import { ContributionsService } from './contributions.service';

@ApiTags('contributions')
@ApiBearerAuth()
@Controller('contributions')
export class ContributionsController {
  constructor(private readonly contributions: ContributionsService) {}

  @RequirePermissions('contributions.read.self')
  @Get()
  overview(@CurrentAuth() auth: AuthContext) {
    return this.contributions.overview(auth.userId);
  }

  @RequirePermissions('contributions.pay.self')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Idempotent()
  @Post()
  async pay(@CurrentAuth() auth: AuthContext, @Body() dto: PayContributionDto, @Ctx() ctx: RequestContext) {
    const result = await this.contributions.pay(auth.userId, dto, ctx);
    return { ...result, overview: await this.contributions.overview(auth.userId) };
  }

  @RequirePermissions('contributions.pay.self')
  @Patch('settings')
  updateSettings(@CurrentAuth() auth: AuthContext, @Body() dto: ContributionSettingsDto, @Ctx() ctx: RequestContext) {
    return this.contributions.updateSettings(auth.userId, dto, ctx);
  }
}

@ApiTags('admin / contributions')
@ApiBearerAuth()
@Controller('admin/contributions')
export class AdminContributionsController {
  constructor(private readonly contributions: ContributionsService) {}

  @RequirePermissions('admin.contributions.read')
  @Get()
  list(@Query() query: AdminContributionsQueryDto) {
    return this.contributions.adminList(query);
  }

  @RequirePermissions('admin.contributions.read')
  @Get('metrics')
  metrics() {
    return this.contributions.adminMetrics();
  }
}

/** Prélèvements automatiques et rappels quotidiens (vérifiés toutes les 5 minutes, exécutés une fois par jour). */
@Injectable()
export class ContributionsJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ContributionsJobs.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly contributions: ContributionsService,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.jobsEnabled) return;
    this.timer = setInterval(() => void this.tick(), 5 * 60_000);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const debit = await this.contributions.runAutoDebit(now);
      if (debit) this.logger.log(`Prélèvement automatique : ${debit.succeeded} réussi(s), ${debit.failed} échec(s)`);
      const reminded = await this.contributions.runReminders(now);
      if (reminded !== null) this.logger.log(`Rappels de contribution envoyés : ${reminded}`);
    } catch (error) {
      this.logger.error({ err: error }, 'Tâche contributions en échec');
    } finally {
      this.running = false;
    }
  }
}

@Module({
  imports: [LedgerModule, NotificationsModule],
  controllers: [ContributionsController, AdminContributionsController],
  providers: [ContributionsService, ContributionsJobs],
  exports: [ContributionsService],
})
export class ContributionsModule {}
