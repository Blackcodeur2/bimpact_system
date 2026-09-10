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

  /** Fournisseur de paiement. Seul le bac à sable existe tant qu'aucun opérateur agréé n'est contractualisé. */
  @IsIn(['sandbox'])
  PAYMENT_PROVIDER: 'sandbox' = 'sandbox';

  /** Secret HMAC des webhooks du bac à sable ; généré au démarrage s'il est absent. */
  @IsOptional()
  @IsString()
  @MinLength(32)
  PAYMENTS_SANDBOX_WEBHOOK_SECRET?: string;

  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(300)
  PAYMENTS_SANDBOX_CONFIRM_DELAY_SECONDS = 6;

  @Transform(toBool)
  @IsBoolean()
  PAYMENTS_SANDBOX_AUTO_CONFIRM = true;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  PAYMENT_MIN_AMOUNT = 500;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  PAYMENT_MAX_AMOUNT = 500_000;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  PAYMENT_DAILY_LIMIT = 1_000_000;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(1440)
  PAYMENT_INTENT_TTL_MINUTES = 15;

  /** Montant de la contribution quotidienne en FCFA (signature du programme : 200). */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  CONTRIBUTION_DAILY_AMOUNT = 200;

  /** Heure (Cameroun) à partir de laquelle le prélèvement automatique du jour est exécuté. */
  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(23)
  CONTRIBUTION_AUTO_DEBIT_HOUR = 7;

  /** Heure (Cameroun) du rappel pour les contributions non payées. */
  @Transform(toInt)
  @IsInt()
  @Min(0)
  @Max(23)
  CONTRIBUTION_REMINDER_HOUR = 18;

  /** Secret HMAC des jetons anonymes des participants aux tirages ; généré au démarrage s'il est absent. */
  @IsOptional()
  @IsString()
  @MinLength(32)
  DRAW_TOKEN_SECRET?: string;

  /** Règle d'éligibilité par défaut : jours de contribution payés sur la période observée. */
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(365)
  DRAW_DEFAULT_MIN_PAID_DAYS = 20;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(365)
  DRAW_DEFAULT_WINDOW_DAYS = 30;

  /** Tâches récurrentes (expiration des paiements, contributions programmées…). Toujours coupées en test. */
  @Transform(toBool)
  @IsBoolean()
  JOBS_ENABLED = true;
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
  if (env.NODE_ENV === 'production' && env.PAYMENT_PROVIDER === 'sandbox') {
    throw new Error('Configuration invalide — le fournisseur de paiement sandbox est interdit en production');
  }
  if (env.PAYMENT_MIN_AMOUNT > env.PAYMENT_MAX_AMOUNT) {
    throw new Error('Configuration invalide — PAYMENT_MIN_AMOUNT doit être inférieur à PAYMENT_MAX_AMOUNT');
  }
  return env;
}
