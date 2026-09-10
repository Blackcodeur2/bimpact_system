import { randomBytes } from 'node:crypto';
import {
  participantToken,
  rankWinners,
  resultHash,
  seedCommitment,
  snapshotHash,
  verifyDraw,
} from './draw.algorithm';

const tokens = Array.from({ length: 50 }, (_, i) => participantToken('secret-de-test-suffisamment-long!!', 'draw-1', `user-${i}`));

describe('algorithme de tirage vérifiable', () => {
  it('produit des jetons anonymes stables et distincts par tirage', () => {
    expect(participantToken('s'.repeat(32), 'draw-1', 'user-1')).toBe(participantToken('s'.repeat(32), 'draw-1', 'user-1'));
    expect(participantToken('s'.repeat(32), 'draw-1', 'user-1')).not.toBe(participantToken('s'.repeat(32), 'draw-2', 'user-1'));
    expect(new Set(tokens).size).toBe(50);
  });

  it('calcule une empreinte de liste indépendante de l’ordre', () => {
    expect(snapshotHash(tokens)).toBe(snapshotHash([...tokens].reverse()));
  });

  it('sélectionne exactement N gagnants distincts, de façon déterministe pour une graine donnée', () => {
    const seed = randomBytes(32).toString('hex');
    const winners = rankWinners(seed, tokens, 10);
    expect(winners).toHaveLength(10);
    expect(new Set(winners.map((w) => w.token)).size).toBe(10);
    expect(winners.map((w) => w.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(rankWinners(seed, [...tokens].reverse(), 10)).toEqual(winners);
    expect(rankWinners(seed, [...tokens, tokens[0]!], 10)).toEqual(winners);
  });

  it('ne sélectionne jamais plus de gagnants que de participants', () => {
    expect(rankWinners(randomBytes(32).toString('hex'), tokens.slice(0, 3), 10)).toHaveLength(3);
  });

  it('valide un tirage intègre et détecte toute altération', () => {
    const seed = randomBytes(32).toString('hex');
    const winners = rankWinners(seed, tokens, 5);
    const audit = {
      snapshotHash: snapshotHash(tokens),
      seedCommitment: seedCommitment(seed),
      seed,
      resultHash: resultHash(winners),
      winnerCount: 5,
      participants: tokens,
      winners,
    };
    expect(verifyDraw(audit).valid).toBe(true);

    expect(verifyDraw({ ...audit, participants: tokens.slice(1) }).snapshotMatches).toBe(false);
    expect(verifyDraw({ ...audit, seed: randomBytes(32).toString('hex') }).seedMatchesCommitment).toBe(false);
    const swapped = [winners[1]!, winners[0]!].map((w, i) => ({ ...w, rank: i + 1 }));
    expect(verifyDraw({ ...audit, winners: [...swapped, ...winners.slice(2)] }).valid).toBe(false);
  });
});
