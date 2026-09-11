import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Prisma, SupportTicket, SupportTicketStatus } from '@prisma/client';
import { randomCode, withUniqueRetry } from '../../common/codes';
import { AppException } from '../../common/errors/app-exception';
import { formatXaf } from '../../common/money';
import { afterCursor, toPage } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { AppConfig } from '../../config/app-config';
import { PrismaService, Tx } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';
import type { CreateTicketDto, TicketMessageDto, TicketsQueryDto, TicketStatusDto } from './support.dto';

const ticketInclude = { messages: { orderBy: { createdAt: 'asc' } } } satisfies Prisma.SupportTicketInclude;
type TicketWithMessages = Prisma.SupportTicketGetPayload<{ include: typeof ticketInclude }>;

/** Support (cahier §7.25) : FAQ calculée à partir des règles réellement configurées, demandes et échanges tracés. */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
  ) {}

  /** Réponses construites depuis la configuration en vigueur : elles ne peuvent pas contredire les règles appliquées. */
  async faq() {
    const { dailyAmount, autoDebitHour } = this.config.contributions;
    const { defaultMinPaidDays, defaultWindowDays } = this.config.draws;
    const s = await this.settings.values([
      'solidarity.enabled',
      'solidarity.contribution_amount',
      'solidarity.max_assistance_amount',
      'solidarity.waiting_days',
    ]);
    const sandbox = this.config.payments.provider === 'sandbox';
    return {
      items: [
        {
          question: 'Comment fonctionne la contribution quotidienne ?',
          answer: `La contribution est de ${formatXaf(dailyAmount)} par jour, payée avec le solde de votre portefeuille depuis l’écran Contribution. Vous pouvez activer le prélèvement automatique : il est tenté chaque jour à partir de ${autoDebitHour} h (heure du Cameroun) si votre solde est suffisant. Un jour manqué peut être rattrapé pendant 7 jours.`,
        },
        {
          question: 'Qui peut participer aux tirages ?',
          answer: `Il faut une identité vérifiée et, selon la règle par défaut, au moins ${defaultMinPaidDays} jours de contribution payés sur les ${defaultWindowDays} derniers jours. Les conditions exactes sont rappelées sur chaque tirage. La liste des participants est figée avant le tirage et chacun peut vérifier le résultat, sans donnée personnelle.`,
        },
        {
          question: 'Comment recharger mon portefeuille ?',
          answer: `Depuis Portefeuille, touchez « Recharger », choisissez MTN Mobile Money ou Orange Money puis validez la demande sur votre téléphone. Votre solde n’est crédité qu’après la confirmation de l’opérateur.${sandbox ? ' Le service fonctionne actuellement en mode test : aucun argent réel n’est débité.' : ''}`,
        },
        {
          question: 'Qu’est-ce que la solidarité volontaire ?',
          answer: `L’adhésion est facultative et peut être arrêtée à tout moment. Quand le comité approuve le dossier d’accident d’un adhérent, chaque adhérent participe à hauteur de ${formatXaf(s['solidarity.contribution_amount'])}. Seuls les accidents survenus au moins ${s['solidarity.waiting_days']} jours après l’adhésion peuvent être aidés, dans la limite de ${formatXaf(s['solidarity.max_assistance_amount'])} et des fonds disponibles. Ce n’est pas une assurance.${s['solidarity.enabled'] === 'true' ? '' : ' Les collectes ne sont pas encore activées : aucun prélèvement n’est effectué pour le moment.'}`,
        },
        {
          question: 'Que faire en cas d’accident ?',
          answer: 'Mettez-vous en sécurité et faites-vous soigner en priorité. Déclarez ensuite l’accident depuis Solidarité, puis ajoutez vos justificatifs (bulletin d’hôpital, ordonnances, factures, constat). Le comité examine chaque dossier : la déclaration ne vaut pas accord de prise en charge.',
        },
        {
          question: 'J’ai oublié mon code PIN',
          answer: 'Sur l’écran de connexion, touchez « Code PIN oublié ? ». Un code de vérification vous est envoyé par SMS pour choisir un nouveau code PIN ; toutes vos sessions ouvertes sont alors fermées.',
        },
        {
          question: 'Comment suivre ma demande au support ?',
          answer: 'Chaque demande reçoit une référence. Vous êtes notifié à chaque réponse de l’équipe et pouvez compléter votre demande depuis Support, rubrique « Mes demandes ».',
        },
      ],
    };
  }

  // ───────────────────────────── Membre ─────────────────────────────

  async list(userId: string, query: TicketsQueryDto) {
    const rows = await this.prisma.supportTicket.findMany({
      where: { userId, ...(query.status ? { status: query.status } : {}), ...afterCursor(query.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return toPage(rows, query.limit, summaryView);
  }

  async get(id: string, userId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, userId }, include: ticketInclude });
    if (!ticket) throw notFound();
    return detailView(ticket);
  }

  async create(userId: string, dto: CreateTicketDto, ctx: RequestContext) {
    const ticket = await withUniqueRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const now = new Date();
        const created = await tx.supportTicket.create({
          data: {
            userId,
            reference: `SUP-${now.toISOString().slice(2, 10).replaceAll('-', '')}-${randomCode(5)}`,
            category: dto.category,
            subject: dto.subject,
            lastMessageAt: now,
          },
        });
        await tx.supportTicketMessage.create({ data: { ticketId: created.id, authorId: userId, authorType: 'MEMBER', body: dto.message } });
        // Le contenu des échanges n'est pas recopié dans le journal d'audit.
        await this.audit.record(
          { action: 'support.ticket.created', resourceType: 'support_ticket', resourceId: created.id, metadata: { category: dto.category } },
          ctx,
          tx,
        );
        return created;
      }),
    );
    return this.get(ticket.id, userId);
  }

  async addMessage(id: string, userId: string, dto: TicketMessageDto, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const ticket = await lock(tx, id);
      if (ticket.userId !== userId) throw notFound();
      if (ticket.status === 'CLOSED') throw closed();
      await tx.supportTicketMessage.create({ data: { ticketId: id, authorId: userId, authorType: 'MEMBER', body: dto.body } });
      await tx.supportTicket.update({ where: { id }, data: { status: 'OPEN', lastMessageAt: new Date() } });
      await this.audit.record({ action: 'support.ticket.member_message', resourceType: 'support_ticket', resourceId: id }, ctx, tx);
    });
    return this.get(id, userId);
  }

  async close(id: string, userId: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const ticket = await lock(tx, id);
      if (ticket.userId !== userId) throw notFound();
      if (ticket.status === 'CLOSED') return;
      await tx.supportTicket.update({ where: { id }, data: { status: 'CLOSED' } });
      await this.audit.record(
        { action: 'support.ticket.closed', resourceType: 'support_ticket', resourceId: id, before: { status: ticket.status } },
        ctx,
        tx,
      );
    });
    return this.get(id, userId);
  }

  // ───────────────────────────── Équipe ─────────────────────────────

  async adminList(query: TicketsQueryDto) {
    const rows = await this.prisma.supportTicket.findMany({
      where: { ...(query.status ? { status: query.status } : {}), ...afterCursor(query.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { user: { select: { phone: true, profile: { select: { firstName: true, lastName: true } } } } },
    });
    return toPage(rows, query.limit, (ticket) => ({
      ...summaryView(ticket),
      member: {
        userId: ticket.userId,
        phone: ticket.user.phone,
        firstName: ticket.user.profile?.firstName ?? null,
        lastName: ticket.user.profile?.lastName ?? null,
      },
    }));
  }

  async adminGet(id: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: { ...ticketInclude, user: { select: { phone: true, profile: { select: { firstName: true, lastName: true, city: true } } } } },
    });
    if (!ticket) throw notFound();
    return {
      ...detailView(ticket),
      member: {
        userId: ticket.userId,
        phone: ticket.user.phone,
        firstName: ticket.user.profile?.firstName ?? null,
        lastName: ticket.user.profile?.lastName ?? null,
        city: ticket.user.profile?.city ?? null,
      },
    };
  }

  async adminReply(id: string, dto: TicketMessageDto, ctx: RequestContext) {
    const actorId = ctx.auth?.userId;
    if (!actorId) throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Authentification requise.');
    const ticket = await this.prisma.$transaction(async (tx) => {
      const current = await lock(tx, id);
      if (current.status === 'CLOSED') throw closed();
      await tx.supportTicketMessage.create({ data: { ticketId: id, authorId: actorId, authorType: 'STAFF', body: dto.body } });
      const updated = await tx.supportTicket.update({ where: { id }, data: { status: 'PENDING', lastMessageAt: new Date() } });
      await this.audit.record({ action: 'support.ticket.staff_reply', resourceType: 'support_ticket', resourceId: id }, ctx, tx);
      return updated;
    });
    await this.notifications
      .notify(ticket.userId, {
        type: 'SUPPORT_REPLY',
        title: 'Réponse du support',
        body: `L’équipe a répondu à votre demande ${ticket.reference}.`,
        deepLink: `/profile/support/tickets/${id}`,
      })
      .catch((error: unknown) => this.logger.warn({ err: error }, 'Notification support non envoyée'));
    return this.adminGet(id);
  }

  async adminSetStatus(id: string, dto: TicketStatusDto, ctx: RequestContext) {
    const ticket = await this.prisma.$transaction(async (tx) => {
      const current = await lock(tx, id);
      const updated = await tx.supportTicket.update({ where: { id }, data: { status: dto.status } });
      await this.audit.record(
        { action: 'support.ticket.status_changed', resourceType: 'support_ticket', resourceId: id, before: { status: current.status }, after: { status: dto.status } },
        ctx,
        tx,
      );
      return updated;
    });
    if (dto.status === 'RESOLVED') {
      await this.notifications
        .notify(ticket.userId, {
          type: 'SUPPORT_RESOLVED',
          title: 'Demande résolue',
          body: `Votre demande ${ticket.reference} est marquée comme résolue. Répondez si le problème persiste.`,
          deepLink: `/profile/support/tickets/${id}`,
        })
        .catch(() => undefined);
    }
    return this.adminGet(id);
  }
}

function summaryView(ticket: SupportTicket) {
  return {
    id: ticket.id,
    reference: ticket.reference,
    category: ticket.category,
    subject: ticket.subject,
    status: ticket.status,
    lastMessageAt: ticket.lastMessageAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

function detailView(ticket: TicketWithMessages) {
  return {
    ...summaryView(ticket),
    canReply: ticket.status !== 'CLOSED',
    // L'identité de l'agent n'est pas communiquée : l'équipe répond collectivement.
    messages: ticket.messages.map((message) => ({
      id: message.id,
      authorType: message.authorType,
      body: message.body,
      createdAt: message.createdAt,
    })),
  };
}

async function lock(tx: Tx, id: string): Promise<SupportTicket> {
  await tx.$queryRaw`SELECT id FROM support_tickets WHERE id = ${id}::uuid FOR UPDATE`;
  const ticket = await tx.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw notFound();
  return ticket;
}

function notFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'SUPPORT_TICKET_NOT_FOUND', 'Demande introuvable.');
}

function closed() {
  return new AppException(HttpStatus.CONFLICT, 'SUPPORT_TICKET_CLOSED', 'Cette demande est clôturée : créez une nouvelle demande si besoin.');
}

export type { SupportTicketStatus };
