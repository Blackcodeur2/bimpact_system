import { randomUUID } from 'node:crypto';
import { LedgerService } from '../../src/modules/ledger/ledger.service';
import { TokenService } from '../../src/modules/auth/token.service';
import { RegisteredMember, TestContext, uniquePhone } from './app';

/** Compte back-office de test avec un rôle donné ; renvoie un jeton d'accès. */
export async function staffToken(ctx: TestContext, roleCode: string): Promise<{ token: string; userId: string }> {
  const role = await ctx.prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  const staff = await ctx.prisma.user.create({
    data: {
      phone: uniquePhone(),
      kind: 'STAFF',
      status: 'ACTIVE',
      profile: { create: { firstName: 'Agent', lastName: roleCode, city: 'Yaoundé' } },
      roles: { create: { roleId: role.id } },
    },
  });
  const session = await ctx.prisma.$transaction((tx) =>
    ctx.app.get(TokenService).issueSession(tx, { userId: staff.id, kind: 'STAFF' }, {}),
  );
  return { token: session.accessToken, userId: staff.id };
}

/** Identité vérifiée sans passer par le circuit KYC complet (couvert par kyc.e2e-spec). */
export async function approveKyc(ctx: TestContext, member: RegisteredMember): Promise<void> {
  await ctx.prisma.profile.update({ where: { userId: member.user.id }, data: { kycStatus: 'APPROVED' } });
}

/** Crédite le portefeuille par une écriture équilibrée du ledger (compensation sandbox). */
export async function fundWallet(ctx: TestContext, member: RegisteredMember, amount: string): Promise<void> {
  const wallet = await ctx.prisma.wallet.findUniqueOrThrow({ where: { userId: member.user.id } });
  const clearing = await ctx.prisma.ledgerAccount.findUniqueOrThrow({ where: { code: 'system:provider_clearing:sandbox' } });
  await ctx.app.get(LedgerService).post({
    reference: `test:fund:${randomUUID()}`,
    type: 'DEPOSIT',
    entries: [
      { accountId: clearing.id, direction: 'DEBIT', amount },
      { accountId: wallet.availableAccountId, direction: 'CREDIT', amount },
    ],
  });
}

export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 0x37)]);
