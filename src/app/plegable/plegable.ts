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

/**
 * Texto recortado a tres líneas, con «Ver más / Ver menos» si no cabe. Como el horario de las fichas:
 * al abrir, la altura crece y las líneas nuevas van apareciendo detrás; al cerrar, solo se recoge.
 */
/** Alto del degradado con el que aparecen las líneas al abrir (unas dos líneas). */
const DEGRADADO = 40;

@Component({
  selector: 'app-plegable',
  template: `
    <p #parrafo [class.recortado]="recortado()">{{ texto() }}</p>
    @if (sobra()) {
      <button type="button" [attr.aria-expanded]="abierto()" (click)="alternar()">
        {{ abierto() ? 'Ver menos' : 'Ver más' }}
      </button>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    // Oculta lo que sobra mientras se anima la altura.
    p {
      margin: 0;
      font-size: 0.88rem;
      overflow: hidden;
    }

    .recortado {
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

  /** Lo que se ha pedido (el texto del botón cambia en cuanto se pulsa). */
  protected readonly abierto = signal(false);
  /** Las tres líneas con puntos suspensivos: al cerrar, solo cuando ha terminado de recogerse. */
  protected readonly recortado = signal(true);
  /** El texto no cabe en las tres líneas. */
  protected readonly sobra = signal(false);
  private readonly parrafo = viewChild.required<ElementRef<HTMLElement>>('parrafo');

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const parrafo = this.parrafo().nativeElement;
      // Se vuelve a medir al cambiar el ancho; abierto se ve entero, así que solo se mide recortado.
      const observador = new ResizeObserver(() => {
        if (this.recortado()) this.sobra.set(parrafo.scrollHeight > parrafo.clientHeight + 1);
      });
      observador.observe(parrafo);
      destroyRef.onDestroy(() => observador.disconnect());
    });
  }

  protected alternar(): void {
    const parrafo = this.parrafo().nativeElement;
    // Si se pulsa a medio camino, se sigue desde la altura que tenga en ese momento.
    const desde = parrafo.getBoundingClientRect().height;
    const abrir = !this.abierto();
    this.abierto.set(abrir);
    for (const animacion of parrafo.getAnimations()) animacion.cancel();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.recortado.set(!abrir);
      return;
    }

    // La clase se cambia a mano para medir ya la altura final, sin esperar a que se pinte.
    parrafo.classList.add('recortado');
    const recortado = parrafo.getBoundingClientRect().height;
    parrafo.classList.remove('recortado');
    const completo = parrafo.getBoundingClientRect().height;
    const curva = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

    if (abrir) {
      this.recortado.set(false);
      parrafo.animate([{ height: `${desde}px` }, { height: `${completo}px` }], {
        duration: 400,
        easing: curva,
      });
      // Una máscara que acaba en degradado baja un poco por detrás de la altura: cada línea nueva
      // aparece poco a poco, después de que se le haya hecho hueco.
      const mascara = (alto: number): Keyframe => ({
        maskImage: `linear-gradient(#000 calc(100% - ${DEGRADADO}px), transparent)`,
        maskRepeat: 'no-repeat',
        maskSize: `100% ${alto + DEGRADADO}px`,
      });
      parrafo.animate([mascara(desde), mascara(completo)], {
        duration: 550,
        delay: 100,
        easing: curva,
        fill: 'backwards',
      });
    } else {
      // Se recorta al acabar: si no, los puntos suspensivos saldrían antes de tiempo.
      parrafo.animate([{ height: `${desde}px` }, { height: `${recortado}px` }], {
        duration: 300,
        easing: curva,
      }).onfinish = () => this.recortado.set(true);
    }
  }
}
