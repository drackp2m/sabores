import { Component, ElementRef, computed, inject, input } from '@angular/core';

import { Almacen } from '../almacen';
import { Tapa, claveTapa } from '../locales';
import { Visor } from '../visor/visor';

/**
 * Miniatura de una tapa (en las fichas y en la galería): un botón que la amplía en el visor, donde se
 * valora, con sus estrellas encima.
 */
@Component({
  selector: 'button[appFotoTapa]',
  template: `
    <img
      [src]="'data/' + tapa().photo"
      [alt]="tapa().name"
      loading="lazy"
      decoding="async"
      width="690"
      height="439"
    />
    <span class="estrellas pastilla-estrellas" aria-hidden="true" [style.--valor]="valor()"></span>
  `,
  host: {
    type: 'button',
    '[attr.aria-label]': 'etiqueta()',
    '(click)': 'ampliar()',
  },
  styles: `
    // Con todo el ancho: un botón se ajusta a lo que tiene dentro, y hasta que carga la foto (en
    // diferido) no mediría nada, ni se cargaría en algunos navegadores. Relativo, para quedar por
    // encima de lo que cubra la tarjeta (la cabecera de la galería).
    :host,
    :host(:hover:not(:disabled)) {
      position: relative;
      display: block;
      width: 100%;
      height: auto;
      padding: 0;
      // Fino: las fotos de fondo claro no se funden con la ficha (0,5px: una línea de pantalla en
      // móvil).
      border: 0.5px solid var(--borde);
      border-radius: 0.5rem;
      background: var(--borde);
      overflow: hidden;
      cursor: zoom-in;
    }

    // Al pasar por encima, la foto se acerca un poco dentro de su hueco, sin mover nada más.
    img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 690 / 439;
      object-fit: cover;
      transition: transform 0.3s ease-out;

      :host(:is(:hover, :focus-visible)) & {
        transform: scale(1.06);
      }

      @media (prefers-reduced-motion: reduce) {
        transition: none;
      }
    }

    // La estrella de ICONOS (icono.ts) con el trazo de 1,5 de las estrellas, en un hueco de 1,1em de
    // ancho: la estrella y el espacio hasta la siguiente.
    $estrella: 'M12 2.9L14.44 9.54L21.51 9.81L15.95 14.18L17.88 20.99L12 17.05L6.12 20.99L8.05 14.18L2.49 9.81L9.56 9.54z';
    @function estrella($pintura) {
      @return url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26.4 24'%3E%3Cpath d='#{$estrella}' stroke-linejoin='round' #{$pintura}/%3E%3C/svg%3E");
    }

    // Abajo en el centro de la foto (en el visor van a ponerse debajo de ella, en grande). Las cinco
    // en un solo elemento, del mismo tamaño que las del visor (estrellas.ts): el contorno de todas
    // (::after) encima del relleno de las valoradas (::before), con la estrella como máscara.
    .estrellas {
      position: absolute;
      bottom: 0.3rem;
      left: 50%;
      font-size: 0.8rem;
      translate: -50%;

      &::before,
      &::after {
        content: '';
        height: 1em;
        mask-position: 0 0;
        mask-size: 1.1em 1em;
        mask-repeat: repeat-x;
      }

      &::before {
        position: absolute;
        top: 0.2em;
        left: 0.35em;
        width: calc(var(--valor) * 1.1em);
        background: var(--estrella);
        mask-image: estrella("fill='%23000'");
      }

      &::after {
        position: relative;
        width: 5.4em;
        background: currentColor;
        mask-image: estrella("fill='none' stroke='%23000' stroke-width='1.5'");
      }
    }
  `,
})
export class FotoTapa {
  readonly local = input.required<number>();
  readonly tapa = input.required<Tapa>();

  private readonly visor = inject(Visor);
  private readonly almacen = inject(Almacen);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  protected readonly valor = computed(
    () => this.almacen.valoraciones().get(claveTapa(this.local(), this.tapa().number)) ?? 0,
  );
  protected readonly etiqueta = computed(() => {
    const valor = this.valor();
    const estrellas = valor ? `${valor} de 5 estrellas` : 'sin valorar';
    return `Ampliar y valorar la foto de ${this.tapa().name} (${estrellas})`;
  });

  protected ampliar(): void {
    this.visor.ampliar(this.host, this.local(), this.tapa());
  }
}
