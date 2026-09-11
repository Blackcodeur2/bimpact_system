import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { buildPinoHttpOptions } from './common/logging';
import { RequestContextMiddleware } from './common/request-context';
import { AppConfig, AppConfigModule } from './config/app-config';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './database/prisma.service';
import { AccidentsModule } from './modules/accidents/accidents.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ContributionsModule } from './modules/contributions/contributions.module';
import { DrawsModule } from './modules/draws/draws.module';
import { HealthModule } from './modules/health/health.module';
import { KycModule } from './modules/kyc/kyc.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PlatformModule } from './modules/platform/platform.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { RecruitmentModule } from './modules/recruitment/recruitment.module';
import { SettingsModule } from './modules/settings/settings.module';
import { SolidarityModule } from './modules/solidarity/solidarity.module';
import { SupportModule } from './modules/support/support.module';
import { TrainingModule } from './modules/training/training.module';
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
    SettingsModule,
    HealthModule,
    PlatformModule,
    LedgerModule,
    WalletModule,
    UsersModule,
    AuthModule,
    KycModule,
    NotificationsModule,
    PaymentsModule,
    ContributionsModule,
    DrawsModule,
    TrainingModule,
    ProjectsModule,
    CompaniesModule,
    RecruitmentModule,
    SolidarityModule,
    AccidentsModule,
    SupportModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('{*splat}');
  }
}
