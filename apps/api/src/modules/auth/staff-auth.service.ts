import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception';
import type { AuthContext, RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LOCK_DURATION_MS, MAX_FAILED_LOGINS } from './auth.service';
import type { ChangePasswordDto, StaffLoginDto } from './dto';
import { passwordIssues, PasswordService } from './password.service';
import { TokenPair, TokenService } from './token.service';

export interface StaffMeView {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  roles: string[];
  /** Capacités effectives : l'interface s'adapte, le serveur reste seul juge. */
  permissions: string[];
  mustChangePassword: boolean;
  passwordChangedAt: Date | null;
  lastLoginAt: Date | null;
}

/**
 * Connexion du back-office par e-mail et mot de passe (comptes STAFF uniquement).
 * Mêmes protections que la connexion membre : verrouillage après échecs, temps de réponse homogène, audit.
 */
@Injectable()
export class StaffAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async login(dto: StaffLoginDto, ctx: RequestContext): Promise<{ tokens: TokenPair; user: StaffMeView }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || user.kind !== 'STAFF' || !user.passwordHash || user.status === 'CLOSED') {
      await this.passwords.burn(dto.password);
      throw invalidCredentials();
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw accountLocked(user.lockedUntil);
    }
    if (!(await this.passwords.verify(user.passwordHash, dto.password))) {
      await this.registerFailure(user.id, 'auth.staff_login', ctx);
      throw invalidCredentials();
    }
    if (user.status !== 'ACTIVE') {
      throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_NOT_ACTIVE', "Ce compte n'est pas actif. Contactez un administrateur.");
    }

    const tokens = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
      const session = await this.tokens.issueSession(tx, { userId: user.id, kind: 'STAFF' }, ctx);
      await this.audit.record(
        {
          action: 'auth.staff_login.succeeded',
          resourceType: 'session',
          resourceId: session.sessionId,
          actorId: user.id,
          actorType: 'STAFF',
          metadata: { mustChangePassword: user.mustChangePassword },
        },
        ctx,
        tx,
      );
      const { sessionId: _sessionId, ...pair } = session;
      return pair;
    });
    return { tokens, user: await this.me(user.id) };
  }

  async me(userId: string): Promise<StaffMeView> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: { select: { firstName: true, lastName: true } },
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
    });
    if (!user || user.kind !== 'STAFF' || !user.email) throw staffOnly();
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.profile?.firstName ?? '',
      lastName: user.profile?.lastName ?? '',
      roles: user.roles.map((r) => r.role.code).sort(),
      permissions: [...new Set(user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)))].sort(),
      mustChangePassword: user.mustChangePassword,
      passwordChangedAt: user.passwordChangedAt,
      lastLoginAt: user.lastLoginAt,
    };
  }

  /** Remplace le mot de passe (temporaire ou non) et ferme toutes les autres sessions de l'agent. */
  async changePassword(auth: AuthContext, dto: ChangePasswordDto, ctx: RequestContext): Promise<StaffMeView> {
    const user = await this.prisma.user.findUnique({ where: { id: auth.userId }, include: { profile: true } });
    if (!user || user.kind !== 'STAFF' || !user.passwordHash) throw staffOnly();

    if (!(await this.passwords.verify(user.passwordHash, dto.currentPassword))) {
      await this.registerFailure(user.id, 'auth.staff_password', ctx);
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_CURRENT_PASSWORD', 'Mot de passe actuel incorrect.', {
        fields: { currentPassword: ['Mot de passe actuel incorrect.'] },
      });
    }
    const issues = passwordIssues(dto.newPassword, {
      email: user.email,
      firstName: user.profile?.firstName,
      lastName: user.profile?.lastName,
    });
    if (issues.length === 0 && (await this.passwords.verify(user.passwordHash, dto.newPassword))) {
      issues.push('Choisissez un mot de passe différent de l’actuel.');
    }
    if (issues.length > 0) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PASSWORD_TOO_WEAK',
        'Ce mot de passe ne respecte pas la politique de sécurité.',
        { fields: { newPassword: issues } },
      );
    }

    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash, passwordChangedAt: now, mustChangePassword: false, failedLoginCount: 0, lockedUntil: null },
      });
      const revoked = await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: auth.sessionId } },
        data: { revokedAt: now, revokedReason: 'PASSWORD_CHANGED' },
      });
      await this.audit.record(
        {
          action: 'auth.staff_password.changed',
          resourceType: 'user',
          resourceId: user.id,
          metadata: { wasTemporary: user.mustChangePassword, revokedSessions: revoked.count },
        },
        ctx,
        tx,
      );
    });
    return this.me(user.id);
  }

  /** Compte les échecs ; au-delà du seuil, verrouille le compte et ferme ses sessions. */
  private async registerFailure(userId: string, action: string, ctx: RequestContext): Promise<void> {
    const { failedLoginCount } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    const locked = failedLoginCount >= MAX_FAILED_LOGINS;
    const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
    if (locked) {
      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: userId }, data: { failedLoginCount: 0, lockedUntil } }),
        this.prisma.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date(), revokedReason: 'ACCOUNT_LOCKED' },
        }),
      ]);
    }
    await this.audit.record(
      {
        action: locked ? `${action}.locked` : `${action}.failed`,
        resourceType: 'user',
        resourceId: userId,
        actorId: userId,
        actorType: 'STAFF',
        metadata: { failedLoginCount },
      },
      ctx,
    );
    if (locked) throw accountLocked(lockedUntil);
  }
}

function invalidCredentials() {
  return new AppException(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'E-mail ou mot de passe incorrect.');
}

function accountLocked(lockedUntil: Date) {
  return new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_LOCKED', 'Trop de tentatives. Compte temporairement bloqué.', {
    lockedUntil: lockedUntil.toISOString(),
  });
}

function staffOnly() {
  return new AppException(HttpStatus.FORBIDDEN, 'STAFF_ONLY', 'Réservé aux comptes du back-office.');
}
