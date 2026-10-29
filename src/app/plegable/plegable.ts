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

/** Texto recortado a tres líneas, con «Ver más / Ver menos» si no cabe. */
@Component({
  selector: 'app-plegable',
  template: `
    <p #parrafo [class.recortado]="!abierto()">{{ texto() }}</p>
    @if (sobra()) {
      <button type="button" [attr.aria-expanded]="abierto()" (click)="abierto.set(!abierto())">
        {{ abierto() ? 'Ver menos' : 'Ver más' }}
      </button>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    p {
      margin: 0;
      font-size: 0.88rem;
    }

    .recortado {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
      line-clamp: 3;
      overflow: hidden;
    }

    button,
    button:hover:not(:disabled) {
      height: auto;
      margin-top: 0.15rem;
      padding: 0;
      border: 0;
      background: none;
      color: var(--acento);
      font-size: 0.8rem;
    }

    button:hover:not(:disabled) {
      text-decoration: underline;
    }
  `,
})
export class Plegable {
  readonly texto = input.required<string>();

  protected readonly abierto = signal(false);
  /** El texto no cabe en las tres líneas. */
  protected readonly sobra = signal(false);
  private readonly parrafo = viewChild.required<ElementRef<HTMLElement>>('parrafo');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const parrafo = this.parrafo().nativeElement;
      // Se vuelve a medir al cambiar el ancho; abierto se ve entero, así que solo se mide recortado.
      const observador = new ResizeObserver(() => {
        if (!this.abierto()) this.sobra.set(parrafo.scrollHeight > parrafo.clientHeight + 1);
      });
      observador.observe(parrafo);
      destroyRef.onDestroy(() => observador.disconnect());
    });
  }
}
