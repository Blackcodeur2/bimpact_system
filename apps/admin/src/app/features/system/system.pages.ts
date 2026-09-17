import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'bi-forbidden-page',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="card card-body stack" style="max-width: 560px; margin: 40px auto; text-align: center; align-items: center">
        <bi-icon name="lock" [size]="36" />
        <h1>Accès refusé</h1>
        <p class="muted">Vos rôles ne donnent pas accès à cette page. Si vous en avez besoin, demandez l’ajout d’un rôle à un super administrateur.</p>
        <a class="btn" routerLink="/">Retour à l’accueil</a>
      </div>
    </div>
  `,
})
export class ForbiddenPage {}

@Component({
  selector: 'bi-not-found-page',
  imports: [RouterLink, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div class="card card-body stack" style="max-width: 560px; margin: 40px auto; text-align: center; align-items: center">
        <bi-icon name="search" [size]="36" />
        <h1>Page introuvable</h1>
        <p class="muted">L’adresse demandée n’existe pas ou plus.</p>
        <a class="btn" routerLink="/">Retour à l’accueil</a>
      </div>
    </div>
  `,
})
export class NotFoundPage {}
