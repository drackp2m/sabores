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

import { GLIDE } from '../animate-height';
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

const DURATION = 420;
/** Corner radius of the large photo. */
const RADIUS = 12;
/**
 * Line of the stars: that of the thumbnails (tapa-photo.ts) and, thinner, that of the large ones,
 * which on screen measures the same as the cards' heart (venue-card.scss): 1.8px.
 */
const STROKE = 1.5;
const LARGE_STROKE = 1.29;

/**
 * Enlarged photo: it grows from its thumbnail to the center of the space under the header (which
 * stays in view) while the backdrop appears, blurred and colorless, and on closing (by clicking
 * anywhere or with Escape) it makes the same journey in reverse. Its stars go with it, large, to stay
 * below and rate it (also with the keys 0 to 5), and what the rating says comes out from under them.
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
            decoding="sync"
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

    // Over what's in view, but in the page and not fixed on the screen: a phone's scroll can stop
    // between two CSS pixels and the code is told a rounded position, so a fixed photo wouldn't land
    // exactly on its thumbnail. This way the scroll moves them both the same. Above everything but the
    // header, floating buttons included.
    .viewer {
      --top: var(--header-bottom);
      position: absolute;
      left: 0;
      z-index: 1090;
      width: 100%;
      height: 100dvh;
      outline: none;
    }

    // Under the header (its height, the safe area and its border), which isn't covered.
    .backdrop {
      position: fixed;
      inset: var(--top) 0 0;
      background: rgb(42 33 27 / 0.35);
      backdrop-filter: blur(10px) grayscale(0.5);
      -webkit-backdrop-filter: blur(10px) grayscale(0.5);
      touch-action: none;
      will-change: opacity;
    }

    // The photo, with the stars and the phrase below it, in the center of the space left. A size
    // container, to measure the photo with that space.
    .center {
      position: absolute;
      inset: var(--top) 0 0;
      container-type: size;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    // As large as possible, with room below for the stars and the phrase (6.5rem), up to 1.25 times
    // the real size of the photos (690×439).
    img {
      --width: min(92cqw, (88cqh - 6.5rem) * 690 / 439, 860px);
      position: relative; // Moved in snap().
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

    // The thumbnail's, large (they're the size of the text). Above the phrase, which comes out from
    // under them.
    app-stars {
      position: relative; // Moved in snap().
      z-index: 1;
      margin-top: 1rem;
      font-size: 2.1rem;
      transform-origin: 0 0;
      will-change: transform;
    }

    // Thinner than on the thumbnails: large, the usual line looks heavy.
    app-stars {
      --icon-stroke: ${LARGE_STROKE};
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
      transform-origin: 0 0;
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
    // again. The same for the scroll, which the keyboard or the scrollbar can still move: in capture,
    // since app-root's doesn't bubble.
    effect((onCleanup) => {
      if (!this.viewer.photo()) return;
      const onKeydown = (event: KeyboardEvent) => this.pressKey(event);
      const onScroll = () => this.place();
      document.addEventListener('keydown', onKeydown);
      document.addEventListener('scroll', onScroll, { capture: true, passive: true });
      onCleanup(() => {
        document.removeEventListener('keydown', onKeydown);
        document.removeEventListener('scroll', onScroll, { capture: true });
      });
    });

    // As soon as the large photo is on the page (before it gets painted), the enlarging starts.
    afterRenderEffect(() => {
      const image = this.image();
      const photo = this.viewer.photo();
      if (!image || !photo) return;
      photo.origin.style.visibility = 'hidden';
      // The focus, on the dialog: Escape closes it, and on closing it returns to the thumbnail.
      this.dialog()!.nativeElement.focus({ preventScroll: true });
      this.place();
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

  /** Takes the viewer to the part of the page in view (see .viewer). */
  private place(): void {
    const dialog = this.dialog()?.nativeElement;
    if (!dialog) return;
    dialog.style.top = '0';
    dialog.style.top = `${-dialog.getBoundingClientRect().top}px`;
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
   * always starts gently and slows down on arrival.
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
    // The photo and not its frame: on hover it moves closer (tapa-photo.ts), and it has to set off
    // exactly as it's seen, with the frame cutting off what sticks out. Moved closer it's scaled, and
    // that isn't painted on whole pixels.
    const thumbnail = photo.origin.querySelector('img')!.getBoundingClientRect();
    const frame = painted(photo.origin.getBoundingClientRect());
    const from = thumbnail.width > frame.width ? thumbnail : painted(thumbnail);
    const to = snap(image);
    const scaleX = from.width / to.width;
    const scaleY = from.height / to.height;
    const crop = [
      (frame.top - from.top) / scaleY,
      (from.right - frame.right) / scaleX,
      (from.bottom - frame.bottom) / scaleY,
      (frame.left - from.left) / scaleX,
    ];
    // The frame's border around the photo, measured (it depends on the screen). On hover there's none
    // to carry: the photo covers it.
    const border = Math.max(0, from.left - frame.left);
    const originStyle = getComputedStyle(photo.origin);
    // The radius gets scaled too: it's compensated so that on screen it's the thumbnail's (and doesn't
    // change suddenly on arrival), on each axis separately because the scale isn't the same.
    const radius = parseFloat(originStyle.borderTopLeftRadius) || 0;
    const corners = (size: number) => `${size / scaleX}px / ${size / scaleY}px`;
    // The current theme's, already resolved (animations don't always resolve CSS variables).
    const shadow = getComputedStyle(image).boxShadow;
    const options: KeyframeAnimationOptions = {
      duration: reduced ? 0 : DURATION,
      easing: GLIDE,
      fill: 'both',
    };
    const direction = (keyframes: Keyframe[]) => (open ? keyframes : keyframes.reverse());
    const stars = this.stars()!.nativeElement;
    const phrase = this.phrase()!.nativeElement;
    // Only the corner goes to whole pixels: the stars aren't stretched to fit them, as the photo is.
    const pill = photo.origin.querySelector('.stars-pill')!.getBoundingClientRect();
    const fromStars = new DOMRect(pixel(pill.left), pixel(pill.top), pill.width, pill.height);
    const toStars = snap(stars);
    const starsScale = fromStars.height / toStars.height;
    // From the card of a venue that has withdrawn, almost in black and white (styles/_theme.scss):
    // the photo and its stars get their color back on the way.
    const withdrawn = photo.origin.closest('.withdrawn')
      ? getComputedStyle(photo.origin).getPropertyValue('--withdrawn-filter').trim()
      : '';
    const colors = withdrawn
      ? [image, stars].map((element) =>
          element.animate(direction([{ filter: withdrawn }, { filter: 'none' }]), options),
        )
      : [];
    // Each transform on its own, away from what has to be repainted, so that it can run on the
    // compositor: a slow frame on the main thread doesn't hold it up.
    const animations = [
      image.animate(direction([{ transform: over(from, to) }, { transform: 'none' }]), options),
      image.animate(
        direction([
          {
            borderRadius: corners(radius - border),
            clipPath: `inset(${crop.map((side) => `${side}px`).join(' ')} round ${corners(radius)})`,
            // The photo carries the thumbnail's border, so that on landing they measure the same: it's
            // the shadow's first layer, the one that fades out on the way. The rest of the shadow
            // appears on takeoff and goes on returning, without vanishing suddenly at the end.
            boxShadow: `0 0 0 ${border / scaleX}px ${originStyle.borderTopColor}`,
          },
          {
            borderRadius: `${RADIUS}px`,
            // Beyond the shadow, which it would cut off.
            clipPath: `inset(-200px round ${RADIUS}px)`,
            boxShadow: `0 0 0 0 transparent, ${shadow}`,
          },
        ]),
        options,
      ),
      // Just the opacity: animating the blur itself stutters on phones.
      this.backdrop()!.nativeElement.animate(direction([{ opacity: 0 }, {}]), options),
      stars.animate(
        direction([{ transform: over(fromStars, toStars) }, { transform: 'none' }]),
        options,
      ),
      // They're not the thumbnail's stars but a larger copy: the lines get scaled too, so they're
      // compensated for it to look the same on takeoff and on landing.
      stars.animate(
        direction([
          { '--icon-stroke': STROKE, '--pill-edge': `${1 / starsScale}px` },
          { '--icon-stroke': LARGE_STROKE, '--pill-edge': '1px' },
        ]),
        options,
      ),
      phrase.animate(
        direction([
          {
            opacity: 0,
            transform: centered(fromStars, phrase.getBoundingClientRect(), starsScale),
          },
          { transform: 'none' },
        ]),
        options,
      ),
      ...colors,
    ];
    return Promise.all(animations.map((animation) => animation.finished));
  }
}

