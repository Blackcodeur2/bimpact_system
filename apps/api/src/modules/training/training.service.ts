import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../database/prisma.service';
import { SubmitQuizDto } from './training.dto';
import * as crypto from 'crypto';

@Injectable()
export class TrainingService {
  constructor(private readonly prisma: PrismaService) {}

  async listModules(userId: string) {
    const modules = await this.prisma.courseModule.findMany({
      orderBy: { order: 'asc' },
      include: {
        lessons: { select: { id: true } },
        quizzes: {
          include: {
            submissions: {
              where: { userId },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    const userProgress = await this.prisma.userLessonProgress.findMany({
      where: { userId, isCompleted: true },
      select: { lessonId: true },
    });
    const completedLessonIds = new Set(userProgress.map((p) => p.lessonId));

    let previousModulePassed = true; // Month 1 is unlocked by default

    return modules.map((m) => {
      const totalLessons = m.lessons.length;
      const completedCount = m.lessons.filter((l) => completedLessonIds.has(l.id)).length;
      const latestSubmission = m.quizzes[0]?.submissions[0];
      const isQuizPassed = latestSubmission?.passed ?? false;

      let status = 'LOCKED';
      if (isQuizPassed || (totalLessons > 0 && completedCount === totalLessons)) {
        status = 'COMPLETED';
      } else if (previousModulePassed) {
        status = 'IN_PROGRESS';
      } else {
        status = 'LOCKED';
      }

      // Pour débloquer le mois suivant, le quiz du mois courant doit être validé
      previousModulePassed = isQuizPassed || status === 'COMPLETED';

      return {
        id: m.id,
        month: m.month,
        title: m.title,
        description: m.description,
        durationMinutes: m.durationMinutes,
        order: m.order,
        iconName: m.iconName,
        totalLessons,
        completedLessons: completedCount,
        progressPercent: totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0,
        status,
        latestQuizScore: latestSubmission?.score ?? null,
      };
    });
  }

  async getModule(id: string, userId: string) {
    const m = await this.prisma.courseModule.findUnique({
      where: { id },
      include: {
        lessons: {
          orderBy: { order: 'asc' },
        },
        quizzes: {
          select: { id: true, title: true, passScore: true },
        },
      },
    });
    if (!m) {
      throw new AppException(HttpStatus.NOT_FOUND, 'MODULE_NOT_FOUND', 'Module de formation introuvable.');
    }

    const progress = await this.prisma.userLessonProgress.findMany({
      where: { userId, lessonId: { in: m.lessons.map((l) => l.id) } },
    });
    const progressMap = new Map(progress.map((p) => [p.lessonId, p.isCompleted]));

    return {
      id: m.id,
      month: m.month,
      title: m.title,
      description: m.description,
      durationMinutes: m.durationMinutes,
      quiz: m.quizzes[0] ?? null,
      lessons: m.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        description: l.description,
        durationMinutes: l.durationMinutes,
        contentType: l.contentType,
        audioUrl: l.audioUrl,
        order: l.order,
        isCompleted: progressMap.get(l.id) ?? false,
      })),
    };
  }

  async getLesson(lessonId: string, userId: string) {
    const lesson = await this.prisma.courseLesson.findUnique({
      where: { id: lessonId },
      include: { module: { select: { id: true, month: true, title: true } } },
    });
    if (!lesson) {
      throw new AppException(HttpStatus.NOT_FOUND, 'LESSON_NOT_FOUND', 'Leçon introuvable.');
    }

    const progress = await this.prisma.userLessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });

    return {
      id: lesson.id,
      moduleId: lesson.moduleId,
      moduleMonth: lesson.module.month,
      moduleTitle: lesson.module.title,
      title: lesson.title,
      description: lesson.description,
      durationMinutes: lesson.durationMinutes,
      contentType: lesson.contentType,
      audioUrl: lesson.audioUrl,
      markdownContent: lesson.markdownContent,
      keyPoints: lesson.keyPoints,
      order: lesson.order,
      isCompleted: progress?.isCompleted ?? false,
    };
  }

  async completeLesson(lessonId: string, userId: string) {
    const lesson = await this.prisma.courseLesson.findUnique({ where: { id: lessonId } });
    if (!lesson) {
      throw new AppException(HttpStatus.NOT_FOUND, 'LESSON_NOT_FOUND', 'Leçon introuvable.');
    }

    await this.prisma.userLessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: {
        userId,
        lessonId,
        isCompleted: true,
        completedAt: new Date(),
      },
      update: {
        isCompleted: true,
        completedAt: new Date(),
      },
    });

    return { success: true, lessonId };
  }

  async getQuiz(moduleId: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { moduleId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          select: {
            id: true,
            question: true,
            options: true,
            order: true,
            // Ne pas exposer correctIndex avant soumission
          },
        },
      },
    });
    if (!quiz) {
      throw new AppException(HttpStatus.NOT_FOUND, 'QUIZ_NOT_FOUND', 'Quiz introuvable pour ce module.');
    }
    return quiz;
  }

  async submitQuiz(moduleId: string, dto: SubmitQuizDto, userId: string) {
    const quiz = await this.prisma.quiz.findFirst({
      where: { moduleId },
      include: { questions: { orderBy: { order: 'asc' } }, module: true },
    });
    if (!quiz) {
      throw new AppException(HttpStatus.NOT_FOUND, 'QUIZ_NOT_FOUND', 'Quiz introuvable.');
    }

    let correctCount = 0;
    const questionsResults = quiz.questions.map((q) => {
      const userAnswer = dto.answers.find((a) => a.questionId === q.id);
      const isCorrect = userAnswer !== undefined && userAnswer.selectedIndex === q.correctIndex;
      if (isCorrect) correctCount++;

      return {
        questionId: q.id,
        question: q.question,
        userIndex: userAnswer?.selectedIndex ?? -1,
        correctIndex: q.correctIndex,
        isCorrect,
        explanation: q.explanation,
      };
    });

    const total = quiz.questions.length;
    const score = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const passed = score >= quiz.passScore;

    await this.prisma.quizSubmission.create({
      data: {
        userId,
        quizId: quiz.id,
        score,
        passed,
      },
    });

    // Si l'utilisateur valide le module du mois 6, délivrer automatiquement la certification s'il ne l'a pas encore !
    let certificationIssued = false;
    if (passed && quiz.module.month === 6) {
      const existingCert = await this.prisma.certification.findFirst({ where: { userId } });
      if (!existingCert) {
        const certNumber = `CERT-BENSKIN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const verificationHash = crypto.createHash('sha256').update(`${userId}:${certNumber}:${Date.now()}`).digest('hex');
        await this.prisma.certification.create({
          data: {
            userId,
            certificateNumber: certNumber,
            verificationHash,
          },
        });
        certificationIssued = true;
      }
    }

    return {
      score,
      passScore: quiz.passScore,
      passed,
      correctCount,
      totalQuestions: total,
      questionsResults,
      certificationIssued,
    };
  }

  async listCertificates(userId: string) {
    return this.prisma.certification.findMany({
      where: { userId },
      orderBy: { issuedAt: 'desc' },
      include: {
        user: {
          select: {
            phone: true,
            profile: { select: { firstName: true, lastName: true, city: true } },
          },
        },
      },
    });
  }
}
