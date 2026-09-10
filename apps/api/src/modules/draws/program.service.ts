import { Injectable } from '@nestjs/common';
import type { BeneficiaryStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { DrawsService } from './draws.service';

export type MilestoneStatus = 'DONE' | 'IN_PROGRESS' | 'TODO' | 'LOCKED';

export interface ProgramMilestone {
  code: string;
  title: string;
  status: MilestoneStatus;
  detail: string;
  progress: { current: number; target: number } | null;
  action: { label: string; deepLink: string } | null;
}

const STAGES: BeneficiaryStatus[] = ['SELECTED', 'TRAINING', 'CERTIFIED', 'ENTREPRENEUR'];

/** Parcours du membre dans le programme (cahier §7.12), calculé à partir des données réelles. */
@Injectable()
export class ProgramService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly draws: DrawsService,
  ) {}

  async forMember(userId: string) {
    const [profile, beneficiary, next] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId }, select: { kycStatus: true } }),
      this.prisma.beneficiary.findUnique({ where: { userId }, include: { draw: { select: { title: true } } } }),
      this.draws.nextForMember(userId),
    ]);

    const kycStatus = profile?.kycStatus ?? 'NOT_STARTED';
    const kycDone = kycStatus === 'APPROVED';
    const selected = beneficiary !== null && beneficiary.status !== 'WITHDRAWN';
    const reached = (stage: BeneficiaryStatus) =>
      selected && STAGES.indexOf(beneficiary.status) >= STAGES.indexOf(stage);
    const { eligibility } = next;

    const milestones: ProgramMilestone[] = [
      {
        code: 'KYC',
        title: 'Identité vérifiée',
        status: kycDone ? 'DONE' : kycStatus === 'SUBMITTED' || kycStatus === 'UNDER_REVIEW' ? 'IN_PROGRESS' : 'TODO',
        detail: kycDone
          ? 'Votre identité a été vérifiée.'
          : kycStatus === 'SUBMITTED' || kycStatus === 'UNDER_REVIEW'
            ? 'Votre dossier est en cours de vérification.'
            : 'Vérifiez votre identité pour accéder aux contributions et aux tirages.',
        progress: null,
        action: kycDone ? null : { label: 'Vérifier mon identité', deepLink: '/kyc' },
      },
      {
        code: 'CONTRIBUTIONS',
        title: 'Contributions régulières',
        status:
          selected || eligibility.paidDays >= eligibility.requiredDays ? 'DONE' : eligibility.paidDays > 0 ? 'IN_PROGRESS' : kycDone ? 'TODO' : 'LOCKED',
        detail: `${eligibility.paidDays} jour${eligibility.paidDays > 1 ? 's' : ''} payé${eligibility.paidDays > 1 ? 's' : ''} sur les ${eligibility.windowDays} derniers jours (minimum ${eligibility.requiredDays}).`,
        progress: { current: Math.min(eligibility.paidDays, eligibility.requiredDays), target: eligibility.requiredDays },
        action: kycDone && !selected ? { label: 'Contribuer', deepLink: '/contributions' } : null,
      },
      {
        code: 'SELECTION',
        title: 'Sélection au tirage',
        status: selected ? 'DONE' : next.participation?.included ? 'IN_PROGRESS' : eligibility.eligible ? 'IN_PROGRESS' : 'TODO',
        detail: selected
          ? `Sélectionné lors du tirage « ${beneficiary.draw.title} ».`
          : next.draw
            ? `Prochain tirage : « ${next.draw.title} » (${next.draw.winnerCount} bénéficiaire${next.draw.winnerCount > 1 ? 's' : ''}).`
            : 'Le prochain tirage sera annoncé dans l’application.',
        progress: null,
        action: { label: 'Voir les tirages', deepLink: '/draws' },
      },
      {
        code: 'TRAINING',
        title: 'Formation entrepreneuriale (6 mois)',
        status: reached('CERTIFIED') ? 'DONE' : reached('TRAINING') ? 'IN_PROGRESS' : selected ? 'TODO' : 'LOCKED',
        detail: selected ? 'Six mois de formation : entrepreneuriat, marché, modèle économique, finance, marketing, gestion.' : 'Accessible aux bénéficiaires sélectionnés.',
        progress: null,
        action: selected ? { label: 'Ma formation', deepLink: '/training' } : null,
      },
      {
        code: 'CERTIFICATION',
        title: 'Certification',
        status: reached('CERTIFIED') ? 'DONE' : selected ? 'TODO' : 'LOCKED',
        detail: reached('CERTIFIED') ? 'Certificat d’entrepreneur délivré.' : 'Délivrée après validation de la formation.',
        progress: null,
        action: null,
      },
      {
        code: 'COMPANY',
        title: 'Création d’entreprise',
        status: reached('ENTREPRENEUR') ? 'DONE' : reached('CERTIFIED') ? 'IN_PROGRESS' : 'LOCKED',
        detail: reached('ENTREPRENEUR') ? 'Votre entreprise est créée.' : 'Présentez votre projet après la certification.',
        progress: null,
        action: reached('CERTIFIED') ? { label: 'Mes projets', deepLink: '/projects' } : null,
      },
    ];

    const done = milestones.filter((m) => m.status === 'DONE').length;
    const programStatus =
      beneficiary?.status === 'WITHDRAWN'
        ? 'PAUSED'
        : beneficiary?.status === 'ENTREPRENEUR'
          ? 'COMPLETED'
          : kycDone || selected
            ? 'ACTIVE'
            : 'NOT_STARTED';

    return {
      programStatus,
      completionPercent: Math.round((done / milestones.length) * 100),
      beneficiary: beneficiary
        ? {
            status: beneficiary.status,
            selectedAt: beneficiary.selectedAt,
            mentorName: beneficiary.mentorName,
            drawTitle: beneficiary.draw.title,
          }
        : null,
      nextDraw: next.draw,
      milestones,
      nextAction: milestones.find((m) => m.status !== 'DONE' && m.status !== 'LOCKED' && m.action)?.action ?? null,
    };
  }
}
