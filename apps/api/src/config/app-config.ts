import { randomBytes } from 'node:crypto';
import { Global, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from './env.validation';

/** Accès typé à la configuration validée. */
@Injectable()
export class AppConfig {
  constructor(private readonly config: ConfigService<EnvironmentVariables, true>) {}

  private get<K extends keyof EnvironmentVariables>(key: K): EnvironmentVariables[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv() {
    return this.get('NODE_ENV');
  }

  get isProduction() {
    return this.nodeEnv === 'production';
  }

  get isTest() {
    return this.nodeEnv === 'test';
  }

  get port() {
    return this.get('API_PORT');
  }

  get corsOrigins(): string[] {
    return this.get('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  get trustProxy() {
    return this.get('TRUST_PROXY');
  }

  get swaggerEnabled() {
    return !this.isProduction || this.get('SWAGGER_ENABLED');
  }

  get jwt() {
    return {
      secret: this.get('JWT_ACCESS_SECRET'),
      accessTtlSeconds: this.get('JWT_ACCESS_TTL_SECONDS'),
      refreshTtlDays: this.get('JWT_REFRESH_TTL_DAYS'),
    };
  }

  get otp() {
    return {
      ttlSeconds: this.get('OTP_TTL_SECONDS'),
      maxAttempts: this.get('OTP_MAX_ATTEMPTS'),
      devLog: this.get('OTP_DEV_LOG'),
      hmacSecret: this.get('OTP_HMAC_SECRET'),
    };
  }

  get ipHashSecret() {
    return this.get('IP_HASH_SECRET');
  }

  get pinPepper() {
    return this.get('PIN_PEPPER');
  }

  private generatedSandboxSecret?: string;

  get payments() {
    this.generatedSandboxSecret ??= randomBytes(32).toString('hex');
    return {
      provider: this.get('PAYMENT_PROVIDER'),
      sandboxWebhookSecret: this.get('PAYMENTS_SANDBOX_WEBHOOK_SECRET') ?? this.generatedSandboxSecret,
      sandboxConfirmDelaySeconds: this.get('PAYMENTS_SANDBOX_CONFIRM_DELAY_SECONDS'),
      // En test, les confirmations sont déclenchées explicitement par les scénarios.
      sandboxAutoConfirm: !this.isTest && this.get('PAYMENTS_SANDBOX_AUTO_CONFIRM'),
      minAmount: this.get('PAYMENT_MIN_AMOUNT'),
      maxAmount: this.get('PAYMENT_MAX_AMOUNT'),
      dailyLimit: this.get('PAYMENT_DAILY_LIMIT'),
      intentTtlMinutes: this.get('PAYMENT_INTENT_TTL_MINUTES'),
    };
  }

  private generatedDrawSecret?: string;

  get draws() {
    this.generatedDrawSecret ??= randomBytes(32).toString('hex');
    return {
      tokenSecret: this.get('DRAW_TOKEN_SECRET') ?? this.generatedDrawSecret,
      defaultMinPaidDays: this.get('DRAW_DEFAULT_MIN_PAID_DAYS'),
      defaultWindowDays: this.get('DRAW_DEFAULT_WINDOW_DAYS'),
    };
  }

  get contributions() {
    return {
      dailyAmount: this.get('CONTRIBUTION_DAILY_AMOUNT'),
      autoDebitHour: this.get('CONTRIBUTION_AUTO_DEBIT_HOUR'),
      reminderHour: this.get('CONTRIBUTION_REMINDER_HOUR'),
    };
  }

  get jobsEnabled() {
    return !this.isTest && this.get('JOBS_ENABLED');
  }

  get documents() {
    return {
      storageDir: this.get('DOCUMENT_STORAGE_DIR'),
      encryptionKey: Buffer.from(this.get('DOCUMENT_ENCRYPTION_KEY'), 'base64'),
      fileUrlSecret: this.get('FILE_URL_SECRET'),
      maxBytes: this.get('KYC_DOCUMENT_MAX_BYTES'),
    };
  }
}

@Global()
@Module({ providers: [AppConfig], exports: [AppConfig] })
export class AppConfigModule {}
