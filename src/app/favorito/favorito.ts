import { Component, ElementRef, computed, inject, input } from '@angular/core';

import { Almacen } from '../almacen';
import { Icono } from '../icono/icono';
import { Local } from '../locales';

/** Ángulos de las chispas que salen del corazón al marcarlo. */
const CHISPAS = [0, 45, 90, 135, 180, 225, 270, 315];

/**
 * Corazón para marcar un local como favorito, del tamaño de la letra. Al marcarlo late, con una
 * onda y unas chispas alrededor; al desmarcarlo se encoge un momento.
 */
@Component({
  selector: 'app-favorito',
  imports: [Icono],
  template: `
    <button
      type="button"
      [class.activo]="activo()"
      [attr.aria-pressed]="activo()"
      [attr.aria-label]="'Favorito: ' + local().name"
      [title]="activo() ? 'Quitar de favoritos' : 'Marcar como favorito'"
      (click)="alternar()"
    >
      <span class="onda" aria-hidden="true"></span>
      @for (giro of chispas; track giro) {
        <span class="chispa" aria-hidden="true"></span>
      }
      <app-icono nombre="corazon" />
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }

    // Solo el corazón, sin el aspecto de los demás botones (styles.scss), con aire para el dedo.
    // Relativo, para quedar por encima de lo que cubra la tarjeta (la cabecera de la galería).
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
      color: var(--suave);
      transition: color 0.15s;
    }

    @media (hover: hover) {
      button:hover:not(:disabled) {
        color: var(--corazon);
      }
    }

    .activo {
      color: var(--corazon);
      --relleno-icono: currentColor;
    }

    app-icono {
      position: relative;
    }

    .onda,
    .chispa {
      position: absolute;
      top: 50%;
      left: 50%;
      border-radius: 50%;
      opacity: 0;
      pointer-events: none;
    }

    .onda {
      width: 1.7em;
      height: 1.7em;
      margin: -0.85em;
      border: 0 solid var(--corazon);
    }

    .chispa {
      width: 0.22em;
      height: 0.22em;
      margin: -0.11em;
      background: var(--corazon);

      &:nth-of-type(odd) {
        background: #ffb53d;
      }
    }
  `,
})
export class Favorito {
  readonly local = input.required<Local>();

  protected readonly chispas = CHISPAS;
  private readonly almacen = inject(Almacen);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  protected readonly activo = computed(() => this.almacen.favoritos().has(this.local().number));

  protected alternar(): void {
    this.almacen.alternarFavorito(this.local().number);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Si se pulsa otra vez a medio latido, empieza de nuevo.
    for (const animacion of this.host.getAnimations({ subtree: true })) animacion.cancel();
    const corazon = this.host.querySelector('app-icono')!;

    if (!this.activo()) {
      corazon.animate([{ transform: 'scale(0.7)' }, {}], {
        duration: 320,
        easing: 'cubic-bezier(0.3, 1.6, 0.6, 1)',
      });
      return;
    }
    corazon.animate(
      [
        { transform: 'scale(0.2)' },
        { transform: 'scale(1.25)', offset: 0.45 },
        { transform: 'scale(0.92)', offset: 0.72 },
        {},
      ],
      { duration: 560, easing: 'ease-out' },
    );
    this.host.querySelector('.onda')!.animate(
      [
        { opacity: 1, transform: 'scale(0.2)', borderWidth: '0.5em' },
        { opacity: 0, transform: 'scale(1)', borderWidth: '0.05em' },
      ],
      { duration: 420, easing: 'ease-out' },
    );
    this.host.querySelectorAll('.chispa').forEach((chispa, i) => {
      const giro = `rotate(${CHISPAS[i]}deg)`;
      chispa.animate(
        [
          { opacity: 1, transform: `${giro} translateY(-0.45em) scale(1)` },
          { opacity: 0, transform: `${giro} translateY(-1.15em) scale(0.2)` },
        ],
        { duration: 520, delay: 120, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
    });
  }
}
