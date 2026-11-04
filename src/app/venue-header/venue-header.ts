import { Component, booleanAttribute, computed, inject, input, output } from '@angular/core';

import { ArrivalTime } from '../arrival-time/arrival-time';
import { Icon } from '../icon/icon';
import { TapasRoute } from '../tapas-route';
import { Venue } from '../venues';

/**
 * A venue's heading, the same in its card and in the gallery, so that switching view leaves it as it
 * is: the number, centered with the name and the address (with how long it takes to get there), and
 * the map button at the top on the right. In the gallery the name opens the venue: its ::after covers
 * the whole card, and what has to stay clickable on top of it is relative (the map button, the heart).
 */
@Component({
  selector: 'app-venue-header',
  imports: [ArrivalTime, Icon],
  template: `
    <span class="venue-number">{{ venue().number }}</span>
    <div class="title">
      @if (opens()) {
        <h2>
          <button type="button" class="open-venue" (click)="open.emit()">{{ venue().name }}</button>
        </h2>
      } @else {
        <h2>{{ venue().name }}</h2>
      }
      <p class="address">
        <span>{{ venue().address }}</span>
        @if (arrival(); as arrival) {
          <app-arrival-time [arrival]="arrival" />
        }
      </p>
    </div>
    @if (venue().location) {
      <button
        type="button"
        class="secondary icon map-button"
        title="Ver en el mapa"
        aria-label="Ver en el mapa"
        (click)="showOnMap.emit()"
      >
        <app-icon name="pin" />
      </button>
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .title {
      flex: 1;
      min-width: 0;
    }

    h2 {
      font-size: 1rem;
    }

    .address {
      display: flex;
      flex-wrap: wrap;
      column-gap: 0.75rem;
      margin: 0.1rem 0 0;
      font-size: 0.85rem;
      color: var(--muted);
    }

    // Above the name's ::after, in the gallery.
    .map-button {
      position: relative;
      flex: none;
      align-self: flex-start;
    }

    // The name, as text: the button is there to open the venue from the whole card.
    .open-venue,
    .open-venue:hover:not(:disabled) {
      display: inline;
      height: auto;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      white-space: normal;
    }

    .open-venue {
      position: static;

      &::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
      }

      &:focus-visible {
        outline: none;

        &::after {
          outline: 2px solid var(--accent);
          outline-offset: 2px;
          border-radius: var(--radius);
        }
      }
    }
  `,
})
export class VenueHeader {
  readonly venue = input.required<Venue>();
  /** The name opens the venue (in the gallery). */
  readonly opens = input(false, { transform: booleanAttribute });
  readonly open = output<void>();
  readonly showOnMap = output<void>();

  private readonly tapasRoute = inject(TapasRoute);
  protected readonly arrival = computed(() => this.tapasRoute.arrivals().get(this.venue().number));
}
