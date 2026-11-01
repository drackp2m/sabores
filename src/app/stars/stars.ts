import {
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  model,
  output,
} from '@angular/core';

import { Icon } from '../icon/icon';
import { reducedMotion } from '../media';

/** What each rating says: unrated and from 1 to 5 stars. */
export const PHRASES = [
  '¿Qué te ha parecido?',
  'Gracias por participar',
  'He probado mejores',
  'No está nada mal',
  'Esto está increíble',
  'De estrella Michelin',
] as const;

/**
 * The five stars to rate a tapa in the enlarged photo, on the same pill as the thumbnails'
 * (tapa-photo.ts), the size of the text: outlined in slightly transparent white, with those of the
 * rating filled in yellow. Pressing the one already marked removes it. On hover (mouse or pen), those
 * that would get marked show a yellow outline, like the heart; not with a finger, since lifting it
 * would make the phrase come and go.
 */
@Component({
  selector: 'app-stars',
  imports: [Icon],
  template: `
    @for (n of five; track n) {
      <button
        type="button"
        [class.filled]="n <= value()"
        [class.preview]="n <= preview()"
        [attr.aria-pressed]="n === value()"
        [attr.aria-label]="n + (n === 1 ? ' estrella: ' : ' estrellas: ') + phrases[n]"
        [title]="phrases[n]"
        (pointerenter)="$event.pointerType !== 'touch' && preview.set(n)"
        (pointerleave)="preview.set(0)"
        (click)="preview.set(0); rate.emit(n === value() ? 0 : n)"
      >
        <app-icon name="star" />
      </button>
    }
  `,
  host: { class: 'stars-pill', role: 'group', 'aria-label': 'Valoración' },
  styles: `
    app-icon {
      width: 1em;
      height: 1em;
    }

    // The outline stays white: on the yellow, it still shows a little.
    .filled {
      --icon-fill: var(--star);
    }

    .preview {
      color: var(--star);
    }

    // Just the star, without the look of the other buttons (styles/_controls.scss), with room for
    // the finger.
    button,
    button:hover:not(:disabled) {
      height: auto;
      margin: -0.1em;
      padding: 0.1em;
      border: 0;
      border-radius: 50%;
      background: none;
    }

    button {
      color: inherit;
    }
  `,
})
export class Stars {
  /** From 0 (unrated) to 5. */
  readonly value = input(0);
  readonly rate = output<number>();

  protected readonly five = [1, 2, 3, 4, 5];
  protected readonly phrases = PHRASES;
  /** The star under the mouse (0 if there is none); the viewer shows its phrase. */
  readonly preview = model(0);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    // When the rating changes (by finger, mouse or keyboard), not when it appears.
    let previous: number | undefined;
    afterRenderEffect(() => {
      const value = this.value();
      if (previous !== undefined && value !== previous) this.celebrate(value);
      previous = value;
    });
  }

  /** The marked stars give a little hop one after another; on removing it, they all shrink. */
  private celebrate(value: number): void {
    if (reducedMotion()) return;
    const icons = [...this.host.querySelectorAll('app-icon')];
    if (!value) {
      for (const icon of icons) {
        icon.animate([{}, { transform: 'scale(0.7)' }, {}], { duration: 260, easing: 'ease-out' });
      }
      return;
    }
    icons.slice(0, value).forEach((icon, i) =>
      icon.animate([{}, { transform: 'scale(1.4)', offset: 0.35 }, {}], {
        duration: 340,
        delay: i * 45,
        easing: 'ease-out',
      }),
    );
  }
}
