import {
  Component,
  ElementRef,
  Injectable,
  afterRenderEffect,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { SETTLE } from '../animate-height';
import { reducedMotion } from '../media';
import { PHRASES, Stars } from '../stars/stars';
import { Store } from '../store';
import { Tapa, photoUrl } from '../venues';

export interface EnlargedPhoto {
  src: string;
  /** The thumbnail's, already downloaded: it shows behind while the large one arrives. */
  thumbnail: string;
  alt: string;
  /** The tapa, to rate it: its venue's number and its own. */
  venue: number;
  tapa: number;
  /** Thumbnail (with its stars) it enlarges from and returns to, and the focus on closing. */
  origin: HTMLElement;
}

/** Photo being viewed large. */
@Injectable({ providedIn: 'root' })
export class Viewer {
  readonly photo = signal<EnlargedPhoto | null>(null);
  /** Closes the photo; the viewer replaces it with its animated close. */
  close: () => void = () => this.photo.set(null);

  enlarge(origin: HTMLElement, venue: number, tapa: Tapa): void {
    this.photo.set({
      src: photoUrl(tapa, 690),
      thumbnail: photoUrl(tapa, 500),
      alt: tapa.name,
      venue,
      tapa: tapa.number,
      origin,
    });
  }
}

const DURATION = 380;
/** Corner radius of the large photo. */
const RADIUS = 12;

/**
 * Enlarged photo: it grows from its thumbnail to the center of the space under the header (which
 * stays in view) while the backdrop appears, blurred and colorless, and on closing (by clicking
 * anywhere or with Escape) it makes the same journey in reverse. Its stars go with it, large, to stay
 * below and rate it (also with the keys 0 to 5), with what the rating says.
 */
@Component({
  selector: 'app-photo-viewer',
  imports: [Stars],
  template: `
    @if (viewer.photo(); as photo) {
      <!-- No page scroll while viewing the photo; clicking anywhere (except the stars) closes it. -->
      <div
        #dialog
        class="viewer"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        [attr.aria-label]="photo.alt"
        (click)="close()"
        (wheel)="$event.preventDefault()"
        (touchmove)="$event.preventDefault()"
      >
        <div #backdrop class="backdrop"></div>
        <div class="center">
          <img
            #image
            [src]="photo.src"
            [alt]="photo.alt"
            [style.background-image]="'url(' + photo.thumbnail + ')'"
            decoding="async"
            width="690"
            height="439"
          />
          <app-stars
            #stars
            [value]="rating()"
            [(preview)]="preview"
            (rate)="rate(photo, $event)"
            (click)="$event.stopPropagation()"
          />
          <!-- All the phrases in a row; the current one, centered and with margins to stand alone. -->
          <p #phrase class="phrase" aria-hidden="true">
            <span #ribbon class="ribbon">
              @for (text of phrases; track $index) {
                <span [class.active]="$index === shown()">{{ text }}</span>
              }
            </span>
          </p>
        </div>
      </div>
    }
  `,
  host: {
    '(document:keydown.escape)': 'close()',
  },
  styles: `
    @use 'media';

    // Under the header (its height, the safe area and its border), which isn't covered; above
    // everything else, floating buttons included. A size container, to measure the photo with the
    // space left.
    .viewer {
      position: fixed;
      inset: calc(var(--header-height) + env(safe-area-inset-top, 0px) + 1px) 0 0;
      z-index: 1090;
      container-type: size;
      outline: none;
    }

    .backdrop {
      position: absolute;
      inset: 0;
      background: rgb(42 33 27 / 0.35);
      backdrop-filter: blur(10px) grayscale(0.5);
      -webkit-backdrop-filter: blur(10px) grayscale(0.5);
      touch-action: none;
      will-change: opacity;
    }

    // The photo, with the stars and the phrase below it, in the center of the space left.
    .center {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    // As large as possible, with room below for the stars and the phrase (6.5rem), up to 1.25 times
    // the real size of the photos (690×439).
    img {
      --width: min(92cqw, (88cqh - 6.5rem) * 690 / 439, 860px);
      flex: none;
      width: var(--width);
      height: calc(var(--width) * 439 / 690);
      border-radius: ${RADIUS}px;
      background-size: cover;
      object-fit: cover;
      box-shadow: var(--shadow-photo); // Stronger in dark mode (styles/_theme.scss).
      transform-origin: 0 0;
      will-change: transform;
    }

    // The thumbnail's, large (they're the size of the text).
    app-stars {
      margin-top: 1rem;
      font-size: 2.1rem;
      transform-origin: 0 0;
      will-change: transform;
    }

    // Thinner than on the thumbnails (1.5): large, the usual line looks heavy.
    app-stars {
      --icon-stroke: 1.1;
    }

    // One line in view, fading out at the sides. --steps (the phrases going by) is set by the ribbon:
    // the more go by, the longer it takes, so that they can be seen.
    .phrase {
      --duration: calc(0.25s + var(--steps, 1) * 0.07s);
      --curve: cubic-bezier(0.3, 0.2, 0.2, 1);
      container-type: inline-size;
      width: min(92cqw, 24rem);
      height: 1.5em;
      margin: 0.5rem 0 0;
      overflow: hidden;
      color: #fff;
      font-size: 1.1rem;
      font-weight: 700;
      line-height: 1.5;
      text-shadow: 0 1px 8px rgb(0 0 0 / 0.6);
      mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
    }

    // Each phrase takes up just what it needs, and the current one, with half a width of margin on
    // each side, stands alone. On changing, its margin opens while the previous one's closes and the
    // ribbon moves (in the constructor) to leave it in the center: those in between pass through it.
    .ribbon {
      display: flex;
      width: max-content;
      transition: transform var(--duration) var(--curve);

      span {
        flex: none;
        padding-inline: 0.4em;
        white-space: nowrap;
        transition: margin var(--duration) var(--curve);
      }

      .active {
        margin-inline: 50cqw;
      }
    }

    @include media.reduced-motion {
      .ribbon,
      .ribbon span {
        transition: none;
      }
    }
  `,
})
export class PhotoViewer {
  protected readonly viewer = inject(Viewer);
  protected readonly store = inject(Store);
  protected readonly phrases = PHRASES;
  /** The stars of the photo being viewed. */
  protected readonly rating = computed(() => {
    const photo = this.viewer.photo();
    return photo ? this.store.stars(photo.venue, photo.tapa) : 0;
  });
  /** The star under the mouse, to see its phrase before marking it. */
  protected readonly preview = signal(0);
  protected readonly shown = computed(() => this.preview() || this.rating());

  private readonly backdrop = viewChild<ElementRef<HTMLElement>>('backdrop');
  private readonly image = viewChild<ElementRef<HTMLElement>>('image');
  private readonly stars = viewChild('stars', { read: ElementRef<HTMLElement> });
  private readonly phrase = viewChild<ElementRef<HTMLElement>>('phrase');
  private readonly ribbon = viewChild<ElementRef<HTMLElement>>('ribbon');
  private readonly dialog = viewChild<ElementRef<HTMLElement>>('dialog');
  private closing = false;

  constructor() {
    this.viewer.close = () => void this.close();

    // The keys, only with the photo open: otherwise, every key pressed anywhere would check the view
    // again.
    effect((onCleanup) => {
      if (!this.viewer.photo()) return;
      const onKeydown = (event: KeyboardEvent) => this.pressKey(event);
      document.addEventListener('keydown', onKeydown);
      onCleanup(() => document.removeEventListener('keydown', onKeydown));
    });

    // As soon as the large photo is on the page (before it gets painted), the enlarging starts.
    afterRenderEffect(() => {
      const image = this.image();
      const photo = this.viewer.photo();
      if (!image || !photo) return;
      photo.origin.style.visibility = 'hidden';
      // The focus, on the dialog: Escape closes it, and on closing it returns to the thumbnail.
      this.dialog()!.nativeElement.focus({ preventScroll: true });
      this.animate(photo, true);
    });

    // The phrase ribbon moves by what the phrases before the current one measure plus half of it: its
    // left margin (half a line) leaves it in the center. On opening, already in place.
    let previous: number | null = null;
    afterRenderEffect(() => {
      const ribbon = this.ribbon()?.nativeElement;
      const shown = this.shown();
      if (!ribbon) {
        previous = null;
        return;
      }
      // Before measuring, since measuring applies the styles and starts the margins' transitions.
      const steps = Math.max(1, Math.abs(shown - (previous ?? shown)));
      ribbon.parentElement!.style.setProperty('--steps', String(steps));
      const widths = [...ribbon.children].map((phrase) => (phrase as HTMLElement).offsetWidth);
      const offset = widths.slice(0, shown).reduce((a, b) => a + b, 0) + widths[shown] / 2;
      if (previous === null) ribbon.style.transition = 'none';
      ribbon.style.transform = `translateX(${-offset}px)`;
      if (previous === null) {
        void ribbon.offsetWidth;
        ribbon.style.transition = '';
      }
      previous = shown;
    });
  }

  protected rate(photo: EnlargedPhoto, stars: number): void {
    this.store.rate(photo.venue, photo.tapa, stars);
  }

  /** With the photo open, keys 1 to 5 rate it and 0 removes the rating. */
  private pressKey(event: KeyboardEvent): void {
    const photo = this.viewer.photo();
    if (!photo || this.closing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (/^[0-5]$/.test(event.key)) this.rate(photo, Number(event.key));
  }

  protected async close(): Promise<void> {
    const photo = this.viewer.photo();
    if (!photo || this.closing) return;
    this.closing = true;
    await this.animate(photo, false);
    photo.origin.style.visibility = '';
    photo.origin.focus({ preventScroll: true });
    this.viewer.photo.set(null);
    this.preview.set(0);
    this.closing = false;
  }

  /**
   * From the thumbnail to the large photo (open) or the other way round. The keyframes get reversed
   * and not the animation (direction: 'reverse'), which would reverse the curve too: this way it
   * always starts fast and slows down on arrival.
   */
  private animate(photo: EnlargedPhoto, open: boolean): Promise<unknown> {
    const image = this.image()!.nativeElement;
    const reduced = reducedMotion();
    // The thumbnail is gone (on rating a venue's last tapa with the «Alguna sin probar» filter, say):
    // with nowhere to return to, it fades out.
    if (!photo.origin.isConnected) {
      return this.dialog()!.nativeElement.animate([{}, { opacity: 0 }], {
        duration: reduced ? 0 : 200,
        fill: 'both',
      }).finished;
    }
    const from = photo.origin.getBoundingClientRect();
    const to = image.getBoundingClientRect();
    const scaleX = from.width / to.width;
    const scaleY = from.height / to.height;
    // The radius gets scaled too: it's compensated so that on screen it's the thumbnail's (and doesn't
    // change suddenly on arrival), on each axis separately because the scale isn't the same.
    const radius = parseFloat(getComputedStyle(photo.origin).borderTopLeftRadius) || 0;
    // The current theme's, already resolved (animations don't always resolve CSS variables).
    const shadow = getComputedStyle(image).boxShadow;
    const options: KeyframeAnimationOptions = {
      duration: reduced ? 0 : DURATION,
      easing: SETTLE,
      fill: 'both',
    };
    const direction = (keyframes: Keyframe[]) => (open ? keyframes : keyframes.reverse());
    const animations = [
      image.animate(
        direction([
          {
            transform: over(from, to),
            borderRadius: `${radius / scaleX}px / ${radius / scaleY}px`,
            // The shadow appears on takeoff and goes on returning, without vanishing suddenly at the end.
            boxShadow: 'none',
          },
          { transform: 'none', boxShadow: shadow, borderRadius: `${RADIUS}px` },
        ]),
        options,
      ),
      // Just the opacity: animating the blur itself stutters on phones.
      this.backdrop()!.nativeElement.animate(direction([{ opacity: 0 }, {}]), options),
      // The phrase appears when the stars have almost arrived, and on closing it leaves right away.
      this.phrase()!.nativeElement.animate([{ opacity: 0, transform: 'translateY(-0.5rem)' }, {}], {
        duration: reduced ? 0 : open ? 260 : 120,
        delay: open && !reduced ? DURATION * 0.55 : 0,
        easing: open ? 'ease-out' : 'ease-in',
        direction: open ? 'normal' : 'reverse',
        fill: 'both',
      }),
    ];
    const stars = this.stars()!.nativeElement;
    const originStars = photo.origin.querySelector('.stars-pill');
    if (originStars) {
      const fromStars = originStars.getBoundingClientRect();
      animations.push(
        stars.animate(
          direction([
            { transform: over(fromStars, stars.getBoundingClientRect()) },
            { transform: 'none' },
          ]),
          options,
        ),
      );
    }
    return Promise.all(animations.map((animation) => animation.finished));
  }
}

/** Moves and scales (from the corner) what is at "to" so that it sits exactly over "from". */
function over(from: DOMRect, to: DOMRect): string {
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scaleX}, ${scaleY})`;
}
