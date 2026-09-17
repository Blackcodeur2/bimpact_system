import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PaymentIntent, PaymentIntentStatus, Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { Decimal, money, MoneyView } from '../../common/money';
import { afterCursor, Page, toPage } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { AppConfig } from '../../config/app-config';
import { PrismaService, Tx } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CHANNEL_LABELS,
  isSelfNotifying,
  PAYMENT_PROVIDER,
  PaymentChannel,
  PaymentProvider,
  ProviderStatusResult,
} from './payment-provider';
import type { CreatePaymentIntentDto, PaymentsQueryDto } from './payments.dto';

const OPEN_STATUSES: PaymentIntentStatus[] = ['CREATED', 'PENDING'];

export interface PaymentIntentView {
  id: string;
  status: PaymentIntentStatus;
  provider: string;
  testMode: boolean;
  channel: string;
  channelLabel: string;
  amount: MoneyView;
  fee: MoneyView;
  payerPhone: string;
  externalReference: string | null;
  payerInstructions: string | null;
  failure: { code: string; message: string | null } | null;
  ledgerTransactionId: string | null;
  expiresAt: Date;
  confirmedAt: Date | null;
  createdAt: Date;
}

/**
 * Rechargement du portefeuille (cahier §7.8, §10) :
 *   intention créée → en attente chez l'opérateur → confirmée (webhook ou interrogation) → écriture au ledger.
 * L'initiation n'est jamais présentée comme un succès ; seul un statut SUCCEEDED crédite le portefeuille.
 */
@Injectable()
export class PaymentsService implements OnModuleInit {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly notifications: NotificationsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  onModuleInit() {
    if (isSelfNotifying(this.provider)) {
      this.provider.onWebhook((rawBody, headers) => this.handleWebhook(this.provider.code, rawBody, headers));
    }
  }

  methods() {
    const { minAmount, maxAmount, dailyLimit } = this.config.payments;
    return {
      provider: this.provider.code,
      testMode: this.provider.testMode,
      currency: 'XAF',
      channels: this.provider.channels.map((code) => ({ code, label: CHANNEL_LABELS[code] })),
      minAmount: money(minAmount),
      maxAmount: money(maxAmount),
      dailyLimit: money(dailyLimit),
      fee: money(0),
    };
  }

