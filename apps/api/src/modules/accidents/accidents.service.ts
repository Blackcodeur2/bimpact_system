import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AccidentClaimStatus } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { PrismaService } from '../../database/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import type { RequestContext } from '../../common/request-context';
import { ApproveClaimDto, ReportAccidentDto } from './accidents.dto';

/** Clé du paramètre système pour le montant de prélèvement solidaire minimum. */
export const SOLIDARITY_DEBIT_AMOUNT_KEY = 'accidents.solidarity_debit_amount';

/** Montant par défaut si le paramètre n'est pas encore configuré (en XAF). */
const DEFAULT_SOLIDARITY_DEBIT = 500;

@Injectable()
export class AccidentsService {
  private readonly logger = new Logger(AccidentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
  ) {}

  // ─────────────────────── Paramètre configurable ───────────────────────

  async getSolidarityDebitAmount(): Promise<number> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: SOLIDARITY_DEBIT_AMOUNT_KEY },
    });
    if (!setting) return DEFAULT_SOLIDARITY_DEBIT;
    const parsed = parseFloat(setting.value);
    return isNaN(parsed) || parsed <= 0 ? DEFAULT_SOLIDARITY_DEBIT : parsed;
  }

  async setSolidarityDebitAmount(amount: number, updatedById?: string): Promise<void> {
    if (amount <= 0) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_AMOUNT', 'Le montant doit être positif.');
    }
    await this.prisma.systemSetting.upsert({
      where: { key: SOLIDARITY_DEBIT_AMOUNT_KEY },
      create: {
        key: SOLIDARITY_DEBIT_AMOUNT_KEY,
        value: String(amount),
        description: 'Montant minimum prélevé sur chaque membre lors d\'un accident validé (en XAF)',
        updatedById,
      },
      update: { value: String(amount), updatedById },
    });
  }

  // ─────────────────────── Couverture membre ───────────────────────

  async getCoverageStatus(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const paidDays = await this.prisma.contribution.count({
      where: {
        userId,
        periodDate: { gte: thirtyDaysAgo },
      },
    });

    const isCovered = paidDays >= 5;
    const maxCoverageAmount = 150000;

    return {
      isCovered,
      paidDaysLast30Days: paidDays,
      minRequiredDays: 5,
      maxCoverageAmount,
      currency: 'XAF',
      emergencyPhone: '+237699000000',
      guarantees: [
        'Prise en charge directe des soins d\'urgence hôpital conventionné',
        'Remboursement ordonnance et médicaments sous 48h',
        'Assistance juridique et constat en cas de tiers responsable',
      ],
    };
  }

  // ─────────────────────── Dossiers sinistres ───────────────────────

  async listClaims(userId: string) {
    return this.prisma.accidentClaim.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        documents: { select: { id: true, type: true, mimeType: true, sizeBytes: true, createdAt: true } },
      },
    });
  }

  async listAllClaims(status?: AccidentClaimStatus) {
    return this.prisma.accidentClaim.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, phone: true, profile: { select: { firstName: true, lastName: true } } } },
        documents: { select: { id: true, type: true, mimeType: true, sizeBytes: true, createdAt: true } },
      },
    });
  }

  async getClaim(id: string, userId: string) {
    const claim = await this.prisma.accidentClaim.findUnique({
      where: { id },
      include: { documents: true },
    });
    if (!claim || claim.userId !== userId) {
      throw new AppException(HttpStatus.NOT_FOUND, 'CLAIM_NOT_FOUND', 'Dossier d\'assistance introuvable.');
    }
    return claim;
  }

  async getClaimAdmin(id: string) {
    const claim = await this.prisma.accidentClaim.findUnique({
      where: { id },
      include: {
        documents: true,
        user: { select: { id: true, phone: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!claim) {
      throw new AppException(HttpStatus.NOT_FOUND, 'CLAIM_NOT_FOUND', 'Dossier d\'assistance introuvable.');
    }
    return claim;
  }

  async createClaim(dto: ReportAccidentDto, userId: string) {
    const count = await this.prisma.accidentClaim.count();
    const year = new Date().getFullYear();
    const reference = `ACC-${year}-${String(count + 1).padStart(4, '0')}`;

    const claim = await this.prisma.accidentClaim.create({
      data: {
        userId,
        reference,
        date: new Date(dto.date),
        location: dto.location,
        severity: dto.severity,
        thirdPartyInvolved: dto.thirdPartyInvolved ?? false,
        hospitalName: dto.hospitalName,
        description: dto.description,
        requestedAmount: dto.requestedAmount,
        status: AccidentClaimStatus.SUBMITTED,
      },
    });

    return claim;
  }

  // ─────────────────────── Validation admin + prélèvement solidaire ───────────────────────

  /**
   * Approuve un dossier d'accident et déclenche le prélèvement solidaire automatique.
   * Tous les membres possédant un portefeuille actif sont débités du montant configurable.
   * Les fonds sont versés dans le compte de pool solidarité, puis l'indemnité est
   * créditée au compte disponible du sinistré (dans la limite du pool).
   */
  async approveClaim(claimId: string, dto: ApproveClaimDto, ctx: RequestContext): Promise<{ claim: any; debitedCount: number; totalCollected: number }> {
    // 1. Récupérer le dossier
    const claim = await this.prisma.accidentClaim.findUnique({ where: { id: claimId } });
    if (!claim) {
      throw new AppException(HttpStatus.NOT_FOUND, 'CLAIM_NOT_FOUND', 'Dossier introuvable.');
    }
    if (claim.status !== AccidentClaimStatus.SUBMITTED && claim.status !== AccidentClaimStatus.INVESTIGATING) {
      throw new AppException(HttpStatus.CONFLICT, 'CLAIM_ALREADY_PROCESSED', `Ce dossier est déjà en statut ${claim.status}.`);
    }

    const approvedAmount = dto.approvedAmount ?? Number(claim.requestedAmount);
    const solidarityDebitAmount = await this.getSolidarityDebitAmount();

    // 2. Récupérer ou créer le compte de pool solidarité (compte système ASSET)
    const solidarityPoolAccount = await this.getOrCreateSolidarityPoolAccount();

    // 3. Récupérer tous les wallets actifs (sauf le sinistré lui-même)
    const activeWallets = await this.prisma.wallet.findMany({
      where: {
        status: 'ACTIVE',
        // Inclure tout le monde (y compris le sinistré — c'est l'esprit de la solidarité)
      },
      select: {
        userId: true,
        availableAccountId: true,
      },
    });

    this.logger.log(
      `Accident ${claim.reference} approuvé — prélèvement solidaire de ${solidarityDebitAmount} XAF sur ${activeWallets.length} membres`,
    );

    let debitedCount = 0;
    let totalCollected = 0;

    // 4. Débiter chaque membre (une transaction par membre pour granularité + idempotence)
    for (const wallet of activeWallets) {
      try {
        const reference = `SOLIDARITY:${claim.reference}:${wallet.userId}`;

        // Vérifier si ce membre a assez de solde
        const account = await this.prisma.ledgerAccount.findUnique({
          where: { id: wallet.availableAccountId },
          select: { balance: true, allowNegative: true },
        });

        const balance = parseFloat(account?.balance?.toString() ?? '0');
        if (!account?.allowNegative && balance < solidarityDebitAmount) {
          this.logger.warn(`Membre ${wallet.userId} ignoré — solde insuffisant (${balance} XAF < ${solidarityDebitAmount} XAF)`);
          continue;
        }

        await this.ledger.post(
          {
            reference,
            type: 'SOLIDARITY_DEBIT',
            currency: 'XAF',
            description: `Prélèvement solidaire — accident ${claim.reference}`,
            createdById: ctx.auth?.userId ?? null,
            metadata: { claimId, claimReference: claim.reference, debitAmount: solidarityDebitAmount },
            entries: [
              // Débit du compte disponible du membre (LIABILITY → le solde diminue avec un débit)
              { accountId: wallet.availableAccountId, direction: 'DEBIT', amount: String(solidarityDebitAmount) },
              // Crédit du pool solidarité (ASSET → le pool augmente avec un crédit)
              { accountId: solidarityPoolAccount.id, direction: 'CREDIT', amount: String(solidarityDebitAmount) },
            ],
          },
          ctx,
        );

        debitedCount++;
        totalCollected += solidarityDebitAmount;
      } catch (err: any) {
        // On ne bloque pas l'ensemble de l'opération si un membre échoue
        this.logger.error(`Échec prélèvement solidaire pour le membre ${wallet.userId} : ${err?.message}`);
      }
    }

    // 5. Créditer le portefeuille du sinistré depuis le pool
    const victimWallet = await this.prisma.wallet.findUnique({
      where: { userId: claim.userId },
      select: { availableAccountId: true },
    });

    if (victimWallet) {
      const disbursementAmount = Math.min(approvedAmount, totalCollected);
      if (disbursementAmount > 0) {
        const disbursementRef = `ACCIDENT_DISBURSEMENT:${claim.reference}`;
        await this.ledger.post(
          {
            reference: disbursementRef,
            type: 'ACCIDENT_DISBURSEMENT',
            currency: 'XAF',
            description: `Indemnisation accident — ${claim.reference}`,
            createdById: ctx.auth?.userId ?? null,
            metadata: { claimId, claimReference: claim.reference, approvedAmount: disbursementAmount },
            entries: [
              // Débit du pool solidarité pour financer l'indemnisation
              { accountId: solidarityPoolAccount.id, direction: 'DEBIT', amount: String(disbursementAmount) },
              // Crédit du compte disponible du sinistré
              { accountId: victimWallet.availableAccountId, direction: 'CREDIT', amount: String(disbursementAmount) },
            ],
          },
          ctx,
        );
      }
    }

    // 6. Mettre à jour le statut du dossier
    const updatedClaim = await this.prisma.accidentClaim.update({
      where: { id: claimId },
      data: {
        status: AccidentClaimStatus.DISBURSED,
        approvedAmount,
        reviewNotes: dto.reviewNotes,
      },
    });

    this.logger.log(
      `Accident ${claim.reference} — prélèvement collectif terminé : ${debitedCount} membres débités, ${totalCollected} XAF collectés`,
    );

    return { claim: updatedClaim, debitedCount, totalCollected };
  }

  async rejectClaim(claimId: string, reviewNotes: string, ctx: RequestContext) {
    const claim = await this.prisma.accidentClaim.findUnique({ where: { id: claimId } });
    if (!claim) {
      throw new AppException(HttpStatus.NOT_FOUND, 'CLAIM_NOT_FOUND', 'Dossier introuvable.');
    }
    if (claim.status === AccidentClaimStatus.DISBURSED || claim.status === AccidentClaimStatus.REJECTED) {
      throw new AppException(HttpStatus.CONFLICT, 'CLAIM_ALREADY_PROCESSED', `Ce dossier est déjà en statut ${claim.status}.`);
    }
    return this.prisma.accidentClaim.update({
      where: { id: claimId },
      data: { status: AccidentClaimStatus.REJECTED, reviewNotes },
    });
  }

  async setInvestigating(claimId: string, reviewNotes?: string) {
    const claim = await this.prisma.accidentClaim.findUnique({ where: { id: claimId } });
    if (!claim) {
      throw new AppException(HttpStatus.NOT_FOUND, 'CLAIM_NOT_FOUND', 'Dossier introuvable.');
    }
    if (claim.status !== AccidentClaimStatus.SUBMITTED) {
      throw new AppException(HttpStatus.CONFLICT, 'CLAIM_ALREADY_PROCESSED', `Ce dossier est déjà en statut ${claim.status}.`);
    }
    return this.prisma.accidentClaim.update({
      where: { id: claimId },
      data: { status: AccidentClaimStatus.INVESTIGATING, reviewNotes },
    });
  }

  // ─────────────────────── Helpers privés ───────────────────────

  private async getOrCreateSolidarityPoolAccount() {
    const existing = await this.prisma.ledgerAccount.findUnique({
      where: { code: 'system:solidarity_pool' },
    });
    if (existing) return existing;

    return this.prisma.$transaction((tx) =>
      this.ledger.createAccount(tx, {
        code: 'system:solidarity_pool',
        name: 'Pool Solidarité Accidents',
        type: 'ASSET',
        purpose: 'SOLIDARITY_POOL',
        allowNegative: false,
      }),
    );
  }
}
