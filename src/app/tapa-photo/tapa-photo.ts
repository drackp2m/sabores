import { Component, ElementRef, computed, inject, input } from '@angular/core';

import { Store } from '../store';
import { Tapa, photoUrl, tapaKey } from '../venues';
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
    <span class="stars stars-pill" aria-hidden="true" [style.--value]="rating()"></span>
  `,
  host: {
    type: 'button',
    '[attr.aria-label]': 'label()',
    '(click)': 'enlarge()',
  },
  styles: `
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

    // On hover, the photo moves a little closer within its frame, without moving anything else.
    img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 690 / 439;
      object-fit: cover;
      transition: transform 0.3s ease-out;

      :host(:is(:hover, :focus-visible)) & {
        transform: scale(1.06);
      }

      @media (prefers-reduced-motion: reduce) {
        transition: none;
      }
    }

    // The star from ICONS (icon.ts) with the stars' 1.5 stroke, in a slot 1.1em wide: the star and the
    // gap up to the next one.
    $star-path: 'M12 2.9L14.44 9.54L21.51 9.81L15.95 14.18L17.88 20.99L12 17.05L6.12 20.99L8.05 14.18L2.49 9.81L9.56 9.54z';
    @function star($paint) {
      @return url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26.4 24'%3E%3Cpath d='#{$star-path}' stroke-linejoin='round' #{$paint}/%3E%3C/svg%3E");
    }

    // At the bottom center of the photo (in the viewer they move below it, large). All five in a
    // single element, the same size as the viewer's (stars.ts): the outline of them all (::after) on
    // top of the fill of the rated ones (::before), with the star as a mask.
    .stars {
      position: absolute;
      bottom: 0.3rem;
      left: 50%;
      font-size: 0.8rem;
      translate: -50%;

      &::before,
      &::after {
        content: '';
        height: 1em;
        mask-position: 0 0;
        mask-size: 1.1em 1em;
        mask-repeat: repeat-x;
      }

      &::before {
        position: absolute;
        top: 0.2em;
        left: 0.35em;
        width: calc(var(--value) * 1.1em);
        background: var(--star);
        mask-image: star("fill='%23000'");
      }

      &::after {
        position: relative;
        width: 5.4em;
        background: currentColor;
        mask-image: star("fill='none' stroke='%23000' stroke-width='1.5'");
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

  protected readonly photo = computed(() => photoUrl(this.tapa(), 500));
  protected readonly rating = computed(
    () => this.store.ratings().get(tapaKey(this.venue(), this.tapa().number)) ?? 0,
  );
  protected readonly label = computed(() => {
    const rating = this.rating();
    const stars = rating ? `${rating} de 5 estrellas` : 'sin valorar';
    return `Ampliar y valorar la foto de ${this.tapa().name} (${stars})`;
  });

  protected enlarge(): void {
    this.viewer.enlarge(this.host, this.venue(), this.tapa());
  }
}
