import {
  Component,
  ElementRef,
  afterRenderEffect,
  booleanAttribute,
  inject,
  input,
  model,
  output,
} from '@angular/core';

import { Icono } from '../icono/icono';

/** Lo que dice cada valoración: sin valorar y de 1 a 5 estrellas. */
export const FRASES = [
  '¿Qué te ha parecido?',
  'Gracias por participar',
  'He probado mejores',
  'No está nada mal',
  'Esto está increíble',
  'De estrella Michelin',
] as const;

/**
 * Las cinco estrellas de una tapa sobre una pastilla gris translúcida, del tamaño de la letra: con
 * el contorno blanco y algo transparente, y rellenas de amarillo las de la valoración. Sobre las
 * miniaturas, solo para verla; en la foto ampliada (editable), para valorarla: pulsar la que ya está
 * marcada la quita. Al pasar por encima (ratón o lápiz), las que se marcarían se ven con el contorno
 * amarillo, como el corazón; con el dedo no, que al levantarlo la frase iría y volvería.
 */
@Component({
  selector: 'app-estrellas',
  imports: [Icono],
  template: `
    @for (n of cinco; track n) {
      @if (editable()) {
        <button
          type="button"
          [class.llena]="n <= valor()"
          [class.previa]="n <= previa()"
          [attr.aria-pressed]="n === valor()"
          [attr.aria-label]="n + (n === 1 ? ' estrella: ' : ' estrellas: ') + frases[n]"
          [title]="frases[n]"
          (pointerenter)="$event.pointerType !== 'touch' && previa.set(n)"
          (pointerleave)="previa.set(0)"
          (click)="previa.set(0); valorar.emit(n === valor() ? 0 : n)"
        >
          <app-icono nombre="estrella" />
        </button>
      } @else {
        <app-icono nombre="estrella" [class.llena]="n <= valor()" />
      }
    }
  `,
  host: {
    '[attr.role]': 'editable() ? "group" : "img"',
    '[attr.aria-label]': 'editable() ? "Valoración" : descripcion()',
  },
  styles: `
    // Con un filo de luz arriba y a la izquierda, como un cristal.
    :host {
      --trazo-icono: 1.5;
      display: inline-flex;
      align-items: center;
      gap: 0.1em;
      padding: 0.2em 0.35em;
      border-radius: 999px;
      background: rgb(38 38 38 / 0.3);
      box-shadow: inset 1px 1px 0 rgb(255 255 255 / 0.3);
      -webkit-backdrop-filter: blur(4px);
      backdrop-filter: blur(4px);
      color: rgb(255 255 255 / 0.7);
      line-height: 1;
    }

    app-icono {
      width: 1em;
      height: 1em;
    }

    // El contorno sigue siendo blanco: sobre el amarillo, aún se nota un poco.
    .llena {
      --relleno-icono: var(--estrella);
    }

    .previa {
      color: var(--estrella);
    }

    // Solo la estrella, sin el aspecto de los demás botones (styles.scss), con aire para el dedo.
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
export class Estrellas {
  /** De 0 (sin valorar) a 5. */
  readonly valor = input(0);
  readonly editable = input(false, { transform: booleanAttribute });
  readonly valorar = output<number>();

  protected readonly cinco = [1, 2, 3, 4, 5];
  protected readonly frases = FRASES;
  /** La estrella bajo el ratón (0 si no hay ninguna); el visor muestra su frase. */
  readonly previa = model(0);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    // Al cambiar la valoración (con el dedo, el ratón o el teclado), no al aparecer.
    let anterior: number | undefined;
    afterRenderEffect(() => {
      const valor = this.valor();
      if (this.editable() && anterior !== undefined && valor !== anterior) this.celebrar(valor);
      anterior = valor;
    });
  }

  protected descripcion(): string {
    const valor = this.valor();
    return valor ? `${valor} de 5 estrellas` : 'Sin valorar';
  }

  /** Las estrellas marcadas dan un saltito una detrás de otra; al quitarla, se encogen todas. */
  private celebrar(valor: number): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const iconos = [...this.host.querySelectorAll('app-icono')];
    if (!valor) {
      for (const icono of iconos) {
        icono.animate([{}, { transform: 'scale(0.7)' }, {}], { duration: 260, easing: 'ease-out' });
      }
      return;
    }
    iconos.slice(0, valor).forEach((icono, i) =>
      icono.animate([{}, { transform: 'scale(1.4)', offset: 0.35 }, {}], {
        duration: 340,
        delay: i * 45,
        easing: 'ease-out',
      }),
    );
  }
}
