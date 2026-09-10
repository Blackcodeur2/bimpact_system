import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Authenticated } from '../../common/access/access.decorators';
import { AuthContext, CurrentAuth } from '../../common/request-context';
import { ApplyJobDto } from './recruitment.dto';
import { RecruitmentService } from './recruitment.service';

@ApiTags('recruitment')
@ApiBearerAuth()
@Controller('jobs')
export class RecruitmentController {
  constructor(private readonly recruitment: RecruitmentService) {}

  @Authenticated()
  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.recruitment.listOffers(auth.userId);
  }

  @Authenticated()
  @Get('applications/me')
  myApplications(@CurrentAuth() auth: AuthContext) {
    return this.recruitment.listMyApplications(auth.userId);
  }

  @Authenticated()
  @Get(':id')
  get(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.recruitment.getOffer(id, auth.userId);
  }

  @Authenticated()
  @Post(':id/apply')
  apply(
    @CurrentAuth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyJobDto,
  ) {
    return this.recruitment.apply(id, dto, auth.userId);
  }
}

@Module({
  controllers: [RecruitmentController],
  providers: [RecruitmentService],
  exports: [RecruitmentService],
})
export class RecruitmentModule {}
