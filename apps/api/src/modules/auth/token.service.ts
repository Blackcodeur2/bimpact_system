import { randomBytes, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { UserKind } from '@prisma/client';
import { sha256Hex } from '../../common/crypto';
import { AppException } from '../../common/errors/app-exception';
import type { RequestContext } from '../../common/request-context';
import { AppConfig } from '../../config/app-config';
import { PrismaService, Tx } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  kind: UserKind;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

type RotateError = 'INVALID_REFRESH_TOKEN' | 'REFRESH_TOKEN_REUSED' | 'SESSION_EXPIRED' | 'ACCOUNT_NOT_ACTIVE';
type RotateOutcome = { ok: true; pair: TokenPair } | { ok: false; error: RotateError };

/** Fenêtre pendant laquelle un refresh token tout juste remplacé est refusé sans révoquer la famille (retry réseau). */
const ROTATION_GRACE_MS = 10_000;

/**
 * Sessions : access token JWT court + refresh token opaque rotatif.
 * La réutilisation d'un refresh token déjà remplacé révoque toute la famille de sessions.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  async issueSession(
    tx: Tx,
    params: { userId: string; kind: UserKind; deviceId?: string; familyId?: string },
    ctx: RequestContext,
  ): Promise<TokenPair & { sessionId: string }> {
    const refreshToken = randomBytes(48).toString('base64url');
    const session = await tx.session.create({
      data: {
        userId: params.userId,
        deviceId: params.deviceId,
        familyId: params.familyId ?? randomUUID(),
        refreshTokenHash: sha256Hex(refreshToken),
        expiresAt: new Date(Date.now() + this.config.jwt.refreshTtlDays * 86_400_000),
        ipHash: ctx.ipHash,
        userAgent: ctx.userAgent,
      },
    });
    const payload: AccessTokenPayload = { sub: params.userId, sid: session.id, kind: params.kind };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: this.config.jwt.accessTtlSeconds });
    return {
      sessionId: session.id,
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.jwt.accessTtlSeconds,
    };
  }

  async rotate(refreshToken: string, ctx: RequestContext): Promise<TokenPair> {
    const hash = sha256Hex(refreshToken);
    const outcome = await this.prisma.$transaction(async (tx): Promise<RotateOutcome> => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM sessions WHERE refresh_token_hash = ${hash} FOR UPDATE`;
      const sessionId = locked[0]?.id;
      if (!sessionId) return { ok: false, error: 'INVALID_REFRESH_TOKEN' };

      const session = await tx.session.findUniqueOrThrow({
        where: { id: sessionId },
        include: { user: { select: { status: true, kind: true } } },
      });
      const now = Date.now();

      if (session.revokedAt) {
        const recentlyRotated =
          session.revokedReason === 'ROTATED' && now - session.revokedAt.getTime() <= ROTATION_GRACE_MS;
        if (session.revokedReason === 'ROTATED' && !recentlyRotated) {
          await this.revokeFamily(tx, session.familyId, 'REUSE_DETECTED');
          await this.audit.record(
            {
              action: 'auth.refresh.reuse_detected',
              resourceType: 'session',
              resourceId: session.id,
              actorId: session.userId,
              actorType: session.user.kind,
              metadata: { familyId: session.familyId },
            },
            ctx,
            tx,
          );
          return { ok: false, error: 'REFRESH_TOKEN_REUSED' };
        }
        return { ok: false, error: 'INVALID_REFRESH_TOKEN' };
      }
      if (session.expiresAt.getTime() <= now) return { ok: false, error: 'SESSION_EXPIRED' };
      if (session.user.status !== 'ACTIVE') return { ok: false, error: 'ACCOUNT_NOT_ACTIVE' };

      const next = await this.issueSession(
        tx,
        { userId: session.userId, kind: session.user.kind, deviceId: session.deviceId ?? undefined, familyId: session.familyId },
        ctx,
      );
      await tx.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date(now), revokedReason: 'ROTATED', replacedById: next.sessionId, lastUsedAt: new Date(now) },
      });
      const { sessionId: _ignored, ...pair } = next;
      return { ok: true, pair };
    });

    if (!outcome.ok) {
      const messages: Record<RotateError, string> = {
        INVALID_REFRESH_TOKEN: 'Session invalide. Reconnectez-vous.',
        REFRESH_TOKEN_REUSED: 'Session révoquée pour votre sécurité. Reconnectez-vous.',
        SESSION_EXPIRED: 'Session expirée. Reconnectez-vous.',
        ACCOUNT_NOT_ACTIVE: "Ce compte n'est pas actif.",
      };
      throw new AppException(HttpStatus.UNAUTHORIZED, outcome.error, messages[outcome.error]);
    }
    return outcome.pair;
  }

  async revoke(tx: Tx, sessionId: string, reason: string): Promise<void> {
    await tx.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  private async revokeFamily(tx: Tx, familyId: string, reason: string): Promise<void> {
    await tx.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}
