import { randomInt, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { OtpPurpose } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { AppConfig } from '../../src/config/app-config';
import { PrismaService } from '../../src/database/prisma.service';
import { OTP_SENDER, OtpSender } from '../../src/modules/auth/otp.service';

/** Remplace l'envoi SMS : les codes sont capturés pour être saisis par le test. */
export class CapturingOtpSender implements OtpSender {
  readonly sent: { phone: string; code: string; purpose: OtpPurpose }[] = [];

  async send(phone: string, code: string, purpose: OtpPurpose) {
    this.sent.push({ phone, code, purpose });
  }

  lastCodeFor(phone: string): string {
    const entry = [...this.sent].reverse().find((s) => s.phone === phone);
    if (!entry) throw new Error(`Aucun OTP envoyé à ${phone}`);
    return entry.code;
  }
}

export interface TestContext {
  app: INestApplication;
  otp: CapturingOtpSender;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestContext> {
  const otp = new CapturingOtpSender();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(OTP_SENDER)
    .useValue(otp)
    .compile();
  const app = moduleRef.createNestApplication({ logger: ['error', 'warn'], rawBody: true });
  configureApp(app, app.get(AppConfig));
  await app.init();
  return { app, otp, prisma: app.get(PrismaService), http: () => request(app.getHttpServer()) };
}

export function uniquePhone(): string {
  return `+2376${randomInt(0, 100_000_000).toString().padStart(8, '0')}`;
}

export const TEST_PIN = '408215';

export function newDevice() {
  return { installationId: randomUUID(), platform: 'android' as const, model: 'Pixel 4a', appVersion: '0.1.0' };
}

export interface RegisteredMember {
  phone: string;
  pin: string;
  device: ReturnType<typeof newDevice>;
  tokens: { accessToken: string; refreshToken: string };
  user: { id: string; roles: string[]; permissions: string[] };
}

/** Parcours complet inscription → OTP → compte actif. */
export async function registerMember(ctx: TestContext): Promise<RegisteredMember> {
  const phone = uniquePhone();
  const device = newDevice();
  const registration = await ctx
    .http()
    .post('/v1/auth/register')
    .send({
      phone,
      firstName: 'Awa',
      lastName: 'Ngono',
      city: 'Douala',
      pin: TEST_PIN,
      acceptTerms: true,
      acceptPrivacy: true,
    })
    .expect(202);

  const verification = await ctx
    .http()
    .post('/v1/auth/otp/verify')
    .send({ challengeId: registration.body.otp.challengeId, code: ctx.otp.lastCodeFor(phone), device })
    .expect(200);

  return { phone, pin: TEST_PIN, device, tokens: verification.body.tokens, user: verification.body.user };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
