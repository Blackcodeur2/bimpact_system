import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { buildPinoHttpOptions } from './common/logging';
import { RequestContextMiddleware } from './common/request-context';
import { AppConfig, AppConfigModule } from './config/app-config';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database/prisma.service';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { KycModule } from './modules/kyc/kyc.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { UsersModule } from './modules/users/users.module';
import { WalletModule } from './modules/wallet/wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Lancée depuis apps/api : le .env partagé est à la racine du monorepo.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    AppConfigModule,
    LoggerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({ pinoHttp: buildPinoHttpOptions(config) }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        // Stockage mémoire pour l'instant ; passage au stockage Redis avec BullMQ (multi-instances).
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        skipIf: () => config.isTest,
      }),
    }),
    PrismaModule,
    AuditModule,
    HealthModule,
    LedgerModule,
    WalletModule,
    UsersModule,
    AuthModule,
    KycModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('{*splat}');
  }
}
