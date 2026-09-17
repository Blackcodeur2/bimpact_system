export const ROLE_NAMES: Record<string, string> = {
  SUPER_ADMIN: 'Super administrateur',
  ADMIN: 'Administrateur',
  FINANCE: 'Finance',
  OPS: 'Opérations',
  COMPLIANCE: 'Conformité',
  PROGRAM: 'Programme',
  RISK: 'Risque',
  CLAIMS: 'Sinistres / solidarité',
};

export function roleName(code: string): string {
  return ROLE_NAMES[code] ?? code;
}
