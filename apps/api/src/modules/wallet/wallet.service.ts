import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { money, MoneyView } from '../../common/money';
import { afterCursor, Page, toPage } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { PrismaService, Tx } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import type { WalletTransactionsQueryDto } from './wallet.dto';

export interface WalletView {
  id: string;
  status: string;
  currency: string;
  availableBalance: MoneyView;
  reservedBalance: MoneyView;
  updatedAt: Date;
}

export interface WalletTransactionView {
  id: string;
  transactionId: string;
  reference: string;
  type: string;
  description: string | null;
  /** IN = entrée d'argent sur le portefeuille, OUT = sortie. */
  direction: 'IN' | 'OUT';
  amount: MoneyView;
  balanceAfter: MoneyView;
  bucket: 'AVAILABLE' | 'RESERVED';
  /** Seules les écritures postées vivent dans le ledger ; les paiements en attente viendront du module Paiements. */
  status: 'POSTED';
  isReversal: boolean;
  createdAt: Date;
}

/**
 * Portefeuille membre = deux comptes de passif du ledger (disponible, réservé).
 * Le solde affiché est le cache contrôlé du ledger, jamais un calcul côté client.
 */
@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  async openForUser(tx: Tx, userId: string, ctx: RequestContext) {
    const available = await this.ledger.createAccount(tx, {
      code: `member:${userId}:available`,
      name: 'Solde disponible',
      type: 'LIABILITY',
      purpose: 'MEMBER_AVAILABLE',
      ownerUserId: userId,
    });
    const reserved = await this.ledger.createAccount(tx, {
      code: `member:${userId}:reserved`,
      name: 'Solde réservé',
      type: 'LIABILITY',
      purpose: 'MEMBER_RESERVED',
      ownerUserId: userId,
    });
    const wallet = await tx.wallet.create({
      data: { userId, availableAccountId: available.id, reservedAccountId: reserved.id },
    });
    await this.audit.record(
      { action: 'wallet.opened', resourceType: 'wallet', resourceId: wallet.id, actorId: userId, actorType: 'MEMBER' },
      ctx,
      tx,
    );
    return wallet;
  }

  async getMine(userId: string): Promise<WalletView> {
    const wallet = await this.findWallet(userId);
    const accounts = await this.prisma.ledgerAccount.findMany({
      where: { id: { in: [wallet.availableAccountId, wallet.reservedAccountId] } },
      select: { id: true, balance: true, updatedAt: true },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const available = byId.get(wallet.availableAccountId)!;
    const reserved = byId.get(wallet.reservedAccountId)!;
    return {
      id: wallet.id,
      status: wallet.status,
      currency: wallet.currency,
      availableBalance: money(available.balance, wallet.currency),
      reservedBalance: money(reserved.balance, wallet.currency),
      updatedAt: [wallet.updatedAt, available.updatedAt, reserved.updatedAt].reduce((a, b) => (a > b ? a : b)),
    };
  }

  async listTransactions(userId: string, query: WalletTransactionsQueryDto): Promise<Page<WalletTransactionView>> {
    const wallet = await this.findWallet(userId);
    const where: Prisma.LedgerEntryWhereInput = {
      accountId: { in: [wallet.availableAccountId, wallet.reservedAccountId] },
      createdAt: { gte: query.from, lte: query.to },
      // Comptes de passif : un crédit augmente ce que la plateforme doit au membre (entrée).
      direction: query.direction ? (query.direction === 'IN' ? 'CREDIT' : 'DEBIT') : undefined,
      transaction: query.type ? { type: query.type } : undefined,
      ...afterCursor(query.cursor),
    };
    const rows = await this.prisma.ledgerEntry.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { transaction: { select: { reference: true, type: true, description: true, reversalOfId: true } } },
    });
    return toPage(rows, query.limit, (row) => ({
      id: row.id,
      transactionId: row.transactionId,
      reference: row.transaction.reference,
      type: row.transaction.type,
      description: row.transaction.description,
      direction: row.direction === 'CREDIT' ? 'IN' : 'OUT',
      amount: money(row.amount, row.currency),
      balanceAfter: money(row.balanceAfter, row.currency),
      bucket: row.accountId === wallet.availableAccountId ? 'AVAILABLE' : 'RESERVED',
      status: 'POSTED',
      isReversal: row.transaction.reversalOfId !== null,
      createdAt: row.createdAt,
    }));
  }

  private async findWallet(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new AppException(HttpStatus.NOT_FOUND, 'WALLET_NOT_FOUND', 'Portefeuille introuvable.');
    }
    return wallet;
  }
}
