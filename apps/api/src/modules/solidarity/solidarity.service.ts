import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { Decimal, formatXaf, money, MoneyView } from '../../common/money';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from '../settings/settings.service';

export const SOLIDARITY_POOL = 'system:solidarity_pool';
export const SOLIDARITY_CONSENT = 'SOLIDARITY_RULES';
const BATCH_SIZE = 500;
const DAY_MS = 86_400_000;

export interface SolidarityRules {
  collectionsEnabled: boolean;
  contributionPerClaim: MoneyView;
  maxAssistance: MoneyView;
  waitingDays: number;
  rulesVersion: string;
}

export interface ClaimToFund {
  id: string;
  reference: string;
  userId: string;
  approvedAmount: Prisma.Decimal;
  decidedAt: Date;
}

export interface FundingResult {
  collected: MoneyView;
  disbursed: MoneyView;
  participatingMembers: number;
  skippedMembers: number;
}

/**
 * Fonds de solidarité VOLONTAIRE (cahier §10, §16).
 * - adhésion explicite, versionnée et résiliable ; jamais de prélèvement sur un non-adhérent ;
 * - collectes désactivées par défaut (`solidarity.enabled`) tant que le dispositif n'est pas validé juridiquement ;
 * - chaque participation et chaque aide sont des écritures du ledger à référence idempotente.
 */
