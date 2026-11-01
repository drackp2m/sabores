import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { SETTLE, animateHeight } from '../animate-height';
import { reducedMotion } from '../media';

/**
 * Text clamped to three lines, with «Ver más / Ver menos» if it doesn't fit. Like the cards' schedule:
 * on opening, the height grows and the new lines appear behind it; on closing, it just folds.
 */
/** Height of the gradient through which the lines appear on opening (about two lines). */
const FADE = 40;

const onResize = new WeakMap<Element, () => void>();
let observer: ResizeObserver | undefined;

/** A single observer for all the texts (two per card). Returns how to stop observing. */
function observeSize(element: Element, callback: () => void): () => void {
  const shared = (observer ??= new ResizeObserver((entries) => {
    for (const { target } of entries) onResize.get(target)?.();
  }));
  onResize.set(element, callback);
  shared.observe(element);
  return () => shared.unobserve(element);
}

@Component({
  selector: 'app-collapsible',
  template: `
    <p #paragraph [class.clamped]="clamped()">{{ text() }}</p>
    @if (overflows()) {
      <button type="button" [attr.aria-expanded]="open()" (click)="toggle()">
        {{ open() ? 'Ver menos' : 'Ver más' }}
      </button>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    // Hides what's left over while the height animates.
    p {
      margin: 0;
      font-size: 0.88rem;
      overflow: hidden;
    }

    .clamped {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      line-clamp: 3;
    }

    button,
    button:hover:not(:disabled) {
      height: auto;
      margin-top: 0.15rem;
      padding: 0;
      border: 0;
      background: none;
      color: var(--accent);
      font-size: 0.8rem;
    }

    button:hover:not(:disabled) {
      text-decoration: underline;
    }
  `,
})
export class Collapsible {
  readonly text = input.required<string>();

  /** What was asked for (the button's text changes as soon as it's pressed). */
  protected readonly open = signal(false);
  /** The three lines with an ellipsis: on closing, only once it has finished folding. */
  protected readonly clamped = signal(true);
  /** The text doesn't fit in the three lines. */
  protected readonly overflows = signal(false);
  private readonly paragraph = viewChild.required<ElementRef<HTMLElement>>('paragraph');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const paragraph = this.paragraph().nativeElement;
      // Measured again when the width changes; open it shows in full, so only clamped is measured.
      const stopObserving = observeSize(paragraph, () => {
        if (this.clamped()) {
          this.overflows.set(paragraph.scrollHeight > paragraph.clientHeight + 1);
        }
      });
      destroyRef.onDestroy(stopObserving);
    });
  }

  protected toggle(): void {
    const paragraph = this.paragraph().nativeElement;
    // If pressed halfway through, it continues from the height it has at that moment.
    const from = paragraph.getBoundingClientRect().height;
    const open = !this.open();
    this.open.set(open);
    for (const animation of paragraph.getAnimations()) animation.cancel();
    if (reducedMotion()) {
      this.clamped.set(!open);
      return;
    }

    // The class changes by hand to measure the final height now, without waiting for it to paint.
    paragraph.classList.add('clamped');
    const clamped = paragraph.getBoundingClientRect().height;
    paragraph.classList.remove('clamped');
    const full = paragraph.getBoundingClientRect().height;

    if (open) {
      this.clamped.set(false);
      animateHeight(paragraph, from, full);
      // A mask ending in a gradient moves down a bit behind the height: each new line appears little
      // by little, after room has been made for it.
      const mask = (height: number): Keyframe => ({
        maskImage: `linear-gradient(#000 calc(100% - ${FADE}px), transparent)`,
        maskRepeat: 'no-repeat',
        maskSize: `100% ${height + FADE}px`,
      });
      paragraph.animate([mask(from), mask(full)], {
        duration: 550,
        delay: 100,
        easing: SETTLE,
        fill: 'backwards',
      });
    } else {
      // It gets clamped at the end: otherwise, the ellipsis would show up too early.
      animateHeight(paragraph, from, clamped).onfinish = () => this.clamped.set(true);
    }
  }
}
