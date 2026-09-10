import { INestApplication, RequestMethod } from '@nestjs/common';
import type { Express } from 'express';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { createValidationPipe } from './common/validation';
import { AppConfig } from './config/app-config';

/** Configuration HTTP partagée entre main.ts et les tests E2E. */
export function configureApp(app: INestApplication, config: AppConfig) {
  const express = app.getHttpAdapter().getInstance() as Express;
  express.disable('x-powered-by');
  if (config.trustProxy) {
    express.set('trust proxy', 1);
  }

  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins.length > 0 ? config.corsOrigins : false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id'],
  });

  app.setGlobalPrefix('v1', {
    exclude: [
      { path: 'health', method: RequestMethod.GET },
      { path: 'ready', method: RequestMethod.GET },
    ],
  });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
}
