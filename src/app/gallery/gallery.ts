import { Component, computed, input, output } from '@angular/core';

import { Favorite } from '../favorite/favorite';
import { ScheduleStatus } from '../schedule-status/schedule-status';
import { Seal, glutenSeal } from '../seal/seal';
import { TapaPhoto } from '../tapa-photo/tapa-photo';
import { VenueHeader } from '../venue-header/venue-header';
import { Venue } from '../venues';

/**
 * The «Fotos» view: each venue with the same heading as its card (number, name, address, how long it
 * takes to get there and the map button), the photos of its two tapas with their stars and, at the
 * bottom, whether it's open, its seals and the favorite heart, where the card has it. The map button
 * opens the venue (on desktop, takes the map beside it there) and each photo enlarges (and gets rated
 * there).
 */
@Component({
  selector: 'app-gallery',
  imports: [Favorite, ScheduleStatus, Seal, TapaPhoto, VenueHeader],
  template: `
    <ul>
      @for (card of cards(); track card.venue.number) {
        @let venue = card.venue;
        <li [attr.id]="'venue-' + venue.number">
          <span class="venue-mark"></span>
          <app-venue-header
            [venue]="venue"
            [mapButton]="venue.number !== centered()"
            (showOnMap)="showOnMap.emit(venue.number)"
          />
          <div class="photos">
            @for (tapa of venue.tapas; track tapa.number) {
              <figure>
                <button appTapaPhoto [venue]="venue.number" [tapa]="tapa"></button>
                <figcaption>{{ tapa.name }}</figcaption>
              </figure>
            }
          </div>
          <!-- Bottom right, the heart, like in the card. -->
          <div class="bottom">
            <app-schedule-status [venue]="venue.number" />
            @if (card.gluten) {
              <app-seal [kind]="card.gluten" />
            }
            @if (card.flavorRoute) {
              <app-seal kind="flavor-route" />
            }
            <app-favorite [venue]="venue" />
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

    // On top, the padding of the cards; on the sides and at the bottom, less, for the photos.
    li {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      padding: 1rem 0.6rem 0.6rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
    }

    // With the padding of the card's sides, which this one has less of: the heading stays in place on
    // switching view.
    app-venue-header {
      margin-inline: 0.4rem;
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

    // Whether it's open on the left; on the right, the seals and the heart.
    .bottom {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      min-height: 1.4rem;
      padding-left: 0.4rem;

      app-schedule-status {
        margin-right: auto;
      }
    }

    // Like in the card (venue-card.scss): its size and line, and as far from the corner. It has 0.4rem
    // less padding on the sides and at the bottom.
    app-favorite {
      --icon-stroke: 1.68;
      margin: 0 0.2rem 0.2rem 0.1rem;
      font-size: 1.4rem;
    }
  `,
})
export class Gallery {
  readonly venues = input.required<readonly Venue[]>();
  /** On desktop, the venue in the middle of the map beside it: its map button has nothing to do. */
  readonly centered = input<number | null>(null);
  /** The map button: on phones the venue opens, on its map; on desktop, the map goes to it. */
  readonly showOnMap = output<number>();

  /** The venue's seals: gluten-free (or on request) and Ruta de Sabor, if any tapa has them. */
  protected readonly cards = computed(() =>
    this.venues().map((venue) => ({
      venue,
      gluten: glutenSeal(venue.tapas),
      flavorRoute: venue.tapas.some((t) => t.flavorRoute),
    })),
  );
}
