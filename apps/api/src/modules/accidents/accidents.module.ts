import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Authenticated, RequirePermissions } from '../../common/access/access.decorators';
import { AuthContext, CurrentAuth, RequestContext, Ctx } from '../../common/request-context';
import { LedgerModule } from '../ledger/ledger.module';
import {
  ApproveClaimDto,
  ListClaimsQueryDto,
  RejectClaimDto,
  ReportAccidentDto,
  SetInvestigatingDto,
  SetSolidarityAmountDto,
} from './accidents.dto';
import { AccidentsService } from './accidents.service';

// ─────────────────────── Contrôleur membre ───────────────────────

@ApiTags('accidents')
@ApiBearerAuth()
@Controller('accidents')
export class AccidentsController {
  constructor(private readonly accidents: AccidentsService) {}

  @Authenticated()
  @Get('coverage')
  @ApiOperation({ summary: 'Statut de couverture solidaire du membre connecté' })
  coverage(@CurrentAuth() auth: AuthContext) {
    return this.accidents.getCoverageStatus(auth.userId);
  }

  @Authenticated()
  @Get()
  @ApiOperation({ summary: 'Liste des dossiers de sinistre du membre connecté' })
  list(@CurrentAuth() auth: AuthContext) {
    return this.accidents.listClaims(auth.userId);
  }

  @Authenticated()
  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un dossier de sinistre' })
  get(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.accidents.getClaim(id, auth.userId);
  }

  @Authenticated()
  @Post()
  @ApiOperation({ summary: 'Déclarer un accident' })
  report(@CurrentAuth() auth: AuthContext, @Body() dto: ReportAccidentDto) {
    return this.accidents.createClaim(dto, auth.userId);
  }
}

// ─────────────────────── Contrôleur admin back-office ───────────────────────

@ApiTags('admin/accidents')
@ApiBearerAuth()
@Controller('admin/accidents')
export class AccidentsAdminController {
  constructor(private readonly accidents: AccidentsService) {}

  @RequirePermissions('admin.accidents.read')
  @Get()
  @ApiOperation({ summary: '[Admin] Liste tous les dossiers de sinistre' })
  listAll(@Query() query: ListClaimsQueryDto) {
    return this.accidents.listAllClaims(query.status);
  }

  @RequirePermissions('admin.accidents.read')
  @Get('settings/solidarity-amount')
  @ApiOperation({ summary: '[Admin] Montant configurable du prélèvement solidaire' })
  getSolidarityAmount() {
    return this.accidents.getSolidarityDebitAmount().then((amount) => ({ key: 'accidents.solidarity_debit_amount', amount, currency: 'XAF' }));
  }

  @RequirePermissions('admin.accidents.decide')
  @Put('settings/solidarity-amount')
  @ApiOperation({ summary: '[Admin] Configurer le montant du prélèvement solidaire minimum (XAF)' })
  setSolidarityAmount(@Body() dto: SetSolidarityAmountDto, @CurrentAuth() auth: AuthContext) {
    return this.accidents.setSolidarityDebitAmount(dto.amount, auth.userId).then(() => ({
      key: 'accidents.solidarity_debit_amount',
      amount: dto.amount,
      currency: 'XAF',
      updatedBy: auth.userId,
    }));
  }

  @RequirePermissions('admin.accidents.read')
  @Get(':id')
  @ApiOperation({ summary: '[Admin] Détail d\'un dossier de sinistre' })
  getAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.accidents.getClaimAdmin(id);
  }

  @RequirePermissions('admin.accidents.decide')
  @Post(':id/investigate')
  @ApiOperation({ summary: '[Admin] Marquer un dossier en cours d\'investigation' })
  investigate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetInvestigatingDto) {
    return this.accidents.setInvestigating(id, dto.reviewNotes);
  }

  @RequirePermissions('admin.accidents.decide')
  @Post(':id/approve')
  @ApiOperation({
    summary: '[Admin] Approuver un dossier — déclenche le prélèvement solidaire sur TOUS les membres actifs',
  })
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveClaimDto,
    @Ctx() ctx: RequestContext,
  ) {
    return this.accidents.approveClaim(id, dto, ctx);
  }

  @RequirePermissions('admin.accidents.decide')
  @Post(':id/reject')
  @ApiOperation({ summary: '[Admin] Rejeter un dossier de sinistre' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectClaimDto,
    @Ctx() ctx: RequestContext,
  ) {
    return this.accidents.rejectClaim(id, dto.reviewNotes, ctx);
  }
}

// ─────────────────────── Module ───────────────────────

@Module({
  imports: [LedgerModule],
  controllers: [AccidentsController, AccidentsAdminController],
  providers: [AccidentsService],
  exports: [AccidentsService],
})
export class AccidentsModule {}
