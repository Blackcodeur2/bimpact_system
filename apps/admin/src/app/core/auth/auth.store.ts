import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiError } from '../api/api-error';
import { ApiService } from '../api/api.service';

export interface StaffMe {
  id: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  roles: string[];
  permissions: string[];
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
  lastLoginAt: string | null;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
}

/**
 * Le jeton d'accès (15 min) reste en mémoire ; le jeton de rafraîchissement est conservé pour l'onglet
 * uniquement (sessionStorage) : fermer l'onglet termine la session du back-office.
 */
const REFRESH_KEY = 'benskin.admin.refresh';

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly currentUser = signal<StaffMe | null>(null);
  readonly user = this.currentUser.asReadonly();
  readonly accessToken = signal<string | null>(null);
  /** Message affiché sur l'écran de connexion après une fin de session. */
  readonly sessionNotice = signal<string | null>(null);
  readonly permissions = computed(() => new Set(this.currentUser()?.permissions ?? []));
  readonly displayName = computed(() => {
    const user = this.currentUser();
    return user ? `${user.firstName} ${user.lastName}`.trim() || user.email : '';
  });

  private refreshInFlight: Promise<boolean> | null = null;

  /** L'agent dispose de toutes les permissions indiquées. */
  can(...codes: string[]): boolean {
    const granted = this.permissions();
    return codes.every((code) => granted.has(code));
  }

  /** L'agent dispose d'au moins une des permissions (liste vide : aucune exigence). */
  canAny(codes: readonly string[]): boolean {
    if (codes.length === 0) return true;
    const granted = this.permissions();
    return codes.some((code) => granted.has(code));
  }

  /** Au démarrage : reprise de la session de l'onglet si elle est encore valide. */
  async restore(): Promise<void> {
    if (!readRefreshToken()) return;
    if (!(await this.refresh())) return;
    try {
      this.currentUser.set(await this.api.get<StaffMe>('/admin/me'));
    } catch {
      this.clear();
    }
  }

  async login(email: string, password: string): Promise<StaffMe> {
    const result = await this.api.post<{ tokens: TokenPair; user: StaffMe }>('/auth/staff/login', { email, password });
    this.storeTokens(result.tokens);
    this.currentUser.set(result.user);
    this.sessionNotice.set(null);
    return result.user;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<StaffMe> {
    const user = await this.api.post<StaffMe>('/admin/me/password', { currentPassword, newPassword });
    this.currentUser.set(user);
    return user;
  }

  /** Un seul rafraîchissement à la fois, partagé par toutes les requêtes en attente. */
  refresh(): Promise<boolean> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  async logout(): Promise<void> {
    try {
      if (this.accessToken()) await this.api.post('/auth/logout');
    } catch {
      // La session locale est fermée même si le serveur est injoignable.
    } finally {
      this.clear();
      await this.router.navigateByUrl('/login');
    }
  }

  /** Session fermée côté serveur (expiration, révocation, suspension du compte). */
  sessionLost(message = 'Votre session a expiré. Reconnectez-vous.'): void {
    if (!this.currentUser()) return;
    this.clear();
    this.sessionNotice.set(message);
    void this.router.navigate(['/login']);
  }

  private async doRefresh(): Promise<boolean> {
    const refreshToken = readRefreshToken();
    if (!refreshToken) return false;
    try {
      this.storeTokens(await this.api.post<TokenPair>('/auth/refresh', { refreshToken }));
      return true;
    } catch (error) {
      // Hors ligne : la session n'est pas abandonnée, la requête échouera simplement.
      if (!ApiError.from(error).isNetwork) this.clear();
      return false;
    }
  }

  private storeTokens(pair: TokenPair): void {
    this.accessToken.set(pair.accessToken);
    writeRefreshToken(pair.refreshToken);
  }

  private clear(): void {
    this.accessToken.set(null);
    this.currentUser.set(null);
    writeRefreshToken(null);
  }
}

function readRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writeRefreshToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(REFRESH_KEY, token);
    else sessionStorage.removeItem(REFRESH_KEY);
  } catch {
    // Stockage indisponible (navigation privée stricte) : la session reste en mémoire.
  }
}
