import { Body, Controller, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public, RequirePermissions } from '../../common/access/access.decorators';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { NotificationsModule } from '../notifications/notifications.module';
import { LessonProgressDto, SubmitQuizDto } from './training.dto';
import { TrainingService } from './training.service';

@ApiTags('training')
@ApiBearerAuth()
@Controller('training')
export class TrainingController {
  constructor(private readonly training: TrainingService) {}

  @RequirePermissions('training.read.self')
  @Get('modules')
  modules(@CurrentAuth() auth: AuthContext) {
    return this.training.listModules(auth.userId);
  }

  @RequirePermissions('training.read.self')
  @Get('modules/:id')
  getModule(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.training.getModule(id, auth.userId);
  }

  @RequirePermissions('training.read.self')
  @Get('lessons/:id')
  getLesson(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.training.getLesson(id, auth.userId);
  }

  @RequirePermissions('training.progress.self')
  @Post('lessons/:id/progress')
  @HttpCode(HttpStatus.OK)
  saveProgress(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LessonProgressDto) {
    return this.training.saveProgress(id, auth.userId, dto);
  }

  @RequirePermissions('training.progress.self')
  @Post('lessons/:id/complete')
  @HttpCode(HttpStatus.OK)
  completeLesson(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.training.completeLesson(id, auth.userId, ctx);
  }

  @RequirePermissions('training.progress.self')
  @Get('quiz/:moduleId')
  getQuiz(@CurrentAuth() auth: AuthContext, @Param('moduleId', ParseUUIDPipe) moduleId: string) {
    return this.training.getQuiz(moduleId, auth.userId);
  }

  @RequirePermissions('training.progress.self')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('quiz/:moduleId/submit')
  @HttpCode(HttpStatus.OK)
  submitQuiz(
    @CurrentAuth() auth: AuthContext,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() dto: SubmitQuizDto,
    @Ctx() ctx: RequestContext,
  ) {
    return this.training.submitQuiz(moduleId, auth.userId, dto, ctx);
  }
}

@ApiTags('certificates')
@ApiBearerAuth()
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly training: TrainingService) {}

  @RequirePermissions('training.read.self')
  @Get()
  mine(@CurrentAuth() auth: AuthContext) {
    return this.training.certificates(auth.userId);
  }

  /** Vérification publique d'un certificat (QR code). */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('verify/:code')
  verify(@Param('code') code: string) {
    return this.training.verify(code.slice(0, 32));
  }
}

@Module({
  imports: [NotificationsModule],
  controllers: [TrainingController, CertificatesController],
  providers: [TrainingService],
  exports: [TrainingService],
})
export class TrainingModule {}
