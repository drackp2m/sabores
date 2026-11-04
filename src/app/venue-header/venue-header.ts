import { Component, computed, inject, input, output } from '@angular/core';

import { ArrivalTime } from '../arrival-time/arrival-time';
import { Icon } from '../icon/icon';
import { TapasRoute } from '../tapas-route';
import { Venue } from '../venues';

/**
 * A venue's heading, the same in its card and in the gallery, so that switching view leaves it as it
 * is: the number, centered with the name and the address (with how long it takes to get there), and
 * the map button at the top on the right.
 */
@Component({
  selector: 'app-venue-header',
  imports: [ArrivalTime, Icon],
  template: `
    <span class="venue-number">{{ venue().number }}</span>
    <div class="title">
      <h2>{{ venue().name }}</h2>
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
        [class.idle]="!mapButton()"
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

    .map-button {
      flex: none;
      align-self: flex-start;
      transition:
        background-color 0.15s,
        border-color 0.15s,
        opacity 0.15s,
        visibility 0.15s;

      // With nothing to do, it goes away without leaving its place: the heading stays as it is.
      &.idle {
        visibility: hidden;
        opacity: 0;
      }

      // While its card arrives from another view, as it was there (view-switch.ts).
      &.kept-shown {
        visibility: visible;
        opacity: 1;
        transition: none;
      }

      &.kept-hidden {
        visibility: hidden;
        opacity: 0;
        transition: none;
      }
    }
  `,
})
export class VenueHeader {
  readonly venue = input.required<Venue>();
  /** Whether the map button has something to do: not with the venue in the middle of the map. */
  readonly mapButton = input(true);
  readonly showOnMap = output<void>();

  private readonly tapasRoute = inject(TapasRoute);
  protected readonly arrival = computed(() => this.tapasRoute.arrivals().get(this.venue().number));
}
