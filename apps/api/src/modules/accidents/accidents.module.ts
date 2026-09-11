import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../../common/access/access.decorators';
import { Idempotent } from '../../common/idempotency.interceptor';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { NotificationsModule } from '../notifications/notifications.module';
import { SolidarityModule } from '../solidarity/solidarity.module';
import type { UploadedFileLike } from '../storage/file-types';
import { StorageModule } from '../storage/storage.module';
import {
  AdminClaimsQueryDto,
  ApproveClaimDto,
  ClaimMessageDto,
  ClaimReasonDto,
  CloseClaimDto,
  InvestigateClaimDto,
  ReportAccidentDto,
  UploadClaimDocumentDto,
} from './accidents.dto';
import { AccidentsService } from './accidents.service';

const UPLOAD_HARD_LIMIT_BYTES = 20_000_000;

@ApiTags('accidents')
@ApiBearerAuth()
@Controller('accidents')
export class AccidentsController {
  constructor(private readonly accidents: AccidentsService) {}

  @RequirePermissions('accidents.read.self')
  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.accidents.listMine(auth.userId);
  }

  /** Déclaration ; l'en-tête Idempotency-Key permet de la renvoyer sans doublon après une coupure réseau. */
  @RequirePermissions('accidents.report.self')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Idempotent()
  @Post()
  report(@CurrentAuth() auth: AuthContext, @Body() dto: ReportAccidentDto, @Ctx() ctx: RequestContext) {
    return this.accidents.report(auth.userId, dto, ctx);
  }

  @RequirePermissions('accidents.read.self')
  @Get(':id')
  get(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.accidents.getMine(id, auth.userId);
  }

  @RequirePermissions('accidents.report.self')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':id/documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_HARD_LIMIT_BYTES, files: 1, fields: 4 } }))
  upload(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadClaimDocumentDto,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Ctx() ctx: RequestContext,
  ) {
    return this.accidents.uploadDocument(id, auth.userId, dto.type, file, ctx);
  }

  @RequirePermissions('accidents.report.self')
  @Post(':id/messages')
  @HttpCode(HttpStatus.OK)
  message(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ClaimMessageDto, @Ctx() ctx: RequestContext) {
    return this.accidents.addMessage(id, auth.userId, dto, ctx);
  }
}

@ApiTags('admin / accidents')
@ApiBearerAuth()
@Controller('admin/accidents')
export class AdminAccidentsController {
  constructor(private readonly accidents: AccidentsService) {}

  @RequirePermissions('admin.accidents.read')
  @Get()
  list(@Query() query: AdminClaimsQueryDto) {
    return this.accidents.adminList(query);
  }

  @RequirePermissions('admin.accidents.read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.accidents.adminGet(id, ctx);
  }

  @RequirePermissions('admin.accidents.decide')
  @Post(':id/request-documents')
  @HttpCode(HttpStatus.OK)
  requestDocuments(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ClaimReasonDto, @Ctx() ctx: RequestContext) {
    return this.accidents.requestDocuments(id, dto, ctx);
  }

  @RequirePermissions('admin.accidents.decide')
  @Post(':id/investigate')
  @HttpCode(HttpStatus.OK)
  investigate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: InvestigateClaimDto, @Ctx() ctx: RequestContext) {
    return this.accidents.investigate(id, dto, ctx);
  }

  @RequirePermissions('admin.accidents.decide')
  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveClaimDto, @Ctx() ctx: RequestContext) {
    return this.accidents.approve(id, dto, ctx);
  }

  @RequirePermissions('admin.accidents.decide')
  @Post(':id/disburse')
  @HttpCode(HttpStatus.OK)
  disburse(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.accidents.disburse(id, ctx);
  }

  @RequirePermissions('admin.accidents.decide')
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ClaimReasonDto, @Ctx() ctx: RequestContext) {
    return this.accidents.reject(id, dto, ctx);
  }

  @RequirePermissions('admin.accidents.decide')
  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseClaimDto, @Ctx() ctx: RequestContext) {
    return this.accidents.close(id, dto, ctx);
  }
}

@Module({
  imports: [StorageModule, NotificationsModule, SolidarityModule],
  controllers: [AccidentsController, AdminAccidentsController],
  providers: [AccidentsService],
  exports: [AccidentsService],
})
export class AccidentsModule {}
