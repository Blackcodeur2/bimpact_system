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
import { Idempotent } from '../../common/idempotency.interceptor';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { NotificationsModule } from '../notifications/notifications.module';
import type { UploadedFileLike } from '../storage/file-types';
import { StorageModule } from '../storage/storage.module';
import { AdminProjectsQueryDto, CreateProjectDto, ProjectDecisionDto, UpdateProjectDto, UploadProjectDocumentDto } from './projects.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @RequirePermissions('projects.read.self')
  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.projects.listMine(auth.userId);
  }

  @RequirePermissions('projects.write.self')
  @Idempotent()
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateProjectDto, @Ctx() ctx: RequestContext) {
    return this.projects.create(auth.userId, dto, ctx);
  }

  @RequirePermissions('projects.read.self')
  @Get(':id')
  get(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.projects.getMine(id, auth.userId);
  }

  @RequirePermissions('projects.write.self')
  @Patch(':id')
  update(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto, @Ctx() ctx: RequestContext) {
    return this.projects.update(id, auth.userId, dto, ctx);
  }

  @RequirePermissions('projects.write.self')
  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.projects.submit(id, auth.userId, ctx);
  }

  @RequirePermissions('projects.write.self')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':id/documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20_000_000, files: 1, fields: 4 } }))
  upload(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadProjectDocumentDto,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Ctx() ctx: RequestContext,
  ) {
    return this.projects.uploadDocument(id, auth.userId, dto.type, file, ctx);
  }
}

@ApiTags('admin / projects')
@ApiBearerAuth()
@Controller('admin/projects')
export class AdminProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @RequirePermissions('admin.projects.read')
  @Get()
  list(@Query() query: AdminProjectsQueryDto) {
    return this.projects.adminList(query);
  }

  @RequirePermissions('admin.projects.read')
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.adminGet(id);
  }

  @RequirePermissions('admin.projects.decide')
  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  startReview(@Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.projects.startReview(id, ctx);
  }

  @RequirePermissions('admin.projects.decide')
  @Post(':id/decision')
  @HttpCode(HttpStatus.OK)
  decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProjectDecisionDto, @Ctx() ctx: RequestContext) {
    return this.projects.decide(id, dto, ctx);
  }
}

@Module({
  imports: [StorageModule, NotificationsModule],
  controllers: [ProjectsController, AdminProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
