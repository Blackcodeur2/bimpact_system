/**
 * Outil de DÉVELOPPEMENT : traiter les dossiers KYC sans back-office (refusé en production).
 * Passe par KycReviewService : mêmes règles, mêmes transactions, même audit que l'API admin.
 *
 *   pnpm --filter @benskin/api kyc:dev list
 *   pnpm --filter @benskin/api kyc:dev approve 699001122
 *   pnpm --filter @benskin/api kyc:dev reject 699001122 "Photo de la pièce illisible"
 *   pnpm --filter @benskin/api kyc:dev more-info 699001122 "Merci d'ajouter le verso de votre CNI"
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import type { RequestContext } from '../src/common/request-context';
import { PrismaService } from '../src/database/prisma.service';
import { normalizeCameroonPhone } from '../src/modules/auth/phone';
import { KycReviewService } from '../src/modules/kyc/kyc-review.service';

const DEV_REVIEWER_PHONE = '+237600000000';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Outil interdit en production.');
  const [command = 'list', phoneArg, ...reasonParts] = process.argv.slice(2);
  const reason = reasonParts.join(' ').trim() || undefined;

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const reviews = app.get(KycReviewService);
    const reviewer = await ensureDevReviewer(prisma);
    const ctx: RequestContext = {
      requestId: `cli-${randomUUID()}`,
      auth: { userId: reviewer.id, sessionId: 'cli', kind: 'STAFF', roles: ['COMPLIANCE'], permissions: new Set() },
    };

    if (command === 'list') {
      const { items } = await reviews.queue({ limit: 50 } as never);
      if (items.length === 0) console.log('Aucun dossier en attente.');
      for (const item of items) {
        console.log(
          `${item.status.padEnd(12)} ${item.applicant.phone}  ${item.applicant.firstName ?? ''} ${item.applicant.lastName ?? ''}` +
            `  soumis ${item.submittedAt?.toISOString()}  docs:${item.documentCount}  signaux:[${item.riskFlags.join(', ')}]`,
        );
      }
      return;
    }

    const decisions: Record<string, 'APPROVED' | 'REJECTED' | 'MORE_INFO_REQUESTED'> = {
      approve: 'APPROVED',
      reject: 'REJECTED',
      'more-info': 'MORE_INFO_REQUESTED',
    };
    const decision = decisions[command];
    if (!decision || !phoneArg) {
      throw new Error('Usage : list | approve <téléphone> | reject <téléphone> "motif" | more-info <téléphone> "motif"');
    }

    const phone = normalizeCameroonPhone(phoneArg) as string;
    const profile = await prisma.kycProfile.findFirst({ where: { user: { phone } } });
    if (!profile) throw new Error(`Aucun dossier KYC pour ${phone}.`);

    await reviews.claim(profile.id, ctx);
    const result = await reviews.decide(profile.id, { decision, reason }, ctx);
    console.log(`Dossier ${profile.id} → ${result.status} (${result.decision})${reason ? ` — « ${reason} »` : ''}`);
  } finally {
    await app.close();
  }
}

/** Compte STAFF de développement, sans PIN (aucune connexion possible), rôle Conformité. */
async function ensureDevReviewer(prisma: PrismaService) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: 'COMPLIANCE' } });
  const user = await prisma.user.upsert({
    where: { phone: DEV_REVIEWER_PHONE },
    create: {
      phone: DEV_REVIEWER_PHONE,
      kind: 'STAFF',
      status: 'ACTIVE',
      profile: { create: { firstName: 'Réviseur', lastName: 'Développement', city: 'Yaoundé' } },
    },
    update: {},
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id },
    update: {},
  });
  return user;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
