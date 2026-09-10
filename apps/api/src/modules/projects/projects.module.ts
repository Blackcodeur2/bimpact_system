import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Authenticated } from '../../common/access/access.decorators';
import { AuthContext, CurrentAuth } from '../../common/request-context';
import { CreateProjectDto } from './projects.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Authenticated()
  @Get()
  list(@CurrentAuth() auth: AuthContext) {
    return this.projects.listForMember(auth.userId);
  }

  @Authenticated()
  @Get(':id')
  get(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.projects.getById(id, auth.userId);
  }

  @Authenticated()
  @Post()
  create(@CurrentAuth() auth: AuthContext, @Body() dto: CreateProjectDto) {
    return this.projects.create(dto, auth.userId);
  }
}

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
