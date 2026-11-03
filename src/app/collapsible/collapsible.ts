import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';

import { Unfolding } from '../animate-height';
import { reducedMotion } from '../media';

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

/** Cuts the text where the browser wraps it, with the spaces, so that the pieces add up to the text. */
function wrappedLines(paragraph: HTMLElement): string[] {
  const node = paragraph.firstElementChild!.firstChild as Text;
  const range = document.createRange();
  const lines: string[] = [];
  let start = 0;
  let bottom = Infinity;
  for (const { index } of node.data.matchAll(/\S/g)) {
    range.setStart(node, index);
    range.setEnd(node, index + 1);
    const character = range.getBoundingClientRect();
    if (character.top >= bottom) {
      lines.push(node.data.slice(start, index));
      start = index;
    }
    bottom = character.bottom;
  }
  return [...lines, node.data.slice(start)];
}

/**
 * Text clamped to three lines, with «Ver más / Ver menos» if it doesn't fit. It opens and closes like
 * the cards' schedule: line by line, at the same pace.
 */
@Component({
  selector: 'app-collapsible',
  template: `
    <p #paragraph [class.clamped]="clamped()">
      @for (line of lines(); track $index) {
        <span>{{ line }}</span>
      }
    </p>
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

    // While it animates, a block per line, so that each one can fade on its own.
    span {
      display: block;
    }

    .clamped {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      line-clamp: 3;

      span {
        display: inline;
      }
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

    @media (hover: hover) {
      button:hover:not(:disabled) {
        text-decoration: underline;
      }
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
  /** The text in one piece; only while it animates, a piece per line. */
  protected readonly lines = linkedSignal(() => [this.text()]);
  private readonly injector = inject(Injector);
  private readonly unfolding = new Unfolding();
  private readonly paragraph = viewChild.required<ElementRef<HTMLElement>>('paragraph');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const paragraph = this.paragraph().nativeElement;
      // Open it shows in full, so only clamped is measured.
      const measure = () => {
        if (this.clamped()) {
          this.overflows.set(paragraph.scrollHeight > paragraph.clientHeight + 1);
        }
      };
      // Right now, for the card to have its final height before it gets painted (app.ts counts on
      // it to land on a venue), and again when the width changes.
      measure();
      destroyRef.onDestroy(observeSize(paragraph, measure));
    });
  }

  protected toggle(): void {
    const open = !this.open();
    this.open.set(open);
    if (reducedMotion()) {
      this.clamped.set(!open);
      return;
    }
    if (this.unfolding.turnBack()) return;

    // The class changes by hand to measure both heights now, without waiting for it to paint.
    const paragraph = this.paragraph().nativeElement;
    paragraph.classList.add('clamped');
    const clamped = paragraph.getBoundingClientRect().height;
    paragraph.classList.remove('clamped');
    const full = paragraph.getBoundingClientRect().height;

    this.lines.set(wrappedLines(paragraph));
    this.clamped.set(false);
    // As soon as each line is in its piece (before it gets painted).
    afterNextRender(
      () =>
        this.unfolding.play(paragraph, clamped, full, open, () => {
          // It gets clamped at the end: otherwise, the ellipsis would show up too early.
          this.clamped.set(!this.open());
          this.lines.set([this.text()]);
        }),
      { injector: this.injector },
    );
  }
}
