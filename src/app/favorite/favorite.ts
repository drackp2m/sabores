import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';

import { Icon } from '../icon/icon';
import { Store } from '../store';
import { Venue } from '../venues';

/** Angles of the sparks that come out of the heart when marking it. */
const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * Heart to mark a venue as a favorite, the size of the text. When marked it beats, with a ripple and
 * some sparks around it, which only exist while they animate; when unmarked it shrinks for a moment.
 */
@Component({
  selector: 'app-favorite',
  imports: [Icon],
  template: `
    <button
      type="button"
      [class.active]="active()"
      [attr.aria-pressed]="active()"
      [attr.aria-label]="'Favorito: ' + venue().name"
      [title]="active() ? 'Quitar de favoritos' : 'Marcar como favorito'"
      (click)="toggle()"
    >
      @if (beating()) {
        <span class="ripple" aria-hidden="true"></span>
        @for (turn of sparks; track turn) {
          <span class="spark" aria-hidden="true"></span>
        }
      }
      <app-icon name="heart" />
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }

    // Just the heart, without the look of the other buttons (styles.scss), with room for the finger.
    // Relative, to stay above whatever covers the card (the gallery's heading).
    button,
    button:hover:not(:disabled) {
      position: relative;
      height: auto;
      margin: -0.25em;
      padding: 0.25em;
      border: 0;
      border-radius: 50%;
      background: none;
    }

    button {
      color: var(--muted);
      transition: color 0.15s;
    }

    @media (hover: hover) {
      button:hover:not(:disabled) {
        color: var(--heart);
      }
    }

    .active {
      color: var(--heart);
      --icon-fill: currentColor;
    }

    app-icon {
      position: relative;
    }

    .ripple,
    .spark {
      position: absolute;
      top: 50%;
      left: 50%;
      border-radius: 50%;
      opacity: 0;
      pointer-events: none;
    }

    .ripple {
      width: 1.7em;
      height: 1.7em;
      margin: -0.85em;
      border: 0 solid var(--heart);
    }

    .spark {
      width: 0.22em;
      height: 0.22em;
      margin: -0.11em;
      background: var(--heart);

      &:nth-of-type(odd) {
        background: #ffb53d;
      }
    }
  `,
})
export class Favorite {
  readonly venue = input.required<Venue>();

  protected readonly sparks = SPARKS;
  private readonly store = inject(Store);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  protected readonly beating = signal(false);
  /** Changes with each press: whatever is left of the previous beat no longer touches anything. */
  private beat = 0;
  protected readonly active = computed(() => this.store.favorites().has(this.venue().number));

  protected toggle(): void {
    this.store.toggleFavorite(this.venue().number);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // If pressed again mid-beat, it starts over.
    for (const animation of this.host.getAnimations({ subtree: true })) animation.cancel();
    const heart = this.host.querySelector('app-icon')!;
    const beat = ++this.beat;

    if (!this.active()) {
      this.beating.set(false);
      heart.animate([{ transform: 'scale(0.7)' }, {}], {
        duration: 320,
        easing: 'cubic-bezier(0.3, 1.6, 0.6, 1)',
      });
      return;
    }
    heart.animate(
      [
        { transform: 'scale(0.2)' },
        { transform: 'scale(1.25)', offset: 0.45 },
        { transform: 'scale(0.92)', offset: 0.72 },
        {},
      ],
      { duration: 560, easing: 'ease-out' },
    );
    this.beating.set(true);
    afterNextRender(() => beat === this.beat && this.sparkle(beat), {
      injector: this.injector,
    });
  }

  /** The ripple and the sparks; when they finish (or another press cuts them off), they go away. */
  private sparkle(beat: number): void {
    const animations = [
      this.host.querySelector('.ripple')!.animate(
        [
          { opacity: 1, transform: 'scale(0.2)', borderWidth: '0.5em' },
          { opacity: 0, transform: 'scale(1)', borderWidth: '0.05em' },
        ],
        { duration: 420, easing: 'ease-out' },
      ),
      ...[...this.host.querySelectorAll('.spark')].map((spark, i) => {
        const turn = `rotate(${SPARKS[i]}deg)`;
        return spark.animate(
          [
            { opacity: 1, transform: `${turn} translateY(-0.45em) scale(1)` },
            { opacity: 0, transform: `${turn} translateY(-1.15em) scale(0.2)` },
          ],
          { duration: 520, delay: 120, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
        );
      }),
    ];
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (beat === this.beat) this.beating.set(false);
    });
  }
}
