import { Body, Controller, Get, HttpCode, HttpStatus, Module, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Authenticated, Public, RequirePermissions } from '../../common/access/access.decorators';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { AppConfig } from '../../config/app-config';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { AccessPolicyGuard, JwtAuthGuard } from './auth.guards';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ChangePinDto,
  LoginDto,
  OtpRequestDto,
  OtpVerifyDto,
  PinResetConfirmDto,
  PinResetRequestDto,
  RefreshDto,
  RegisterDto,
  StaffLoginDto,
} from './dto';
import { DevLogOtpSender, OTP_SENDER, OtpService, UnconfiguredOtpSender } from './otp.service';
import { PasswordService } from './password.service';
import { PinService } from './pin.service';
import { SecurityService } from './security.service';
import { StaffAuthService } from './staff-auth.service';
import { TokenService } from './token.service';

const PER_MINUTE = 60_000;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly staffAuth: StaffAuthService,
  ) {}

  /** Back-office : e-mail + mot de passe. Les comptes membres ne peuvent pas l'utiliser (et inversement). */
  @Public()
  @Throttle({ default: { limit: 5, ttl: PER_MINUTE } })
  @Post('staff/login')
  @HttpCode(HttpStatus.OK)
  staffLogin(@Body() dto: StaffLoginDto, @Ctx() ctx: RequestContext) {
    return this.staffAuth.login(dto, ctx);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: PER_MINUTE } })
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  register(@Body() dto: RegisterDto, @Ctx() ctx: RequestContext) {
    return this.auth.register(dto, ctx);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: PER_MINUTE } })
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  requestOtp(@Body() dto: OtpRequestDto) {
    return this.auth.requestOtp(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: PER_MINUTE } })
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: OtpVerifyDto, @Ctx() ctx: RequestContext) {
    return this.auth.verifyRegistration(dto, ctx);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: PER_MINUTE } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Ctx() ctx: RequestContext) {
    return this.auth.login(dto, ctx);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: PER_MINUTE } })
  @Post('pin-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  requestPinReset(@Body() dto: PinResetRequestDto) {
    return this.auth.requestPinReset(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: PER_MINUTE } })
  @Post('pin-reset/confirm')
  @HttpCode(HttpStatus.OK)
  confirmPinReset(@Body() dto: PinResetConfirmDto, @Ctx() ctx: RequestContext) {
    return this.auth.confirmPinReset(dto, ctx);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: PER_MINUTE } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto, @Ctx() ctx: RequestContext) {
    return this.auth.refresh(dto, ctx);
  }

  @ApiBearerAuth()
  @Authenticated()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@CurrentAuth() auth: AuthContext, @Ctx() ctx: RequestContext) {
    return this.auth.logout(auth, ctx);
  }
}

@ApiTags('security')
@ApiBearerAuth()
@Controller('security')
export class SecurityController {
  constructor(private readonly security: SecurityService) {}

  @RequirePermissions('security.manage.self')
  @Throttle({ default: { limit: 5, ttl: PER_MINUTE } })
  @Post('pin')
  @HttpCode(HttpStatus.OK)
  changePin(@CurrentAuth() auth: AuthContext, @Body() dto: ChangePinDto, @Ctx() ctx: RequestContext) {
    return this.security.changePin(auth, dto, ctx);
  }

  @RequirePermissions('security.manage.self')
  @Get('devices')
  devices(@CurrentAuth() auth: AuthContext) {
    return this.security.devices(auth);
  }

  @RequirePermissions('security.manage.self')
  @Post('devices/:id/revoke')
  @HttpCode(HttpStatus.OK)
  revokeDevice(@CurrentAuth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string, @Ctx() ctx: RequestContext) {
    return this.security.revokeDevice(auth, id, ctx);
  }
}

/** Compte de l'agent connecté. Accessible même avec un mot de passe temporaire, pour pouvoir le remplacer. */
@ApiTags('admin / compte')
@ApiBearerAuth()
@Controller('admin/me')
export class AdminAccountController {
  constructor(private readonly staffAuth: StaffAuthService) {}

  @Authenticated()
  @Get()
  me(@CurrentAuth() auth: AuthContext) {
    return this.staffAuth.me(auth.userId);
  }

  @Authenticated()
  @Throttle({ default: { limit: 5, ttl: PER_MINUTE } })
  @Post('password')
  @HttpCode(HttpStatus.OK)
  changePassword(@CurrentAuth() auth: AuthContext, @Body() dto: ChangePasswordDto, @Ctx() ctx: RequestContext) {
    return this.staffAuth.changePassword(auth, dto, ctx);
  }
}

@Module({
  imports: [
    UsersModule,
    WalletModule,
    NotificationsModule,
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.jwt.secret,
        signOptions: { issuer: 'benskin-impact', audience: 'benskin-api', algorithm: 'HS256' },
        verifyOptions: { issuer: 'benskin-impact', audience: 'benskin-api', algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController, SecurityController, AdminAccountController],
  providers: [
    AuthService,
    StaffAuthService,
    OtpService,
    PinService,
    PasswordService,
    TokenService,
    SecurityService,
    {
      provide: OTP_SENDER,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => (config.otp.devLog ? new DevLogOtpSender() : new UnconfiguredOtpSender()),
    },
    // Ordre des gardes globales : limitation de débit → authentification → politique d'accès.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AccessPolicyGuard },
  ],
  exports: [TokenService, PasswordService],
})
export class AuthModule {}
