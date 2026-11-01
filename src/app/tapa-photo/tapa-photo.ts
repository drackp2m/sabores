import { Component, ElementRef, computed, inject, input } from '@angular/core';

import { STAR_PATH } from '../icon/icon';
import { Store } from '../store';
import { Tapa, photoUrl } from '../venues';
import { Viewer } from '../viewer/viewer';

/**
 * A tapa's thumbnail (in the cards and the gallery): a button that enlarges it in the viewer, where
 * it gets rated, with its stars on top.
 */
@Component({
  selector: 'button[appTapaPhoto]',
  template: `
    <img
      [src]="photo()"
      [alt]="tapa().name"
      loading="lazy"
      decoding="async"
      width="690"
      height="439"
    />
    <span class="stars stars-pill" aria-hidden="true">
      <svg
        viewBox="-8.4 -4.8 146.4 33.6"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
      >
        @for (x of stars; track x) {
          <path
            [attr.d]="star"
            [attr.transform]="'translate(' + x + ')'"
            [class.filled]="$index < rating()"
          />
        }
      </svg>
    </span>
  `,
  host: {
    type: 'button',
    '[attr.aria-label]': 'label()',
    '(click)': 'enlarge()',
  },
  styles: `
    @use 'media';

    // Full width: a button fits what it has inside, and until the photo loads (lazily) it wouldn't
    // measure anything, nor would it load in some browsers. Relative, to stay above whatever covers
    // the card (the gallery's heading).
    :host,
    :host(:hover:not(:disabled)) {
      position: relative;
      display: block;
      width: 100%;
      height: auto;
      padding: 0;
      // Thin: photos with light backgrounds don't blend into the card (0.5px: one screen line on a
      // phone).
      border: 0.5px solid var(--border);
      border-radius: 0.5rem;
      background: var(--border);
      overflow: hidden;
      cursor: zoom-in;
    }

    // On hover, the photo moves a little closer within its frame, without moving anything else. Not
    // on touch screens: there the hover stays on after tapping.
    img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 690 / 439;
      object-fit: cover;
      transition: transform 0.3s ease-out;

      @media (hover: hover) {
        :host(:is(:hover, :focus-visible)) & {
          transform: scale(1.06);
        }
      }

      @include media.reduced-motion {
        transition: none;
      }
    }

    // At the bottom center of the photo (in the viewer they move below it, large), the same size as
    // the viewer's (stars.ts): its padding, in the viewBox, and 1.1em per star. Centered with margins
    // and not with a transform, so that it's painted on whole pixels like the photo.
    .stars {
      position: absolute;
      inset-inline: 0;
      bottom: 0.3rem;
      width: 6.1em;
      height: 1.4em;
      margin-inline: auto;
      padding: 0;
      font-size: 0.8rem;

      // All five in a single <svg>, and not as a mask: Safari rounds a mask's size to whole pixels,
      // and they'd come out wider than the viewer's. The transform, for the same reason as in stars.ts.
      svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        transform: translate(0);
      }

      .filled {
        fill: var(--star);
      }
    }
  `,
})
export class TapaPhoto {
  readonly venue = input.required<number>();
  readonly tapa = input.required<Tapa>();

  private readonly viewer = inject(Viewer);
  private readonly store = inject(Store);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  protected readonly star = STAR_PATH;
  /** Where each star starts: every 1.1em, with the 24 of the icons being 1em. */
  protected readonly stars = [0, 26.4, 52.8, 79.2, 105.6];
  protected readonly photo = computed(() => photoUrl(this.tapa(), 500));
  protected readonly rating = computed(() => this.store.stars(this.venue(), this.tapa().number));
  protected readonly label = computed(() => {
    const rating = this.rating();
    const stars = rating ? `${rating} de 5 estrellas` : 'sin valorar';
    return `Ampliar y valorar la foto de ${this.tapa().name} (${stars})`;
  });

  protected enlarge(): void {
    this.viewer.enlarge(this.host, this.venue(), this.tapa());
  }
}
