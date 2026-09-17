import { HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { money } from '../../common/money';
import { afterCursor, toPage } from '../../common/pagination';
import { PrismaService } from '../../database/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { fullName } from './backoffice.common';
import type { AdminPaymentsQueryDto } from './backoffice.dto';

const memberSelect = { select: { id: true, phone: true, profile: { select: { firstName: true, lastName: true } } } } as const;

/** Suivi des paiements (cahier §8.5) : intentions, webhooks reçus et écriture comptable associée. */
@Injectable()
export class PaymentsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
  ) {}

  async list(query: AdminPaymentsQueryDto) {
    const q = query.q?.trim();
    const digits = q?.replace(/\D/g, '') ?? '';
    const search: Prisma.PaymentIntentWhereInput[] = q
      ? [
          { externalReference: { contains: q } },
          ...(digits.length >= 3 ? [{ payerPhone: { contains: digits } }, { user: { phone: { contains: digits } } }] : []),
        ]
      : [];
    const rows = await this.prisma.paymentIntent.findMany({
      where: {
        status: query.status,
        channel: query.channel,
        createdAt: { gte: query.from, lte: query.to },
        ...(search.length > 0 ? { AND: [{ OR: search }] } : {}),
        ...afterCursor(query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { user: memberSelect },
    });
    return toPage(rows, query.limit, (row) => ({
      ...this.payments.toView(row),
      member: { userId: row.user.id, phone: row.user.phone, name: fullName(row.user.profile) },
    }));
  }

  async get(id: string) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id }, include: { user: memberSelect } });
    if (!intent) throw new AppException(HttpStatus.NOT_FOUND, 'PAYMENT_NOT_FOUND', 'Paiement introuvable.');
    const [webhooks, transaction] = await Promise.all([
      intent.externalReference
        ? this.prisma.paymentWebhookEvent.findMany({ where: { externalReference: intent.externalReference }, orderBy: { receivedAt: 'asc' } })
        : Promise.resolve([]),
      intent.ledgerTransactionId
        ? this.prisma.ledgerTransaction.findUnique({
            where: { id: intent.ledgerTransactionId },
            include: { entries: { include: { account: { select: { code: true, name: true } } } } },
          })
        : Promise.resolve(null),
    ]);
    return {
      ...this.payments.toView(intent),
      updatedAt: intent.updatedAt,
      member: { userId: intent.user.id, phone: intent.user.phone, name: fullName(intent.user.profile) },
      webhooks: webhooks.map((event) => ({
        id: event.id,
        eventId: event.eventId,
        status: event.status,
        receivedAt: event.receivedAt,
        processedAt: event.processedAt,
        processingError: event.processingError,
        payload: event.payload,
      })),
      ledgerTransaction: transaction
        ? {
            id: transaction.id,
            reference: transaction.reference,
            type: transaction.type,
            postedAt: transaction.postedAt,
            entries: transaction.entries.map((entry) => ({
              direction: entry.direction,
              amount: money(entry.amount, entry.currency),
              account: entry.account,
            })),
          }
        : null,
    };
  }
}
