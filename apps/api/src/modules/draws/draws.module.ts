import { Body, Controller, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public, RequirePermissions } from '../../common/access/access.decorators';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { NotificationsModule } from '../notifications/notifications.module';
import { BeneficiariesService } from './beneficiaries.service';
import { BeneficiariesQueryDto, CancelDrawDto, CreateDrawDto, DrawsQueryDto, UpdateBeneficiaryDto } from './draws.dto';
import { DrawsService } from './draws.service';
import { ProgramService } from './program.service';

@ApiTags('draws')
@ApiBearerAuth()
@Controller('draws')
export class DrawsController {
  constructor(private readonly draws: DrawsService) {}

  @RequirePermissions('draws.read.self')
  @Get('next')
  next(@CurrentAuth() auth: AuthContext) {
    return this.draws.nextForMember(auth.userId);
  }

  @RequirePermissions('draws.read.self')
  @Get()
  published(@Query() query: DrawsQueryDto) {
    return this.draws.listPublished(query);
  }

  @RequirePermissions('draws.read.self')
  @Get(':id')
  get(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.draws.getForMember(id, auth.userId);
  }

  @RequirePermissions('draws.read.self')
  @Get(':id/results')
  results(@Param('id', ParseUUIDPipe) id: string) {
    return this.draws.results(id);
  }

  /** Vérification publique de l'intégrité : aucune donnée personnelle, aucun compte requis. */
  @Public()
  @Get(':id/audit')
  audit(@Param('id', ParseUUIDPipe) id: string) {
    return this.draws.auditReport(id);
  }
}

@ApiTags('program')
@ApiBearerAuth()
@Controller('program')
export class ProgramController {
  constructor(private readonly program: ProgramService) {}

  @RequirePermissions('program.read.self')
  @Get('me')
  me(@CurrentAuth() auth: AuthContext) {
    return this.program.forMember(auth.userId);
  }
}

@ApiTags('admin / draws')
@ApiBearerAuth()
@Controller('admin/draws')
export class AdminDrawsController {
  constructor(private readonly draws: DrawsService) {}

  @RequirePermissions('admin.draws.manage')
  @Post()
  create(@Body() dto: CreateDrawDto, @Ctx() ctx: RequestContext) {
    return this.draws.create(dto, ctx);
  }

  @RequirePermissions('admin.draws.manage')
  @Get()
  list(@Query() query: DrawsQueryDto) {
    return this.draws.adminList(query);
  }

  @RequirePermissions('admin.draws.manage')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.draws.adminGet(id);
  }

  @RequirePermissions('admin.draws.manage')
  @Post(':id/freeze')
  @HttpCode(HttpStatus.OK)
  freeze(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.draws.freeze(id, ctx);
  }

  @RequirePermissions('admin.draws.execute')
  @Post(':id/execute')
  @HttpCode(HttpStatus.OK)
  execute(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.draws.execute(id, ctx);
  }

  @RequirePermissions('admin.draws.publish')
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.draws.publish(id, ctx);
  }

  @RequirePermissions('admin.draws.manage')
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDrawDto, @Ctx() ctx: RequestContext) {
    return this.draws.cancel(id, dto, ctx);
  }
}

@ApiTags('admin / beneficiaries')
@ApiBearerAuth()
@Controller('admin/beneficiaries')
export class AdminBeneficiariesController {
  constructor(private readonly beneficiaries: BeneficiariesService) {}

  @RequirePermissions('admin.beneficiaries.read')
  @Get()
  list(@Query() query: BeneficiariesQueryDto) {
    return this.beneficiaries.list(query);
  }

  @RequirePermissions('admin.beneficiaries.manage')
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBeneficiaryDto, @Ctx() ctx: RequestContext) {
    return this.beneficiaries.update(id, dto, ctx);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [DrawsController, ProgramController, AdminDrawsController, AdminBeneficiariesController],
  providers: [DrawsService, ProgramService, BeneficiariesService],
  exports: [DrawsService, ProgramService],
})
export class DrawsModule {}
