import { randomInt } from 'node:crypto';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { OtpPurpose } from '@prisma/client';
import { hmacHex, safeEqualHex } from '../../common/crypto';
import { AppException } from '../../common/errors/app-exception';
import { AppConfig } from '../../config/app-config';
import { PrismaService, Tx } from '../../database/prisma.service';
import { maskPhone } from './phone';

export const OTP_SENDER = Symbol('OTP_SENDER');

/** Abstraction d'envoi (SMS agrégateur, WhatsApp…) — le fournisseur réel sera branché plus tard. */
export interface OtpSender {
  send(phone: string, code: string, purpose: OtpPurpose): Promise<void>;
}

/** Développement uniquement (interdit en production par la validation de configuration). */
@Injectable()
export class DevLogOtpSender implements OtpSender {
  private readonly logger = new Logger('OTP');

  async send(phone: string, code: string, purpose: OtpPurpose) {
    this.logger.warn(`[DEV] Code ${purpose} pour ${maskPhone(phone)} : ${code}`);
  }
}

@Injectable()
export class UnconfiguredOtpSender implements OtpSender {
  async send(): Promise<void> {
    throw new AppException(
      HttpStatus.SERVICE_UNAVAILABLE,
      'SMS_PROVIDER_UNAVAILABLE',
      "L'envoi de SMS n'est pas encore disponible. Réessayez plus tard.",
    );
  }
}

export interface OtpIssued {
  challengeId: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_PER_HOUR = 5;

@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    @Inject(OTP_SENDER) private readonly sender: OtpSender,
  ) {}

  async issue(phone: string, purpose: OtpPurpose): Promise<OtpIssued> {
    const now = Date.now();
    const recent = await this.prisma.otpChallenge.findMany({
      where: { phone, purpose, createdAt: { gte: new Date(now - 3_600_000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const last = recent[0];
    if (last && now - last.createdAt.getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000) {
      const retryAfterSeconds = Math.ceil(
        (last.createdAt.getTime() + OTP_RESEND_COOLDOWN_SECONDS * 1000 - now) / 1000,
      );
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'OTP_RESEND_TOO_SOON',
        `Patientez ${retryAfterSeconds} secondes avant de demander un nouveau code.`,
        { retryAfterSeconds },
      );
    }
    if (recent.length >= OTP_MAX_PER_HOUR) {
      const oldest = recent[recent.length - 1]!;
      const retryAfterSeconds = Math.ceil((oldest.createdAt.getTime() + 3_600_000 - now) / 1000);
      throw new AppException(
        HttpStatus.TOO_MANY_REQUESTS,
        'OTP_RATE_LIMITED',
        'Trop de codes demandés. Réessayez plus tard.',
        { retryAfterSeconds },
      );
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const expiresAt = new Date(now + this.config.otp.ttlSeconds * 1000);

    const challenge = await this.prisma.$transaction(async (tx) => {
      // Un seul code actif à la fois : les précédents sont invalidés.
      await tx.otpChallenge.updateMany({
        where: { phone, purpose, consumedAt: null },
        data: { consumedAt: new Date(now) },
      });
      return tx.otpChallenge.create({
        data: {
          phone,
          purpose,
          codeHash: this.hash(phone, purpose, code),
          maxAttempts: this.config.otp.maxAttempts,
          expiresAt,
        },
      });
    });

    await this.sender.send(phone, code, purpose);

    return {
      challengeId: challenge.id,
      expiresAt,
      resendAvailableAt: new Date(now + OTP_RESEND_COOLDOWN_SECONDS * 1000),
    };
  }

  /**
   * Vérifie le code sans le consommer. Chaque échec est persisté (compteur de tentatives),
   * d'où une transaction dédiée, distincte de celle qui consommera le code.
   */
  async verify(challengeId: string, code: string, purpose: OtpPurpose): Promise<{ phone: string }> {
    const outcome = await this.prisma.$transaction(async (tx): Promise<VerifyOutcome> => {
      await tx.$queryRaw`SELECT id FROM otp_challenges WHERE id = ${challengeId}::uuid FOR UPDATE`;
      const challenge = await tx.otpChallenge.findUnique({ where: { id: challengeId } });

      if (!challenge || challenge.purpose !== purpose) return { ok: false, error: 'OTP_INVALID' };
      if (challenge.consumedAt) return { ok: false, error: 'OTP_NO_LONGER_VALID' };
      if (challenge.expiresAt.getTime() <= Date.now()) return { ok: false, error: 'OTP_EXPIRED' };
      if (challenge.attempts >= challenge.maxAttempts) return { ok: false, error: 'OTP_ATTEMPTS_EXCEEDED' };

      if (!safeEqualHex(this.hash(challenge.phone, purpose, code), challenge.codeHash)) {
        const attempts = challenge.attempts + 1;
        await tx.otpChallenge.update({ where: { id: challenge.id }, data: { attempts } });
        return { ok: false, error: 'OTP_INVALID', remainingAttempts: challenge.maxAttempts - attempts };
      }
      return { ok: true, phone: challenge.phone };
    });

    if (!outcome.ok) throw otpError(outcome.error, outcome.remainingAttempts);
    return { phone: outcome.phone };
  }

  /** Consomme le code dans la transaction métier ; empêche toute double utilisation concurrente. */
  async consume(tx: Tx, challengeId: string): Promise<void> {
    const { count } = await tx.otpChallenge.updateMany({
      where: { id: challengeId, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (count !== 1) throw otpError('OTP_NO_LONGER_VALID');
  }

  private hash(phone: string, purpose: OtpPurpose, code: string): string {
    return hmacHex(this.config.otp.hmacSecret, `${purpose}:${phone}:${code}`);
  }
}

type OtpErrorCode = 'OTP_INVALID' | 'OTP_NO_LONGER_VALID' | 'OTP_EXPIRED' | 'OTP_ATTEMPTS_EXCEEDED';

type VerifyOutcome =
  | { ok: true; phone: string }
  | { ok: false; error: OtpErrorCode; remainingAttempts?: number };

function otpError(code: OtpErrorCode, remainingAttempts?: number) {
  const messages = {
    OTP_INVALID: 'Code incorrect.',
    OTP_NO_LONGER_VALID: "Ce code n'est plus valide. Demandez un nouveau code.",
    OTP_EXPIRED: 'Ce code a expiré. Demandez un nouveau code.',
    OTP_ATTEMPTS_EXCEEDED: 'Trop de tentatives. Demandez un nouveau code.',
  };
  return new AppException(
    HttpStatus.BAD_REQUEST,
    code,
    messages[code],
    remainingAttempts === undefined ? {} : { remainingAttempts },
  );
}
