import { Component, computed, inject, input, output } from '@angular/core';

import { ArrivalTime } from '../arrival-time/arrival-time';
import { Favorite } from '../favorite/favorite';
import { ScheduleStatus } from '../schedule-status/schedule-status';
import { Seal, glutenSeal } from '../seal/seal';
import { TapaPhoto } from '../tapa-photo/tapa-photo';
import { TapasRoute } from '../tapas-route';
import { Venue } from '../venues';

/**
 * The «Fotos» view: each venue's name with its seals and favorite heart, how long it takes to get
 * there, whether it's open and the photos of its two tapas with their stars. The card opens the venue
 * and each photo enlarges (and gets rated there).
 */
@Component({
  selector: 'app-gallery',
  imports: [ArrivalTime, Favorite, ScheduleStatus, Seal, TapaPhoto],
  template: `
    <ul>
      @for (card of cards(); track card.venue.number) {
        @let venue = card.venue;
        @let arrival = tapasRoute.arrivals().get(venue.number);
        <li [attr.id]="'venue-' + venue.number">
          <span class="venue-mark"></span>
          <div class="heading">
            <span class="venue-number">{{ venue.number }}</span>
            <div class="title">
              <div class="name">
                <!-- Its ::after covers the whole card: the venue opens by clicking anywhere except the photos and the heart. -->
                <button type="button" class="open-venue" (click)="open.emit(venue.number)">
                  {{ venue.name }}
                </button>
                <div class="corner">
                  @if (card.gluten) {
                    <app-seal [kind]="card.gluten" />
                  }
                  @if (card.flavorRoute) {
                    <app-seal kind="flavor-route" />
                  }
                  <app-favorite [venue]="venue" />
                </div>
              </div>
              <span class="data">
                @if (arrival) {
                  <app-arrival-time [arrival]="arrival" distance />
                }
                <app-schedule-status [venue]="venue.number" />
              </span>
            </div>
          </div>
          <div class="photos">
            @for (tapa of venue.tapas; track tapa.number) {
              <figure>
                <button appTapaPhoto [venue]="venue.number" [tapa]="tapa"></button>
                <figcaption>{{ tapa.name }}</figcaption>
              </figure>
            }
          </div>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }

    ul {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
      gap: 1rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    // On top, the padding of the cards: with the rest of the heading measured like theirs, switching
    // view leaves it in place.
    li {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      padding: 1rem 0.6rem 0.6rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      transition: border-color 0.15s;

      &:hover {
        border-color: var(--control-border);
      }
    }

    .heading {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    // Out of the left edge, past less padding on the sides than the cards'.
    .venue-number {
      margin-left: calc(-0.6rem - 1px);
    }

    // The name, as text: the button is there to open the venue from the whole card.
    .open-venue,
    .open-venue:hover:not(:disabled) {
      flex: 1;
      justify-content: flex-start;
      min-width: 0;
      height: auto;
      padding: 0;
      border: 0;
      background: none;
      color: var(--text);
      font-weight: inherit;
      text-align: left;
      white-space: normal;
      text-wrap: balance;
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

    .title {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 0.1rem;
      min-width: 0;
    }

    // A long name wraps before reaching the seals and the heart.
    .name {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 1rem;
      font-weight: 700;
      line-height: 1.2;
    }

    // In the card's corner, without adding height to the row. The heart's drawing, as far from the top
    // as from the right: it has more room in its box above than on its side.
    .corner {
      flex: none;
      display: flex;
      align-self: flex-start;
      align-items: center;
      gap: 0.35rem;
      margin-top: -0.46rem;
    }

    // The size of the seals next to it, whose drawing fills more of its box.
    app-favorite {
      margin-left: 0.1rem;
      font-size: 1.2rem;
    }

    .data {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.4rem;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .photos {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem;
    }

    figure {
      margin: 0;
    }

    // The tapa's name centered under the photo, like in the map's popups.
    figcaption {
      margin-top: 0.25rem;
      text-align: center;
      font-size: 0.75rem;
      line-height: 1.25;
      color: var(--muted);
      text-wrap: balance;
    }
  `,
})
export class Gallery {
  readonly venues = input.required<readonly Venue[]>();
  readonly open = output<number>();

  protected readonly tapasRoute = inject(TapasRoute);

  /** The venue's seals: gluten-free (or on request) and Ruta de Sabor, if any tapa has them. */
  protected readonly cards = computed(() =>
    this.venues().map((venue) => ({
      venue,
      gluten: glutenSeal(venue.tapas),
      flavorRoute: venue.tapas.some((t) => t.flavorRoute),
    })),
  );
}
