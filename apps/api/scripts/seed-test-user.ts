/**
 * Script de développement : crée un compte conducteur test complet et prêt à l'emploi.
 *
 * Identifiants de connexion :
 *   Téléphone : +237690000001
 *   PIN       : 147258
 *
 * Éléments initialisés :
 *   - Compte actif + rôle MEMBER + profil complet (Kouam Test, Yaoundé)
 *   - Portefeuille avec solde de 25 000 FCFA (écritures double-partie au ledger)
 *   - Statut KYC validé (APPROVED)
 *   - Plan de contribution actif (200 FCFA/jour, auto-débit activé)
 *   - Historique de 7 jours de cotisations payées (streak actif)
 *   - Prochain tirage au sort créé et visible
 */
import * as argon2 from 'argon2';
import { PrismaClient, EntryDirection, LedgerAccountType } from '@prisma/client';

const PHONE = '+237690000001';
const PIN = '147258';
const PEPPER = process.env.PIN_PEPPER ?? '3lE3vBDa38bFJH3Gcg6g7zfoaxozE1GJLV6cFBbrLBd7MNzldFrng4Z7Cyyrfa';

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log('--- Initialisation du compte test BENSKIN IMPACT ---');

    // 1. Hachage du code PIN avec Argon2id + pepper
    const pinHash = await argon2.hash(PIN, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      secret: Buffer.from(PEPPER, 'utf8'),
    });

    // 2. Utilisateur & Profil
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
            kycStatus: 'APPROVED',
          },
        },
      },
      update: {
        pinHash,
        status: 'ACTIVE',
        phoneVerifiedAt: new Date(),
        profile: {
          upsert: {
            create: {
              firstName: 'Kouam',
              lastName: 'Test',
              city: 'Yaoundé',
              zone: 'Centre Administratif',
              kycStatus: 'APPROVED',
            },
            update: {
              kycStatus: 'APPROVED',
            },
          },
        },
      },
      include: { profile: true },
    });
    console.log(`[OK] Utilisateur créé/actualisé : ${user.id} (${user.phone})`);

    // 3. Consentements
    for (const type of ['TERMS', 'PRIVACY']) {
      await prisma.consent.upsert({
        where: { userId_type_version: { userId: user.id, type, version: '2026-09' } },
        create: { userId: user.id, type, version: '2026-09' },
        update: {},
      });
    }
    console.log('[OK] Consentements enregistrés');

    // 4. Attribution du rôle MEMBER
    const memberRole = await prisma.role.findUniqueOrThrow({ where: { code: 'MEMBER' } });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: memberRole.id } },
      create: { userId: user.id, roleId: memberRole.id },
      update: {},
    });
    console.log('[OK] Rôle MEMBER attribué');

    // 5. Profil KYC APPROVED
    await prisma.kycProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        status: 'APPROVED',
        firstName: 'Kouam',
        lastName: 'Test',
        birthDate: new Date('1992-05-14'),
        city: 'Yaoundé',
        district: 'Centre Administratif',
        idDocumentType: 'CNI',
        idDocumentNumber: '1188442200',
        idDocumentExpiry: new Date('2029-12-31'),
        vehiclePlate: 'LT 4529 BB',
        vehicleModel: 'Bajaj Boxer 150 HD',
        vehicleOwnership: 'OWNER',
        submittedAt: new Date(),
        reviewedAt: new Date(),
      },
      update: {
        status: 'APPROVED',
      },
    });
    console.log('[OK] Profil KYC validé (APPROVED)');

    // 6. Comptes du Ledger pour le portefeuille
    const availableAccount = await prisma.ledgerAccount.upsert({
      where: { code: `member:${user.id}:available` },
      create: {
        code: `member:${user.id}:available`,
        name: 'Solde disponible',
        type: LedgerAccountType.LIABILITY,
        purpose: 'MEMBER_AVAILABLE',
        ownerUserId: user.id,
        currency: 'XAF',
        balance: 25000,
      },
      update: {},
    });

    const reservedAccount = await prisma.ledgerAccount.upsert({
      where: { code: `member:${user.id}:reserved` },
      create: {
        code: `member:${user.id}:reserved`,
        name: 'Solde réservé',
        type: LedgerAccountType.LIABILITY,
        purpose: 'MEMBER_RESERVED',
        ownerUserId: user.id,
        currency: 'XAF',
        balance: 0,
      },
      update: {},
    });

    // 7. Portefeuille
    await prisma.wallet.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        availableAccountId: availableAccount.id,
        reservedAccountId: reservedAccount.id,
        currency: 'XAF',
        status: 'ACTIVE',
      },
      update: {
        status: 'ACTIVE',
      },
    });
    console.log('[OK] Portefeuille actif initialisé');

    // 8. Écriture initiale au ledger pour les 25 000 FCFA
    const clearingAccount = await prisma.ledgerAccount.findUnique({
      where: { code: 'system:provider_clearing:sandbox' },
    });

    if (clearingAccount) {
      const existingTx = await prisma.ledgerTransaction.findUnique({
        where: { reference: `seed:initial_deposit:${user.id}` },
      });

      if (!existingTx) {
        await prisma.$transaction(async (tx) => {
          const ledgerTx = await tx.ledgerTransaction.create({
            data: {
              reference: `seed:initial_deposit:${user.id}`,
              type: 'DEPOSIT',
              description: 'Dépôt initial de bienvenue (compte test)',
              currency: 'XAF',
              createdById: user.id,
            },
          });

          await tx.ledgerEntry.create({
            data: {
              transactionId: ledgerTx.id,
              accountId: clearingAccount.id,
              direction: EntryDirection.DEBIT,
              amount: 25000,
              currency: 'XAF',
              balanceAfter: 25000,
            },
          });

          await tx.ledgerEntry.create({
            data: {
              transactionId: ledgerTx.id,
              accountId: availableAccount.id,
              direction: EntryDirection.CREDIT,
              amount: 25000,
              currency: 'XAF',
              balanceAfter: 25000,
            },
          });
        });
        console.log('[OK] Transaction de dépôt initial enregistrée dans le ledger (25 000 FCFA)');
      }
    }

    // 9. Plan de contribution actif (200 FCFA/jour)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 14);

    const plan = await prisma.contributionPlan.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        amount: 200,
        currency: 'XAF',
        frequency: 'DAILY',
        autoDebit: true,
        status: 'ACTIVE',
        startedOn: startDate,
      },
      update: {
        autoDebit: true,
        status: 'ACTIVE',
      },
    });
    console.log('[OK] Plan de cotisation actif (200 FCFA/jour, auto-débit ON)');

    // 10. Cotisations des 7 derniers jours (historique & streak)
    const poolAccount = await prisma.ledgerAccount.findUnique({
      where: { code: 'system:contribution_pool' },
    });

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const periodDate = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

      const existingContribution = await prisma.contribution.findUnique({
        where: { userId_periodDate: { userId: user.id, periodDate } },
      });

      if (!existingContribution && poolAccount) {
        const ref = `seed:contrib:${user.id}:${periodDate.toISOString().slice(0, 10)}`;
        const existingTx = await prisma.ledgerTransaction.findUnique({ where: { reference: ref } });

        if (!existingTx) {
          await prisma.$transaction(async (tx) => {
            const txRecord = await tx.ledgerTransaction.create({
              data: {
                reference: ref,
                type: 'CONTRIBUTION',
                description: `Contribution quotidienne du ${periodDate.toISOString().slice(0, 10)}`,
                currency: 'XAF',
                createdById: user.id,
              },
            });

            await tx.ledgerEntry.create({
              data: {
                transactionId: txRecord.id,
                accountId: availableAccount.id,
                direction: EntryDirection.DEBIT,
                amount: 200,
                currency: 'XAF',
                balanceAfter: 25000 - (7 - i) * 200,
              },
            });

            await tx.ledgerEntry.create({
              data: {
                transactionId: txRecord.id,
                accountId: poolAccount.id,
                direction: EntryDirection.CREDIT,
                amount: 200,
                currency: 'XAF',
                balanceAfter: (7 - i) * 200,
              },
            });

            await tx.contribution.create({
              data: {
                userId: user.id,
                planId: plan.id,
                periodDate,
                amount: 200,
                currency: 'XAF',
                source: 'AUTO',
                ledgerTransactionId: txRecord.id,
              },
            });
          });
        }
      }
    }
    console.log('[OK] 7 jours de cotisations consécutives enregistrées (Streak = 7)');

    // 11. Prochain tirage au sort vérifiable
    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + 5);
    scheduledDate.setHours(18, 0, 0, 0);

    await prisma.draw.upsert({
      where: { code: 'DRAW-SEPT-2026' },
      create: {
        code: 'DRAW-SEPT-2026',
        title: 'Grand Tirage Entrepreneurial de Septembre 2026',
        scheduledAt: scheduledDate,
        winnerCount: 3,
        minPaidDays: 7,
        windowDays: 30,
        status: 'DRAFT',
        createdById: user.id,
      },
      update: {},
    });
    console.log('[OK] Prochain tirage au sort configuré (DRAW-SEPT-2026)');

    console.log('\n=============================================================');
    console.log('🎉 COMPTE TEST INITIALISÉ AVEC SUCCÈS !');
    console.log(`📱 Téléphone : ${PHONE}`);
    console.log(`🔑 Code PIN  : ${PIN}`);
    console.log(`💰 Solde     : 25 000 FCFA`);
    console.log('=============================================================\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('[ERREUR] Impossible de créer le compte test :', e);
  process.exitCode = 1;
});
