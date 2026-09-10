/**
 * Outil de DÉVELOPPEMENT : conduire un tirage sans back-office (refusé en production).
 * Passe par DrawsService : mêmes règles, même audit, même principe des quatre yeux (deux réviseurs de dev).
 *
 *   pnpm --filter @benskin/api draw:dev list
 *   pnpm --filter @benskin/api draw:dev run "Tirage de démonstration" 2 1 7
 *        (titre, nombre de gagnants, jours payés minimum, période en jours)
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import type { RequestContext } from '../src/common/request-context';
import { PrismaService } from '../src/database/prisma.service';
import { DrawsService } from '../src/modules/draws/draws.service';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Outil interdit en production.');
  const [command = 'list', title = 'Tirage de démonstration', winners = '1', minPaidDays = '1', windowDays = '7'] = process.argv.slice(2);

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const draws = app.get(DrawsService);

    if (command === 'list') {
      const { items } = await draws.adminList({ limit: 20 } as never);
      if (items.length === 0) console.log('Aucun tirage.');
      for (const draw of items) {
        console.log(`${draw.status.padEnd(10)} ${draw.code}  « ${draw.title} »  gagnants:${draw.winnerCount}  éligibles:${draw.eligibleCount ?? '-'}`);
      }
      return;
    }
    if (command !== 'run') throw new Error('Usage : list | run "titre" gagnants joursMinimum période');

    const operator = await devStaff(prisma, '+237600000000', 'Réviseur');
    const validator = await devStaff(prisma, '+237600000001', 'Validateur');
    const as = (userId: string): RequestContext => ({
      requestId: `cli-${randomUUID()}`,
      auth: { userId, sessionId: 'cli', kind: 'STAFF', roles: ['COMPLIANCE'], permissions: new Set() },
    });

    const created = await draws.create(
      { title, scheduledAt: new Date(Date.now() + 60_000), winnerCount: Number(winners), minPaidDays: Number(minPaidDays), windowDays: Number(windowDays) },
      as(operator),
    );
    const frozen = await draws.freeze(created.id, as(operator));
    console.log(`Gelé : ${frozen.eligibleCount} participant(s), empreinte ${frozen.snapshotHash}`);
    await draws.execute(created.id, as(operator));
    const published = await draws.publish(created.id, as(validator));
    const audit = await draws.audit(created.id);
    console.log(`Publié : ${published.code} — vérification ${audit.verification?.valid ? 'VALIDE' : 'INVALIDE'}`);
    for (const winner of audit.winners) console.log(`  #${winner.rank}  jeton ${winner.token}`);
  } finally {
    await app.close();
  }
}

async function devStaff(prisma: PrismaService, phone: string, firstName: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: 'COMPLIANCE' } });
  const user = await prisma.user.upsert({
    where: { phone },
    create: { phone, kind: 'STAFF', status: 'ACTIVE', profile: { create: { firstName, lastName: 'Développement', city: 'Yaoundé' } } },
    update: {},
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id },
    update: {},
  });
  return user.id;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
