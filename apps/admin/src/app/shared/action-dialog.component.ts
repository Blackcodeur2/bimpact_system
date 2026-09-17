import { ChangeDetectionStrategy, Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

let nextId = 0;

/**
 * Confirmation d'une action sensible, avec motif facultatif ou obligatoire.
 * Le parent gère l'appel à l'API (busy / error) et ferme la boîte en cas de succès.
 */
@Component({
  selector: 'bi-action-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="dialog" [class.dialog-wide]="wide()" (cancel)="onCancel($event)">
      <form (submit)="$event.preventDefault(); submit()">
        <div class="dialog-header">
          <h2>{{ title() }}</h2>
        </div>
        <div class="dialog-body stack">
          @if (message()) {
            <p class="muted pre-line">{{ message() }}</p>
          }
          <ng-content />
          @if (reasonLabel()) {
            <div class="field">
              <label [for]="fieldId">{{ reasonLabel() }}</label>
              <textarea class="input" [id]="fieldId" name="reason" rows="3" [(ngModel)]="reason"></textarea>
              <span class="hint">{{ reasonMin() }} caractères minimum{{ reasonHint() ? ' — ' + reasonHint() : '' }}</span>
            </div>
          }
          @if (error()) {
            <div class="alert alert-danger" role="alert">{{ error() }}</div>
          }
        </div>
        <div class="dialog-footer">
          <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="close()">Annuler</button>
          <button
            type="submit"
            class="btn"
            [class.btn-danger]="tone() === 'danger'"
            [class.btn-success]="tone() === 'success'"
            [disabled]="busy() || !canSubmit()"
          >
            @if (busy()) {
              <span class="spinner"></span>
            }
            {{ confirmLabel() }}
          </button>
        </div>
      </form>
    </dialog>
  `,
})
export class ActionDialogComponent {
  readonly title = input.required<string>();
  readonly message = input('');
  readonly confirmLabel = input('Confirmer');
  readonly tone = input<'primary' | 'danger' | 'success'>('primary');
  readonly reasonLabel = input('');
  readonly reasonHint = input('');
  readonly reasonMin = input(5);
  readonly busy = input(false);
  readonly error = input<string | null>(null);
  /** Validité du contenu projeté (champs supplémentaires). */
  readonly valid = input(true);
  readonly wide = input(false);
  readonly confirmed = output<string>();

  protected readonly fieldId = `dialog-reason-${nextId++}`;
  protected readonly reason = signal('');
  protected readonly canSubmit = computed(
    () => this.valid() && (!this.reasonLabel() || this.reason().trim().length >= this.reasonMin()),
  );
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  open(): void {
    this.reason.set('');
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected submit(): void {
    if (this.canSubmit() && !this.busy()) this.confirmed.emit(this.reason().trim());
  }

  protected onCancel(event: Event): void {
    if (this.busy()) event.preventDefault();
  }
}
