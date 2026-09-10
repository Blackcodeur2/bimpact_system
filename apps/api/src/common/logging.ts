import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Options } from 'pino-http';
import type { AppConfig } from '../config/app-config';
import { UUID_RE } from './crypto';
import type { AppRequest } from './request-context';

/** Logs JSON structurés avec request_id, user_id, latence et statut ; secrets masqués. */
export function buildPinoHttpOptions(config: AppConfig): Options {
  return {
    level: config.isTest ? 'warn' : config.isProduction ? 'info' : 'debug',
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const header = req.headers['x-request-id'];
      const id = typeof header === 'string' && UUID_RE.test(header) ? header : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customProps: (req: IncomingMessage) => ({ userId: (req as AppRequest).auth?.userId }),
    serializers: {
      req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["idempotency-key"]'],
      censor: '[REDACTED]',
    },
    autoLogging: { ignore: (req: IncomingMessage) => req.url === '/health' || req.url === '/ready' },
    quietReqLogger: true,
    transport:
      config.isProduction || config.isTest
        ? undefined
        : { target: 'pino-pretty', options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' } },
  };
}
