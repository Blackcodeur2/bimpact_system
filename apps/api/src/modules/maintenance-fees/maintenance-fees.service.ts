import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception';
import { Decimal, money, MoneyView } from '../../common/money';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { formatDay } from '../contributions/contributions.rules';
import { LedgerService } from '../ledger/ledger.service';
import { SettingsService } from '../settings/settings.service';

const FEES_REVENUE_ACCOUNT = 'system:fees_revenue';

export interface MaintenanceFeeStatusView {
  month: string;
  isPaid: boolean;
  amount: MoneyView;
  paidAt: Date | null;
  notes: string | null;
}

@Injectable()
export class MaintenanceFeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  currentMonth(date = new Date()): string {
    return formatDay(date).slice(0, 7);
  }

  async getAmount(): Promise<Decimal> {
    const val = await this.settings.amount('system.monthly_maintenance_fee');
    return val.isZero() ? new Decimal(500) : val;
  }

  async status(userId: string, asOf = new Date()): Promise<MaintenanceFeeStatusView> {
    const month = this.currentMonth(asOf);
    const [feeAmount, record] = await Promise.all([
      this.getAmount(),
      this.prisma.systemMaintenanceFee.findUnique({
        where: { userId_month: { userId, month } },
      }),
    ]);
    return {
      month,
      isPaid: Boolean(record),
      amount: money(feeAmount),
      paidAt: record?.paidAt ?? null,
      notes: record?.notes ?? null,
    };
  }

  async isPaid(userId: string, month: string): Promise<boolean> {
    const record = await this.prisma.systemMaintenanceFee.findUnique({
      where: { userId_month: { userId, month } },
      select: { id: true },
    });
    return Boolean(record);
  }

  async pay(
    userId: string,
    targetMonth?: string,
    ctx?: RequestContext,
    options: { source?: 'WALLET' | 'MANUAL'; notes?: string; actorId?: string } = {},
  ) {
    const month = targetMonth || this.currentMonth();
    const source = options.source ?? 'WALLET';
    const amount = await this.getAmount();

    // Idempotence : si déjà payé pour ce mois, on renvoie l'existant.
    const existing = await this.prisma.systemMaintenanceFee.findUnique({
      where: { userId_month: { userId, month } },
    });
    if (existing) {
      return existing;
    }

    return this.prisma.$transaction(async (tx) => {
      let ledgerTransactionId: string | null = null;

      if (source === 'WALLET') {
        const [wallet, feesAccount] = await Promise.all([
          tx.wallet.findUnique({ where: { userId } }),
          tx.ledgerAccount.findUnique({ where: { code: FEES_REVENUE_ACCOUNT } }),
        ]);

        if (!wallet) {
          throw new AppException(HttpStatus.NOT_FOUND, 'WALLET_NOT_FOUND', 'Portefeuille introuvable.');
        }
        if (!feesAccount) {
          throw new AppException(HttpStatus.INTERNAL_SERVER_ERROR, 'LEDGER_ACCOUNT_NOT_FOUND', 'Compte système de frais introuvable.');
        }

        try {
          const posted = await this.ledger.post(
            {
              reference: `fee:maintenance:${userId}:${month}`,
              type: 'SYSTEM_FEE',
              currency: 'XAF',
              description: `Frais d’entretien du système (${month})`,
              entries: [
                { accountId: wallet.availableAccountId, direction: 'DEBIT', amount },
                { accountId: feesAccount.id, direction: 'CREDIT', amount },
              ],
              metadata: { userId, month, source: 'WALLET' },
              createdById: options.actorId ?? userId,
            },
            ctx,
            tx,
          );
          ledgerTransactionId = posted.transaction.id;
        } catch (error) {
          if (error instanceof AppException && error.code === 'INSUFFICIENT_FUNDS') {
            throw new AppException(
              HttpStatus.UNPROCESSABLE_ENTITY,
              'INSUFFICIENT_FUNDS',
              `Solde insuffisant : rechargez au moins ${amount.toFixed(0)} FCFA pour régler vos frais d’entretien.`,
            );
          }
          throw error;
        }
      }

      const created = await tx.systemMaintenanceFee.create({
        data: {
          userId,
          month,
          amount,
          currency: 'XAF',
          ledgerTransactionId,
          notes: options.notes ?? (source === 'MANUAL' ? 'Règlement manuel enregistré par l’administration' : null),
        },
      });

      await this.audit.record(
        {
          action: 'maintenance_fee.paid',
          resourceType: 'system_maintenance_fee',
          resourceId: created.id,
          after: { userId, month, amount: amount.toString(), source, ledgerTransactionId },
        },
        ctx,
        tx,
      );

      return created;
    });
  }

  async listForMember(userId: string) {
    const rows = await this.prisma.systemMaintenanceFee.findMany({
      where: { userId },
      orderBy: { month: 'desc' },
      take: 24,
    });
    return rows.map((r) => ({
      id: r.id,
      month: r.month,
      amount: money(r.amount, r.currency),
      paidAt: r.paidAt,
      notes: r.notes,
    }));
  }
}
