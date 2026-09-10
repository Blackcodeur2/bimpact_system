/**
 * Script de développement : crée un compte conducteur test prêt à l'emploi.
 * Compte créé :
 *   Téléphone : +237690000001
 *   PIN       : 147258
 */
import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const PHONE = '+237690000001';
const PIN = '147258';
const PEPPER = process.env.PIN_PEPPER ?? '3lE3vBDa38bFJH3Gcg6g7zfoaxozE1GJLV6cFBbrLBd7MNzldFrng4Z7Cyyrfa';

async function main() {
  const prisma = new PrismaClient();
  try {
    const pinHash = await argon2.hash(PIN, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      secret: Buffer.from(PEPPER, 'utf8'),
    });

    const user = await prisma.user.upsert({
      where: { phone: PHONE },
      create: {
        phone: PHONE,
        pinHash,
        status: 'ACTIVE',
        kind: 'MEMBER',
        phoneVerifiedAt: new Date(),
        lastLoginAt: new Date(),
        profile: {
          create: {
            firstName: 'Kouam',
            lastName: 'Test',
            city: 'Yaoundé',
            zone: 'Centre Administratif',
          },
        },
      },
      update: { pinHash, status: 'ACTIVE', phoneVerifiedAt: new Date() },
      include: { profile: true },
    });
    console.log('Utilisateur upsert : ' + user.id + ' (' + user.phone + ')');

    for (const type of ['TERMS', 'PRIVACY']) {
      await prisma.consent.upsert({
        where: { userId_type_version: { userId: user.id, type, version: '2026-09' } },
        create: { userId: user.id, type, version: '2026-09' },
        update: {},
      });
    }
    console.log('Consentements enregistres');

    const memberRole = await prisma.role.findUniqueOrThrow({ where: { code: 'MEMBER' } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: memberRole.id } },
      create: { userId: user.id, roleId: memberRole.id },
      update: {},
    });
    console.log('Role MEMBER attribue');

    const existingWallet = await prisma.wallet.findUnique({ where: { userId: user.id } });
    if (!existingWallet) {
      const memberWalletAccount = await prisma.ledgerAccount.findFirst({ where: { code: { startsWith: 'MEMBER_WALLET' } } });
      if (memberWalletAccount) {
        await prisma.wallet.create({ data: { userId: user.id, ledgerAccountId: memberWalletAccount.id, currency: 'XAF' } });
        console.log('Wallet cree');
      } else {
        console.warn('Compte ledger MEMBER_WALLET introuvable - lancez le seed principal dabord');
      }
    } else {
      console.log('Wallet deja existant');
    }

    console.log('\nCOMPTE TEST PRET');
    console.log('Telephone : ' + PHONE);
    console.log('PIN       : ' + PIN);
  } finally {
    await prisma.();
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
