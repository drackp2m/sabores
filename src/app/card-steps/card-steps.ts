import { Component, computed, input, output } from '@angular/core';

import { Icon } from '../icon/icon';
import { Venue } from '../venues';

/**
 * In the venue view, the card before the venue's and the one after, among the cards side by side:
 * on touch screens they're swiped and these aren't there; with a mouse they can't be (nor with a
 * wheel, without Shift), and the scroll bar can be hidden, as on a Mac. A pill like «Volver»'s, split
 * down the middle, floating where app.scss puts it. At either end, the half with nothing beyond it
 * stays, dimmed.
 */
@Component({
  selector: 'app-card-steps',
  imports: [Icon],
  template: `
    <button
      type="button"
      title="Local anterior"
      aria-label="Local anterior"
      [disabled]="around().previous === null"
      (click)="go(around().previous)"
    >
      <app-icon name="previous" />
    </button>
    <button
      type="button"
      title="Local siguiente"
      aria-label="Local siguiente"
      [disabled]="around().next === null"
      (click)="go(around().next)"
    >
      <app-icon name="next" />
    </button>
  `,
  styles: `
    @use 'media';

    :host {
      display: flex;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--brand);

      @include media.touch {
        display: none;
      }
    }

    // The split, a line of light shorter than the pill: the same with either half dimmed.
    :host::before {
      content: '';
      position: absolute;
      inset: 25% auto 25% 50%;
      width: 1px;
      background: rgb(255 255 255 / 0.3);
    }

    button {
      width: 3.25rem;
      height: 100%;
      padding: 0;
      border: 0;
      background: transparent;
      font-size: 1.3rem;

      @media (hover: hover) {
        &:hover:not(:disabled) {
          background: var(--brand-dark);
        }
      }

      // Each half of the pill, with its icon a little away from the middle.
      &:first-child {
        padding-right: 0.15rem;
        border-radius: 999px 0 0 999px;
      }

      &:last-child {
        padding-left: 0.15rem;
        border-radius: 0 999px 999px 0;
      }
    }
  `,
})
export class CardSteps {
  /** The cards side by side, in their order. */
  readonly venues = input.required<readonly Venue[]>();
  /** The venue, whose card is in the middle. */
  readonly current = input.required<number | null>();
  /** Number of the venue whose card is to come to the middle. */
  readonly venueSelect = output<number>();

  /** The venues on each side of the current one: null at either end. */
  protected readonly around = computed(() => {
    const venues = this.venues();
    const at = venues.findIndex((venue) => venue.number === this.current());
    if (at < 0) return { previous: null, next: null };
    return { previous: venues[at - 1]?.number ?? null, next: venues[at + 1]?.number ?? null };
  });

  protected go(number: number | null): void {
    if (number !== null) this.venueSelect.emit(number);
  }
}
