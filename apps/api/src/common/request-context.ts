import { createHmac } from 'node:crypto';
import {
  createParamDecorator,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestMiddleware,
} from '@nestjs/common';
import type { UserKind } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { AppConfig } from '../config/app-config';
import { AppException } from './errors/app-exception';

export interface AuthContext {
  userId: string;
  sessionId: string;
  kind: UserKind;
  roles: string[];
  permissions: ReadonlySet<string>;
}

export type AppRequest = Request & {
  id?: string;
  ipHash?: string;
  auth?: AuthContext;
};

/** Contexte passé explicitement aux services pour l'audit et la traçabilité. */
export interface RequestContext {
  requestId?: string;
  ipHash?: string;
  userAgent?: string;
  auth?: AuthContext;
}

/** Calcule une empreinte HMAC de l'IP : on trace sans stocker l'adresse en clair. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly config: AppConfig) {}

  use(req: AppRequest, _res: Response, next: NextFunction) {
    const ip = req.ip ?? req.socket.remoteAddress;
    if (ip) {
      req.ipHash = createHmac('sha256', this.config.ipHashSecret).update(ip).digest('hex').slice(0, 32);
    }
    next();
  }
}

export const Ctx = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  return {
    requestId: req.id,
    ipHash: req.ipHash,
    userAgent: req.headers['user-agent']?.slice(0, 255),
    auth: req.auth,
  };
});

/** Contexte d'authentification de la requête ; lève 401 s'il est absent. */
export const CurrentAuth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.auth) {
    throw new AppException(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', 'Authentification requise.');
  }
  return req.auth;
});
