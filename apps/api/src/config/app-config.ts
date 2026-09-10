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
