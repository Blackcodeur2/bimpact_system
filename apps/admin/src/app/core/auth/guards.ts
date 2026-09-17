import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstAllowedRoute } from '../navigation';
import { AuthStore } from './auth.store';

/** Espace connecté : session active et mot de passe temporaire déjà remplacé. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthStore);
  const router = inject(Router);
  const user = auth.user();
  if (!user) {
    return router.createUrlTree(['/login'], state.url && state.url !== '/' ? { queryParams: { suite: state.url } } : {});
  }
  if (user.mustChangePassword) return router.createUrlTree(['/compte/mot-de-passe']);
  return true;
};

/** Session active, même avec un mot de passe temporaire (écran de remplacement). */
export const sessionGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return auth.user() ? true : inject(Router).createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return auth.user() ? inject(Router).createUrlTree(['/']) : true;
};

/** Permissions déclarées dans `data.permissions` (au moins une). */
export const permissionGuard: CanActivateFn = (route) => {
  const auth = inject(AuthStore);
  const permissions = (route.data['permissions'] as string[] | undefined) ?? [];
  return auth.canAny(permissions) ? true : inject(Router).createUrlTree(['/acces-refuse']);
};

export const homeRedirectGuard: CanActivateFn = () => {
  const auth = inject(AuthStore);
  return inject(Router).createUrlTree([firstAllowedRoute((permissions) => auth.canAny(permissions))]);
};
