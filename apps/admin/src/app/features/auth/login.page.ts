import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { formatDateTime } from '../../core/format';

@Component({
  selector: 'bi-login-page',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-pages.scss',
  template: `
    <div class="auth-page">
      <section class="auth-hero" aria-hidden="true">
        <img src="logo-mark.svg" alt="" width="64" height="64" />
        <p class="brand">BENSKIN IMPACT</p>
        <p class="tagline">200 FCFA aujourd’hui.<br />Une opportunité demain.</p>
        <p class="hero-note">Back-office de pilotage : membres, finances, programme et solidarité.</p>
      </section>
      <section class="auth-panel">
        <form class="auth-card stack" (submit)="$event.preventDefault(); submit()" novalidate>
          <div class="stack-sm">
            <h1>Connexion</h1>
            <p class="muted">Espace réservé aux équipes BENSKIN IMPACT.</p>
          </div>

          @if (auth.sessionNotice(); as notice) {
            <div class="alert alert-warning" role="status">{{ notice }}</div>
          }

          <div class="field">
            <label for="email">Adresse e-mail</label>
            <input
              id="email"
              class="input"
              type="email"
              name="email"
              autocomplete="username"
              [(ngModel)]="email"
              [class.invalid]="!!emailError()"
              required
            />
            @if (emailError()) {
              <span class="field-error">{{ emailError() }}</span>
            }
          </div>

          <div class="field">
            <label for="password">Mot de passe</label>
            <div class="password">
              <input
                id="password"
                class="input"
                [type]="showPassword() ? 'text' : 'password'"
                name="password"
                autocomplete="current-password"
                [(ngModel)]="password"
                required
              />
              <button type="button" class="btn btn-ghost btn-sm" (click)="showPassword.set(!showPassword())">
                {{ showPassword() ? 'Masquer' : 'Afficher' }}
              </button>
            </div>
          </div>

          @if (error()) {
            <div class="alert alert-danger" role="alert">{{ error() }}</div>
          }

          <button class="btn btn-block" type="submit" [disabled]="submitting()">
            @if (submitting()) {
              <span class="spinner"></span>
            }
            Se connecter
          </button>
          <p class="hint">Mot de passe oublié ? Un super administrateur peut le réinitialiser depuis « Utilisateurs & rôles ».</p>
        </form>
      </section>
    </div>
  `,
})
export class LoginPage {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly emailError = signal<string | null>(null);

  protected async submit(): Promise<void> {
    this.error.set(null);
    this.emailError.set(null);
    if (!this.email().trim() || !this.password()) {
      this.error.set('Saisissez votre adresse e-mail et votre mot de passe.');
      return;
    }
    this.submitting.set(true);
    try {
      const user = await this.auth.login(this.email().trim(), this.password());
      this.password.set('');
      if (user.mustChangePassword) {
        await this.router.navigateByUrl('/compte/mot-de-passe');
        return;
      }
      const next = this.route.snapshot.queryParamMap.get('suite');
      await this.router.navigateByUrl(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
    } catch (caught) {
      const error = ApiError.from(caught);
      if (error.code === 'ACCOUNT_LOCKED') {
        const until = error.details['lockedUntil'];
        this.error.set(
          typeof until === 'string'
            ? `Trop de tentatives. Réessayez après ${formatDateTime(until)}.`
            : error.message,
        );
      } else if (error.code === 'VALIDATION_FAILED') {
        this.emailError.set(error.field('email'));
        if (!error.field('email')) this.error.set(error.message);
      } else {
        this.error.set(error.message);
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
