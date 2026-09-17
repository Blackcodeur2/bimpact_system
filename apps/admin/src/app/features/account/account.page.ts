import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthStore } from '../../core/auth/auth.store';
import { roleName } from '../../core/roles';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { FrDateTimePipe, PhonePipe } from '../../shared/pipes';

@Component({
  selector: 'bi-account-page',
  imports: [RouterLink, PageHeaderComponent, FrDateTimePipe, PhonePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <bi-page-header title="Mon compte" subtitle="Vos informations de connexion et les droits attribués par un super administrateur.">
        <a class="btn btn-secondary" routerLink="/compte/mot-de-passe">Changer mon mot de passe</a>
      </bi-page-header>
      @if (auth.user(); as user) {
        <div class="grid grid-main-side">
          <section class="card">
            <div class="card-header"><h3>Permissions effectives</h3></div>
            <div class="card-body">
              <div class="row">
                @for (permission of user.permissions; track permission) {
                  <span class="badge badge-plain mono">{{ permission }}</span>
                } @empty {
                  <span class="muted">Aucune permission attribuée.</span>
                }
              </div>
            </div>
          </section>
          <section class="card">
            <div class="card-header"><h3>Identité</h3></div>
            <div class="card-body">
              <dl class="dl">
                <dt>Nom</dt>
                <dd>{{ user.firstName }} {{ user.lastName }}</dd>
                <dt>E-mail</dt>
                <dd>{{ user.email }}</dd>
                <dt>Téléphone</dt>
                <dd>{{ user.phone | phone }}</dd>
                <dt>Rôles</dt>
                <dd>{{ roles() }}</dd>
                <dt>Dernière connexion</dt>
                <dd>{{ user.lastLoginAt | frDateTime }}</dd>
                <dt>Mot de passe changé</dt>
                <dd>{{ user.passwordChangedAt | frDateTime }}</dd>
              </dl>
            </div>
          </section>
        </div>
      }
    </div>
  `,
})
export class AccountPage {
  protected readonly auth = inject(AuthStore);
  protected readonly roles = computed(() => (this.auth.user()?.roles ?? []).map(roleName).join(', ') || '—');
}
