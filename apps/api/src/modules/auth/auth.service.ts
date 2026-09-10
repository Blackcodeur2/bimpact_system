import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception';
import type { AuthContext, RequestContext } from '../../common/request-context';
import { PrismaService, Tx } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MeView, UsersService } from '../users/users.service';
import { WalletService } from '../wallet/wallet.service';
import type { DeviceDto, LoginDto, OtpRequestDto, OtpVerifyDto, RefreshDto, RegisterDto } from './dto';
import { OtpIssued, OtpService } from './otp.service';
import { isWeakPin, PinService } from './pin.service';
import { TokenPair, TokenService } from './token.service';

export const CONSENT_VERSION = '2026-09';
export const MAX_FAILED_LOGINS = 5;
export const LOCK_DURATION_MS = 15 * 60_000;

export interface AuthResult {
  tokens: TokenPair;
  user: MeView;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly pins: PinService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly wallets: WalletService,
    private readonly audit: AuditService,
  ) {}

  /** Étape 1 : crée (ou reprend) un compte en attente de vérification et envoie un code OTP. */
  async register(dto: RegisterDto, ctx: RequestContext): Promise<{ phone: string; otp: OtpIssued }> {
    if (isWeakPin(dto.pin)) {
      throw new AppException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'PIN_TOO_WEAK',
        'Ce code PIN est trop facile à deviner. Choisissez-en un autre.',
      );
    }

    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone }, select: { id: true, status: true } });
    if (existing && existing.status !== 'PENDING_VERIFICATION') {
      throw new AppException(
        HttpStatus.CONFLICT,
        'PHONE_ALREADY_REGISTERED',
        'Ce numéro est déjà inscrit. Connectez-vous.',
      );
    }

    const pinHash = await this.pins.hash(dto.pin);
    const profile = { firstName: dto.firstName, lastName: dto.lastName, city: dto.city, zone: dto.zone ?? null };

    await this.prisma.$transaction(async (tx) => {
      const user = existing
        ? await tx.user.update({ where: { id: existing.id }, data: { pinHash, profile: { update: profile } } })
        : await tx.user.create({ data: { phone: dto.phone, pinHash, profile: { create: profile } } });

      for (const type of ['TERMS', 'PRIVACY']) {
        await tx.consent.upsert({
          where: { userId_type_version: { userId: user.id, type, version: CONSENT_VERSION } },
          create: { userId: user.id, type, version: CONSENT_VERSION },
          update: {},
        });
      }
      await this.audit.record(
        {
          action: existing ? 'auth.register.restarted' : 'auth.register.started',
          resourceType: 'user',
          resourceId: user.id,
          actorId: user.id,
          actorType: 'MEMBER',
          after: { ...profile, consentVersion: CONSENT_VERSION },
        },
        ctx,
        tx,
      );
    });

    return { phone: dto.phone, otp: await this.otp.issue(dto.phone, 'REGISTER') };
  }

  async requestOtp(dto: OtpRequestDto): Promise<{ phone: string; otp: OtpIssued }> {
    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone }, select: { status: true } });
    if (!user) {
      throw new AppException(HttpStatus.NOT_FOUND, 'REGISTRATION_NOT_FOUND', 'Aucune inscription en cours pour ce numéro.');
    }
    if (user.status !== 'PENDING_VERIFICATION') {
      throw new AppException(HttpStatus.CONFLICT, 'ACCOUNT_ALREADY_VERIFIED', 'Ce compte est déjà vérifié. Connectez-vous.');
    }
    return { phone: dto.phone, otp: await this.otp.issue(dto.phone, dto.purpose) };
  }

  /** Étape 2 : vérifie l'OTP, active le compte, ouvre le portefeuille et démarre la session. */
  async verifyRegistration(dto: OtpVerifyDto, ctx: RequestContext): Promise<AuthResult> {
    const { phone } = await this.otp.verify(dto.challengeId, dto.code, 'REGISTER');

    const { userId, tokens } = await this.prisma.$transaction(async (tx) => {
      await this.otp.consume(tx, dto.challengeId);
      const user = await tx.user.findUnique({ where: { phone } });
      if (!user || user.status !== 'PENDING_VERIFICATION') {
        throw new AppException(HttpStatus.CONFLICT, 'ACCOUNT_ALREADY_VERIFIED', 'Ce compte est déjà vérifié. Connectez-vous.');
      }
      const memberRole = await tx.role.findUniqueOrThrow({ where: { code: 'MEMBER' } });
      const now = new Date();

      await tx.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE', phoneVerifiedAt: now, lastLoginAt: now },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: memberRole.id } });
      await this.wallets.openForUser(tx, user.id, ctx);

      const deviceId = await this.upsertDevice(tx, user.id, dto.device);
      const session = await this.tokens.issueSession(tx, { userId: user.id, kind: user.kind, deviceId }, ctx);
      await this.audit.record(
        { action: 'auth.register.completed', resourceType: 'user', resourceId: user.id, actorId: user.id, actorType: 'MEMBER' },
        ctx,
        tx,
      );
      const { sessionId: _sessionId, ...pair } = session;
      return { userId: user.id, tokens: pair };
    });

    return { tokens, user: await this.users.getMe(userId) };
  }

  async login(dto: LoginDto, ctx: RequestContext): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });

    // Les comptes back-office passeront par une connexion avec MFA (phase back-office).
    if (!user || !user.pinHash || user.kind !== 'MEMBER' || user.status === 'CLOSED') {
      await this.pins.burn(dto.pin);
      throw invalidCredentials();
    }
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw accountLocked(user.lockedUntil);
    }

    if (!(await this.pins.verify(user.pinHash, dto.pin))) {
      const { failedLoginCount } = await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });
      const locked = failedLoginCount >= MAX_FAILED_LOGINS;
      const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      if (locked) {
        await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil } });
      }
      await this.audit.record(
        {
          action: locked ? 'auth.login.locked' : 'auth.login.failed',
          resourceType: 'user',
          resourceId: user.id,
          actorId: user.id,
          actorType: 'MEMBER',
          metadata: { failedLoginCount },
        },
        ctx,
      );
      if (locked) throw accountLocked(lockedUntil);
      throw invalidCredentials(MAX_FAILED_LOGINS - failedLoginCount);
    }

    if (user.status === 'PENDING_VERIFICATION') {
      throw new AppException(HttpStatus.FORBIDDEN, 'PHONE_NOT_VERIFIED', 'Vérifiez votre numéro pour terminer l’inscription.');
    }
    if (user.status !== 'ACTIVE') {
      throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_NOT_ACTIVE', "Ce compte n'est pas actif. Contactez le support.");
    }

    const tokens = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      });
      const deviceId = await this.upsertDevice(tx, user.id, dto.device);
      const session = await this.tokens.issueSession(tx, { userId: user.id, kind: user.kind, deviceId }, ctx);
      await this.audit.record(
        {
          action: 'auth.login.succeeded',
          resourceType: 'session',
          resourceId: session.sessionId,
          actorId: user.id,
          actorType: 'MEMBER',
          metadata: { deviceId },
        },
        ctx,
        tx,
      );
      const { sessionId: _sessionId, ...pair } = session;
      return pair;
    });

    return { tokens, user: await this.users.getMe(user.id) };
  }

  refresh(dto: RefreshDto, ctx: RequestContext): Promise<TokenPair> {
    return this.tokens.rotate(dto.refreshToken, ctx);
  }

  async logout(auth: AuthContext, ctx: RequestContext): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.tokens.revoke(tx, auth.sessionId, 'LOGOUT');
      await this.audit.record({ action: 'auth.logout', resourceType: 'session', resourceId: auth.sessionId }, ctx, tx);
    });
  }

  private async upsertDevice(tx: Tx, userId: string, device: DeviceDto): Promise<string> {
    const saved = await tx.device.upsert({
      where: { userId_installationId: { userId, installationId: device.installationId } },
      create: { userId, ...device },
      update: { platform: device.platform, model: device.model, appVersion: device.appVersion, lastSeenAt: new Date() },
      select: { id: true, revokedAt: true },
    });
    if (saved.revokedAt) {
      throw new AppException(HttpStatus.FORBIDDEN, 'DEVICE_REVOKED', 'Cet appareil a été révoqué. Contactez le support.');
    }
    return saved.id;
  }
}

function invalidCredentials(remainingAttempts?: number) {
  return new AppException(
    HttpStatus.UNAUTHORIZED,
    'INVALID_CREDENTIALS',
    'Numéro ou code PIN incorrect.',
    remainingAttempts === undefined ? {} : { remainingAttempts },
  );
}

function accountLocked(lockedUntil: Date) {
  return new AppException(
    HttpStatus.FORBIDDEN,
    'ACCOUNT_LOCKED',
    'Trop de tentatives. Compte temporairement bloqué.',
    { lockedUntil: lockedUntil.toISOString() },
  );
}
