import { Component, computed, inject, input, output } from '@angular/core';

import { EstadoHorario } from '../estado-horario/estado-horario';
import { Icono } from '../icono/icono';
import { Estado, Llegada, Local, Tapa, formatearDistancia, formatearDuracion } from '../locales';
import { Sello, selloGluten } from '../sello/sello';
import { Visor } from '../visor/visor';

/**
 * Vista «Fotos»: el nombre del local con sus sellos, cuánto se tarda en llegar, si está abierto y
 * las fotos de sus dos tapas. La tarjeta abre el local y cada foto se amplía.
 */
@Component({
  selector: 'app-galeria',
  imports: [EstadoHorario, Icono, Sello],
  template: `
    <ul>
      @for (ficha of fichas(); track ficha.local.number) {
        @let local = ficha.local;
        @let llegada = llegadas().get(local.number);
        @let estado = estados().get(local.number);
        <li>
          <!-- Su ::after cubre toda la tarjeta, así que se abre el local pinchando en cualquier sitio menos en las fotos. -->
          <button type="button" class="cabeza" (click)="abrir.emit(local.number)">
            <span class="numero">{{ local.number }}</span>
            <span class="titulo">
              <span class="nombre">
                <span class="texto">{{ local.name }}</span>
                @if (ficha.gluten) {
                  <app-sello [tipo]="ficha.gluten" />
                }
                @if (ficha.ruta) {
                  <app-sello tipo="ruta" />
                }
              </span>
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
            </span>
          </button>
          <div class="fotos">
            @for (tapa of local.tapas; track tapa.number) {
              <figure>
                <button
                  type="button"
                  class="foto"
                  [attr.aria-label]="'Ampliar la foto de ' + tapa.name"
                  (click)="ampliar($event, tapa)"
                >
                  <img
                    [src]="'data/' + tapa.photo"
                    [alt]="tapa.name"
                    loading="lazy"
                    width="690"
                    height="439"
                  />
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

    .cabeza,
    .cabeza:hover:not(:disabled) {
      justify-content: flex-start;
      gap: 0.5rem;
      height: auto;
      padding: 0;
      border: 0;
      background: none;
      color: var(--texto);
      font-weight: 400;
      text-align: left;
      white-space: normal;
    }

    .cabeza {
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

    // Como en las fichas: los sellos a la derecha, centrados con el nombre aunque ocupe varias líneas.
    .nombre {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 1rem;
      font-weight: 700;
      line-height: 1.2;
    }

    .texto {
      flex: 1;
      min-width: 0;
      text-wrap: balance;
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
      background: var(--acento);
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

    // Por encima del ::after de la cabecera, para ampliarse en vez de abrir el local.
    .foto,
    .foto:hover:not(:disabled) {
      position: relative;
      display: block;
      height: auto;
      padding: 0;
      border: 0;
      border-radius: 8px;
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
  `,
})
export class Galeria {
  readonly locales = input.required<readonly Local[]>();
  readonly estados = input<ReadonlyMap<number, Estado>>(new Map());
  readonly llegadas = input<ReadonlyMap<number, Llegada>>(new Map());
  readonly ahora = input(new Date());
  readonly abrir = output<number>();

  private readonly visor = inject(Visor);

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

  protected ampliar(evento: Event, tapa: Tapa): void {
    this.visor.foto.set({
      src: `data/${tapa.photo}`,
      alt: tapa.name,
      origen: evento.currentTarget as HTMLElement,
    });
  }
}
