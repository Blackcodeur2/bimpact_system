import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Injectable,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public, RequirePermissions } from '../../common/access/access.decorators';
import { AppException } from '../../common/errors/app-exception';
import { Idempotent } from '../../common/idempotency.interceptor';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { AppConfig } from '../../config/app-config';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PAYMENT_PROVIDER } from './payment-provider';
import { CreatePaymentIntentDto, PaymentsQueryDto } from './payments.dto';
import { PaymentsService } from './payments.service';
import { SandboxPaymentProvider } from './sandbox-payment.provider';

@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @RequirePermissions('payments.read.self')
  @Get('methods')
  methods() {
    return this.payments.methods();
  }

  @RequirePermissions('payments.read.self')
  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: PaymentsQueryDto) {
    return this.payments.listMine(auth.userId, query);
  }

  @RequirePermissions('payments.create.self')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Idempotent()
  @Post('intents')
  create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreatePaymentIntentDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Ctx() ctx: RequestContext,
  ) {
    return this.payments.createIntent(auth.userId, dto, idempotencyKey, ctx);
  }

  @RequirePermissions('payments.read.self')
  @Get(':id')
  get(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.payments.getMine(auth.userId, id);
  }

  @RequirePermissions('payments.create.self')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.payments.cancel(auth.userId, id, ctx);
  }
}

@ApiTags('payments / webhooks')
@Controller('payments/webhooks')
export class PaymentWebhooksController {
  constructor(private readonly payments: PaymentsService) {}

  /** Appelé par l'opérateur ; authentifié par la signature du corps brut, pas par un jeton. */
  @Public()
  @SkipThrottle()
  @Post(':provider')
  @HttpCode(HttpStatus.OK)
  receive(@Param('provider') provider: string, @Req() req: RawBodyRequest<Request>) {
    if (!req.rawBody) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'WEBHOOK_BODY_MISSING', 'Corps de webhook manquant.');
    }
    return this.payments.handleWebhook(provider, req.rawBody, req.headers);
  }
}

/** Tâches récurrentes : expiration des intentions et interrogation des paiements en attente. */
@Injectable()
export class PaymentsJobs implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsJobs.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly payments: PaymentsService,
    private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap() {
    if (!this.config.jobsEnabled) return;
    this.timer = setInterval(() => void this.tick(), 30_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.payments.pollPending();
      const expired = await this.payments.expireStale();
      if (expired > 0) this.logger.log(`${expired} intention(s) de paiement expirée(s)`);
    } catch (error) {
      this.logger.error({ err: error }, 'Tâche paiements en échec');
    } finally {
      this.running = false;
    }
  }
}

@Module({
  imports: [LedgerModule, NotificationsModule],
  controllers: [PaymentsController, PaymentWebhooksController],
  providers: [PaymentsService, PaymentsJobs, SandboxPaymentProvider, { provide: PAYMENT_PROVIDER, useExisting: SandboxPaymentProvider }],
  exports: [PaymentsService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
