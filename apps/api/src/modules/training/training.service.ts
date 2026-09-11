import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Certification } from '@prisma/client';
import { randomCode, withUniqueRetry } from '../../common/codes';
import { AppException } from '../../common/errors/app-exception';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { LessonProgressDto, SubmitQuizDto } from './training.dto';

export type ModuleStatus = 'LOCKED' | 'AVAILABLE' | 'IN_PROGRESS' | 'COMPLETED';

/** Tentatives de quiz autorisées par module sur 24 heures glissantes. */
export const MAX_QUIZ_ATTEMPTS_PER_DAY = 5;

interface ModuleState {
  id: string;
  month: number;
  title: string;
  description: string;
  durationMinutes: number;
  order: number;
  iconName: string | null;
  totalLessons: number;
  completedLessons: number;
  status: ModuleStatus;
  quiz: { id: string; title: string; passScore: number } | null;
  bestScore: number | null;
}

/**
 * Formation entrepreneuriale (cahier §7.13-7.16) : modules débloqués dans l'ordre, quiz corrigés par le serveur,
 * certificat délivré quand les six modules sont validés, vérifiable publiquement par son code.
 */
@Injectable()
export class TrainingService {
  private readonly logger = new Logger(TrainingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async listModules(userId: string) {
    const [states, summary] = await Promise.all([this.moduleStates(userId), this.summary(userId)]);
    return { summary, modules: states.map(({ quiz, ...state }) => ({ ...state, hasQuiz: quiz !== null })) };
  }

  /** Résumé pour le tableau de bord et l'écran formation. */
  async summary(userId: string) {
    const [states, certificate] = await Promise.all([
      this.moduleStates(userId),
      this.prisma.certification.findFirst({ where: { userId, revokedAt: null }, select: { id: true } }),
    ]);
    const totalLessons = states.reduce((sum, state) => sum + state.totalLessons, 0);
    const completedLessons = states.reduce((sum, state) => sum + state.completedLessons, 0);
    const current = states.find((state) => state.status === 'AVAILABLE' || state.status === 'IN_PROGRESS') ?? null;
    let nextLesson: { id: string; title: string } | null = null;
    if (current) {
      nextLesson = await this.prisma.courseLesson.findFirst({
        where: { moduleId: current.id, progress: { none: { userId, isCompleted: true } } },
        orderBy: { order: 'asc' },
        select: { id: true, title: true },
      });
    }
    return {
      totalModules: states.length,
      completedModules: states.filter((state) => state.status === 'COMPLETED').length,
      totalLessons,
      completedLessons,
      progressPercent: totalLessons === 0 ? 0 : Math.round((completedLessons / totalLessons) * 100),
      certified: certificate !== null,
      current: current
        ? {
            moduleId: current.id,
            month: current.month,
            title: current.title,
            nextLesson,
            quizReady: current.quiz !== null && current.completedLessons === current.totalLessons,
          }
        : null,
    };
  }

  async getModule(id: string, userId: string) {
    const state = await this.unlockedModule(id, userId);
    const [lessons, attempts, lastAttempt] = await Promise.all([
      this.prisma.courseLesson.findMany({
        where: { moduleId: id },
        orderBy: { order: 'asc' },
        include: { progress: { where: { userId } } },
      }),
      state.quiz ? this.attemptsLastDay(userId, state.quiz.id) : Promise.resolve(0),
      state.quiz
        ? this.prisma.quizSubmission.findFirst({ where: { userId, quizId: state.quiz.id }, orderBy: { createdAt: 'desc' } })
        : Promise.resolve(null),
    ]);
    const { quiz, ...rest } = state;
    return {
      ...rest,
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        durationMinutes: lesson.durationMinutes,
        contentType: lesson.contentType,
        order: lesson.order,
        isCompleted: lesson.progress[0]?.isCompleted ?? false,
        progressPercent: lesson.progress[0]?.progressPercent ?? 0,
      })),
      quiz: quiz
        ? {
            ...quiz,
            available: state.completedLessons === state.totalLessons,
            attemptsLeftToday: Math.max(0, MAX_QUIZ_ATTEMPTS_PER_DAY - attempts),
            bestScore: state.bestScore,
            lastAttempt: lastAttempt ? { score: lastAttempt.score, passed: lastAttempt.passed, createdAt: lastAttempt.createdAt } : null,
          }
        : null,
    };
  }

  async getLesson(lessonId: string, userId: string) {
    const lesson = await this.prisma.courseLesson.findUnique({
      where: { id: lessonId },
      include: { module: { select: { id: true, month: true, title: true } }, progress: { where: { userId } } },
    });
    if (!lesson) throw lessonNotFound();
    await this.unlockedModule(lesson.moduleId, userId);
    const next = await this.prisma.courseLesson.findFirst({
      where: { moduleId: lesson.moduleId, order: { gt: lesson.order } },
      orderBy: { order: 'asc' },
      select: { id: true, title: true },
    });
    const progress = lesson.progress[0];
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
      content: lesson.markdownContent,
      keyPoints: Array.isArray(lesson.keyPoints) ? lesson.keyPoints : [],
      order: lesson.order,
      isCompleted: progress?.isCompleted ?? false,
      positionSeconds: progress?.positionSeconds ?? 0,
      progressPercent: progress?.progressPercent ?? 0,
      nextLesson: next,
    };
  }

  /** Position de lecture : l'avancement ne recule jamais et n'implique pas la validation de la leçon. */
  async saveProgress(lessonId: string, userId: string, dto: LessonProgressDto) {
    const lesson = await this.prisma.courseLesson.findUnique({ where: { id: lessonId }, select: { moduleId: true } });
    if (!lesson) throw lessonNotFound();
    await this.unlockedModule(lesson.moduleId, userId);
    const existing = await this.prisma.userLessonProgress.findUnique({ where: { userId_lessonId: { userId, lessonId } } });
    const progressPercent = Math.max(existing?.progressPercent ?? 0, dto.progressPercent);
    await this.prisma.userLessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId, positionSeconds: dto.positionSeconds, progressPercent },
      update: { positionSeconds: dto.positionSeconds, progressPercent },
    });
    return { lessonId, positionSeconds: dto.positionSeconds, progressPercent };
  }

  async completeLesson(lessonId: string, userId: string, ctx: RequestContext) {
    const lesson = await this.prisma.courseLesson.findUnique({ where: { id: lessonId }, select: { moduleId: true, order: true } });
    if (!lesson) throw lessonNotFound();
    await this.unlockedModule(lesson.moduleId, userId);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.userLessonProgress.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        create: { userId, lessonId, isCompleted: true, progressPercent: 100, completedAt: now },
        update: { isCompleted: true, progressPercent: 100, completedAt: now },
      });
      // Première leçon suivie par un bénéficiaire sélectionné : son parcours passe en formation.
      const beneficiary = await tx.beneficiary.findUnique({ where: { userId } });
      if (beneficiary?.status === 'SELECTED') {
        await tx.beneficiary.update({ where: { userId }, data: { status: 'TRAINING', statusNote: 'Formation commencée.' } });
        await this.audit.record(
          {
            action: 'beneficiary.status.changed',
            resourceType: 'beneficiary',
            resourceId: beneficiary.id,
            actorId: null,
            actorType: 'SYSTEM',
            before: { status: 'SELECTED' },
            after: { status: 'TRAINING' },
          },
          ctx,
          tx,
        );
      }
    });
    const next = await this.prisma.courseLesson.findFirst({
      where: { moduleId: lesson.moduleId, order: { gt: lesson.order } },
      orderBy: { order: 'asc' },
      select: { id: true, title: true },
    });
    return { lessonId, completed: true, nextLesson: next };
  }

  async getQuiz(moduleId: string, userId: string) {
    const state = await this.quizReadyModule(moduleId, userId);
    const quiz = await this.prisma.quiz.findUniqueOrThrow({
      where: { id: state.quiz!.id },
      include: { questions: { orderBy: { order: 'asc' }, select: { id: true, question: true, options: true, order: true } } },
    });
    const attempts = await this.attemptsLastDay(userId, quiz.id);
    return {
      id: quiz.id,
      moduleId,
      title: quiz.title,
      passScore: quiz.passScore,
      attemptsLeftToday: Math.max(0, MAX_QUIZ_ATTEMPTS_PER_DAY - attempts),
      // La bonne réponse n'est jamais envoyée avant la correction.
      questions: quiz.questions.map((question) => ({
        id: question.id,
        question: question.question,
        options: Array.isArray(question.options) ? question.options.map(String) : [],
        order: question.order,
      })),
    };
  }

  async submitQuiz(moduleId: string, userId: string, dto: SubmitQuizDto, ctx: RequestContext) {
    const state = await this.quizReadyModule(moduleId, userId);
    const quiz = await this.prisma.quiz.findUniqueOrThrow({ where: { id: state.quiz!.id }, include: { questions: { orderBy: { order: 'asc' } } } });
    const attempts = await this.attemptsLastDay(userId, quiz.id);
    if (attempts >= MAX_QUIZ_ATTEMPTS_PER_DAY) {
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'QUIZ_TOO_MANY_ATTEMPTS',
        `Vous avez atteint ${MAX_QUIZ_ATTEMPTS_PER_DAY} tentatives en 24 heures. Relisez les leçons et réessayez demain.`,
      );
    }

    const answers = new Map(dto.answers.map((answer) => [answer.questionId, answer.selectedIndex]));
    const graded = quiz.questions.map((question) => ({ question, selected: answers.get(question.id), isCorrect: answers.get(question.id) === question.correctIndex }));
    const correctCount = graded.filter((item) => item.isCorrect).length;
    const score = quiz.questions.length === 0 ? 0 : Math.round((correctCount / quiz.questions.length) * 100);
    const passed = score >= quiz.passScore;

    await this.prisma.quizSubmission.create({
      data: {
        userId,
        quizId: quiz.id,
        score,
        passed,
        answers: [...answers.entries()].map(([questionId, selectedIndex]) => ({ questionId, selectedIndex })),
      },
    });
    const certificate = passed ? await this.issueCertificateIfEligible(userId, ctx) : null;

    return {
      score,
      passScore: quiz.passScore,
      passed,
      correctCount,
      totalQuestions: quiz.questions.length,
      attemptsLeftToday: Math.max(0, MAX_QUIZ_ATTEMPTS_PER_DAY - attempts - 1),
      // Les bonnes réponses ne sont révélées qu'une fois le quiz réussi, pour que la nouvelle tentative reste un vrai contrôle.
      results: graded.map((item) =>
        passed
          ? { questionId: item.question.id, isCorrect: item.isCorrect, correctIndex: item.question.correctIndex, explanation: item.question.explanation }
          : { questionId: item.question.id, isCorrect: item.isCorrect },
      ),
      certificate: certificate ? certificateView(certificate) : null,
    };
  }

  async certificates(userId: string) {
    const certificates = await this.prisma.certification.findMany({ where: { userId }, orderBy: { issuedAt: 'desc' } });
    return { items: certificates.map(certificateView) };
  }

  /** Vérification publique : aucun compte requis, seules les informations imprimées sur le certificat sont renvoyées. */
  async verify(code: string) {
    const certificate = await this.prisma.certification.findUnique({ where: { verificationCode: code.toUpperCase() } });
    if (!certificate) {
      throw new AppException(HttpStatus.NOT_FOUND, 'CERTIFICATE_NOT_FOUND', 'Aucun certificat ne correspond à ce code.');
    }
    return {
      valid: certificate.revokedAt === null,
      certificateNumber: certificate.certificateNumber,
      title: certificate.title,
      holderName: certificate.holderName,
      issuedAt: certificate.issuedAt,
      revokedAt: certificate.revokedAt,
    };
  }

  // ───────────────────────────── Interne ─────────────────────────────

  private async moduleStates(userId: string): Promise<ModuleState[]> {
    const [modules, completed, best, passed] = await Promise.all([
      this.prisma.courseModule.findMany({
        orderBy: [{ order: 'asc' }, { month: 'asc' }],
        include: { lessons: { select: { id: true } }, quizzes: { select: { id: true, title: true, passScore: true }, take: 1 } },
      }),
      this.prisma.userLessonProgress.findMany({ where: { userId, isCompleted: true }, select: { lessonId: true } }),
      this.prisma.quizSubmission.groupBy({ by: ['quizId'], where: { userId }, _max: { score: true } }),
      this.prisma.quizSubmission.findMany({ where: { userId, passed: true }, select: { quizId: true }, distinct: ['quizId'] }),
    ]);
    const done = new Set(completed.map((row) => row.lessonId));
    const bestScores = new Map(best.map((row) => [row.quizId, row._max.score]));
    const passedQuizzes = new Set(passed.map((row) => row.quizId));

    let previousCompleted = true;
    return modules.map((module) => {
      const quiz = module.quizzes[0] ?? null;
      const completedLessons = module.lessons.filter((lesson) => done.has(lesson.id)).length;
      const validated = quiz ? passedQuizzes.has(quiz.id) : module.lessons.length > 0 && completedLessons === module.lessons.length;
      const status: ModuleStatus = !previousCompleted
        ? 'LOCKED'
        : validated
          ? 'COMPLETED'
          : completedLessons > 0
            ? 'IN_PROGRESS'
            : 'AVAILABLE';
      previousCompleted = status === 'COMPLETED';
      return {
        id: module.id,
        month: module.month,
        title: module.title,
        description: module.description,
        durationMinutes: module.durationMinutes,
        order: module.order,
        iconName: module.iconName,
        totalLessons: module.lessons.length,
        completedLessons,
        status,
        quiz,
        bestScore: quiz ? (bestScores.get(quiz.id) ?? null) : null,
      };
    });
  }

  private async unlockedModule(moduleId: string, userId: string): Promise<ModuleState> {
    const state = (await this.moduleStates(userId)).find((module) => module.id === moduleId);
    if (!state) throw new AppException(HttpStatus.NOT_FOUND, 'MODULE_NOT_FOUND', 'Module de formation introuvable.');
    if (state.status === 'LOCKED') {
      throw new AppException(HttpStatus.FORBIDDEN, 'MODULE_LOCKED', 'Validez le quiz du module précédent pour débloquer celui-ci.');
    }
    return state;
  }

  private async quizReadyModule(moduleId: string, userId: string): Promise<ModuleState> {
    const state = await this.unlockedModule(moduleId, userId);
    if (!state.quiz) throw new AppException(HttpStatus.NOT_FOUND, 'QUIZ_NOT_FOUND', 'Ce module n’a pas de quiz.');
    if (state.completedLessons < state.totalLessons) {
      throw new AppException(HttpStatus.CONFLICT, 'QUIZ_LESSONS_INCOMPLETE', 'Terminez toutes les leçons du module avant de passer le quiz.', {
        completedLessons: state.completedLessons,
        totalLessons: state.totalLessons,
      });
    }
    return state;
  }

  private attemptsLastDay(userId: string, quizId: string) {
    return this.prisma.quizSubmission.count({ where: { userId, quizId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } });
  }

  private async issueCertificateIfEligible(userId: string, ctx: RequestContext): Promise<Certification | null> {
    const states = await this.moduleStates(userId);
    if (states.length === 0 || states.some((state) => state.status !== 'COMPLETED')) return null;

    const [profile, kyc] = await Promise.all([
      this.prisma.profile.findUniqueOrThrow({ where: { userId }, select: { firstName: true, lastName: true } }),
      this.prisma.kycProfile.findUnique({ where: { userId }, select: { status: true, firstName: true, lastName: true } }),
    ]);
    // Nom de la pièce d'identité vérifiée quand il existe, sinon celui du compte.
    const holderName =
      kyc?.status === 'APPROVED' && kyc.firstName && kyc.lastName ? `${kyc.firstName} ${kyc.lastName}` : `${profile.firstName} ${profile.lastName}`;

    const certificate = await withUniqueRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`certificate:${userId}`}::text, 0))`;
        if (await tx.certification.findFirst({ where: { userId, revokedAt: null } })) return null;
        const created = await tx.certification.create({
          data: {
            userId,
            certificateNumber: `BI-${new Date().getFullYear()}-${randomCode(8)}`,
            verificationCode: randomCode(12),
            holderName,
          },
        });
        const beneficiary = await tx.beneficiary.findUnique({ where: { userId } });
        if (beneficiary && (beneficiary.status === 'SELECTED' || beneficiary.status === 'TRAINING')) {
          await tx.beneficiary.update({
            where: { userId },
            data: { status: 'CERTIFIED', statusNote: 'Formation validée : certificat délivré.' },
          });
        }
        await this.audit.record(
          {
            action: 'training.certificate.issued',
            resourceType: 'certification',
            resourceId: created.id,
            actorId: null,
            actorType: 'SYSTEM',
            after: { certificateNumber: created.certificateNumber, beneficiaryCertified: Boolean(beneficiary) },
          },
          ctx,
          tx,
        );
        return created;
      }),
    );
    if (certificate) {
      await this.notifications
        .notify(userId, {
          type: 'TRAINING_CERTIFIED',
          title: 'Certificat délivré',
          body: `Félicitations : vous avez validé les ${states.length} modules. Votre certificat ${certificate.certificateNumber} est disponible.`,
          deepLink: '/training/certificate',
        })
        .catch((error: unknown) => this.logger.warn({ err: error }, 'Notification de certificat non envoyée'));
    }
    return certificate;
  }
}

function certificateView(certificate: Certification) {
  return {
    id: certificate.id,
    certificateNumber: certificate.certificateNumber,
    title: certificate.title,
    holderName: certificate.holderName,
    issuedAt: certificate.issuedAt,
    verificationCode: certificate.verificationCode,
    revoked: certificate.revokedAt !== null,
    revokedAt: certificate.revokedAt,
    /** Chemin public de vérification (relatif à l'origine de l'API). */
    verificationPath: `/v1/certificates/verify/${certificate.verificationCode}`,
  };
}

function lessonNotFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'LESSON_NOT_FOUND', 'Leçon introuvable.');
}
