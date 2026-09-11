import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CAMEROON_MOBILE_RE, normalizeCameroonPhone } from './phone';

export const PIN_RE = /^\d{6}$/;

const cleanText = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class DeviceDto {
  /** UUID généré une fois par installation de l'application. */
  @IsUUID()
  installationId: string;

  @IsIn(['android', 'ios', 'web'])
  platform: 'android' | 'ios' | 'web';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;
}

export class PhoneDto {
  @Transform(({ value }) => normalizeCameroonPhone(value))
  @Matches(CAMEROON_MOBILE_RE, { message: 'Numéro mobile camerounais invalide (ex. 6 12 34 56 78).' })
  phone: string;
}

export class RegisterDto extends PhoneDto {
  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  firstName: string;

  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  lastName: string;

  @Transform(cleanText)
  @IsString()
  @Length(2, 60)
  city: string;

  @IsOptional()
  @Transform(cleanText)
  @IsString()
  @MaxLength(60)
  zone?: string;

  @Matches(PIN_RE, { message: 'Le code PIN doit contenir exactement 6 chiffres.' })
  pin: string;

  @Equals(true, { message: 'Vous devez accepter les conditions d’utilisation.' })
  acceptTerms: boolean;

  @Equals(true, { message: 'Vous devez accepter la politique de confidentialité.' })
  acceptPrivacy: boolean;
}

export class OtpRequestDto extends PhoneDto {
  @IsIn(['REGISTER'])
  purpose: 'REGISTER';
}

export class OtpVerifyDto {
  @IsUUID()
  challengeId: string;

  @Matches(/^\d{6}$/, { message: 'Le code doit contenir 6 chiffres.' })
  code: string;

  @ValidateNested()
  @Type(() => DeviceDto)
  device: DeviceDto;
}

export class LoginDto extends PhoneDto {
  @Matches(PIN_RE, { message: 'Le code PIN doit contenir exactement 6 chiffres.' })
  pin: string;

  @ValidateNested()
  @Type(() => DeviceDto)
  device: DeviceDto;
}

export class RefreshDto {
  @IsString()
  @Length(40, 128)
  refreshToken: string;
}

/** Code PIN oublié — étape 1 : envoi d'un code par SMS. */
export class PinResetRequestDto extends PhoneDto {}

/** Code PIN oublié — étape 2 : code SMS + nouveau PIN ; ferme toutes les sessions existantes. */
export class PinResetConfirmDto {
  @IsUUID()
  challengeId: string;

  @Matches(/^\d{6}$/, { message: 'Le code doit contenir 6 chiffres.' })
  code: string;

  @Matches(PIN_RE, { message: 'Le code PIN doit contenir exactement 6 chiffres.' })
  newPin: string;

  @ValidateNested()
  @Type(() => DeviceDto)
  device: DeviceDto;
}

export class ChangePinDto {
  @Matches(PIN_RE, { message: 'Le code PIN doit contenir exactement 6 chiffres.' })
  currentPin: string;

  @Matches(PIN_RE, { message: 'Le code PIN doit contenir exactement 6 chiffres.' })
  newPin: string;
}
