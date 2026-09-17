import { CanActivate, ExecutionContext, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import {
  ACCESS_AUTHENTICATED,
  ACCESS_PERMISSIONS,
  ACCESS_PUBLIC,
} from '../../common/access/access.decorators';
import { AppException } from '../../common/errors/app-exception';
import type { AppRequest, AuthContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import type { AccessTokenPayload } from './token.service';

/**
 * Authentifie la requête : JWT valide ET session non révoquée ET compte actif.
 * La vérification en base permet la révocation immédiate (déconnexion, appareil volé, suspension).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<AppRequest>();
    const isPublic = this.reflector.getAllAndOverride<boolean>(ACCESS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);

    try {
      req.auth = await this.authenticate(req);
      return true;
    } catch (error) {
      if (isPublic) return true;
      throw error;
    }
  }

  private async authenticate(req: AppRequest): Promise<AuthContext> {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    if (!token) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Authentification requise.');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'ACCESS_TOKEN_INVALID', 'Session expirée. Veuillez actualiser.');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: {
          select: {
            status: true,
            kind: true,
            mustChangePassword: true,
            roles: {
              select: {
                role: {
                  select: { code: true, permissions: { select: { permission: { select: { code: true } } } } },
                },
              },
            },
          },
        },
      },
    });

    if (!session || session.userId !== payload.sub || session.revokedAt || session.expiresAt <= new Date()) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'SESSION_REVOKED', 'Session terminée. Reconnectez-vous.');
    }
    if (session.user.status !== 'ACTIVE') {
      throw new AppException(HttpStatus.FORBIDDEN, 'ACCOUNT_NOT_ACTIVE', "Ce compte n'est pas actif.");
    }

    const roles = session.user.roles.map((r) => r.role.code);
    const permissions = new Set(
      session.user.roles.flatMap((r) => r.role.permissions.map((p) => p.permission.code)),
    );
    return {
      userId: session.userId,
      sessionId: payload.sid,
      kind: session.user.kind,
      roles,
      permissions,
      mustChangePassword: session.user.mustChangePassword,
    };
  }
}

/**
 * Applique la politique d'accès déclarée sur la route.
 * Défaut sûr : une route sans @Public, @Authenticated ou @RequirePermissions est refusée.
 */
@Injectable()
export class AccessPolicyGuard implements CanActivate {
  private readonly logger = new Logger(AccessPolicyGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(ACCESS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<AppRequest>();
    if (!req.auth) {
      throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Authentification requise.');
    }

    const required = this.reflector.getAllAndOverride<string[] | undefined>(ACCESS_PERMISSIONS, targets);
    if (required?.length) {
      if (req.auth.mustChangePassword) {
        throw new AppException(
          HttpStatus.FORBIDDEN,
          'PASSWORD_CHANGE_REQUIRED',
          'Remplacez votre mot de passe temporaire avant de continuer.',
        );
      }
      if (required.every((permission) => req.auth!.permissions.has(permission))) return true;
      throw new AppException(
        HttpStatus.FORBIDDEN,
        'FORBIDDEN',
        "Vous n'avez pas l'autorisation d'effectuer cette action.",
      );
    }

    if (this.reflector.getAllAndOverride<boolean>(ACCESS_AUTHENTICATED, targets)) return true;

    this.logger.error(`Route sans politique d'accès déclarée : ${req.method} ${req.path}`);
    throw new AppException(HttpStatus.FORBIDDEN, 'ACCESS_POLICY_MISSING', 'Accès refusé.');
  }
}
