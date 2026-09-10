import { SetMetadata } from '@nestjs/common';

/**
 * Politique d'accès obligatoire : chaque route déclare explicitement l'une des trois options.
 * Une route sans politique est refusée par AccessPolicyGuard (défaut sûr).
 */
export const ACCESS_PUBLIC = 'access:public';
export const ACCESS_AUTHENTICATED = 'access:authenticated';
export const ACCESS_PERMISSIONS = 'access:permissions';

/** Accessible sans authentification (santé, inscription, connexion…). */
export const Public = () => SetMetadata(ACCESS_PUBLIC, true);

/** Tout utilisateur authentifié avec une session active (ex. déconnexion). */
export const Authenticated = () => SetMetadata(ACCESS_AUTHENTICATED, true);

/** Utilisateur authentifié disposant de toutes les permissions listées. */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(ACCESS_PERMISSIONS, permissions);
