import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '../core/auth/auth.store';
import { NAV_SECTIONS } from '../core/navigation';
import { roleName } from '../core/roles';
import { IconComponent } from '../shared/icon.component';

@Component({
  selector: 'bi-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    .shell {
      min-height: 100vh;
    }
    .sidebar {
      position: fixed;
      inset: 0 auto 0 0;
      width: var(--sidebar-width);
      background: linear-gradient(180deg, var(--navy-900), var(--navy-800));
      color: #dbe6f5;
      display: flex;
      flex-direction: column;
      z-index: 30;
      transition: transform 0.2s ease;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 18px 20px;
      color: #fff;
      text-decoration: none;
    }
    .brand span {
      display: flex;
      flex-direction: column;
      line-height: 1.1;
      font-weight: 800;
      letter-spacing: 0.02em;
    }
    .brand small {
      font-weight: 500;
      color: #9fb6d6;
      letter-spacing: 0;
      margin-top: 2px;
    }
    nav {
      flex: 1;
      overflow-y: auto;
      padding: 4px 12px 20px;
    }
    .nav-section {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #7f98bd;
      padding: 16px 10px 6px;
    }
    .nav-link {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 10px;
      color: #dbe6f5;
      font-weight: 500;
      text-decoration: none;
    }
    .nav-link:hover {
      background: rgba(255, 255, 255, 0.06);
      color: #fff;
    }
    .nav-link.active {
      background: rgba(56, 144, 204, 0.22);
      color: #fff;
      box-shadow: inset 3px 0 0 var(--growth-500);
    }
    .main {
      margin-left: var(--sidebar-width);
      min-width: 0;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 20;
      height: 60px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 24px;
      background: rgba(247, 249, 252, 0.9);
      backdrop-filter: blur(8px);
      border-bottom: 1px solid var(--border);
    }
    .user {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text);
      text-decoration: none;
    }
    .avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--primary-500);
      color: #fff;
      font-weight: 700;
      font-size: 13px;
    }
    .user-text {
      display: flex;
      flex-direction: column;
      line-height: 1.2;
    }
    .user-text small {
      color: var(--text-muted);
    }
    .menu-btn,
    .backdrop {
      display: none;
    }
    @media (max-width: 960px) {
      .sidebar {
        transform: translateX(-100%);
      }
      .nav-open .sidebar {
        transform: none;
      }
      .nav-open .backdrop {
        display: block;
        position: fixed;
        inset: 0;
        background: rgba(6, 27, 69, 0.4);
        z-index: 25;
      }
      .main {
        margin-left: 0;
      }
      .menu-btn {
        display: inline-flex;
      }
      .user-text {
        display: none;
      }
    }
  `,
  template: `
    <div class="shell" [class.nav-open]="navOpen()">
      <aside class="sidebar" aria-label="Navigation principale">
        <a class="brand" routerLink="/">
          <img src="logo-mark.svg" alt="" width="34" height="34" />
          <span>BENSKIN IMPACT<small>Back-office</small></span>
        </a>
        <nav>
          @for (section of sections(); track section.title) {
            <div class="nav-section">{{ section.title }}</div>
            @for (item of section.items; track item.route) {
              <a class="nav-link" [routerLink]="item.route" routerLinkActive="active" (click)="navOpen.set(false)">
                <bi-icon [name]="item.icon" /> {{ item.label }}
              </a>
            }
          }
        </nav>
      </aside>
      <div class="backdrop" (click)="navOpen.set(false)"></div>
      <div class="main">
        <header class="topbar">
          <button type="button" class="icon-btn menu-btn" aria-label="Ouvrir le menu" (click)="navOpen.set(true)">
            <bi-icon name="menu" />
          </button>
          <div class="spacer"></div>
          <a class="user" routerLink="/compte" title="Mon compte">
            <span class="avatar" aria-hidden="true">{{ initials() }}</span>
            <span class="user-text">
              <strong>{{ auth.displayName() }}</strong>
              <small>{{ roles() }}</small>
            </span>
          </a>
          <button type="button" class="icon-btn" title="Se déconnecter" aria-label="Se déconnecter" (click)="auth.logout()">
            <bi-icon name="logout" />
          </button>
        </header>
        <main id="contenu">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class ShellComponent {
  protected readonly auth = inject(AuthStore);
  protected readonly navOpen = signal(false);

  protected readonly sections = computed(() => {
    this.auth.permissions();
    return NAV_SECTIONS.map((section) => ({
      title: section.title,
      items: section.items.filter((item) => this.auth.canAny(item.permissions)),
    })).filter((section) => section.items.length > 0);
  });

  protected readonly initials = computed(() => {
    const user = this.auth.user();
    return `${user?.firstName.charAt(0) ?? ''}${user?.lastName.charAt(0) ?? ''}`.toUpperCase() || '?';
  });

  protected readonly roles = computed(() => (this.auth.user()?.roles ?? []).map(roleName).join(', '));
}
