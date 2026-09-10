import { Body, Controller, HttpCode, HttpStatus, Module, Post } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Authenticated, Public } from '../../common/access/access.decorators';
import { AuthContext, Ctx, CurrentAuth, RequestContext } from '../../common/request-context';
import { AppConfig } from '../../config/app-config';
import { UsersModule } from '../users/users.module';
import { WalletModule } from '../wallet/wallet.module';
import { AccessPolicyGuard, JwtAuthGuard } from './auth.guards';
import { AuthService } from './auth.service';
import { LoginDto, OtpRequestDto, OtpVerifyDto, RefreshDto, RegisterDto } from './dto';
import { DevLogOtpSender, OTP_SENDER, OtpService, UnconfiguredOtpSender } from './otp.service';
import { PinService } from './pin.service';
import { TokenService } from './token.service';

const PER_MINUTE = 60_000;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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

@Module({
  imports: [
    UsersModule,
    WalletModule,
    JwtModule.registerAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        secret: config.jwt.secret,
        signOptions: { issuer: 'benskin-impact', audience: 'benskin-api', algorithm: 'HS256' },
        verifyOptions: { issuer: 'benskin-impact', audience: 'benskin-api', algorithms: ['HS256'] },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    PinService,
    TokenService,
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
  exports: [TokenService],
})
export class AuthModule {}
