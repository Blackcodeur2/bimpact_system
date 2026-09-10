import { Injectable } from '@nestjs/common';
import type { KycStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { WalletService, WalletView } from '../wallet/wallet.service';
import { UsersService } from './users.service';

export interface DashboardAlert {
  code: string;
  severity: 'info' | 'warning' | 'danger';
  title: string;
  message: string;
  action?: { label: string; deepLink: string };
}

/**
 * Modules livrés dans cette version. Les sections non livrées sont renvoyées à `null`
 * pour que l'application affiche un état honnête (« bientôt disponible ») et jamais de fausse donnée.
 */
const FEATURES = {
  payments: false,
  kyc: true,
  contributions: false,
  draws: false,
  training: false,
  projects: false,
  accidents: false,
} as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly wallets: WalletService,
  ) {}

  async forMember(userId: string) {
    const [me, wallet, kyc] = await Promise.all([
      this.users.getMe(userId),
      this.wallets.getMine(userId),
      this.prisma.kycProfile.findUnique({ where: { userId }, select: { lastDecisionReason: true } }),
    ]);
    return {
      generatedAt: new Date(),
      user: { firstName: me.profile.firstName, lastName: me.profile.lastName, kycStatus: me.profile.kycStatus },
      wallet: summarizeWallet(wallet),
      contribution: null,
      eligibility: null,
      nextDraw: null,
      training: null,
      alerts: kycAlerts(me.profile.kycStatus, kyc?.lastDecisionReason ?? null),
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
