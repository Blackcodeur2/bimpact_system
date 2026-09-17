import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Authenticated, RequirePermissions } from '../../common/access/access.decorators';
import { AppException } from '../../common/errors/app-exception';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentsService } from '../payments/payments.service';
import { fullName } from './backoffice.common';
import {
  AdminCompaniesQueryDto,
  AdminJobsQueryDto,
  AdminPaymentsQueryDto,
  CertificatesQueryDto,
  CompanyStatusDto,
  CreateModuleDto,
  DashboardQueryDto,
  LedgerQueryDto,
  LessonDto,
  MemberNoteDto,
  MembersQueryDto,
  MemberStatusDto,
  OpenRiskCaseDto,
  ReasonDto,
  ReportQueryDto,
  RiskCaseActionDto,
  RiskCasesQueryDto,
  SaveQuizDto,
  UpdateLessonDto,
  UpdateModuleDto,
} from './backoffice.dto';
import { CompaniesAdminService } from './companies-admin.service';
import { DashboardAdminService } from './dashboard-admin.service';
import { FinanceAdminService } from './finance-admin.service';
import { MembersAdminService } from './members-admin.service';
import { PaymentsAdminService } from './payments-admin.service';
import { ReportsService } from './reports.service';
import { RiskService } from './risk.service';
import { TrainingAdminService } from './training-admin.service';

@ApiTags('admin / tableau de bord')
@ApiBearerAuth()
@Controller('admin')
export class AdminDashboardController {
  constructor(
    private readonly dashboard: DashboardAdminService,
    private readonly prisma: PrismaService,
  ) {}

  @RequirePermissions('admin.dashboard.read')
  @Get('dashboard')
  overview(@Query() query: DashboardQueryDto) {
    return this.dashboard.overview(query.days);
  }

  /** Noms des agents actifs, pour afficher réviseurs et auteurs dans toutes les files. */
  @Authenticated()
  @Get('staff-directory')
  async directory(@CurrentAuth() auth: AuthContext) {
    if (auth.kind !== 'STAFF' || auth.mustChangePassword) {
      throw new AppException(HttpStatus.FORBIDDEN, 'FORBIDDEN', "Vous n'avez pas l'autorisation d'effectuer cette action.");
    }
    const staff = await this.prisma.user.findMany({
      where: { kind: 'STAFF' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, status: true, profile: { select: { firstName: true, lastName: true } } },
    });
    return { items: staff.map((user) => ({ id: user.id, name: fullName(user.profile) ?? user.email, status: user.status })) };
  }
}

@ApiTags('admin / conducteurs')
@ApiBearerAuth()
@Controller('admin/drivers')
export class AdminMembersController {
  constructor(private readonly members: MembersAdminService) {}

  @RequirePermissions('admin.drivers.read')
  @Get()
  list(@Query() query: MembersQueryDto) {
    return this.members.list(query);
  }

  @RequirePermissions('admin.drivers.read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.members.get(id, ctx);
  }

  @RequirePermissions('admin.drivers.update_status')
  @Patch(':id/status')
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MemberStatusDto, @Ctx() ctx: RequestContext) {
    return this.members.setStatus(id, dto, ctx);
  }

  @RequirePermissions('admin.drivers.update_status')
  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  unlock(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.members.unlock(id, ctx);
  }

  @RequirePermissions('admin.drivers.read')
  @Post(':id/notes')
  addNote(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MemberNoteDto, @Ctx() ctx: RequestContext) {
    return this.members.addNote(id, dto, ctx);
  }
}

@ApiTags('admin / finance')
@ApiBearerAuth()
@Controller('admin/finance')
export class AdminFinanceController {
  constructor(private readonly finance: FinanceAdminService) {}

  @RequirePermissions('admin.finance.ledger.read')
  @Get('overview')
  overview() {
    return this.finance.overview();
  }

  @RequirePermissions('admin.finance.ledger.read')
  @Get('ledger')
  ledger(@Query() query: LedgerQueryDto) {
    return this.finance.transactions(query);
  }

  @RequirePermissions('admin.finance.ledger.read')
  @Get('reconciliation')
  history() {
    return this.finance.reconciliationHistory();
  }

  @RequirePermissions('admin.finance.reconcile')
  @Post('reconciliation/run')
  @HttpCode(HttpStatus.OK)
  run(@Ctx() ctx: RequestContext) {
    return this.finance.runReconciliation(ctx);
  }
}

@ApiTags('admin / paiements')
@ApiBearerAuth()
@Controller('admin/payments')
export class AdminPaymentsController {
  constructor(
    private readonly admin: PaymentsAdminService,
    private readonly payments: PaymentsService,
  ) {}

  @RequirePermissions('admin.payments.read')
  @Get()
  list(@Query() query: AdminPaymentsQueryDto) {
    return this.admin.list(query);
  }

  @RequirePermissions('admin.payments.read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.get(id);
  }

  /** Réconciliation d'un paiement en attente : l'opérateur est réinterrogé, jamais de forçage manuel du statut. */
  @RequirePermissions('admin.payments.reconcile')
  @Post(':id/reconcile')
  @HttpCode(HttpStatus.OK)
  async reconcile(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    await this.payments.adminRefresh(id, ctx);
    return this.admin.get(id);
  }
}

@ApiTags('admin / formation')
@ApiBearerAuth()
@Controller('admin/training')
export class AdminTrainingController {
  constructor(private readonly training: TrainingAdminService) {}

  @RequirePermissions('admin.training.manage')
  @Get('modules')
  modules() {
    return this.training.modules();
  }

