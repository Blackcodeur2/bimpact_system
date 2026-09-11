import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/access/access.decorators';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  AddCompanyMemberDto,
  CreateCompanyDto,
  CreateJobOfferDto,
  UpdateApplicationStatusDto,
  UpdateCompanyDto,
} from './companies.dto';
import { CompaniesService } from './companies.service';

@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @RequirePermissions('companies.manage.self')
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateCompanyDto, @Ctx() ctx: RequestContext) {
    return this.companies.create(auth.userId, dto, ctx);
  }

  @RequirePermissions('companies.manage.self')
  @Get('me')
  mine(@CurrentAuth() auth: AuthContext) {
    return this.companies.mine(auth.userId);
  }

  @RequirePermissions('companies.manage.self')
  @Get(':id')
  get(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.companies.get(id, auth.userId);
  }

  @RequirePermissions('companies.manage.self')
  @Patch(':id')
  update(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCompanyDto, @Ctx() ctx: RequestContext) {
    return this.companies.update(id, auth.userId, dto, ctx);
  }

  @RequirePermissions('companies.manage.self')
  @Post(':id/members')
  addMember(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddCompanyMemberDto, @Ctx() ctx: RequestContext) {
    return this.companies.addMember(id, auth.userId, dto, ctx);
  }

  @RequirePermissions('companies.manage.self')
  @Delete(':id/members/:memberId')
  removeMember(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Ctx() ctx: RequestContext,
  ) {
    return this.companies.removeMember(id, memberId, auth.userId, ctx);
  }

  @RequirePermissions('companies.manage.self')
  @Post(':id/jobs')
  createJob(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateJobOfferDto, @Ctx() ctx: RequestContext) {
    return this.companies.createJob(id, auth.userId, dto, ctx);
  }

  @RequirePermissions('companies.manage.self')
  @Post(':id/jobs/:jobId/close')
  @HttpCode(HttpStatus.OK)
  closeJob(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('jobId', ParseUUIDPipe) jobId: string,
    @Ctx() ctx: RequestContext,
  ) {
    return this.companies.closeJob(id, jobId, auth.userId, ctx);
  }

  @RequirePermissions('companies.manage.self')
  @Get(':id/jobs/:jobId/applications')
  applications(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Param('jobId', ParseUUIDPipe) jobId: string) {
    return this.companies.applications(id, jobId, auth.userId);
  }

  @RequirePermissions('companies.manage.self')
  @Patch(':id/applications/:applicationId')
  updateApplication(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body() dto: UpdateApplicationStatusDto,
    @Ctx() ctx: RequestContext,
  ) {
    return this.companies.updateApplication(id, applicationId, auth.userId, dto, ctx);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [CompaniesController],
  providers: [CompaniesService],
  exports: [CompaniesService],
})
export class CompaniesModule {}