  async createIntent(
    userId: string,
    dto: CreatePaymentIntentDto,
    idempotencyKey: string,
    ctx: RequestContext,
  ): Promise<PaymentIntentView> {
    const existing = await this.prisma.paymentIntent.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
    });
    if (existing) return this.toView(existing);

    const amount = new Decimal(dto.amount);
    const { minAmount, maxAmount, dailyLimit, intentTtlMinutes } = this.config.payments;
    if (amount.lt(minAmount) || amount.gt(maxAmount)) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PAYMENT_AMOUNT_OUT_OF_RANGE',
        `Le montant doit être compris entre ${minAmount} et ${maxAmount} FCFA.`,
        { min: String(minAmount), max: String(maxAmount) },
      );
    }
    if (!this.provider.channels.includes(dto.channel)) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'PAYMENT_CHANNEL_UNAVAILABLE', 'Ce moyen de paiement est indisponible.');
    }

    const [wallet, user] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId } }),
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { phone: true } }),
    ]);
    if (!wallet) throw new AppException(HttpStatus.NOT_FOUND, 'WALLET_NOT_FOUND', 'Portefeuille introuvable.');
    if (wallet.status !== 'ACTIVE') {
      throw new AppException(HttpStatus.CONFLICT, 'WALLET_NOT_ACTIVE', 'Votre portefeuille est gelé. Contactez le support.');
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = await this.prisma.paymentIntent.aggregate({
      where: { userId, createdAt: { gte: startOfDay }, status: { in: ['CREATED', 'PENDING', 'SUCCEEDED'] } },
      _sum: { amount: true },
    });
    if ((today._sum.amount ?? new Decimal(0)).plus(amount).gt(dailyLimit)) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PAYMENT_DAILY_LIMIT_REACHED',
        `Plafond journalier de rechargement atteint (${dailyLimit} FCFA).`,
      );
    }

    let intent: PaymentIntent;
    try {
      intent = await this.prisma.$transaction(async (tx) => {
        const created = await tx.paymentIntent.create({
          data: {
            userId,
            walletId: wallet.id,
            provider: this.provider.code,
            channel: dto.channel,
            amount,
            currency: wallet.currency,
            payerPhone: dto.payerPhone ?? user.phone,
            idempotencyKey,
            expiresAt: new Date(Date.now() + intentTtlMinutes * 60_000),
          },
        });
        await this.audit.record(
          {
            action: 'payment.intent.created',
            resourceType: 'payment_intent',
            resourceId: created.id,
            after: { amount: created.amount, channel: created.channel, provider: created.provider },
          },
          ctx,
          tx,
        );
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const concurrent = await this.prisma.paymentIntent.findUniqueOrThrow({
          where: { userId_idempotencyKey: { userId, idempotencyKey } },
        });
        return this.toView(concurrent);
      }
      throw error;
    }

    try {
      const result = await this.provider.createIntent({
        intentId: intent.id,
        amount: intent.amount.toFixed(0),
        currency: intent.currency,
        payerPhone: intent.payerPhone,
        channel: intent.channel as PaymentChannel,
      });
      intent = await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'PENDING', externalReference: result.externalReference, payerInstructions: result.payerInstructions },
      });
    } catch (error) {
      this.logger.error({ err: error, intentId: intent.id }, 'Le fournisseur de paiement a refusé l’initiation');
      await this.prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'FAILED', failureCode: 'PROVIDER_UNAVAILABLE', failureMessage: 'Opérateur indisponible.' },
      });
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'PAYMENT_PROVIDER_UNAVAILABLE',
        'L’opérateur de paiement est momentanément indisponible. Réessayez plus tard.',
      );
    }

    return this.toView(intent);
  }

  async getMine(userId: string, id: string): Promise<PaymentIntentView> {
    let intent = await this.prisma.paymentIntent.findFirst({ where: { id, userId } });
    if (!intent) throw notFound();
    // Filet de sécurité si un webhook s'est perdu : on interroge l'opérateur.
    if (intent.status === 'PENDING' && intent.externalReference) {
      await this.refreshFromProvider(intent);
      intent = await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id } });
    }
    return this.toView(intent);
  }

  async listMine(userId: string, query: PaymentsQueryDto): Promise<Page<PaymentIntentView>> {
    const rows = await this.prisma.paymentIntent.findMany({
      where: { userId, status: query.status, ...afterCursor(query.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return toPage(rows, query.limit, (row) => this.toView(row));
  }

  async cancel(userId: string, id: string, ctx: RequestContext): Promise<PaymentIntentView> {
    const intent = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payment_intents WHERE id = ${id}::uuid AND user_id = ${userId}::uuid FOR UPDATE`;
      const current = await tx.paymentIntent.findFirst({ where: { id, userId } });
      if (!current) throw notFound();
      if (!OPEN_STATUSES.includes(current.status)) {
        throw new AppException(HttpStatus.CONFLICT, 'PAYMENT_NOT_CANCELLABLE', 'Ce paiement ne peut plus être annulé.', {
          status: current.status,
        });
      }
      const updated = await tx.paymentIntent.update({ where: { id }, data: { status: 'CANCELLED' } });
      await this.audit.record(
        { action: 'payment.intent.cancelled', resourceType: 'payment_intent', resourceId: id, before: { status: current.status } },
        ctx,
        tx,
      );
      return updated;
    });
    return this.toView(intent);
  }

  /**
   * Webhook opérateur : signature vérifiée, événement enregistré AVANT traitement,
   * doublons ignorés (contrainte unique fournisseur + identifiant d'événement).
   */
  async handleWebhook(
    providerCode: string,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ received: true; duplicate: boolean }> {
    if (providerCode !== this.provider.code) {
      throw new AppException(HttpStatus.NOT_FOUND, 'PAYMENT_PROVIDER_UNKNOWN', 'Fournisseur inconnu.');
    }
    const event = this.provider.verifyWebhook(rawBody, headers);
    if (!event) {
      this.logger.warn({ provider: providerCode }, 'Webhook de paiement rejeté : signature invalide');
      throw new AppException(HttpStatus.UNAUTHORIZED, 'WEBHOOK_SIGNATURE_INVALID', 'Signature de webhook invalide.');
    }

    let stored;
    try {
      stored = await this.prisma.paymentWebhookEvent.create({
        data: {
          provider: providerCode,
          eventId: event.eventId,
          externalReference: event.externalReference,
          status: event.status,
          payload: JSON.parse(rawBody.toString('utf8')) as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return { received: true, duplicate: true };
      }
      throw error;
    }

    try {
      await this.applyProviderStatus(event.externalReference, event, 'webhook');
      await this.prisma.paymentWebhookEvent.update({ where: { id: stored.id }, data: { processedAt: new Date() } });
    } catch (error) {
      await this.prisma.paymentWebhookEvent.update({
        where: { id: stored.id },
        data: { processingError: error instanceof Error ? error.message.slice(0, 500) : 'Erreur inconnue' },
      });
      throw error;
    }
    return { received: true, duplicate: false };
  }

  /** Expire les intentions ouvertes dépassées, après une dernière interrogation de l'opérateur. */
  async expireStale(limit = 100): Promise<number> {
    const stale = await this.prisma.paymentIntent.findMany({
      where: { status: { in: OPEN_STATUSES }, expiresAt: { lt: new Date() } },
      take: limit,
    });
    let expired = 0;
    for (const intent of stale) {
      if (intent.externalReference) await this.refreshFromProvider(intent).catch(() => undefined);
      const changed = await this.prisma.paymentIntent.updateMany({
        where: { id: intent.id, status: { in: OPEN_STATUSES } },
        data: { status: 'EXPIRED' },
      });
      if (changed.count > 0) {
        expired += 1;
        await this.audit.record({ action: 'payment.intent.expired', resourceType: 'payment_intent', resourceId: intent.id });
      }
    }
    return expired;
  }

  /** Interroge l'opérateur pour les intentions en attente depuis plus d'une minute (webhooks perdus). */
  async pollPending(limit = 50): Promise<void> {
    const pending = await this.prisma.paymentIntent.findMany({
      where: { status: 'PENDING', externalReference: { not: null }, createdAt: { lt: new Date(Date.now() - 60_000) } },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
    for (const intent of pending) {
      await this.refreshFromProvider(intent).catch((error: unknown) =>
        this.logger.warn({ err: error, intentId: intent.id }, 'Interrogation de l’opérateur impossible'),
      );
    }
  }

  /** Back-office : réinterroge l'opérateur pour un paiement resté en attente (webhook perdu). */
  async adminRefresh(id: string, ctx: RequestContext): Promise<PaymentIntentView> {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id } });
    if (!intent) throw notFound();
    if (intent.status !== 'PENDING' || !intent.externalReference) {
      throw new AppException(HttpStatus.CONFLICT, 'PAYMENT_NOT_PENDING', 'Seul un paiement en attente chez l’opérateur peut être réinterrogé.', {
        status: intent.status,
      });
    }
    await this.refreshFromProvider(intent);
    const after = await this.prisma.paymentIntent.findUniqueOrThrow({ where: { id } });
    await this.audit.record(
      {
        action: 'payment.intent.refreshed',
        resourceType: 'payment_intent',
        resourceId: id,
        before: { status: intent.status },
        after: { status: after.status },
      },
      ctx,
    );
    return this.toView(after);
  }

  private async refreshFromProvider(intent: PaymentIntent): Promise<void> {
    const status = await this.provider.getStatus({
      externalReference: intent.externalReference!,
      payerPhone: intent.payerPhone,
      createdAt: intent.createdAt,
    });
    if (status.status !== 'PENDING') {
      await this.applyProviderStatus(intent.externalReference!, status, 'poll');
    }
  }

  private async applyProviderStatus(externalReference: string, result: ProviderStatusResult, source: 'webhook' | 'poll') {
    if (result.status === 'PENDING') return;

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM payment_intents WHERE external_reference = ${externalReference} FOR UPDATE`;
      const intent = await tx.paymentIntent.findUnique({ where: { externalReference } });
      if (!intent) throw notFound();
      if (intent.status === 'SUCCEEDED') return null;

      if (result.status === 'SUCCEEDED') {
        // L'argent a été reçu : on crédite même si l'intention avait expiré ou été annulée, et on le signale.
        const late = intent.status !== 'PENDING' && intent.status !== 'CREATED';
        const ledgerTransactionId = await this.creditWallet(tx, intent);
        const updated = await tx.paymentIntent.update({
          where: { id: intent.id },
          data: { status: 'SUCCEEDED', confirmedAt: new Date(), ledgerTransactionId, failureCode: null, failureMessage: null },
        });
        await this.audit.record(
          {
            action: late ? 'payment.succeeded.late' : 'payment.succeeded',
            resourceType: 'payment_intent',
            resourceId: intent.id,
            before: { status: intent.status },
            after: { status: 'SUCCEEDED', ledgerTransactionId },
            metadata: { source },
          },
          {},
          tx,
        );
        return { intent: updated, event: 'succeeded' as const };
      }

      if (!OPEN_STATUSES.includes(intent.status)) return null;
      const updated = await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { status: 'FAILED', failureCode: result.failureCode ?? 'PAYMENT_FAILED', failureMessage: result.failureMessage ?? null },
      });
      await this.audit.record(
        {
          action: 'payment.failed',
          resourceType: 'payment_intent',
          resourceId: intent.id,
          after: { failureCode: updated.failureCode },
          metadata: { source },
        },
        {},
        tx,
      );
      return { intent: updated, event: 'failed' as const };
    });

    if (!outcome) return;
    const amount = `${outcome.intent.amount.toFixed(0)} FCFA`;
    await this.notifications
      .notify(outcome.intent.userId, {
        type: outcome.event === 'succeeded' ? 'PAYMENT_SUCCEEDED' : 'PAYMENT_FAILED',
        title: outcome.event === 'succeeded' ? 'Rechargement confirmé' : 'Rechargement échoué',
        body:
          outcome.event === 'succeeded'
            ? `${amount} ont été crédités sur votre portefeuille.`
            : `Le rechargement de ${amount} n’a pas abouti. ${outcome.intent.failureMessage ?? ''}`.trim(),
        deepLink: `/wallet/payments/${outcome.intent.id}`,
      })
      .catch((error: unknown) => this.logger.warn({ err: error }, 'Notification de paiement non envoyée'));
  }

  private async creditWallet(tx: Tx, intent: PaymentIntent): Promise<string> {
    const [wallet, clearing] = await Promise.all([
      tx.wallet.findUniqueOrThrow({ where: { id: intent.walletId } }),
      tx.ledgerAccount.findUniqueOrThrow({ where: { code: `system:provider_clearing:${intent.provider}` } }),
    ]);
    const { transaction } = await this.ledger.post(
      {
        reference: `payment:${intent.id}`,
        type: 'DEPOSIT',
        currency: intent.currency,
        description: `Rechargement ${CHANNEL_LABELS[intent.channel as PaymentChannel] ?? intent.channel}`,
        entries: [
          { accountId: clearing.id, direction: 'DEBIT', amount: intent.amount },
          { accountId: wallet.availableAccountId, direction: 'CREDIT', amount: intent.amount },
        ],
        metadata: { paymentIntentId: intent.id, provider: intent.provider, externalReference: intent.externalReference },
        createdById: intent.userId,
      },
      {},
      tx,
    );
    return transaction.id;
  }

  toView(intent: PaymentIntent): PaymentIntentView {
    return {
      id: intent.id,
      status: intent.status,
      provider: intent.provider,
      testMode: intent.provider === 'sandbox',
      channel: intent.channel,
      channelLabel: CHANNEL_LABELS[intent.channel as PaymentChannel] ?? intent.channel,
      amount: money(intent.amount, intent.currency),
      fee: money(intent.fee, intent.currency),
      payerPhone: intent.payerPhone,
      externalReference: intent.externalReference,
      payerInstructions: intent.payerInstructions,
      failure: intent.failureCode ? { code: intent.failureCode, message: intent.failureMessage } : null,
      ledgerTransactionId: intent.ledgerTransactionId,
      expiresAt: intent.expiresAt,
      confirmedAt: intent.confirmedAt,
      createdAt: intent.createdAt,
    };
  }
}

function notFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'PAYMENT_NOT_FOUND', 'Paiement introuvable.');
}
