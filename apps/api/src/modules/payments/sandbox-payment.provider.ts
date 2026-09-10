import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import {
  PAYMENT_CHANNELS,
  PaymentProvider,
  ProviderIntentInput,
  ProviderIntentResult,
  ProviderPaymentStatus,
  ProviderStatusQuery,
  ProviderStatusResult,
  ProviderTransaction,
  SelfNotifyingProvider,
  VerifiedWebhookEvent,
} from './payment-provider';

export const SANDBOX_SIGNATURE_HEADER = 'x-sandbox-signature';

/**
 * Fournisseur de TEST (cahier §22) : aucun argent réel ne circule.
 *
 * Règles déterministes sur le numéro du payeur :
 *   - se termine par 0000 → échec « solde insuffisant » ;
 *   - se termine par 1111 → reste en attente (jusqu'à expiration) ;
 *   - sinon → succès.
 * La confirmation arrive sous forme de webhook signé (HMAC-SHA256), traité exactement
 * comme celui d'un opérateur réel : vérification, déduplication, enregistrement puis traitement.
 */
@Injectable()
export class SandboxPaymentProvider implements PaymentProvider, SelfNotifyingProvider, OnModuleDestroy {
  readonly code = 'sandbox';
  readonly testMode = true;
  readonly channels = PAYMENT_CHANNELS;

  private readonly logger = new Logger(SandboxPaymentProvider.name);
  private readonly timers = new Set<NodeJS.Timeout>();
  private sink?: (rawBody: Buffer, headers: Record<string, string>) => Promise<unknown>;

  constructor(private readonly config: AppConfig) {}

  onWebhook(sink: (rawBody: Buffer, headers: Record<string, string>) => Promise<unknown>): void {
    this.sink = sink;
  }

  async createIntent(input: ProviderIntentInput): Promise<ProviderIntentResult> {
    const externalReference = `sbx_${input.intentId.replace(/-/g, '')}`;
    const outcome = this.outcomeFor(input.payerPhone);
    const { sandboxAutoConfirm, sandboxConfirmDelaySeconds } = this.config.payments;
    if (outcome !== 'PENDING' && sandboxAutoConfirm) {
      this.schedule(() => this.emit(externalReference, outcome), sandboxConfirmDelaySeconds * 1000);
    }
    return {
      externalReference,
      payerInstructions:
        outcome === 'PENDING'
          ? 'Mode test : cette demande restera en attente (numéro de test se terminant par 1111).'
          : `Mode test : aucune somme n’est débitée. La réponse de l’opérateur est simulée en ${sandboxConfirmDelaySeconds} s.`,
    };
  }

  async getStatus(query: ProviderStatusQuery): Promise<ProviderStatusResult> {
    const outcome = this.outcomeFor(query.payerPhone);
    const elapsed = Date.now() - query.createdAt.getTime();
    if (outcome === 'PENDING' || elapsed < this.config.payments.sandboxConfirmDelaySeconds * 1000) {
      return { status: 'PENDING' };
    }
    return outcome === 'FAILED' ? failure() : { status: 'SUCCEEDED' };
  }

  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): VerifiedWebhookEvent | null {
    const header = headers[SANDBOX_SIGNATURE_HEADER];
    const received = Buffer.from(typeof header === 'string' ? header : '', 'utf8');
    const expected = Buffer.from(this.sign(rawBody), 'utf8');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;

    try {
      const data = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      const status = data.status;
      if (
        typeof data.eventId !== 'string' ||
        typeof data.externalReference !== 'string' ||
        (status !== 'PENDING' && status !== 'SUCCEEDED' && status !== 'FAILED')
      ) {
        return null;
      }
      return {
        eventId: data.eventId,
        externalReference: data.externalReference,
        status,
        failureCode: typeof data.failureCode === 'string' ? data.failureCode : undefined,
        failureMessage: typeof data.failureMessage === 'string' ? data.failureMessage : undefined,
        occurredAt: new Date(typeof data.occurredAt === 'string' ? data.occurredAt : Date.now()),
      };
    } catch {
      return null;
    }
  }

  async reconcile(): Promise<ProviderTransaction[]> {
    return [];
  }

  /** Construit et signe un webhook de test ; exposé pour les tests et la démonstration du circuit. */
  buildWebhook(externalReference: string, status: ProviderPaymentStatus): { rawBody: Buffer; headers: Record<string, string> } {
    const payload = {
      eventId: randomUUID(),
      externalReference,
      status,
      ...(status === 'FAILED' ? failure() : {}),
      occurredAt: new Date().toISOString(),
    };
    const rawBody = Buffer.from(JSON.stringify(payload), 'utf8');
    return { rawBody, headers: { [SANDBOX_SIGNATURE_HEADER]: this.sign(rawBody) } };
  }

  async emit(externalReference: string, status: ProviderPaymentStatus): Promise<void> {
    if (!this.sink) return;
    const { rawBody, headers } = this.buildWebhook(externalReference, status);
    try {
      await this.sink(rawBody, headers);
    } catch (error) {
      this.logger.error({ err: error, externalReference }, 'Échec du traitement du webhook sandbox');
    }
  }

  onModuleDestroy() {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private outcomeFor(payerPhone: string): ProviderPaymentStatus {
    if (payerPhone.endsWith('0000')) return 'FAILED';
    if (payerPhone.endsWith('1111')) return 'PENDING';
    return 'SUCCEEDED';
  }

  private schedule(task: () => Promise<void>, delayMs: number) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      void task();
    }, delayMs);
    timer.unref();
    this.timers.add(timer);
  }

  private sign(rawBody: Buffer): string {
    return createHmac('sha256', this.config.payments.sandboxWebhookSecret).update(rawBody).digest('hex');
  }
}

function failure(): ProviderStatusResult {
  return {
    status: 'FAILED',
    failureCode: 'INSUFFICIENT_FUNDS',
    failureMessage: 'Solde Mobile Money insuffisant (simulation du mode test).',
  };
}
