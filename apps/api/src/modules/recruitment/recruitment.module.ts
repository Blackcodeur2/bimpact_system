import { Body, Controller, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { RequirePermissions } from '../../common/access/access.decorators';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { NotificationsModule } from '../notifications/notifications.module';
import { ApplyJobDto, JobsQueryDto } from './recruitment.dto';
import { RecruitmentService } from './recruitment.service';

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class RecruitmentController {
  constructor(private readonly recruitment: RecruitmentService) {}

  @RequirePermissions('jobs.read')
  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: JobsQueryDto) {
    return this.recruitment.list(auth.userId, query);
  }

  @RequirePermissions('jobs.apply.self')
  @Get('applications/me')
  myApplications(@CurrentAuth() auth: AuthContext) {
    return this.recruitment.myApplications(auth.userId);
  }

  @RequirePermissions('jobs.apply.self')
  @Post('applications/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.recruitment.withdraw(id, auth.userId, ctx);
  }

  @RequirePermissions('jobs.read')
  @Get(':id')
  get(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.recruitment.get(id, auth.userId);
  }

  @RequirePermissions('jobs.apply.self')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post(':id/apply')
  apply(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ApplyJobDto, @Ctx() ctx: RequestContext) {
    return this.recruitment.apply(id, auth.userId, dto, ctx);
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [RecruitmentController],
  providers: [RecruitmentService],
  exports: [RecruitmentService],
})
export class RecruitmentModule {}