@Injectable()
export class SolidarityService {
  private readonly logger = new Logger(SolidarityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async rules(): Promise<SolidarityRules> {
    const v = await this.settings.values([
      'solidarity.enabled',
      'solidarity.contribution_amount',
      'solidarity.max_assistance_amount',
      'solidarity.waiting_days',
      'solidarity.rules_version',
    ]);
    return {
      collectionsEnabled: v['solidarity.enabled'] === 'true',
      contributionPerClaim: money(v['solidarity.contribution_amount']),
      maxAssistance: money(v['solidarity.max_assistance_amount']),
      waitingDays: Number.parseInt(v['solidarity.waiting_days'], 10),
      rulesVersion: v['solidarity.rules_version'],
    };
  }

  async status(userId: string, now = new Date()) {
    const [rules, membership, profile, pool, activeMembers] = await Promise.all([
      this.rules(),
      this.prisma.solidarityMembership.findUnique({ where: { userId } }),
      this.prisma.profile.findUnique({ where: { userId }, select: { kycStatus: true } }),
      this.prisma.ledgerAccount.findUnique({ where: { code: SOLIDARITY_POOL }, select: { balance: true } }),
      this.prisma.solidarityMembership.count({ where: { status: 'ACTIVE' } }),
    ]);
    const active = membership?.status === 'ACTIVE';
    const coveredFrom = active ? new Date(membership.joinedAt.getTime() + rules.waitingDays * DAY_MS) : null;
    const reasons: string[] = [];
    if (profile?.kycStatus !== 'APPROVED') reasons.push('KYC_NOT_APPROVED');
    if (!active) reasons.push('NOT_MEMBER');
    else if (coveredFrom && coveredFrom > now) reasons.push('WAITING_PERIOD');

    return {
      rules,
      rulesText: rulesText(rules),
      membership: membership
        ? {
            status: membership.status,
            joinedAt: membership.joinedAt,
            leftAt: membership.leftAt,
            rulesVersion: membership.rulesVersion,
            rulesUpToDate: membership.rulesVersion === rules.rulesVersion,
          }
        : null,
      canJoin: profile?.kycStatus === 'APPROVED' && (!active || membership.rulesVersion !== rules.rulesVersion),
      covered: reasons.length === 0,
      coveredFrom,
      reasons,
      fund: { balance: money(pool?.balance ?? 0), activeMembers },
    };
  }

  async join(userId: string, rulesVersion: string, ctx: RequestContext) {
    const rules = await this.rules();
    if (rulesVersion !== rules.rulesVersion) {
      throw new AppException(HttpStatus.CONFLICT, 'SOLIDARITY_RULES_OUTDATED', 'Le règlement a changé : relisez-le avant d’adhérer.', {
        rulesVersion: rules.rulesVersion,
      });
    }
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { kycStatus: true } });
    if (profile?.kycStatus !== 'APPROVED') {
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'SOLIDARITY_KYC_REQUIRED',
        'Votre identité doit être vérifiée pour adhérer au fonds de solidarité.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`solidarity:${userId}`}::text, 0))`;
      const current = await tx.solidarityMembership.findUnique({ where: { userId } });
      if (current?.status === 'ACTIVE' && current.rulesVersion === rules.rulesVersion) return;

      await tx.consent.upsert({
        where: { userId_type_version: { userId, type: SOLIDARITY_CONSENT, version: rules.rulesVersion } },
        create: { userId, type: SOLIDARITY_CONSENT, version: rules.rulesVersion },
        update: {},
      });
      if (current?.status === 'ACTIVE') {
        // Nouvelle version du règlement acceptée : l'ancienneté (et donc la carence déjà écoulée) est conservée.
        await tx.solidarityMembership.update({ where: { userId }, data: { rulesVersion: rules.rulesVersion } });
      } else {
        await tx.solidarityMembership.upsert({
          where: { userId },
          create: { userId, rulesVersion: rules.rulesVersion },
          update: { status: 'ACTIVE', joinedAt: new Date(), leftAt: null, rulesVersion: rules.rulesVersion },
        });
      }
      await this.audit.record(
        {
          action: current?.status === 'ACTIVE' ? 'solidarity.rules.accepted' : 'solidarity.joined',
          resourceType: 'solidarity_membership',
          resourceId: userId,
          before: current ? { status: current.status, rulesVersion: current.rulesVersion } : null,
          after: { status: 'ACTIVE', rulesVersion: rules.rulesVersion },
        },
        ctx,
        tx,
      );
    });
    return this.status(userId);
  }

  async leave(userId: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`solidarity:${userId}`}::text, 0))`;
      const current = await tx.solidarityMembership.findUnique({ where: { userId } });
      if (current?.status !== 'ACTIVE') {
        throw new AppException(HttpStatus.CONFLICT, 'SOLIDARITY_NOT_MEMBER', 'Vous n’êtes pas adhérent du fonds de solidarité.');
      }
      await tx.solidarityMembership.update({ where: { userId }, data: { status: 'LEFT', leftAt: new Date() } });
      await this.audit.record(
        { action: 'solidarity.left', resourceType: 'solidarity_membership', resourceId: userId, before: { status: 'ACTIVE' }, after: { status: 'LEFT' } },
        ctx,
        tx,
      );
    });
    return this.status(userId);
  }

  /** Adhérent actif dont le délai de carence était écoulé à la date donnée. */
  async isCoveredAt(userId: string, date: Date): Promise<boolean> {
    const [membership, waitingDays] = await Promise.all([
      this.prisma.solidarityMembership.findUnique({ where: { userId } }),
      this.settings.integer('solidarity.waiting_days'),
    ]);
    return membership?.status === 'ACTIVE' && membership.joinedAt.getTime() + waitingDays * DAY_MS <= date.getTime();
  }

  async overview() {
    const [rules, pool, activeMembers] = await Promise.all([
      this.rules(),
      this.prisma.ledgerAccount.findUnique({ where: { code: SOLIDARITY_POOL }, select: { balance: true } }),
      this.prisma.solidarityMembership.count({ where: { status: 'ACTIVE' } }),
    ]);
    return { rules, fund: { balance: money(pool?.balance ?? 0), activeMembers } };
  }

  /**
   * Collecte auprès des adhérents actifs (hors bénéficiaire) puis verse l'aide, dans la limite du fonds.
   * Rejouable sans risque : chaque participation et le versement ont une référence de ledger unique.
   */
  async fundAssistance(claim: ClaimToFund, ctx: RequestContext): Promise<FundingResult> {
    const rules = await this.rules();
    if (!rules.collectionsEnabled) {
      throw new AppException(HttpStatus.CONFLICT, 'SOLIDARITY_COLLECTIONS_DISABLED', 'Les collectes de solidarité ne sont pas activées.');
    }
    const [pool, claimantWallet] = await Promise.all([
      this.prisma.ledgerAccount.findUniqueOrThrow({ where: { code: SOLIDARITY_POOL } }),
      this.prisma.wallet.findUnique({ where: { userId: claim.userId } }),
    ]);
    if (!claimantWallet || claimantWallet.status !== 'ACTIVE') {
      throw new AppException(HttpStatus.CONFLICT, 'SOLIDARITY_WALLET_UNAVAILABLE', 'Le portefeuille du bénéficiaire n’est pas actif.');
    }
    const share = rules.contributionPerClaim.amount;

    let participatingMembers = 0;
    let skippedMembers = 0;
    let cursor: string | undefined;
    for (;;) {
      const batch = await this.prisma.solidarityMembership.findMany({
        where: { status: 'ACTIVE', joinedAt: { lte: claim.decidedAt }, userId: { not: claim.userId } },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        select: { id: true, userId: true, user: { select: { wallet: { select: { status: true, availableAccountId: true } } } } },
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1]!.id;

      for (const member of batch) {
        const wallet = member.user.wallet;
        if (!wallet || wallet.status !== 'ACTIVE') {
          skippedMembers += 1;
          continue;
        }
        try {
          const posted = await this.ledger.post(
            {
              reference: `solidarity:${claim.id}:${member.userId}`,
              type: 'SOLIDARITY_CONTRIBUTION',
              description: `Participation solidaire — dossier ${claim.reference}`,
              entries: [
                { accountId: wallet.availableAccountId, direction: 'DEBIT', amount: share },
                { accountId: pool.id, direction: 'CREDIT', amount: share },
              ],
              metadata: { claimId: claim.id, claimReference: claim.reference },
            },
            ctx,
          );
          participatingMembers += 1;
          if (!posted.replayed) {
            await this.notifications
              .notify(member.userId, {
                type: 'SOLIDARITY_CONTRIBUTION',
                title: 'Participation solidaire',
                body: `${formatXaf(share)} ont été prélevés sur votre solde pour aider un adhérent accidenté (dossier ${claim.reference}).`,
                deepLink: '/accidents',
              })
              .catch(() => undefined);
          }
        } catch (error) {
          if (error instanceof AppException && error.code === 'INSUFFICIENT_FUNDS') {
            skippedMembers += 1;
            continue;
          }
          throw error;
        }
      }
      if (batch.length < BATCH_SIZE) break;
    }

    const [collectedRow] = await this.prisma.$queryRaw<{ total: string }[]>`
      SELECT COALESCE(SUM(e.amount), 0)::text AS total
      FROM ledger_entries e
      JOIN ledger_transactions t ON t.id = e.transaction_id
      WHERE t.type = 'SOLIDARITY_CONTRIBUTION' AND e.account_id = ${pool.id}::uuid AND t.metadata->>'claimId' = ${claim.id}`;

    const disbursed = await this.prisma.$transaction(async (tx) => {
      const reference = `solidarity-assistance:${claim.id}`;
      const existing = await tx.ledgerTransaction.findUnique({ where: { reference }, include: { entries: true } });
      if (existing) {
        return existing.entries.find((entry) => entry.accountId === claimantWallet.availableAccountId)?.amount ?? new Decimal(0);
      }
      // Verrou du fonds : deux dossiers ne peuvent pas consommer le même solde.
      const [locked] = await tx.$queryRaw<{ balance: string }[]>`
        SELECT balance::text AS balance FROM ledger_accounts WHERE id = ${pool.id}::uuid FOR UPDATE`;
      const amount = Decimal.min(claim.approvedAmount, new Decimal(locked?.balance ?? 0));
      if (amount.lte(0)) return new Decimal(0);
      await this.ledger.post(
        {
          reference,
          type: 'SOLIDARITY_ASSISTANCE',
          description: `Aide solidaire — dossier ${claim.reference}`,
          entries: [
            { accountId: pool.id, direction: 'DEBIT', amount },
            { accountId: claimantWallet.availableAccountId, direction: 'CREDIT', amount },
          ],
          metadata: { claimId: claim.id, claimReference: claim.reference },
        },
        ctx,
        tx,
      );
      return amount;
    });

    this.logger.log(
      `Dossier ${claim.reference} : ${participatingMembers} participation(s), ${skippedMembers} adhérent(s) non prélevé(s), ${formatXaf(disbursed)} versés`,
    );
    return { collected: money(collectedRow?.total ?? 0), disbursed: money(disbursed), participatingMembers, skippedMembers };
  }
}

export function rulesText(rules: SolidarityRules): string[] {
  const lines = [
    'L’adhésion est volontaire. Vous pouvez y mettre fin à tout moment depuis l’application.',
    `Quand le comité approuve le dossier d’accident d’un adhérent, chaque adhérent participe à hauteur de ${formatXaf(rules.contributionPerClaim.amount)}, prélevés sur son solde disponible. Sans solde suffisant, rien n’est prélevé.`,
    `Seuls les accidents survenus au moins ${rules.waitingDays} jour${rules.waitingDays > 1 ? 's' : ''} après l’adhésion peuvent être aidés.`,
    `L’aide est plafonnée à ${formatXaf(rules.maxAssistance.amount)} par dossier et ne peut pas dépasser les fonds disponibles. Elle n’est jamais garantie : chaque dossier est examiné.`,
    'Le fonds de solidarité n’est pas une assurance.',
  ];
  if (!rules.collectionsEnabled) {
    lines.push('Les collectes ne sont pas encore activées : aucun prélèvement n’est effectué pour le moment.');
  }
  return lines;
}
