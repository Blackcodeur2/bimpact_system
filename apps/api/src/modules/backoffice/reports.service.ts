import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { Decimal } from '../../common/money';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { dailyBuckets, dayKeys, localDayBounds } from './backoffice.common';
import { REPORT_TYPES, ReportQueryDto, ReportType } from './backoffice.dto';

type ColumnKind = 'date' | 'text' | 'integer' | 'amount';
type Cell = string | number | null;

export interface ReportTable {
  key: string;
  title: string;
  columns: { key: string; label: string; kind: ColumnKind }[];
  rows: Record<string, Cell>[];
}

const MAX_DAYS = 366;

const TITLES: Record<ReportType, string> = {
  members: 'Membres et vérification d’identité',
  finance: 'Paiements et contributions',
  program: 'Programme : bénéficiaires, formation, projets, emploi',
  solidarity: 'Accidents et solidarité',
};

const LABELS: Record<string, string> = {
  NOT_STARTED: 'Non commencé',
  DRAFT: 'Brouillon',
  SUBMITTED: 'Soumis',
  UNDER_REVIEW: 'En revue',
  APPROVED: 'Approuvé',
  REJECTED: 'Refusé',
  CHANGES_REQUESTED: 'Corrections demandées',
  FUNDED: 'Financé',
  ACTIVE: 'Actif',
  COMPLETED: 'Terminé',
  SELECTED: 'Sélectionné',
  TRAINING: 'En formation',
  CERTIFIED: 'Certifié',
  ENTREPRENEUR: 'Entrepreneur',
  WITHDRAWN: 'Retiré',
  DOCUMENTS_PENDING: 'Pièces demandées',
  INVESTIGATING: 'En instruction',
  DISBURSED: 'Versé',
  CLOSED: 'Clôturé',
  MTN_MOMO: 'MTN Mobile Money',
  ORANGE_MONEY: 'Orange Money',
};

const label = (code: string) => LABELS[code] ?? code;
const amount = (value: Prisma.Decimal | string | number | null | undefined) => new Decimal(value ?? 0).toFixed(0);

