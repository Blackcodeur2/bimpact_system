import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../../common/errors/app-exception';
import { Decimal } from '../../common/money';
import type { RequestContext } from '../../common/request-context';
import { PrismaService } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';

type SettingType = 'boolean' | 'integer' | 'amount' | 'version' | 'text';

export interface SettingDefinition {
  type: SettingType;
  default: string;
  description: string;
  min?: number;
  max?: number;
  maxLength?: number;
}

const definitions = {
  'solidarity.enabled': {
    type: 'boolean',
    default: 'false',
    description: 'Active les collectes du fonds de solidarité volontaire (uniquement après validation juridique).',
  },
  'solidarity.contribution_amount': {
    type: 'amount',
    default: '500',
    description: 'Participation demandée à chaque adhérent pour un dossier d’accident approuvé (FCFA).',
  },
  'solidarity.max_assistance_amount': {
    type: 'amount',
    default: '150000',
    description: 'Plafond de l’aide versée pour un dossier (FCFA).',
  },
  'solidarity.waiting_days': {
    type: 'integer',
    default: '30',
    min: 0,
    max: 365,
    description: 'Délai de carence entre l’adhésion et la couverture d’un accident (jours).',
  },
  'solidarity.rules_version': {
    type: 'text',
    default: '2026-09',
    maxLength: 20,
    description: 'Version du règlement de solidarité acceptée à l’adhésion.',
  },
  'mobile.min_version': {
    type: 'version',
    default: '1.0.0',
    description: 'Version minimale de l’application : en dessous, la mise à jour est obligatoire.',
  },
  'mobile.latest_version': { type: 'version', default: '1.0.0', description: 'Dernière version publiée de l’application.' },
  'mobile.maintenance': { type: 'boolean', default: 'false', description: 'Mode maintenance de l’application mobile.' },
  'mobile.maintenance_message': {
    type: 'text',
    default: '',
    maxLength: 300,
    description: 'Message affiché pendant la maintenance.',
  },
  'system.monthly_maintenance_fee': {
    type: 'amount',
    default: '500',
    description: 'Frais mensuels d’entretien du système exigés pour participer aux tirages (FCFA).',
  },
  'support.phone': { type: 'text', default: '', maxLength: 30, description: 'Numéro du support affiché dans l’application.' },
  'support.whatsapp': { type: 'text', default: '', maxLength: 30, description: 'Numéro WhatsApp du support.' },
  'support.email': { type: 'text', default: '', maxLength: 120, description: 'Adresse e-mail du support.' },
  'support.hours': { type: 'text', default: '', maxLength: 120, description: 'Horaires du support.' },
  'support.emergency_phone': {
    type: 'text',
    default: '',
    maxLength: 30,
    description: 'Numéro d’urgence de la permanence (laisser vide tant qu’aucune permanence n’existe).',
  },
} satisfies Record<string, SettingDefinition>;

export type SettingKey = keyof typeof definitions;

/**
 * Paramètres métier modifiables sans redéploiement (cahier §8.17).
 * Les valeurs par défaut sont prudentes : aucune collecte de solidarité, aucun contact inventé.
 */
export const SETTINGS: Record<SettingKey, SettingDefinition> = definitions;

export interface SettingView {
  key: SettingKey;
  value: string;
  defaultValue: string;
  isDefault: boolean;
  type: SettingType;
  description: string;
  updatedAt: Date | null;
  updatedById: string | null;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async values<K extends SettingKey>(keys: readonly K[]): Promise<Record<K, string>> {
    const rows = await this.prisma.systemSetting.findMany({ where: { key: { in: [...keys] } }, select: { key: true, value: true } });
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    return Object.fromEntries(keys.map((key) => [key, stored.get(key) ?? SETTINGS[key].default])) as Record<K, string>;
  }

  async text(key: SettingKey): Promise<string> {
    return (await this.values([key]))[key];
  }

  async flag(key: SettingKey): Promise<boolean> {
    return (await this.text(key)) === 'true';
  }

  async integer(key: SettingKey): Promise<number> {
    return Number.parseInt(await this.text(key), 10);
  }

  async amount(key: SettingKey): Promise<Decimal> {
    return new Decimal(await this.text(key));
  }

  async list(): Promise<SettingView[]> {
    const rows = await this.prisma.systemSetting.findMany();
    const stored = new Map(rows.map((row) => [row.key, row]));
    return (Object.keys(SETTINGS) as SettingKey[]).map((key) => {
      const row = stored.get(key);
      const definition = SETTINGS[key];
      return {
        key,
        value: row?.value ?? definition.default,
        defaultValue: definition.default,
        isDefault: !row,
        type: definition.type,
        description: definition.description,
        updatedAt: row?.updatedAt ?? null,
        updatedById: row?.updatedById ?? null,
      };
    });
  }

  /** Met à jour plusieurs paramètres d'un coup : tout ou rien, chaque changement audité avec l'ancienne valeur. */
  async update(changes: Record<string, unknown>, ctx: RequestContext): Promise<SettingView[]> {
    const entries = Object.entries(changes);
    if (entries.length === 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'SETTINGS_EMPTY', 'Aucun paramètre à modifier.');
    }
    const errors: Record<string, string[]> = {};
    const accepted: [SettingKey, string][] = [];
    for (const [key, raw] of entries) {
      if (!(key in SETTINGS)) {
        errors[key] = ['Paramètre inconnu.'];
        continue;
      }
      const error = validateSetting(SETTINGS[key as SettingKey], raw);
      if (error) errors[key] = [error];
      else accepted.push([key as SettingKey, String(raw).trim()]);
    }
    if (Object.keys(errors).length > 0) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', 'Certaines informations sont invalides.', { fields: errors });
    }

    const actorId = ctx.auth?.userId ?? null;
    await this.prisma.$transaction(async (tx) => {
      for (const [key, value] of accepted) {
        const before = await tx.systemSetting.findUnique({ where: { key } });
        if (before?.value === value) continue;
        await tx.systemSetting.upsert({
          where: { key },
          create: { key, value, description: SETTINGS[key].description, updatedById: actorId },
          update: { value, updatedById: actorId },
        });
        await this.audit.record(
          {
            action: 'settings.updated',
            resourceType: 'system_setting',
            resourceId: key,
            before: { value: before?.value ?? SETTINGS[key].default },
            after: { value },
          },
          ctx,
          tx,
        );
      }
    });
    return this.list();
  }
}

export function validateSetting(definition: SettingDefinition, raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number' && typeof raw !== 'boolean') return 'Valeur invalide.';
  const value = String(raw).trim();
  switch (definition.type) {
    case 'boolean':
      return value === 'true' || value === 'false' ? null : 'Valeur attendue : true ou false.';
    case 'integer': {
      if (!/^\d{1,6}$/.test(value)) return 'Nombre entier positif attendu.';
      const number = Number(value);
      if (definition.min !== undefined && number < definition.min) return `Minimum ${definition.min}.`;
      if (definition.max !== undefined && number > definition.max) return `Maximum ${definition.max}.`;
      return null;
    }
    case 'amount':
      return /^[1-9]\d{0,8}$/.test(value) ? null : 'Montant en francs CFA entiers attendu.';
    case 'version':
      return /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value) ? null : 'Version attendue au format 1.2.3.';
    case 'text':
      return value.length <= (definition.maxLength ?? 300) ? null : `${definition.maxLength ?? 300} caractères maximum.`;
  }
}