/**
 * Leaves an element on whole pixels and returns where it is. While it animates, the browser rounds
 * its position on its own, and a transform calculated from the real one would land up to half a pixel
 * away from the thumbnail.
 */
function snap(element: HTMLElement): DOMRect {
  element.style.left = element.style.top = '';
  const { left, top } = element.getBoundingClientRect();
  element.style.left = `${Math.round(left) - left}px`;
  element.style.top = `${Math.round(top) - top}px`;
  return element.getBoundingClientRect();
}

/** The screen pixel closest to a position: where the browser paints an edge at rest. */
function pixel(position: number): number {
  return Math.round(position * devicePixelRatio) / devicePixelRatio;
}

/** A box as it's painted at rest, with its edges on screen pixels. */
function painted({ left, top, right, bottom }: DOMRect): DOMRect {
  return new DOMRect(
    pixel(left),
    pixel(top),
    pixel(right) - pixel(left),
    pixel(bottom) - pixel(top),
  );
}

/** Moves and scales (from the corner) what is at "to" so that it sits exactly over "from". */
function over(from: DOMRect, to: DOMRect): string {
  const scaleX = from.width / to.width;
  const scaleY = from.height / to.height;
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${scaleX}, ${scaleY})`;
}

/** Scales (from the corner) what is at "to" and moves it so that it's centered on "on". */
function centered(on: DOMRect, to: DOMRect, scale: number): string {
  const x = on.left + on.width / 2 - (to.left + (to.width * scale) / 2);
  const y = on.top + on.height / 2 - (to.top + (to.height * scale) / 2);
  return `translate(${x}px, ${y}px) scale(${scale})`;
}
