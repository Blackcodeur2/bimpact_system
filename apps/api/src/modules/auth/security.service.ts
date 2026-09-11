import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception';
import type { AuthContext, RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationInput, NotificationsService } from '../notifications/notifications.service';
import { LOCK_DURATION_MS, MAX_FAILED_LOGINS } from './auth.service';
import type { ChangePinDto } from './dto';
import { isWeakPin, PinService } from './pin.service';

export interface DeviceView {
  id: string;
  platform: string;
  model: string | null;
  appVersion: string | null;
  lastSeenAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
  activeSessions: number;
  /** Appareil de la session qui fait la requête. */
  current: boolean;
}

/** Profil & sécurité (cahier §7.24) : changement de PIN, appareils et sessions. */
@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pins: PinService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Vérifie le PIN actuel (mêmes règles de verrouillage que la connexion), puis ferme les autres sessions. */
  async changePin(auth: AuthContext, dto: ChangePinDto, ctx: RequestContext) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: auth.userId },
      select: { id: true, pinHash: true, lockedUntil: true },
    });
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) throw accountLocked(user.lockedUntil);

    if (!user.pinHash || !(await this.pins.verify(user.pinHash, dto.currentPin))) {
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
          action: locked ? 'security.pin.locked' : 'security.pin.change_failed',
          resourceType: 'user',
          resourceId: user.id,
          metadata: { failedLoginCount },
        },
        ctx,
      );
      if (locked) throw accountLocked(lockedUntil);
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'CURRENT_PIN_INVALID', 'Code PIN actuel incorrect.', {
        remainingAttempts: MAX_FAILED_LOGINS - failedLoginCount,
      });
    }
    if (dto.newPin === dto.currentPin) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'PIN_UNCHANGED', 'Le nouveau code PIN doit être différent de l’actuel.');
    }
    if (isWeakPin(dto.newPin)) {
      throw new AppException(HttpStatus.UNPROCESSABLE_ENTITY, 'PIN_TOO_WEAK', 'Ce code PIN est trop facile à deviner. Choisissez-en un autre.');
    }

    const pinHash = await this.pins.hash(dto.newPin);
    const revokedSessions = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { pinHash, failedLoginCount: 0, lockedUntil: null } });
      const { count } = await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null, id: { not: auth.sessionId } },
        data: { revokedAt: new Date(), revokedReason: 'PIN_CHANGED' },
      });
      await this.audit.record(
        { action: 'security.pin.changed', resourceType: 'user', resourceId: user.id, metadata: { revokedSessions: count } },
        ctx,
        tx,
      );
      return count;
    });

    await this.notify(user.id, {
      type: 'SECURITY_PIN_CHANGED',
      title: 'Code PIN modifié',
      body:
        revokedSessions > 0
          ? `Votre code PIN a été modifié et ${revokedSessions} autre${revokedSessions > 1 ? 's sessions ont été fermées' : ' session a été fermée'}.`
          : 'Votre code PIN a été modifié. Si vous n’êtes pas à l’origine de ce changement, contactez le support.',
      deepLink: '/profile/security',
    });
    return { changed: true, revokedSessions };
  }

  async devices(auth: AuthContext): Promise<{ items: DeviceView[] }> {
    const now = new Date();
    const [devices, current] = await Promise.all([
      this.prisma.device.findMany({
        where: { userId: auth.userId },
        orderBy: { lastSeenAt: 'desc' },
        include: { sessions: { where: { revokedAt: null, expiresAt: { gt: now } }, select: { id: true } } },
      }),
      this.prisma.session.findUnique({ where: { id: auth.sessionId }, select: { deviceId: true } }),
    ]);
    return {
      items: devices.map((device) => ({
        id: device.id,
        platform: device.platform,
        model: device.model,
        appVersion: device.appVersion,
        lastSeenAt: device.lastSeenAt,
        createdAt: device.createdAt,
        revokedAt: device.revokedAt,
        activeSessions: device.sessions.length,
        current: device.id === current?.deviceId,
      })),
    };
  }

  /** Révoque un autre appareil (perdu, volé) : ses sessions sont fermées et il ne pourra plus se connecter. */
  async revokeDevice(auth: AuthContext, deviceId: string, ctx: RequestContext) {
    const [device, current] = await Promise.all([
      this.prisma.device.findFirst({ where: { id: deviceId, userId: auth.userId } }),
      this.prisma.session.findUnique({ where: { id: auth.sessionId }, select: { deviceId: true } }),
    ]);
    if (!device) throw new AppException(HttpStatus.NOT_FOUND, 'DEVICE_NOT_FOUND', 'Appareil introuvable.');
    if (device.id === current?.deviceId) {
      throw new AppException(
        HttpStatus.CONFLICT,
        'DEVICE_IS_CURRENT',
        'Il s’agit de cet appareil : utilisez « Se déconnecter » pour fermer cette session.',
      );
    }
    if (device.revokedAt) return this.devices(auth);

    const revokedSessions = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.device.update({ where: { id: device.id }, data: { revokedAt: now } });
      const { count } = await tx.session.updateMany({
        where: { deviceId: device.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'DEVICE_REVOKED' },
      });
      await this.audit.record(
        {
          action: 'security.device.revoked',
          resourceType: 'device',
          resourceId: device.id,
          metadata: { platform: device.platform, model: device.model, revokedSessions: count },
        },
        ctx,
        tx,
      );
      return count;
    });

    await this.notify(auth.userId, {
      type: 'SECURITY_DEVICE_REVOKED',
      title: 'Appareil déconnecté',
      body: `L’appareil ${device.model ?? device.platform} a été déconnecté (${revokedSessions} session${revokedSessions > 1 ? 's' : ''} fermée${revokedSessions > 1 ? 's' : ''}).`,
      deepLink: '/profile/security',
    });
    return this.devices(auth);
  }

  private async notify(userId: string, input: NotificationInput) {
    await this.notifications
      .notify(userId, input)
      .catch((error: unknown) => this.logger.warn({ err: error, userId }, 'Notification de sécurité non envoyée'));
  }
}

function accountLocked(lockedUntil: Date) {
  return new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_LOCKED', 'Trop de tentatives. Compte temporairement bloqué.', {
    lockedUntil: lockedUntil.toISOString(),
  });
}
