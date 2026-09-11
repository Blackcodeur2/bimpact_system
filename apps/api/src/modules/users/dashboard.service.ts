import { Injectable } from '@nestjs/common';
import type { KycStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ContributionsService } from '../contributions/contributions.service';
import { DrawsService } from '../draws/draws.service';
import { SolidarityService } from '../solidarity/solidarity.service';
import { TrainingService } from '../training/training.service';
import { WalletService, WalletView } from '../wallet/wallet.service';
import { UsersService } from './users.service';

export interface DashboardAlert {
  code: string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  action?: { label: string; deepLink: string };
}

/** Tous les modules de l'application membre sont servis par l'API. */
const FEATURES = {
  payments: true,
  notifications: true,
  kyc: true,
  contributions: true,
  draws: true,
  program: true,
  training: true,
  projects: true,
  companies: true,
  recruitment: true,
  accidents: true,
  solidarity: true,
  support: true,
} as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly wallets: WalletService,
    private readonly contributions: ContributionsService,
    private readonly draws: DrawsService,
    private readonly training: TrainingService,
    private readonly solidarity: SolidarityService,
  ) {}

  async forMember(userId: string) {
    const [me, wallet, kyc, contribution, draw, training, solidarity, claimsAwaitingDocuments, projectsToFix, supportReplies] =
      await Promise.all([
        this.users.getMe(userId),
        this.wallets.getMine(userId),
        this.prisma.kycProfile.findUnique({ where: { userId }, select: { lastDecisionReason: true } }),
        this.contributions.summary(userId),
        this.draws.nextSummary(userId),
        this.training.summary(userId),
        this.solidarity.status(userId),
        this.prisma.accidentClaim.findMany({
          where: { userId, status: 'DOCUMENTS_PENDING' },
          select: { id: true, reference: true, reviewNotes: true },
          take: 3,
        }),
        this.prisma.project.findMany({
          where: { userId, status: 'CHANGES_REQUESTED' },
          select: { id: true, title: true, reviewFeedback: true },
          take: 3,
        }),
        this.prisma.supportTicket.count({ where: { userId, status: 'PENDING' } }),
      ]);

    const alerts: DashboardAlert[] = [
      ...kycAlerts(me.profile.kycStatus, kyc?.lastDecisionReason ?? null),
      ...claimsAwaitingDocuments.map(
        (claim): DashboardAlert => ({
          code: 'ACCIDENT_DOCUMENTS_REQUESTED',
          severity: 'warning',
          title: `Dossier ${claim.reference} : justificatifs demandés`,
          message: claim.reviewNotes ?? 'Le comité attend des pièces complémentaires.',
          action: { label: 'Compléter', deepLink: `/accidents/${claim.id}` },
        }),
      ),
      ...projectsToFix.map(
        (project): DashboardAlert => ({
          code: 'PROJECT_CHANGES_REQUESTED',
          severity: 'warning',
          title: `Projet « ${project.title} » à corriger`,
          message: project.reviewFeedback ?? 'Le comité demande des corrections.',
          action: { label: 'Corriger', deepLink: `/projects/${project.id}` },
        }),
      ),
    ];
    if (supportReplies > 0) {
      alerts.push({
        code: 'SUPPORT_REPLY',
        severity: 'info',
        title: 'Réponse du support',
        message: supportReplies > 1 ? `${supportReplies} demandes attendent votre réponse.` : 'Une demande attend votre réponse.',
        action: { label: 'Voir', deepLink: '/profile/support' },
      });
    }

    return {
      generatedAt: new Date(),
      user: { firstName: me.profile.firstName, lastName: me.profile.lastName, kycStatus: me.profile.kycStatus },
      wallet: summarizeWallet(wallet),
      contribution,
      eligibility: draw.eligibility,
      nextDraw: draw.nextDraw,
      training,
      solidarity: {
        member: solidarity.membership?.status === 'ACTIVE',
        covered: solidarity.covered,
        coveredFrom: solidarity.coveredFrom,
        collectionsEnabled: solidarity.rules.collectionsEnabled,
      },
      alerts,
      features: FEATURES,
    };
  }
}

function summarizeWallet(wallet: WalletView) {
  return {
    status: wallet.status,
    availableBalance: wallet.availableBalance,
    reservedBalance: wallet.reservedBalance,
    updatedAt: wallet.updatedAt,
  };
}

export function kycAlerts(status: KycStatus, decisionReason: string | null): DashboardAlert[] {
  switch (status) {
    case 'APPROVED':
      return [];
    case 'SUBMITTED':
    case 'UNDER_REVIEW':
      return [
        {
          code: 'KYC_UNDER_REVIEW',
          severity: 'info',
          title: 'Vérification en cours',
          message: 'Votre dossier est en cours de vérification. Vous serez informé de la décision.',
          action: { label: 'Voir', deepLink: '/kyc' },
        },
      ];
    case 'REJECTED':
      return [
        {
          code: 'KYC_REJECTED',
          severity: 'danger',
          title: 'Vérification refusée',
          message: decisionReason ?? 'Consultez le motif et renvoyez votre dossier.',
          action: { label: 'Corriger', deepLink: '/kyc' },
        },
      ];
    case 'DRAFT':
      return [
        decisionReason
          ? {
              code: 'KYC_MORE_INFO_REQUIRED',
              severity: 'warning',
              title: 'Complément demandé',
              message: decisionReason,
              action: { label: 'Compléter', deepLink: '/kyc' },
            }
          : {
              code: 'KYC_DRAFT',
              severity: 'warning',
              title: 'Terminez votre vérification',
              message: 'Votre dossier est commencé : il ne reste que quelques étapes.',
              action: { label: 'Continuer', deepLink: '/kyc' },
            },
      ];
    default:
      return [
        {
          code: 'KYC_REQUIRED',
          severity: 'warning',
          title: 'Vérifiez votre identité',
          message: 'Complétez votre profil pour accéder aux contributions et aux tirages.',
          action: { label: 'Commencer', deepLink: '/kyc' },
        },
      ];
  }
}
