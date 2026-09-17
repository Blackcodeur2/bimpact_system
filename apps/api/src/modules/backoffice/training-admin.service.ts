import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { decodeCursor, encodeCursor } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type {
  CertificatesQueryDto,
  CreateModuleDto,
  LessonDto,
  ReasonDto,
  SaveQuizDto,
  UpdateLessonDto,
  UpdateModuleDto,
} from './backoffice.dto';

/**
 * Administration de la formation (cahier §8.9) : modules, leçons, quiz et certificats.
 * Un quiz déjà passé par des membres ne peut plus changer de structure (réponses, nombre de questions) :
 * seules les formulations sont corrigeables, pour que les scores obtenus restent justes.
 */
@Injectable()
export class TrainingAdminService {
  private readonly logger = new Logger(TrainingAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async modules() {
    const [modules, learners, quizStats, passedUsers, certificates] = await Promise.all([
      this.prisma.courseModule.findMany({
        orderBy: [{ order: 'asc' }, { month: 'asc' }],
        include: {
          _count: { select: { lessons: true } },
          quizzes: { take: 1, include: { _count: { select: { questions: true } } } },
        },
      }),
      this.prisma.$queryRaw<{ module_id: string; learners: number }[]>`
        SELECT l.module_id, COUNT(DISTINCT p.user_id)::int AS learners
        FROM user_lesson_progress p JOIN course_lessons l ON l.id = p.lesson_id
        GROUP BY l.module_id`,
      this.prisma.quizSubmission.groupBy({ by: ['quizId'], _count: true, _avg: { score: true } }),
      this.prisma.$queryRaw<{ quiz_id: string; passed: number }[]>`
        SELECT quiz_id, COUNT(DISTINCT user_id)::int AS passed FROM quiz_submissions WHERE passed GROUP BY quiz_id`,
      this.prisma.certification.count({ where: { revokedAt: null } }),
    ]);
    const learnersByModule = new Map(learners.map((row) => [row.module_id, row.learners]));
    const statsByQuiz = new Map(quizStats.map((row) => [row.quizId, row]));
    const passedByQuiz = new Map(passedUsers.map((row) => [row.quiz_id, row.passed]));

    return {
      certificates,
      items: modules.map((module) => {
        const quiz = module.quizzes[0] ?? null;
        const stats = quiz ? statsByQuiz.get(quiz.id) : undefined;
        return {
          id: module.id,
          month: module.month,
          order: module.order,
          title: module.title,
          description: module.description,
          durationMinutes: module.durationMinutes,
          iconName: module.iconName,
          status: module.status,
          updatedAt: module.updatedAt,
          lessons: module._count.lessons,
          quiz: quiz ? { id: quiz.id, title: quiz.title, passScore: quiz.passScore, questions: quiz._count.questions } : null,
          stats: {
            learners: learnersByModule.get(module.id) ?? 0,
            submissions: stats?._count ?? 0,
            averageScore: stats?._avg.score != null ? Math.round(stats._avg.score) : null,
            passedLearners: quiz ? (passedByQuiz.get(quiz.id) ?? 0) : 0,
          },
        };
      }),
    };
  }

  async module(id: string) {
    const module = await this.prisma.courseModule.findUnique({
      where: { id },
      include: {
        lessons: { orderBy: { order: 'asc' } },
        quizzes: { take: 1, include: { questions: { orderBy: { order: 'asc' } }, _count: { select: { submissions: true } } } },
      },
    });
    if (!module) throw moduleNotFound();
    const completions = await this.prisma.userLessonProgress.groupBy({
      by: ['lessonId'],
      where: { lessonId: { in: module.lessons.map((lesson) => lesson.id) }, isCompleted: true },
      _count: true,
    });
    const completedByLesson = new Map(completions.map((row) => [row.lessonId, row._count]));
    const quiz = module.quizzes[0] ?? null;
    return {
      id: module.id,
      month: module.month,
      order: module.order,
      title: module.title,
      description: module.description,
      durationMinutes: module.durationMinutes,
      iconName: module.iconName,
      status: module.status,
      createdAt: module.createdAt,
      updatedAt: module.updatedAt,
      lessons: module.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        durationMinutes: lesson.durationMinutes,
        contentType: lesson.contentType,
        audioUrl: lesson.audioUrl,
        markdownContent: lesson.markdownContent,
        keyPoints: Array.isArray(lesson.keyPoints) ? lesson.keyPoints.map(String) : [],
        order: lesson.order,
        completions: completedByLesson.get(lesson.id) ?? 0,
      })),
      quiz: quiz
        ? {
            id: quiz.id,
            title: quiz.title,
            passScore: quiz.passScore,
            submissions: quiz._count.submissions,
            structureLocked: quiz._count.submissions > 0,
            questions: quiz.questions.map((question) => ({
              id: question.id,
              question: question.question,
              options: Array.isArray(question.options) ? question.options.map(String) : [],
              correctIndex: question.correctIndex,
              explanation: question.explanation,
              order: question.order,
            })),
          }
        : null,
    };
  }

  /** Un nouveau module est toujours créé en brouillon : il n'apparaît aux membres qu'une fois publié. */
  async createModule(dto: CreateModuleDto, ctx: RequestContext) {
    try {
      const module = await this.prisma.$transaction(async (tx) => {
        const created = await tx.courseModule.create({ data: { ...dto, status: 'DRAFT' } });
        await this.audit.record(
          { action: 'training.module.created', resourceType: 'course_module', resourceId: created.id, after: { month: dto.month, title: dto.title } },
          ctx,
          tx,
        );
        return created;
      });
      return this.module(module.id);
    } catch (error) {
      throw mapMonthConflict(error);
    }
  }

  async updateModule(id: string, dto: UpdateModuleDto, ctx: RequestContext) {
    const data = definedOnly(dto);
    if (Object.keys(data).length === 0) return this.module(id);
    try {
      await this.prisma.$transaction(async (tx) => {
        const current = await tx.courseModule.findUnique({ where: { id }, include: { _count: { select: { lessons: true } } } });
        if (!current) throw moduleNotFound();
        if (dto.status === 'PUBLISHED' && current._count.lessons === 0) {
          throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'MODULE_EMPTY', 'Ajoutez au moins une leçon avant de publier ce module.');
        }
        await tx.courseModule.update({ where: { id }, data });
        await this.audit.record(
          {
            action: dto.status && dto.status !== current.status ? `training.module.${dto.status.toLowerCase()}` : 'training.module.updated',
            resourceType: 'course_module',
            resourceId: id,
            before: pick(current, Object.keys(data)),
            after: data,
          },
          ctx,
          tx,
        );
      });
    } catch (error) {
      throw mapMonthConflict(error);
    }
    return this.module(id);
  }

  async createLesson(moduleId: string, dto: LessonDto, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const module = await tx.courseModule.findUnique({ where: { id: moduleId }, select: { id: true } });
      if (!module) throw moduleNotFound();
      const last = await tx.courseLesson.findFirst({ where: { moduleId }, orderBy: { order: 'desc' }, select: { order: true } });
      const lesson = await tx.courseLesson.create({
        data: {
          moduleId,
          title: dto.title,
          description: dto.description ?? null,
          durationMinutes: dto.durationMinutes,
          contentType: dto.contentType,
          audioUrl: dto.audioUrl ?? null,
          markdownContent: dto.markdownContent,
          keyPoints: dto.keyPoints ?? [],
          order: dto.order ?? (last?.order ?? 0) + 1,
        },
      });
      await this.audit.record(
        { action: 'training.lesson.created', resourceType: 'course_lesson', resourceId: lesson.id, after: { moduleId, title: lesson.title } },
        ctx,
        tx,
      );
    });
    return this.module(moduleId);
  }

  async updateLesson(id: string, dto: UpdateLessonDto, ctx: RequestContext) {
    const lesson = await this.prisma.courseLesson.findUnique({ where: { id }, select: { moduleId: true, title: true } });
    if (!lesson) throw lessonNotFound();
    const data = definedOnly(dto);
    if (Object.keys(data).length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.courseLesson.update({ where: { id }, data });
        // Le texte des leçons peut être long : l'audit conserve les champs modifiés, pas leur contenu.
        await this.audit.record(
          { action: 'training.lesson.updated', resourceType: 'course_lesson', resourceId: id, metadata: { fields: Object.keys(data), title: dto.title ?? lesson.title } },
          ctx,
          tx,
        );
      });
    }
    return this.module(lesson.moduleId);
  }

  async deleteLesson(id: string, ctx: RequestContext) {
    const lesson = await this.prisma.courseLesson.findUnique({
      where: { id },
      include: { module: { select: { status: true, _count: { select: { lessons: true } } } }, _count: { select: { progress: true } } },
    });
    if (!lesson) throw lessonNotFound();
    if (lesson._count.progress > 0) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'LESSON_HAS_PROGRESS',
        'Des membres ont déjà suivi cette leçon : corrigez-la plutôt que de la supprimer.',
        { learners: lesson._count.progress },
      );
    }
    if (lesson.module.status === 'PUBLISHED' && lesson.module._count.lessons <= 1) {
      throw new AppException(HttpStatus.CONFLICT, 'MODULE_EMPTY', 'Un module publié doit conserver au moins une leçon.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.courseLesson.delete({ where: { id } });
      await this.audit.record(
        { action: 'training.lesson.deleted', resourceType: 'course_lesson', resourceId: id, before: { moduleId: lesson.moduleId, title: lesson.title } },
        ctx,
        tx,
      );
    });
    return this.module(lesson.moduleId);
  }

  async saveQuiz(moduleId: string, dto: SaveQuizDto, ctx: RequestContext) {
    const invalid = dto.questions.findIndex((question) => question.correctIndex >= question.options.length);
    if (invalid >= 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Certaines informations sont invalides.', {
        fields: { [`questions.${invalid}.correctIndex`]: ['La bonne réponse doit faire partie des options.'] },
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM course_modules WHERE id = ${moduleId}::uuid FOR UPDATE`;
      const module = await tx.courseModule.findUnique({
        where: { id: moduleId },
        include: { quizzes: { take: 1, include: { questions: true, _count: { select: { submissions: true } } } } },
      });
      if (!module) throw moduleNotFound();
      const quiz = module.quizzes[0] ?? null;
      const locked = Boolean(quiz && quiz._count.submissions > 0);

      if (quiz && locked) {
        const existing = new Map(quiz.questions.map((question) => [question.id, question]));
        const sameStructure =
          dto.questions.length === existing.size &&
          dto.questions.every((question) => {
            const current = question.id ? existing.get(question.id) : undefined;
            const currentOptions = Array.isArray(current?.options) ? current.options : [];
            return current && currentOptions.length === question.options.length && current.correctIndex === question.correctIndex;
          });
        if (!sameStructure) {
          throw new AppException(
            HttpStatus.CONFLICT,
            'QUIZ_STRUCTURE_LOCKED',
            'Des membres ont déjà passé ce quiz : seules les formulations peuvent être corrigées (ni ajout, ni suppression, ni changement de bonne réponse).',
            { submissions: quiz._count.submissions },
          );
        }
        await tx.quiz.update({ where: { id: quiz.id }, data: { title: dto.title, passScore: dto.passScore } });
        for (const [index, question] of dto.questions.entries()) {
          await tx.quizQuestion.update({
            where: { id: question.id! },
            data: { question: question.question, options: question.options, explanation: question.explanation ?? null, order: index + 1 },
          });
        }
      } else {
        const saved = quiz
          ? await tx.quiz.update({ where: { id: quiz.id }, data: { title: dto.title, passScore: dto.passScore } })
          : await tx.quiz.create({ data: { moduleId, title: dto.title, passScore: dto.passScore } });
        await tx.quizQuestion.deleteMany({ where: { quizId: saved.id } });
        await tx.quizQuestion.createMany({
          data: dto.questions.map((question, index) => ({
            quizId: saved.id,
            question: question.question,
            options: question.options,
            correctIndex: question.correctIndex,
            explanation: question.explanation ?? null,
            order: index + 1,
          })),
        });
      }
      await this.audit.record(
        {
          action: 'training.quiz.saved',
          resourceType: 'course_module',
          resourceId: moduleId,
          before: quiz ? { title: quiz.title, passScore: quiz.passScore, questions: quiz.questions.length } : null,
          after: { title: dto.title, passScore: dto.passScore, questions: dto.questions.length },
          metadata: { structureLocked: locked },
        },
        ctx,
        tx,
      );
    });
    return this.module(moduleId);
  }

  async certificates(query: CertificatesQueryDto) {
    const after = query.cursor ? decodeCursor(query.cursor) : null;
    const q = query.q;
    const rows = await this.prisma.certification.findMany({
      where: {
        ...(q
          ? { AND: [{ OR: [{ holderName: { contains: q, mode: 'insensitive' } }, { certificateNumber: { contains: q.toUpperCase() } }] }] }
          : {}),
        ...(after ? { OR: [{ issuedAt: { lt: after.createdAt } }, { issuedAt: after.createdAt, id: { lt: after.id } }] } : {}),
      },
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { user: { select: { id: true, phone: true } } },
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map((certificate) => ({
        id: certificate.id,
        certificateNumber: certificate.certificateNumber,
        holderName: certificate.holderName,
        title: certificate.title,
        issuedAt: certificate.issuedAt,
        verificationCode: certificate.verificationCode,
        revokedAt: certificate.revokedAt,
        revocationReason: certificate.revocationReason,
        member: { userId: certificate.user.id, phone: certificate.user.phone },
      })),
      nextCursor: hasMore && last ? encodeCursor({ createdAt: last.issuedAt, id: last.id }) : null,
    };
  }

  async revokeCertificate(id: string, dto: ReasonDto, ctx: RequestContext) {
    const certificate = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM certifications WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.certification.findUnique({ where: { id } });
      if (!current) throw new AppException(HttpStatus.NOT_FOUND, 'CERTIFICATE_NOT_FOUND', 'Certificat introuvable.');
      if (current.revokedAt) {
        throw new AppException(HttpStatus.CONFLICT, 'CERTIFICATE_ALREADY_REVOKED', 'Ce certificat est déjà révoqué.');
      }
      const updated = await tx.certification.update({ where: { id }, data: { revokedAt: new Date(), revocationReason: dto.reason } });
      await this.audit.record(
        { action: 'training.certificate.revoked', resourceType: 'certification', resourceId: id, metadata: { reason: dto.reason, certificateNumber: current.certificateNumber } },
        ctx,
        tx,
      );
      return updated;
    });
    await this.notifications
      .notify(certificate.userId, {
        type: 'TRAINING_CERTIFICATE_REVOKED',
        title: 'Certificat révoqué',
        body: `Votre certificat ${certificate.certificateNumber} a été révoqué. Motif : ${dto.reason}`,
        deepLink: '/training/certificate',
      })
      .catch((error: unknown) => this.logger.warn({ err: error }, 'Notification de révocation non envoyée'));
    return { id: certificate.id, revokedAt: certificate.revokedAt, revocationReason: certificate.revocationReason };
  }
}

function definedOnly<T extends object>(dto: T): Partial<T> {
  return Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function pick(source: object, keys: string[]) {
  return Object.fromEntries(keys.map((key) => [key, (source as Record<string, unknown>)[key]]));
}

function mapMonthConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new AppException(HttpStatus.CONFLICT, 'MODULE_MONTH_TAKEN', 'Un module existe déjà pour ce mois du parcours.', {
      fields: { month: ['Un module existe déjà pour ce mois.'] },
    });
  }
  return error;
}

function moduleNotFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'MODULE_NOT_FOUND', 'Module de formation introuvable.');
}

function lessonNotFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'LESSON_NOT_FOUND', 'Leçon introuvable.');
}
