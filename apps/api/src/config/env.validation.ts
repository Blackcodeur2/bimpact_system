import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

type Raw = { value: unknown };
const toInt = ({ value }: Raw) =>
  value === undefined || value === '' ? undefined : Number(value);
const toBool = ({ value }: Raw) =>
  value === undefined || value === '' ? undefined : value === true || value === 'true' || value === '1';

export type NodeEnv = 'development' | 'test' | 'production';

/** Variables d'environnement acceptées par l'API. Toute valeur invalide empêche le démarrage. */
export class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV: NodeEnv = 'development';

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  API_PORT = 3000;

  @IsString()
  @MinLength(1)
  DATABASE_URL: string;

  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  /** Origines autorisées séparées par des virgules. Vide = aucune origine navigateur autorisée. */
  @IsString()
  CORS_ORIGINS = '';

  @Transform(toBool)
  @IsBoolean()
  TRUST_PROXY = false;

  @Transform(toBool)
  @IsBoolean()
  SWAGGER_ENABLED = false;

  @IsString()
  @MinLength(32)
  JWT_ACCESS_SECRET: string;

  @Transform(toInt)
  @IsInt()
  @Min(60)
  @Max(3600)
  JWT_ACCESS_TTL_SECONDS = 900;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(90)
  JWT_REFRESH_TTL_DAYS = 30;

  @Transform(toInt)
  @IsInt()
  @Min(60)
  @Max(900)
  OTP_TTL_SECONDS = 300;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(10)
  OTP_MAX_ATTEMPTS = 5;

  /** Développement uniquement : le code OTP est écrit dans les logs au lieu d'être envoyé par SMS. */
  @Transform(toBool)
  @IsBoolean()
  OTP_DEV_LOG = false;

  @IsString()
  @MinLength(32)
  OTP_HMAC_SECRET: string;

  @IsString()
  @MinLength(32)
  IP_HASH_SECRET: string;

  /** Secret serveur ajouté au hachage Argon2 des PIN : une fuite de la base seule ne permet pas le brute-force. */
  @IsString()
  @MinLength(32)
  PIN_PEPPER: string;

  /** Dossier des documents chiffrés, relatif au répertoire de lancement de l'API. */
  @IsString()
  @MinLength(1)
  DOCUMENT_STORAGE_DIR = '../../.data/documents';

  /** Clé AES-256-GCM des documents privés : 32 octets encodés en base64. */
  @IsString()
  DOCUMENT_ENCRYPTION_KEY: string;

  /** Secret de signature des URLs temporaires d'accès aux fichiers. */
  @IsString()
  @MinLength(32)
  FILE_URL_SECRET: string;

  @Transform(toInt)
  @IsInt()
  @Min(100_000)
  @Max(20_000_000)
  KYC_DOCUMENT_MAX_BYTES = 5_000_000;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const env = plainToInstance(EnvironmentVariables, config, { exposeDefaultValues: true });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join(' | ');
    throw new Error(`Configuration invalide — ${details}`);
  }
  if (Buffer.from(env.DOCUMENT_ENCRYPTION_KEY, 'base64').length !== 32) {
    throw new Error('Configuration invalide — DOCUMENT_ENCRYPTION_KEY doit contenir 32 octets encodés en base64');
  }
  if (env.NODE_ENV === 'production' && env.OTP_DEV_LOG) {
    throw new Error('Configuration invalide — OTP_DEV_LOG est interdit en production');
  }
  return env;
}