/** Rapports (cahier §8.15) : agrégats calculés à la demande sur une période, exportables en CSV par l'interface. */
@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  types() {
    return { items: REPORT_TYPES.map((type) => ({ type, title: TITLES[type] })) };
  }

  async generate(type: string, dto: ReportQueryDto, ctx: RequestContext) {
    if (!(REPORT_TYPES as readonly string[]).includes(type)) {
      throw new AppException(HttpStatus.NOT_FOUND, 'REPORT_NOT_FOUND', 'Rapport inconnu.');
    }
    if (dto.from > dto.to) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'REPORT_RANGE_INVALID', 'La date de début doit précéder la date de fin.');
    }
    const days = dayKeys(dto.from, dto.to);
    if (days.length > MAX_DAYS) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'REPORT_RANGE_INVALID', `Période limitée à ${MAX_DAYS} jours.`);
    }
    const range = { from: localDayBounds(dto.from).start, to: localDayBounds(dto.to).end, days };
    const reportType = type as ReportType;
    const tables =
      reportType === 'members'
        ? await this.members(range)
        : reportType === 'finance'
          ? await this.finance(range)
          : reportType === 'program'
            ? await this.program(range)
            : await this.solidarity(range);

    await this.audit.record({ action: 'report.generated', resourceType: 'report', resourceId: reportType, metadata: { from: dto.from, to: dto.to } }, ctx);
    return { type: reportType, title: TITLES[reportType], from: dto.from, to: dto.to, generatedAt: new Date(), tables };
  }

  private async members({ from, to, days }: Range): Promise<ReportTable[]> {
    const [registrations, approved, rejected, cities, kyc] = await Promise.all([
      dailyBuckets(this.prisma, { table: 'users', column: 'phone_verified_at', from, to, where: Prisma.sql`kind = 'MEMBER'` }),
      dailyBuckets(this.prisma, { table: 'kyc_reviews', column: 'created_at', from, to, where: Prisma.sql`decision = 'APPROVED'` }),
      dailyBuckets(this.prisma, { table: 'kyc_reviews', column: 'created_at', from, to, where: Prisma.sql`decision = 'REJECTED'` }),
      this.prisma.$queryRaw<{ city: string; members: number }[]>`
        SELECT p.city, COUNT(*)::int AS members FROM profiles p JOIN users u ON u.id = p.user_id
        WHERE u.kind = 'MEMBER' AND u.status = 'ACTIVE' GROUP BY p.city ORDER BY members DESC, p.city`,
      this.prisma.profile.groupBy({ by: ['kycStatus'], where: { user: { kind: 'MEMBER', status: { not: 'PENDING_VERIFICATION' } } }, _count: true }),
    ]);
    return [
      {
        key: 'daily',
        title: 'Activité quotidienne',
        columns: [
          { key: 'date', label: 'Date', kind: 'date' },
          { key: 'registrations', label: 'Inscriptions vérifiées', kind: 'integer' },
          { key: 'kycApproved', label: 'Identités approuvées', kind: 'integer' },
          { key: 'kycRejected', label: 'Identités refusées', kind: 'integer' },
        ],
        rows: days.map((date) => ({
          date,
          registrations: registrations.get(date)?.count ?? 0,
          kycApproved: approved.get(date)?.count ?? 0,
          kycRejected: rejected.get(date)?.count ?? 0,
        })),
      },
      {
        key: 'kyc',
        title: 'Vérification d’identité (situation actuelle)',
        columns: [
          { key: 'status', label: 'Statut', kind: 'text' },
          { key: 'members', label: 'Membres', kind: 'integer' },
        ],
        rows: kyc.map((row) => ({ status: label(row.kycStatus), members: row._count })),
      },
      {
        key: 'cities',
        title: 'Membres actifs par ville (situation actuelle)',
        columns: [
          { key: 'city', label: 'Ville', kind: 'text' },
          { key: 'members', label: 'Membres actifs', kind: 'integer' },
        ],
        rows: cities.map((row) => ({ city: row.city, members: row.members })),
      },
    ];
  }

  private async finance({ from, to, days }: Range): Promise<ReportTable[]> {
    const [paid, failed, contributions, channels] = await Promise.all([
      dailyBuckets(this.prisma, { table: 'payment_intents', column: 'confirmed_at', from, to, sumColumn: 'amount', where: Prisma.sql`status = 'SUCCEEDED'` }),
      dailyBuckets(this.prisma, { table: 'payment_intents', column: 'created_at', from, to, where: Prisma.sql`status = 'FAILED'` }),
      dailyBuckets(this.prisma, { table: 'contributions', column: 'paid_at', from, to, sumColumn: 'amount' }),
      this.prisma.paymentIntent.groupBy({
        by: ['channel'],
        where: { status: 'SUCCEEDED', confirmedAt: { gte: from, lte: to } },
        _count: true,
        _sum: { amount: true },
      }),
    ]);
    return [
      {
        key: 'daily',
        title: 'Flux quotidiens (FCFA)',
        columns: [
          { key: 'date', label: 'Date', kind: 'date' },
          { key: 'paymentsCount', label: 'Rechargements confirmés', kind: 'integer' },
          { key: 'paymentsAmount', label: 'Montant rechargé', kind: 'amount' },
          { key: 'paymentsFailed', label: 'Rechargements échoués', kind: 'integer' },
          { key: 'contributionsCount', label: 'Contributions', kind: 'integer' },
          { key: 'contributionsAmount', label: 'Montant contribué', kind: 'amount' },
        ],
        rows: days.map((date) => ({
          date,
          paymentsCount: paid.get(date)?.count ?? 0,
          paymentsAmount: amount(paid.get(date)?.sum),
          paymentsFailed: failed.get(date)?.count ?? 0,
          contributionsCount: contributions.get(date)?.count ?? 0,
          contributionsAmount: amount(contributions.get(date)?.sum),
        })),
      },
      {
        key: 'channels',
        title: 'Rechargements confirmés par moyen de paiement',
        columns: [
          { key: 'channel', label: 'Moyen', kind: 'text' },
          { key: 'count', label: 'Nombre', kind: 'integer' },
          { key: 'amount', label: 'Montant', kind: 'amount' },
        ],
        rows: channels.map((row) => ({ channel: label(row.channel), count: row._count, amount: amount(row._sum.amount) })),
      },
    ];
  }

  private async program({ from, to, days }: Range): Promise<ReportTable[]> {
    const [beneficiaries, projects, certificates, submitted, companies, applications, hires] = await Promise.all([
      this.prisma.beneficiary.groupBy({ by: ['status'], _count: true }),
      this.prisma.project.groupBy({ by: ['status'], _count: true }),
      dailyBuckets(this.prisma, { table: 'certifications', column: 'issued_at', from, to }),
      dailyBuckets(this.prisma, { table: 'projects', column: 'submitted_at', from, to }),
      dailyBuckets(this.prisma, { table: 'companies', column: 'created_at', from, to }),
      dailyBuckets(this.prisma, { table: 'job_applications', column: 'created_at', from, to }),
      this.prisma.jobApplication.count({ where: { status: 'HIRED', updatedAt: { gte: from, lte: to } } }),
    ]);
    return [
      {
        key: 'daily',
        title: 'Activité quotidienne',
        columns: [
          { key: 'date', label: 'Date', kind: 'date' },
          { key: 'certificates', label: 'Certificats délivrés', kind: 'integer' },
          { key: 'projectsSubmitted', label: 'Projets soumis', kind: 'integer' },
          { key: 'companiesCreated', label: 'Entreprises créées', kind: 'integer' },
          { key: 'applications', label: 'Candidatures', kind: 'integer' },
        ],
        rows: days.map((date) => ({
          date,
          certificates: certificates.get(date)?.count ?? 0,
          projectsSubmitted: submitted.get(date)?.count ?? 0,
          companiesCreated: companies.get(date)?.count ?? 0,
          applications: applications.get(date)?.count ?? 0,
        })),
      },
      {
        key: 'beneficiaries',
        title: 'Bénéficiaires par étape (situation actuelle)',
        columns: [
          { key: 'status', label: 'Étape', kind: 'text' },
          { key: 'count', label: 'Bénéficiaires', kind: 'integer' },
        ],
        rows: beneficiaries.map((row) => ({ status: label(row.status), count: row._count })),
      },
      {
        key: 'projects',
        title: 'Projets par statut (situation actuelle)',
        columns: [
          { key: 'status', label: 'Statut', kind: 'text' },
          { key: 'count', label: 'Projets', kind: 'integer' },
        ],
        rows: projects.map((row) => ({ status: label(row.status), count: row._count })),
      },
      {
        key: 'hires',
        title: 'Recrutements sur la période',
        columns: [{ key: 'hires', label: 'Candidats retenus', kind: 'integer' }],
        rows: [{ hires }],
      },
    ];
  }

  private async solidarity({ from, to }: Range): Promise<ReportTable[]> {
    const [claims, joined, left, active] = await Promise.all([
      this.prisma.accidentClaim.groupBy({
        by: ['status'],
        where: { createdAt: { gte: from, lte: to } },
        _count: true,
        _sum: { requestedAmount: true, approvedAmount: true, disbursedAmount: true },
      }),
      this.prisma.solidarityMembership.count({ where: { joinedAt: { gte: from, lte: to } } }),
      this.prisma.solidarityMembership.count({ where: { leftAt: { gte: from, lte: to } } }),
      this.prisma.solidarityMembership.count({ where: { status: 'ACTIVE' } }),
    ]);
    return [
      {
        key: 'claims',
        title: 'Déclarations d’accident créées sur la période (FCFA)',
        columns: [
          { key: 'status', label: 'Statut actuel', kind: 'text' },
          { key: 'count', label: 'Dossiers', kind: 'integer' },
          { key: 'requested', label: 'Montant demandé', kind: 'amount' },
          { key: 'approved', label: 'Montant approuvé', kind: 'amount' },
          { key: 'disbursed', label: 'Montant versé', kind: 'amount' },
        ],
        rows: claims.map((row) => ({
          status: label(row.status),
          count: row._count,
          requested: amount(row._sum.requestedAmount),
          approved: amount(row._sum.approvedAmount),
          disbursed: amount(row._sum.disbursedAmount),
        })),
      },
      {
        key: 'memberships',
        title: 'Adhésions au fonds de solidarité volontaire',
        columns: [
          { key: 'joined', label: 'Adhésions sur la période', kind: 'integer' },
          { key: 'left', label: 'Retraits sur la période', kind: 'integer' },
          { key: 'active', label: 'Adhérents actifs aujourd’hui', kind: 'integer' },
        ],
        rows: [{ joined, left, active }],
      },
    ];
  }
}

interface Range {
  from: Date;
  to: Date;
  days: string[];
}
