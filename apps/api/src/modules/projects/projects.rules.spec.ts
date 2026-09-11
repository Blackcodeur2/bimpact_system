import { Decimal } from '../../common/money';
import { evaluateProject, ProjectDraft } from './projects.rules';

const complete: ProjectDraft = {
  title: 'Atelier de réparation',
  sector: 'Mécanique',
  city: 'Douala',
  problem: 'Pas de réparateur ouvert le soir au carrefour.',
  solution: 'Un atelier ouvert de 17 h à 23 h.',
  market: 'Conducteurs de motos-taxis du quartier.',
  description: 'Atelier équipé et stock de pièces d’usure.',
  estimatedBudget: new Decimal(1_000_000),
  personalContribution: new Decimal(200_000),
  grantRequested: new Decimal(800_000),
  budgetLines: [
    { label: 'Outillage', amount: '600000' },
    { label: 'Stock initial', amount: '400000' },
  ],
};

describe('evaluateProject', () => {
  it('accepte un projet complet dont le budget et le financement sont équilibrés', () => {
    expect(evaluateProject(complete)).toEqual({ complete: true, missing: [], issues: [] });
  });

  it('liste les champs manquants d’un brouillon', () => {
    const result = evaluateProject({ ...complete, problem: '  ', estimatedBudget: null, budgetLines: [] });
    expect(result.complete).toBe(false);
    expect(result.missing).toEqual(['problem', 'estimatedBudget', 'budgetLines']);
  });

  it('signale un budget détaillé différent du budget total', () => {
    const result = evaluateProject({ ...complete, budgetLines: [{ label: 'Outillage', amount: '600000' }] });
    expect(result.issues).toContain('BUDGET_LINES_MISMATCH');
  });

  it('exige apport personnel + subvention = budget, et une subvention inférieure au budget', () => {
    expect(evaluateProject({ ...complete, personalContribution: new Decimal(0) }).issues).toContain('FINANCING_UNBALANCED');
    expect(evaluateProject({ ...complete, grantRequested: new Decimal(1_200_000) }).issues).toContain('GRANT_ABOVE_BUDGET');
  });
});
