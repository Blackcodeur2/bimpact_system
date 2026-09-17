import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/errors/app-exception';
import { afterCursor, toPage } from '../../common/pagination';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { generateTemporaryPassword, PasswordService } from '../auth/password.service';
import { PERMISSIONS, ROLES } from '../auth/rbac.catalog';
import type { CreateStaffDto, RevokeStaffSessionsDto, StaffQueryDto, UpdateStaffDto } from './staff.dto';

/** Rôles attribuables à un agent (MEMBER est réservé aux comptes de l'application). */
export const STAFF_ROLE_CODES = Object.keys(ROLES).filter((code) => code !== 'MEMBER');

const staffInclude = {
  profile: { select: { firstName: true, lastName: true, city: true } },
  roles: { include: { role: { select: { code: true, name: true } } } },
} satisfies Prisma.UserInclude;

type StaffRow = Prisma.UserGetPayload<{ include: typeof staffInclude }>;

/** Comptes internes et rôles (cahier §8.16). Réservé à `admin.users.manage`. */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async list(query: StaffQueryDto) {
    const q = query.q;
    const rows = await this.prisma.user.findMany({
      where: {
        kind: 'STAFF',
        status: query.status,
        ...(query.role ? { roles: { some: { role: { code: query.role } } } } : {}),
        ...(q
          ? {
              AND: [
                {
                  OR: [
                    { email: { contains: q.toLowerCase() } },
                    { phone: { contains: q.replace(/\s/g, '') } },
                    { profile: { firstName: { contains: q, mode: 'insensitive' } } },
                    { profile: { lastName: { contains: q, mode: 'insensitive' } } },
                  ],
                },
              ],
            }
          : {}),
        ...afterCursor(query.cursor),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: staffInclude,
    });
    const sessions = await this.activeSessionCounts(rows.map((row) => row.id));
    return toPage(rows, query.limit, (row) => this.view(row, sessions.get(row.id) ?? 0));
  }

  async get(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, kind: 'STAFF' }, include: staffInclude });
    if (!user) throw notFound();
    const now = new Date();
    const [sessions, recentActions] = await Promise.all([
      this.prisma.session.findMany({
        where: { userId: id, revokedAt: null, expiresAt: { gt: now } },
        orderBy: { lastUsedAt: 'desc' },
        take: 20,
        select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true, userAgent: true },
      }),
      this.prisma.auditLog.findMany({
        where: { actorId: id },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { id: true, action: true, resourceType: true, resourceId: true, createdAt: true },
      }),
    ]);
    return { ...this.view(user, sessions.length), sessions, recentActions };
  }

  /** Crée l'agent avec un mot de passe temporaire, renvoyé une seule fois et à remplacer à la première connexion. */
  async create(dto: CreateStaffDto, ctx: RequestContext) {
    const roles = this.validateRoles(dto.roles, ctx);
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwords.hash(temporaryPassword);

    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const roleRows = await tx.role.findMany({ where: { code: { in: roles } }, select: { id: true } });
        const user = await tx.user.create({
          data: {
            phone: dto.phone,
            email: dto.email,
            kind: 'STAFF',
            status: 'ACTIVE',
            passwordHash,
            mustChangePassword: true,
            profile: { create: { firstName: dto.firstName, lastName: dto.lastName, city: dto.city ?? 'Non renseignée' } },
            roles: { create: roleRows.map((role) => ({ roleId: role.id, grantedBy: ctx.auth?.userId ?? null })) },
          },
        });
        await this.audit.record(
          { action: 'staff.created', resourceType: 'user', resourceId: user.id, after: { email: dto.email, roles } },
          ctx,
          tx,
        );
        return user.id;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target ?? '');
        throw target.includes('email')
          ? new AppException(HttpStatus.CONFLICT, 'EMAIL_ALREADY_USED', 'Cette adresse e-mail est déjà utilisée.', {
              fields: { email: ['Cette adresse e-mail est déjà utilisée.'] },
            })
          : new AppException(HttpStatus.CONFLICT, 'PHONE_ALREADY_USED', 'Ce numéro est déjà associé à un compte.', {
              fields: { phone: ['Ce numéro est déjà associé à un compte.'] },
            });
      }
      throw error;
    }
    return { user: await this.get(id), temporaryPassword };
  }

  async update(id: string, dto: UpdateStaffDto, ctx: RequestContext) {
    const actorId = requireActor(ctx);
    if (dto.roles === undefined && dto.status === undefined) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'NOTHING_TO_UPDATE', 'Aucune modification demandée.');
    }
    const roles = dto.roles ? this.validateRoles(dto.roles, ctx) : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.user.findFirst({ where: { id, kind: 'STAFF' }, include: staffInclude });
      if (!current) throw notFound();
      const currentRoles = current.roles.map((r) => r.role.code).sort();
      const nextRoles = roles ? [...roles].sort() : currentRoles;
      const statusChanged = dto.status !== undefined && dto.status !== current.status;
      const rolesChanged = nextRoles.join() !== currentRoles.join();
      if (!statusChanged && !rolesChanged) return;

      if (statusChanged && !dto.reason) {
        throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'REASON_REQUIRED', 'Indiquez le motif du changement de statut.', {
          fields: { reason: ['Motif obligatoire.'] },
        });
      }
      if (id === actorId && dto.status === 'SUSPENDED') {
        throw new AppException(HttpStatus.CONFLICT, 'CANNOT_SUSPEND_SELF', 'Vous ne pouvez pas suspendre votre propre compte.');
      }
      if (id === actorId && !grantsUserManagement(nextRoles)) {
        throw new AppException(
          HttpStatus.CONFLICT,
          'CANNOT_REMOVE_OWN_ADMIN',
          'Vous ne pouvez pas retirer vos propres droits de gestion des comptes.',
        );
      }
      const losesSuperAdmin =
        currentRoles.includes('SUPER_ADMIN') && current.status === 'ACTIVE' && (!nextRoles.includes('SUPER_ADMIN') || dto.status === 'SUSPENDED');
      if (losesSuperAdmin) {
        const others = await tx.user.count({
          where: { id: { not: id }, kind: 'STAFF', status: 'ACTIVE', roles: { some: { role: { code: 'SUPER_ADMIN' } } } },
        });
        if (others === 0) {
          throw new AppException(HttpStatus.CONFLICT, 'LAST_SUPER_ADMIN', 'Il doit rester au moins un super administrateur actif.');
        }
      }

      if (rolesChanged) {
        const roleRows = await tx.role.findMany({ where: { code: { in: nextRoles } }, select: { id: true } });
        await tx.userRole.deleteMany({ where: { userId: id, roleId: { notIn: roleRows.map((r) => r.id) } } });
        await tx.userRole.createMany({
          data: roleRows.map((role) => ({ userId: id, roleId: role.id, grantedBy: actorId })),
          skipDuplicates: true,
        });
      }
      if (statusChanged) {
        await tx.user.update({ where: { id }, data: { status: dto.status } });
        if (dto.status === 'SUSPENDED') {
          await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'ADMIN' } });
        }
      }
      await this.audit.record(
        {
          action: 'staff.updated',
          resourceType: 'user',
          resourceId: id,
          before: { status: current.status, roles: currentRoles },
          after: { status: dto.status ?? current.status, roles: nextRoles },
          metadata: dto.reason ? { reason: dto.reason } : undefined,
        },
        ctx,
        tx,
      );
    });
    return this.get(id);
  }

  /** Nouveau mot de passe temporaire : sessions fermées, remplacement obligatoire à la prochaine connexion. */
  async resetPassword(id: string, ctx: RequestContext) {
    if (id === requireActor(ctx)) {
      throw new AppException(HttpStatus.CONFLICT, 'CANNOT_RESET_SELF', 'Utilisez « Changer mon mot de passe » pour votre propre compte.');
    }
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await this.passwords.hash(temporaryPassword);
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id, kind: 'STAFF' }, select: { id: true } });
      if (!user) throw notFound();
      await tx.user.update({
        where: { id },
        data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      });
      const revoked = await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'PASSWORD_RESET' },
      });
      await this.audit.record(
        { action: 'staff.password.reset', resourceType: 'user', resourceId: id, metadata: { revokedSessions: revoked.count } },
        ctx,
        tx,
      );
    });
    return { user: await this.get(id), temporaryPassword };
  }

  async unlock(id: string, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id, kind: 'STAFF' }, select: { lockedUntil: true } });
      if (!user) throw notFound();
      await tx.user.update({ where: { id }, data: { lockedUntil: null, failedLoginCount: 0 } });
      await this.audit.record(
        { action: 'staff.unlocked', resourceType: 'user', resourceId: id, before: { lockedUntil: user.lockedUntil } },
        ctx,
        tx,
      );
    });
    return this.get(id);
  }

  async revokeSessions(id: string, dto: RevokeStaffSessionsDto, ctx: RequestContext) {
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({ where: { id, kind: 'STAFF' }, select: { id: true } });
      if (!user) throw notFound();
      const revoked = await tx.session.updateMany({
        where: { userId: id, revokedAt: null, ...(dto.sessionId ? { id: dto.sessionId } : {}) },
        data: { revokedAt: new Date(), revokedReason: 'ADMIN' },
      });
      await this.audit.record(
        {
          action: 'staff.sessions.revoked',
          resourceType: 'user',
          resourceId: id,
          metadata: { sessionId: dto.sessionId ?? null, count: revoked.count },
        },
        ctx,
        tx,
      );
    });
    return this.get(id);
  }

  /** Matrice rôles × permissions (définie dans le code et appliquée par le seed : lecture seule ici). */
  async roles() {
    const counts = await this.prisma.userRole.groupBy({
      by: ['roleId'],
      where: { user: { kind: 'STAFF', status: 'ACTIVE' } },
      _count: true,
    });
    const roleRows = await this.prisma.role.findMany({ select: { id: true, code: true } });
    const countByCode = new Map(roleRows.map((role) => [role.code, counts.find((c) => c.roleId === role.id)?._count ?? 0]));
    return {
      permissions: Object.entries(PERMISSIONS)
        .filter(([code]) => code.startsWith('admin.'))
        .map(([code, description]) => ({ code, description })),
      roles: STAFF_ROLE_CODES.map((code) => ({
        code,
        name: ROLES[code]!.name,
        permissions: ROLES[code]!.permissions,
        activeStaff: countByCode.get(code) ?? 0,
      })),
    };
  }

  private validateRoles(codes: string[], ctx: RequestContext): string[] {
    const unique = [...new Set(codes)];
    const unknown = unique.filter((code) => !STAFF_ROLE_CODES.includes(code));
    if (unknown.length > 0) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'UNKNOWN_ROLE', 'Rôle inconnu.', { fields: { roles: [`Rôles inconnus : ${unknown.join(', ')}`] } });
    }
    if (unique.includes('SUPER_ADMIN') && !ctx.auth?.roles.includes('SUPER_ADMIN')) {
      throw new AppException(HttpStatus.FORBIDDEN, 'SUPER_ADMIN_REQUIRED', 'Seul un super administrateur peut attribuer ce rôle.');
    }
    return unique;
  }

  private async activeSessionCounts(userIds: string[]) {
    if (userIds.length === 0) return new Map<string, number>();
    const rows = await this.prisma.session.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, revokedAt: null, expiresAt: { gt: new Date() } },
      _count: true,
    });
    return new Map(rows.map((row) => [row.userId, row._count]));
  }

  private view(user: StaffRow, activeSessions: number) {
    const now = Date.now();
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.profile?.firstName ?? null,
      lastName: user.profile?.lastName ?? null,
      city: user.profile?.city ?? null,
      status: user.status,
      roles: user.roles.map((r) => ({ code: r.role.code, name: r.role.name })),
      mustChangePassword: user.mustChangePassword,
      lockedUntil: user.lockedUntil && user.lockedUntil.getTime() > now ? user.lockedUntil : null,
      lastLoginAt: user.lastLoginAt,
      passwordChangedAt: user.passwordChangedAt,
      activeSessions,
      createdAt: user.createdAt,
    };
  }
}

function grantsUserManagement(roleCodes: string[]): boolean {
  return roleCodes.some((code) => (ROLES[code]?.permissions as readonly string[] | undefined)?.includes('admin.users.manage'));
}

function requireActor(ctx: RequestContext): string {
  if (!ctx.auth) throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Authentification requise.');
  return ctx.auth.userId;
}

function notFound() {
  return new AppException(HttpStatus.NOT_FOUND, 'STAFF_NOT_FOUND', 'Compte interne introuvable.');
}
