import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiError } from '../../core/api/api-error';
import { AuthStore } from '../../core/auth/auth.store';
import { ToastService } from '../../core/toast.service';

const MIN_LENGTH = 12;

@Component({
  selector: 'bi-change-password-page',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './auth-pages.scss',
  template: `
    <div class="auth-panel" style="min-height: 100vh">
      <form class="auth-card stack" (submit)="$event.preventDefault(); submit()" novalidate>
        <div class="stack-sm">
          <h1>{{ temporary() ? 'Choisissez votre mot de passe' : 'Changer mon mot de passe' }}</h1>
          <p class="muted">{{ auth.user()?.email }}</p>
        </div>

        @if (temporary()) {
          <div class="alert alert-warning" role="status">
            Votre mot de passe est temporaire. Remplacez-le pour accéder au back-office.
          </div>
        }

        <div class="field">
          <label for="current">{{ temporary() ? 'Mot de passe temporaire' : 'Mot de passe actuel' }}</label>
          <input id="current" class="input" type="password" name="current" autocomplete="current-password" [(ngModel)]="current" [class.invalid]="!!currentError()" />
          @if (currentError()) {
            <span class="field-error">{{ currentError() }}</span>
          }
        </div>

        <div class="field">
          <label for="next">Nouveau mot de passe</label>
          <input id="next" class="input" type="password" name="next" autocomplete="new-password" [(ngModel)]="next" />
          <ul class="rules">
            <li [class.ok]="next().length >= minLength">Au moins {{ minLength }} caractères (une phrase facile à retenir convient)</li>
            <li>Ni votre nom, ni votre adresse e-mail, ni un mot de passe courant</li>
          </ul>
          @for (issue of policyIssues(); track issue) {
            <span class="field-error">{{ issue }}</span>
          }
        </div>

        <div class="field">
          <label for="confirm">Confirmez le nouveau mot de passe</label>
          <input id="confirm" class="input" type="password" name="confirm" autocomplete="new-password" [(ngModel)]="confirm" [class.invalid]="mismatch()" />
          @if (mismatch()) {
            <span class="field-error">Les deux saisies sont différentes.</span>
          }
        </div>

        @if (error()) {
          <div class="alert alert-danger" role="alert">{{ error() }}</div>
        }

        <button class="btn btn-block" type="submit" [disabled]="submitting() || !canSubmit()">
          @if (submitting()) {
            <span class="spinner"></span>
          }
          Enregistrer le mot de passe
        </button>
        <p class="hint">Vos autres sessions ouvertes seront fermées.</p>
        <div class="row">
          @if (!temporary()) {
            <a routerLink="/compte">Retour à mon compte</a>
          }
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost btn-sm" (click)="auth.logout()">Se déconnecter</button>
        </div>
      </form>
    </div>
  `,
})
export class ChangePasswordPage {
  protected readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly minLength = MIN_LENGTH;
  protected readonly current = signal('');
  protected readonly next = signal('');
  protected readonly confirm = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly currentError = signal<string | null>(null);
  protected readonly policyIssues = signal<string[]>([]);

  protected readonly temporary = computed(() => this.auth.user()?.mustChangePassword ?? false);
  protected readonly mismatch = computed(() => this.confirm().length > 0 && this.confirm() !== this.next());
  protected readonly canSubmit = computed(
    () => this.current().length > 0 && this.next().length >= MIN_LENGTH && this.next() === this.confirm(),
  );

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.error.set(null);
    this.currentError.set(null);
    this.policyIssues.set([]);
    try {
      await this.auth.changePassword(this.current(), this.next());
      this.toasts.success('Mot de passe enregistré. Vos autres sessions ont été fermées.');
      await this.router.navigateByUrl('/');
    } catch (caught) {
      const error = ApiError.from(caught);
      if (error.code === 'INVALID_CURRENT_PASSWORD') this.currentError.set(error.message);
      else if (error.code === 'PASSWORD_TOO_WEAK') this.policyIssues.set(error.fields['newPassword'] ?? [error.message]);
      else this.error.set(error.message);
    } finally {
      this.submitting.set(false);
    }
  }
}
