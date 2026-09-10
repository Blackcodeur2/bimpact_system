import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../../common/access/access.decorators';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import type { UploadedFileLike } from '../storage/file-types';
import { StorageModule } from '../storage/storage.module';
import { KycDecisionDto, KycQueueQueryDto, UpdateKycDto, UploadKycDocumentDto } from './kyc.dto';
import { KYC_PROVIDER, ManualReviewKycProvider } from './kyc.provider';
import { KycReviewService } from './kyc-review.service';
import { KycService } from './kyc.service';

/** Plafond technique de réception ; la limite métier (KYC_DOCUMENT_MAX_BYTES) est vérifiée par le service. */
const UPLOAD_HARD_LIMIT_BYTES = 20_000_000;

@ApiTags('kyc')
@ApiBearerAuth()
@Controller('kyc')
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @RequirePermissions('kyc.read.self')
  @Get()
  getMine(@CurrentAuth() auth: AuthContext) {
    return this.kyc.getMine(auth.userId);
  }

  @RequirePermissions('kyc.read.self')
  @Get('status')
  getStatus(@CurrentAuth() auth: AuthContext) {
    return this.kyc.getStatus(auth.userId);
  }

  @RequirePermissions('kyc.write.self')
  @Patch()
  update(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateKycDto, @Ctx() ctx: RequestContext) {
    return this.kyc.updateDraft(auth.userId, dto, ctx);
  }

  @RequirePermissions('kyc.write.self')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: UPLOAD_HARD_LIMIT_BYTES, files: 1, fields: 4 } }))
  upload(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UploadKycDocumentDto,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Ctx() ctx: RequestContext,
  ) {
    return this.kyc.uploadDocument(auth.userId, dto.type, file, ctx);
  }

  @RequirePermissions('kyc.write.self')
  @Post('submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentAuth() auth: AuthContext, @Ctx() ctx: RequestContext) {
    return this.kyc.submit(auth.userId, ctx);
  }
}

@ApiTags('admin / kyc')
@ApiBearerAuth()
@Controller('admin/kyc')
export class AdminKycController {
  constructor(private readonly reviews: KycReviewService) {}

  @RequirePermissions('admin.kyc.read')
  @Get('queue')
  queue(@Query() query: KycQueueQueryDto) {
    return this.reviews.queue(query);
  }

  @RequirePermissions('admin.kyc.read')
  @Get(':id')
  dossier(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.reviews.dossier(id, ctx);
  }

  @RequirePermissions('admin.kyc.decide')
  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  claim(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.reviews.claim(id, ctx);
  }

  @RequirePermissions('admin.kyc.decide')
  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: KycDecisionDto, @Ctx() ctx: RequestContext) {
    return this.reviews.decide(id, dto, ctx);
  }
}

@Module({
  imports: [StorageModule],
  controllers: [KycController, AdminKycController],
  providers: [KycService, KycReviewService, { provide: KYC_PROVIDER, useClass: ManualReviewKycProvider }],
  exports: [KycService, KycReviewService],
})
export class KycModule {}
