import { AppException } from '../../common/errors/app-exception';
import type { PrismaService } from '../../database/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { increasesOnDebit, LedgerService, PostTransactionInput } from './ledger.service';

/** Règles de validation vérifiées avant toute requête SQL (les tests d'intégration couvrent la base). */
describe('LedgerService — validation', () => {
  const prisma = {
    $transaction: jest.fn(() => {
      throw new Error('la base ne doit pas être appelée pour une transaction invalide');
    }),
  } as unknown as PrismaService;
  const ledger = new LedgerService(prisma, {} as AuditService);

  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';

  const base: PostTransactionInput = {
    reference: 'test:1',
    type: 'DEPOSIT',
    entries: [
      { accountId: A, direction: 'DEBIT', amount: '200' },
      { accountId: B, direction: 'CREDIT', amount: '200' },
    ],
  };

  async function codeOf(input: PostTransactionInput): Promise<string> {
    try {
      await ledger.post(input);
    } catch (error) {
      if (error instanceof AppException) return error.code;
      throw error;
    }
    throw new Error('une erreur était attendue');
  }

  it('refuse une transaction déséquilibrée', async () => {
    expect(
      await codeOf({ ...base, entries: [base.entries[0]!, { ...base.entries[1]!, amount: '150' }] }),
    ).toBe('LEDGER_UNBALANCED');
  });

  it('refuse une transaction à une seule écriture', async () => {
    expect(await codeOf({ ...base, entries: [base.entries[0]!] })).toBe('LEDGER_UNBALANCED');
  });

  it('refuse une transaction sans crédit', async () => {
    expect(
      await codeOf({ ...base, entries: [base.entries[0]!, { ...base.entries[0]!, accountId: B }] }),
    ).toBe('LEDGER_UNBALANCED');
  });

  it.each(['0', '-200', '200.5', 'abc', 'NaN', 'Infinity'])('refuse le montant %s en XAF', async (amount) => {
    expect(
      await codeOf({
        ...base,
        entries: [
          { ...base.entries[0]!, amount },
          { ...base.entries[1]!, amount },
        ],
      }),
    ).toBe('INVALID_AMOUNT');
  });

  it('refuse une référence vide', async () => {
    expect(await codeOf({ ...base, reference: '' })).toBe('LEDGER_INVALID_REFERENCE');
  });

  it("n'ouvre aucune transaction SQL quand la validation échoue", async () => {
    await codeOf({ ...base, reference: '' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('increasesOnDebit', () => {
  it('suit les conventions comptables', () => {
    expect(increasesOnDebit('ASSET')).toBe(true);
    expect(increasesOnDebit('EXPENSE')).toBe(true);
    expect(increasesOnDebit('LIABILITY')).toBe(false);
    expect(increasesOnDebit('EQUITY')).toBe(false);
    expect(increasesOnDebit('REVENUE')).toBe(false);
  });
});
