import { Body, Controller, Get, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Authenticated } from '../../common/access/access.decorators';
import { AuthContext, CurrentAuth } from '../../common/request-context';
import { SubmitQuizDto } from './training.dto';
import { TrainingService } from './training.service';

@ApiTags('training')
@ApiBearerAuth()
@Controller('training')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @Authenticated()
  @Get('modules')
  modules(@CurrentAuth() auth: AuthContext) {
    return this.training.listModules(auth.userId);
  }

  @Authenticated()
  @Get('modules/:id')
  getModule(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.training.getModule(id, auth.userId);
  }

  @Authenticated()
  @Get('lessons/:id')
  getLesson(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.training.getLesson(id, auth.userId);
  }

  @Authenticated()
  @Post('lessons/:id/complete')
  completeLesson(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.training.completeLesson(id, auth.userId);
  }

  @Authenticated()
  @Get('quiz/:moduleId')
  getQuiz(@Param('moduleId', ParseUUIDPipe) moduleId: string) {
    return this.training.getQuiz(moduleId);
  }

  @Authenticated()
  @Post('quiz/:moduleId/submit')
  submitQuiz(
    @CurrentAuth() auth: AuthContext,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: SubmitQuizDto,
  ) {
    return this.training.submitQuiz(moduleId, dto, auth.userId);
  }

  @Authenticated()
  @Get('certificates')
  certificates(@CurrentAuth() auth: AuthContext) {
    return this.training.listCertificates(auth.userId);
  }
}

@Module({
  controllers: [TrainingController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}
