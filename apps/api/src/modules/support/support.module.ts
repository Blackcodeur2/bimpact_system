import { Body, Controller, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public, RequirePermissions } from '../../common/access/access.decorators';
import { Idempotent } from '../../common/idempotency.interceptor';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { NotificationsModule } from '../notifications/notifications.module';
import { CreateTicketDto, TicketMessageDto, TicketsQueryDto, TicketStatusDto } from './support.dto';
import { SupportService } from './support.service';

@ApiTags('support')
@ApiBearerAuth()
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  /** Consultable avant connexion (ex. code PIN oublié). */
  @Public()
  @Get('faq')
  faq() {
    return this.support.faq();
  }

  @RequirePermissions('support.use.self')
  @Get('tickets')
  list(@CurrentAuth() auth: AuthContext, @Query() query: TicketsQueryDto) {
    return this.support.list(auth.userId, query);
  }

  @RequirePermissions('support.use.self')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Idempotent()
  @Post('tickets')
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateTicketDto, @Ctx() ctx: RequestContext) {
    return this.support.create(auth.userId, dto, ctx);
  }

  @RequirePermissions('support.use.self')
  @Get('tickets/:id')
  get(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.support.get(id, auth.userId);
  }

  @RequirePermissions('support.use.self')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('tickets/:id/messages')
  @HttpCode(HttpStatus.OK)
  addMessage(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TicketMessageDto, @Ctx() ctx: RequestContext) {
    return this.support.addMessage(id, auth.userId, dto, ctx);
  }

  @RequirePermissions('support.use.self')
  @Post('tickets/:id/close')
  @HttpCode(HttpStatus.OK)
  close(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.support.close(id, auth.userId, ctx);
  }
}

@ApiTags('admin / support')
@ApiBearerAuth()
@Controller('admin/support/tickets')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @RequirePermissions('admin.support.manage')
  @Get()
  list(@Query() query: TicketsQueryDto) {
    return this.support.adminList(query);
  }

  @RequirePermissions('admin.support.manage')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.adminGet(id);
  }

  @RequirePermissions('admin.support.manage')
  @Post(':id/messages')
  @HttpCode(HttpStatus.OK)
  reply(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TicketMessageDto, @Ctx() ctx: RequestContext) {
    return this.support.adminReply(id, dto, ctx);
  }

  @RequirePermissions('admin.support.manage')
  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TicketStatusDto, @Ctx() ctx: RequestContext) {
    return this.support.adminSetStatus(id, dto, ctx);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService],
})
export class SupportModule {}
