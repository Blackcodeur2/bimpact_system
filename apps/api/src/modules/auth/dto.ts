import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsEmail,
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

export const USERNAME_RE = /^[a-zA-Z0-9._-]{3,30}$/;

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

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  @MaxLength(254)
  email: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @Matches(USERNAME_RE, {
    message: "Le nom d'utilisateur doit contenir 3 à 30 caractères (lettres, chiffres, tirets, underscores ou points).",
  })
  username: string;

  @IsString()
  @Length(8, 128, { message: 'Le mot de passe doit contenir au moins 8 caractères.' })
  password: string;

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

export class LoginDto {
  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  pin?: string;

  @Transform(({ value, obj }) => {
    const raw = value ?? obj?.phone;
    return typeof raw === 'string' ? raw.trim().toLowerCase() : raw;
  })
  @IsString()
  @Length(3, 254, { message: "L'identifiant doit contenir au moins 3 caractères." })
  identifier: string;

  @Transform(({ value, obj }) => value ?? obj?.pin)
  @IsString()
  @Length(1, 128, { message: 'Le mot de passe est obligatoire.' })
  password: string;

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

/** Connexion back-office. Le mot de passe n'est pas contraint ici : la politique s'applique à sa création. */
export class StaffLoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Adresse e-mail invalide.' })
  @MaxLength(254)
  email: string;

  @IsString()
  @Length(1, 128)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @Length(1, 128)
  currentPassword: string;

  @IsString()
  @Length(1, 256)
  newPassword: string;
}

export class ChangePinDto {
  @Matches(PIN_RE, { message: 'Le code PIN doit contenir exactement 6 chiffres.' })
  currentPin: string;

  @Matches(PIN_RE, { message: 'Le code PIN doit contenir exactement 6 chiffres.' })
  newPin: string;
}
