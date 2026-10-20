import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express, { Express, Request, Response } from 'express';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AppConfig } from '../src/config/app-config';

let cachedServer: Express;

async function bootstrapServer(): Promise<Express> {
  const expressApp = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressApp),
    { bufferLogs: true, rawBody: true },
  );

  app.useLogger(app.get(Logger));

  const config = app.get(AppConfig);
  configureApp(app, config);

  if (config.swaggerEnabled) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('BENSKIN IMPACT API')
        .setDescription('200 FCFA aujourd’hui. Une opportunité demain.')
        .setVersion('1')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  await app.init();
  return expressApp;
}

export default async function handler(req: Request, res: Response) {
  if (!cachedServer) {
    cachedServer = await bootstrapServer();
  }
  // Si la requête arrive préfixée par /api, on la normalise pour NestJS
  if (req.url.startsWith('/api/')) {
    req.url = req.url.replace(/^\/api/, '');
  }
  cachedServer(req, res);
}
