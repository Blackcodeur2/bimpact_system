import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthStore } from './auth.store';

const AUTH_FLOW = /\/auth\/(staff\/login|refresh)$/;

/**
 * Ajoute le jeton d'accès, le renouvelle une fois s'il a expiré puis rejoue la requête.
 * Une session révoquée renvoie vers la connexion ; un mot de passe temporaire vers son remplacement.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiBaseUrl) || AUTH_FLOW.test(req.url)) return next(req);
  const auth = inject(AuthStore);
  const router = inject(Router);

  const withToken = (request: HttpRequest<unknown>) => {
    const token = auth.accessToken();
    return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
  };

  return next(withToken(req)).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) return throwError(() => error);
      const code = (error.error as { code?: string } | null)?.code;

      if (error.status === 401 && code === 'ACCESS_TOKEN_INVALID') {
        return from(auth.refresh()).pipe(
          switchMap((refreshed) => {
            if (refreshed) return next(withToken(req));
            auth.sessionLost();
            return throwError(() => error);
          }),
        );
      }
      if (error.status === 401 && !req.url.endsWith('/auth/logout')) {
        auth.sessionLost(code === 'SESSION_REVOKED' ? 'Votre session a été fermée. Reconnectez-vous.' : undefined);
      }
      if (error.status === 403 && code === 'ACCOUNT_NOT_ACTIVE') {
        auth.sessionLost('Votre compte n’est plus actif. Contactez un administrateur.');
      }
      if (error.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') {
        void router.navigate(['/compte/mot-de-passe']);
      }
      return throwError(() => error);
    }),
  );
};
