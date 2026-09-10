export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export const PAYMENT_CHANNELS = ['MTN_MOMO', 'ORANGE_MONEY'] as const;
export type PaymentChannel = (typeof PAYMENT_CHANNELS)[number];

export const CHANNEL_LABELS: Record<PaymentChannel, string> = {
  MTN_MOMO: 'MTN Mobile Money',
  ORANGE_MONEY: 'Orange Money',
};

export type ProviderPaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

export interface ProviderIntentInput {
  intentId: string;
  amount: string;
  currency: string;
  payerPhone: string;
  channel: PaymentChannel;
}

export interface ProviderIntentResult {
  externalReference: string;
  /** Consigne montrée au payeur (ex. « validez la demande sur votre téléphone »). */
  payerInstructions: string;
}

export interface ProviderStatusQuery {
  externalReference: string;
  payerPhone: string;
  createdAt: Date;
}

export interface ProviderStatusResult {
  status: ProviderPaymentStatus;
  failureCode?: string;
  failureMessage?: string;
}

export interface VerifiedWebhookEvent extends ProviderStatusResult {
  eventId: string;
  externalReference: string;
  occurredAt: Date;
}

export interface ProviderTransaction {
  externalReference: string;
  status: ProviderPaymentStatus;
  amount: string;
  currency: string;
}

/**
 * Abstraction des fournisseurs de paiement (cahier §16). Le cœur métier ne dépend d'aucun opérateur :
 * un partenaire agréé (MTN MoMo, Orange Money, agrégateur) implémentera cette interface.
 */
export interface PaymentProvider {
  readonly code: string;
  /** true : aucun argent réel ne circule. Affiché clairement à l'utilisateur. */
  readonly testMode: boolean;
  readonly channels: readonly PaymentChannel[];
  createIntent(input: ProviderIntentInput): Promise<ProviderIntentResult>;
  getStatus(query: ProviderStatusQuery): Promise<ProviderStatusResult>;
  /** Vérifie la signature et renvoie l'événement, ou null si la signature est invalide. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): VerifiedWebhookEvent | null;
  reconcile(from: Date, to: Date): Promise<ProviderTransaction[]>;
}

/** Fournisseur capable d'émettre ses propres webhooks (bac à sable). */
export interface SelfNotifyingProvider {
  onWebhook(sink: (rawBody: Buffer, headers: Record<string, string>) => Promise<unknown>): void;
}

export function isSelfNotifying(provider: PaymentProvider): provider is PaymentProvider & SelfNotifyingProvider {
  return typeof (provider as Partial<SelfNotifyingProvider>).onWebhook === 'function';
}
