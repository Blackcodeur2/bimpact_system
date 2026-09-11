import type { ProjectStatus } from '@prisma/client';
import { Decimal } from '../../common/money';

/** Le porteur modifie son projet tant qu'il n'est pas soumis, ou quand le comité demande des corrections. */
export const PROJECT_EDITABLE_STATUSES: ProjectStatus[] = ['DRAFT', 'CHANGES_REQUESTED'];

/** Des justificatifs peuvent être ajoutés jusqu'à la décision du comité. */
export const PROJECT_DOCUMENT_STATUSES: ProjectStatus[] = ['DRAFT', 'CHANGES_REQUESTED', 'SUBMITTED', 'UNDER_REVIEW'];

export interface BudgetLine {
  label: string;
  amount: string;
}

export interface TeamMember {
  fullName: string;
  role: string;
}

export interface ProjectForecasts {
  monthlyRevenue: string | null;
  monthlyCosts: string | null;
  jobsCreated: number | null;
}

export interface ProjectDraft {
  title: string;
  sector: string | null;
  city: string | null;
  problem: string | null;
  solution: string | null;
  market: string | null;
  description: string | null;
  estimatedBudget: Decimal | null;
  personalContribution: Decimal;
  grantRequested: Decimal | null;
  budgetLines: unknown;
}

export interface ProjectCompleteness {
  complete: boolean;
  /** Champs manquants : sector, city, problem, solution, market, description, estimatedBudget, grantRequested, budgetLines. */
  missing: string[];
  /** Incohérences : BUDGET_LINES_MISMATCH, FINANCING_UNBALANCED, GRANT_ABOVE_BUDGET. */
  issues: string[];
}

export function parseBudgetLines(value: unknown): BudgetLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((line) =>
    line && typeof line === 'object' && typeof (line as BudgetLine).label === 'string' && typeof (line as BudgetLine).amount === 'string'
      ? [{ label: (line as BudgetLine).label, amount: (line as BudgetLine).amount }]
      : [],
  );
}

export function parseTeamMembers(value: unknown): TeamMember[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((member) =>
    member && typeof member === 'object' && typeof (member as TeamMember).fullName === 'string'
      ? [{ fullName: (member as TeamMember).fullName, role: String((member as TeamMember).role ?? '') }]
      : [],
  );
}

export function parseForecasts(value: unknown): ProjectForecasts {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    monthlyRevenue: typeof raw.monthlyRevenue === 'string' ? raw.monthlyRevenue : null,
    monthlyCosts: typeof raw.monthlyCosts === 'string' ? raw.monthlyCosts : null,
    jobsCreated: typeof raw.jobsCreated === 'number' ? raw.jobsCreated : null,
  };
}

/** Complétude exigée à la soumission : fiche renseignée, budget détaillé et plan de financement équilibré. */
export function evaluateProject(project: ProjectDraft): ProjectCompleteness {
  const missing: string[] = [];
  const filled = (value: string | null) => value !== null && value.trim().length > 0;
  if (!filled(project.sector)) missing.push('sector');
  if (!filled(project.city)) missing.push('city');
  if (!filled(project.problem)) missing.push('problem');
  if (!filled(project.solution)) missing.push('solution');
  if (!filled(project.market)) missing.push('market');
  if (!filled(project.description)) missing.push('description');
  if (!project.estimatedBudget) missing.push('estimatedBudget');
  if (!project.grantRequested) missing.push('grantRequested');
  const lines = parseBudgetLines(project.budgetLines);
  if (lines.length === 0) missing.push('budgetLines');

  const issues: string[] = [];
  if (project.estimatedBudget && lines.length > 0) {
    const total = lines.reduce((sum, line) => sum.plus(line.amount), new Decimal(0));
    if (!total.equals(project.estimatedBudget)) issues.push('BUDGET_LINES_MISMATCH');
  }
  if (project.estimatedBudget && project.grantRequested) {
    if (project.grantRequested.gt(project.estimatedBudget)) issues.push('GRANT_ABOVE_BUDGET');
    else if (!project.grantRequested.plus(project.personalContribution).equals(project.estimatedBudget)) {
      issues.push('FINANCING_UNBALANCED');
    }
  }
  return { complete: missing.length === 0 && issues.length === 0, missing, issues };
}
