import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  input,
  model,
  viewChild,
} from '@angular/core';
import { FormValueControl } from '@angular/forms/signals';

/**
 * A time field whose placeholder is the time that applies while it's empty; <input type="time">
 * doesn't have one, so it goes on top. A half-typed time isn't used: it counts as empty.
 */
@Component({
  selector: 'app-time-field',
  template: `
    <input
      #field
      type="time"
      [attr.aria-label]="label()"
      [disabled]="disabled()"
      [class.implied]="implied()"
      (input)="value.set(field.value)"
    />
    @if (implied()) {
      <span aria-hidden="true">{{ placeholder() }}</span>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      min-width: 0;
    }

    input {
      flex: 1;
    }

    // While it's being edited, its own text is the one that counts.
    .implied:not(:focus) {
      color: transparent;
    }

    input:focus + span {
      display: none;
    }

    span {
      position: absolute;
      inset: 0 auto 0 calc(0.75rem + 1px);
      display: flex;
      align-items: center;
      font-size: 0.95rem;
      color: var(--muted);
      pointer-events: none;
    }
  `,
})
export class TimeField implements FormValueControl<string> {
  readonly value = model('');
  readonly disabled = input(false);
  readonly label = input.required<string>();
  readonly placeholder = input('');

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  protected readonly implied = computed(() => !this.value() && !!this.placeholder());

  constructor() {
    // Not with [value]: emptying the model on a half-typed time would wipe what's been typed so far.
    // Disabled there's nothing left to finish, so it goes.
    afterRenderEffect(() => {
      const field = this.field().nativeElement;
      if (this.disabled() || field.value !== this.value()) field.value = this.value();
    });
  }
}
