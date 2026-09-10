import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { BeneficiaryStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { afterCursor, toPage } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { BeneficiariesQueryDto, UpdateBeneficiaryDto } from './draws.dto';

/** Transitions autorisées du parcours bénéficiaire (cahier §8.8 « changer statut selon workflow »). */
const TRANSITIONS: Record<BeneficiaryStatus, BeneficiaryStatus[]> = {
  SELECTED: ['TRAINING', 'WITHDRAWN'],
  TRAINING: ['CERTIFIED', 'WITHDRAWN'],
  CERTIFIED: ['ENTREPRENEUR', 'WITHDRAWN'],
  ENTREPRENEUR: [],
  WITHDRAWN: [],
};

const STATUS_MESSAGES: Record<BeneficiaryStatus, string> = {
  SELECTED: 'Vous êtes sélectionné dans le programme.',
  TRAINING: 'Votre formation entrepreneuriale commence.',
  CERTIFIED: 'Félicitations : votre formation est validée et votre certificat délivré.',
  ENTREPRENEUR: 'Votre entreprise est enregistrée dans le programme.',
  WITHDRAWN: 'Votre parcours bénéficiaire est suspendu. Contactez l’équipe du programme.',
};

@Injectable()
export class BeneficiariesService {
  private readonly logger = new Logger(BeneficiariesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(query: BeneficiariesQueryDto) {
    const rows = await this.prisma.beneficiary.findMany({
      where: { status: query.status, ...afterCursor(query.cursor) },
      orderBy: [{ selectedAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: {
        draw: { select: { code: true, title: true } },
        user: { select: { phone: true, profile: { select: { firstName: true, lastName: true, city: true } } } },
      },
    });
    // afterCursor s'appuie sur createdAt : la date de sélection en tient lieu.
    return toPage(
      rows.map((row) => ({ ...row, createdAt: row.selectedAt })),
      query.limit,
      (row) => ({
        id: row.id,
        status: row.status,
        selectedAt: row.selectedAt,
        mentorName: row.mentorName,
        statusNote: row.statusNote,
        draw: row.draw,
        member: {
          userId: row.userId,
          phone: row.user.phone,
          firstName: row.user.profile?.firstName ?? null,
          lastName: row.user.profile?.lastName ?? null,
          city: row.user.profile?.city ?? null,
        },
        allowedTransitions: TRANSITIONS[row.status],
      }),
    );
  }

  async update(id: string, dto: UpdateBeneficiaryDto, ctx: RequestContext) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM beneficiaries WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.beneficiary.findUnique({ where: { id } });
      if (!current) throw new AppException(HttpStatus.NOT_FOUND, 'BENEFICIARY_NOT_FOUND', 'Bénéficiaire introuvable.');

      if (dto.status && dto.status !== current.status && !TRANSITIONS[current.status].includes(dto.status)) {
        throw new AppException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'BENEFICIARY_INVALID_TRANSITION',
          `Passage de ${current.status} à ${dto.status} non autorisé.`,
          { from: current.status, to: dto.status, allowed: TRANSITIONS[current.status] },
        );
      }
      const updated = await tx.beneficiary.update({
        where: { id },
        data: {
          status: dto.status ?? current.status,
          mentorName: dto.mentorName ?? current.mentorName,
          statusNote: dto.note ?? current.statusNote,
        },
      });
      await this.audit.record(
        {
          action: 'beneficiary.updated',
          resourceType: 'beneficiary',
          resourceId: id,
          before: { status: current.status, mentorName: current.mentorName },
          after: { status: updated.status, mentorName: updated.mentorName, note: dto.note ?? null },
        },
        ctx,
        tx,
      );
      return { current, updated };
    });

    if (result.updated.status !== result.current.status) {
      await this.notifications
        .notify(result.updated.userId, {
          type: 'PROGRAM_STATUS_CHANGED',
          title: 'Votre parcours évolue',
          body: STATUS_MESSAGES[result.updated.status],
          deepLink: '/program',
        })
        .catch((error: unknown) => this.logger.warn({ err: error }, 'Notification de parcours non envoyée'));
    }
    return { ...result.updated, allowedTransitions: TRANSITIONS[result.updated.status] };
  }
}
