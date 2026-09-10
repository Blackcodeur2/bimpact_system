import { createHash, createHmac } from 'node:crypto';

/**
 * Algorithme de tirage vérifiable publiquement (cahier §11).
 *
 * Toute personne disposant des données d'audit (jetons, empreintes, graine révélée) peut refaire le calcul :
 *   - empreinte de la liste : SHA-256 des jetons triés, un par ligne ;
 *   - engagement : SHA-256 de la graine (publié au gel, avant l'exécution) ;
 *   - score d'un participant : SHA-256(graine hex ‖ ":" ‖ jeton) ;
 *   - gagnants : les N plus petits scores (départage par jeton), rangs 1..N.
 * Aucune donnée personnelle n'intervient : les jetons sont des HMAC non réversibles de l'identifiant.
 */
export const DRAW_ALGORITHM_VERSION = 'sha256-rank-v1';

export interface RankedParticipant {
  rank: number;
  token: string;
  score: string;
}

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function participantToken(secret: string, drawId: string, userId: string): string {
  return createHmac('sha256', secret).update(`${drawId}:${userId}`).digest('hex').slice(0, 24);
}

export function snapshotHash(tokens: readonly string[]): string {
  return sha256Hex([...tokens].sort().join('\n'));
}

export function seedCommitment(seedHex: string): string {
  return sha256Hex(Buffer.from(seedHex, 'hex'));
}

export function participantScore(seedHex: string, token: string): string {
  return sha256Hex(`${seedHex}:${token}`);
}

export function rankWinners(seedHex: string, tokens: readonly string[], winnerCount: number): RankedParticipant[] {
  return [...new Set(tokens)]
    .map((token) => ({ token, score: participantScore(seedHex, token) }))
    .sort((a, b) => (a.score === b.score ? a.token.localeCompare(b.token) : a.score.localeCompare(b.score)))
    .slice(0, Math.max(0, winnerCount))
    .map((entry, index) => ({ rank: index + 1, ...entry }));
}

export function resultHash(winners: readonly RankedParticipant[]): string {
  return sha256Hex(winners.map((w) => `${w.rank}:${w.token}`).join('\n'));
}

export interface DrawAuditData {
  snapshotHash: string;
  seedCommitment: string;
  seed: string;
  resultHash: string;
  winnerCount: number;
  participants: readonly string[];
  winners: readonly RankedParticipant[];
}

export interface DrawVerification {
  snapshotMatches: boolean;
  seedMatchesCommitment: boolean;
  winnersMatch: boolean;
  resultHashMatches: boolean;
  valid: boolean;
}

/** Recalcule entièrement un tirage publié à partir de ses données d'audit. */
export function verifyDraw(audit: DrawAuditData): DrawVerification {
  const expectedWinners = rankWinners(audit.seed, audit.participants, audit.winnerCount);
  const snapshotMatches = snapshotHash(audit.participants) === audit.snapshotHash;
  const seedMatchesCommitment = seedCommitment(audit.seed) === audit.seedCommitment;
  const winnersMatch =
    expectedWinners.length === audit.winners.length &&
    expectedWinners.every((w, i) => w.token === audit.winners[i]?.token && w.rank === audit.winners[i]?.rank && w.score === audit.winners[i]?.score);
  const resultHashMatches = resultHash(audit.winners) === audit.resultHash;
  return {
    snapshotMatches,
    seedMatchesCommitment,
    winnersMatch,
    resultHashMatches,
    valid: snapshotMatches && seedMatchesCommitment && winnersMatch && resultHashMatches,
  };
}