  @RequirePermissions('admin.training.manage')
  @Post('modules')
  createModule(@Body() dto: CreateModuleDto, @Ctx() ctx: RequestContext) {
    return this.training.createModule(dto, ctx);
  }

  @RequirePermissions('admin.training.manage')
  @Get('modules/:id')
  module(@Param('id', ParseUUIDPipe) id: string) {
    return this.training.module(id);
  }

  @RequirePermissions('admin.training.manage')
  @Patch('modules/:id')
  updateModule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateModuleDto, @Ctx() ctx: RequestContext) {
    return this.training.updateModule(id, dto, ctx);
  }

  @RequirePermissions('admin.training.manage')
  @Post('modules/:id/lessons')
  createLesson(@Param('id', ParseUUIDPipe) id: string, @Body() dto: LessonDto, @Ctx() ctx: RequestContext) {
    return this.training.createLesson(id, dto, ctx);
  }

  @RequirePermissions('admin.training.manage')
  @Put('modules/:id/quiz')
  saveQuiz(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveQuizDto, @Ctx() ctx: RequestContext) {
    return this.training.saveQuiz(id, dto, ctx);
  }

  @RequirePermissions('admin.training.manage')
  @Patch('lessons/:id')
  updateLesson(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLessonDto, @Ctx() ctx: RequestContext) {
    return this.training.updateLesson(id, dto, ctx);
  }

  @RequirePermissions('admin.training.manage')
  @Delete('lessons/:id')
  deleteLesson(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.training.deleteLesson(id, ctx);
  }

  @RequirePermissions('admin.training.manage')
  @Get('certificates')
  certificates(@Query() query: CertificatesQueryDto) {
    return this.training.certificates(query);
  }

  @RequirePermissions('admin.training.manage')
  @Post('certificates/:id/revoke')
  @HttpCode(HttpStatus.OK)
  revoke(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Ctx() ctx: RequestContext) {
    return this.training.revokeCertificate(id, dto, ctx);
  }
}

@ApiTags('admin / entreprises')
@ApiBearerAuth()
@Controller('admin')
export class AdminCompaniesController {
  constructor(private readonly companies: CompaniesAdminService) {}

  @RequirePermissions('admin.companies.read')
  @Get('companies')
  list(@Query() query: AdminCompaniesQueryDto) {
    return this.companies.companies(query);
  }

  @RequirePermissions('admin.companies.read')
  @Get('companies/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.companies.company(id);
  }

  @RequirePermissions('admin.companies.manage')
  @Post('companies/:id/status')
  @HttpCode(HttpStatus.OK)
  setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompanyStatusDto, @Ctx() ctx: RequestContext) {
    return this.companies.setCompanyStatus(id, dto, ctx);
  }

  @RequirePermissions('admin.recruitment.read')
  @Get('recruitment/jobs')
  jobs(@Query() query: AdminJobsQueryDto) {
    return this.companies.jobs(query);
  }

  @RequirePermissions('admin.recruitment.read')
  @Get('recruitment/jobs/:id/applications')
  applications(@Param('id', ParseUUIDPipe) id: string) {
    return this.companies.jobApplications(id);
  }

  @RequirePermissions('admin.recruitment.manage')
  @Post('recruitment/jobs/:id/close')
  @HttpCode(HttpStatus.OK)
  closeJob(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Ctx() ctx: RequestContext) {
    return this.companies.closeJob(id, dto, ctx);
  }
}

@ApiTags('admin / fraude & risque')
@ApiBearerAuth()
@Controller('admin/fraud')
export class AdminRiskController {
  constructor(private readonly risk: RiskService) {}

  @RequirePermissions('admin.fraud.read')
  @Get('rules')
  rules() {
    return this.risk.rules();
  }

  @RequirePermissions('admin.fraud.read')
  @Get('signals')
  signals() {
    return this.risk.signals();
  }

  @RequirePermissions('admin.fraud.read')
  @Get('cases')
  cases(@Query() query: RiskCasesQueryDto) {
    return this.risk.cases(query);
  }

  @RequirePermissions('admin.fraud.act')
  @Post('cases')
  open(@Body() dto: OpenRiskCaseDto, @Ctx() ctx: RequestContext) {
    return this.risk.open(dto, ctx);
  }

  @RequirePermissions('admin.fraud.read')
  @Get('cases/:id')
  case(@Param('id', ParseUUIDPipe) id: string) {
    return this.risk.case(id);
  }

  @RequirePermissions('admin.fraud.act')
  @Post('cases/:id/actions')
  @HttpCode(HttpStatus.OK)
  act(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RiskCaseActionDto, @Ctx() ctx: RequestContext) {
    return this.risk.act(id, dto, ctx);
  }
}

@ApiTags('admin / rapports')
@ApiBearerAuth()
@Controller('admin/reports')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermissions('admin.reports.generate')
  @Get()
  types() {
    return this.reports.types();
  }

  @RequirePermissions('admin.reports.generate')
  @Get(':type')
  generate(@Param('type') type: string, @Query() query: ReportQueryDto, @Ctx() ctx: RequestContext) {
    return this.reports.generate(type, query, ctx);
  }
}

@Module({
  imports: [LedgerModule, NotificationsModule, PaymentsModule],
  controllers: [
    AdminDashboardController,
    AdminMembersController,
    AdminFinanceController,
    AdminPaymentsController,
    AdminTrainingController,
    AdminCompaniesController,
    AdminRiskController,
    AdminReportsController,
  ],
  providers: [
    DashboardAdminService,
    MembersAdminService,
    FinanceAdminService,
    PaymentsAdminService,
    TrainingAdminService,
    CompaniesAdminService,
    RiskService,
    ReportsService,
  ],
})
export class BackofficeModule {}
