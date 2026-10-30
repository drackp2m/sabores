import { Component, computed, inject, input, output } from '@angular/core';

import { Almacen } from '../almacen';
import { EstadoHorario } from '../estado-horario/estado-horario';
import { Estrellas } from '../estrellas/estrellas';
import { Favorito } from '../favorito/favorito';
import { Icono } from '../icono/icono';
import {
  Estado,
  Llegada,
  Local,
  Tapa,
  claveTapa,
  formatearDistancia,
  formatearDuracion,
} from '../locales';
import { Sello, selloGluten } from '../sello/sello';
import { Visor } from '../visor/visor';

/**
 * Vista «Fotos»: el nombre del local con sus sellos y el corazón de favorito, cuánto se tarda en
 * llegar, si está abierto y las fotos de sus dos tapas con sus estrellas. La tarjeta abre el local y
 * cada foto se amplía (y ahí se valora).
 */
@Component({
  selector: 'app-galeria',
  imports: [EstadoHorario, Estrellas, Favorito, Icono, Sello],
  template: `
    <ul>
      @for (ficha of fichas(); track ficha.local.number) {
        @let local = ficha.local;
        @let llegada = llegadas().get(local.number);
        @let estado = estados().get(local.number);
        <li>
          <div class="cabeza">
            <span class="numero">{{ local.number }}</span>
            <div class="titulo">
              <div class="nombre">
                <!-- Su ::after cubre toda la tarjeta: se abre el local pinchando en cualquier sitio menos en las fotos y el corazón. -->
                <button type="button" class="abrir" (click)="abrir.emit(local.number)">
                  {{ local.name }}
                </button>
                @if (ficha.gluten) {
                  <app-sello [tipo]="ficha.gluten" />
                }
                @if (ficha.ruta) {
                  <app-sello tipo="ruta" />
                }
                <app-favorito [local]="local" />
              </div>
              @if (llegada || estado) {
                <span class="datos">
                  @if (llegada) {
                    <span class="llegada">
                      <app-icono [nombre]="llegada.modo" />
                      {{ formatearDuracion(llegada.minutos) }} ·
                      {{ formatearDistancia(llegada.metros) }}
                    </span>
                  }
                  @if (estado) {
                    <app-estado-horario [estado]="estado" [ahora]="ahora()" [llegada]="llegada" />
                  }
                </span>
              }
            </div>
          </div>
          <div class="fotos">
            @for (tapa of local.tapas; track tapa.number) {
              @let estrellas = valoraciones().get(claveTapa(local.number, tapa.number)) ?? 0;
              <figure>
                <button
                  type="button"
                  class="foto"
                  [attr.aria-label]="
                    'Ampliar y valorar la foto de ' +
                    tapa.name +
                    (estrellas ? ' (' + estrellas + ' de 5 estrellas)' : ' (sin valorar)')
                  "
                  (click)="ampliar($event, local, tapa)"
                >
                  <img
                    [src]="'data/' + tapa.photo"
                    [alt]="tapa.name"
                    loading="lazy"
                    width="690"
                    height="439"
                  />
                  <app-estrellas class="estrellas" aria-hidden="true" [valor]="estrellas" />
                </button>
                <figcaption>{{ tapa.name }}</figcaption>
              </figure>
            }
          </div>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }

    ul {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 20rem), 1fr));
      gap: 1rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      padding: 0.6rem;
      border: 1px solid var(--borde);
      border-radius: var(--radio);
      background: var(--superficie);
      transition: border-color 0.15s;

      &:hover {
        border-color: var(--borde-control);
      }
    }

    .cabeza {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    // El nombre, como texto: el botón es para abrir el local desde toda la tarjeta.
    .abrir,
    .abrir:hover:not(:disabled) {
      flex: 1;
      justify-content: flex-start;
      min-width: 0;
      height: auto;
      padding: 0;
      border: 0;
      background: none;
      color: var(--texto);
      font-weight: inherit;
      text-align: left;
      white-space: normal;
      text-wrap: balance;
    }

    .abrir {
      position: static;

      &::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
      }

      &:focus-visible {
        outline: none;

        &::after {
          outline: 2px solid var(--acento);
          outline-offset: 2px;
          border-radius: var(--radio);
        }
      }
    }

    .titulo {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }

    // Como en las fichas: los sellos y el corazón a la derecha, centrados con el nombre aunque ocupe
    // varias líneas.
    .nombre {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 1rem;
      font-weight: 700;
      line-height: 1.2;
    }

    app-favorito {
      margin-left: 0.1rem;
    }

    .datos {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.6rem;
      font-size: 0.8rem;
      font-weight: 600;
    }

    .llegada {
      display: inline-flex;
      align-items: center;
      gap: 0.2rem;
    }

    // Como en las fichas: sale del borde izquierdo (tapándolo), redondeado solo por la derecha.
    .numero {
      flex: none;
      display: grid;
      place-items: center;
      min-width: 2.1rem;
      height: 1.75rem;
      margin-left: calc(-0.6rem - 1px);
      padding: 0 0.45rem 0 0.35rem;
      border-radius: 0 999px 999px 0;
      background: var(--marca);
      color: #fff;
      font-size: 0.85rem;
      font-weight: 700;
    }

    .fotos {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem;
    }

    figure {
      margin: 0;
    }

    // El nombre de la tapa centrado debajo de la foto, como en los popups del mapa.
    figcaption {
      margin-top: 0.25rem;
      text-align: center;
      font-size: 0.75rem;
      line-height: 1.25;
      color: var(--suave);
      text-wrap: balance;
    }

    // Por encima del ::after de la cabecera, para ampliarse en vez de abrir el local. Con todo el
    // ancho: un botón se ajusta a lo que tiene dentro, y hasta que carga la foto (en diferido) no
    // mediría nada, ni se cargaría en algunos navegadores.
    .foto,
    .foto:hover:not(:disabled) {
      position: relative;
      display: block;
      width: 100%;
      height: auto;
      padding: 0;
      border: 0.5px solid var(--borde); // Fino, para las fotos de fondo claro (como en las fichas).
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

      .foto:is(:hover, :focus-visible) & {
        transform: scale(1.06);
      }

      @media (prefers-reduced-motion: reduce) {
        transition: none;
      }
    }

    // Abajo en el centro de la foto (en el visor van a ponerse debajo de ella, en grande).
    .estrellas {
      position: absolute;
      bottom: 0.3rem;
      left: 50%;
      font-size: 0.8rem;
      translate: -50%;
    }
  `,
})
export class Galeria {
  readonly locales = input.required<readonly Local[]>();
  readonly estados = input<ReadonlyMap<number, Estado>>(new Map());
  readonly llegadas = input<ReadonlyMap<number, Llegada>>(new Map());
  readonly ahora = input(new Date());
  readonly abrir = output<number>();

  private readonly visor = inject(Visor);
  protected readonly valoraciones = inject(Almacen).valoraciones;

  protected readonly claveTapa = claveTapa;
  protected readonly formatearDuracion = formatearDuracion;
  protected readonly formatearDistancia = formatearDistancia;

  /** Sellos del local: sin gluten (o bajo petición) y Ruta de Sabor, si alguna tapa los tiene. */
  protected readonly fichas = computed(() =>
    this.locales().map((local) => ({
      local,
      gluten: selloGluten(local.tapas),
      ruta: local.tapas.some((t) => t.castelloRutaDeSabor),
    })),
  );

  protected ampliar(evento: Event, local: Local, tapa: Tapa): void {
    this.visor.ampliar(evento.currentTarget as HTMLElement, local.number, tapa);
  }
}
