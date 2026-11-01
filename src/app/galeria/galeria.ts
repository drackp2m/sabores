import { Component, computed, input, output } from '@angular/core';

import { EstadoHorario } from '../estado-horario/estado-horario';
import { Favorito } from '../favorito/favorito';
import { FotoTapa } from '../foto-tapa/foto-tapa';
import { Icono } from '../icono/icono';
import { Estado, Llegada, Local, formatearDistancia, formatearDuracion } from '../locales';
import { Sello, selloGluten } from '../sello/sello';

/**
 * Vista «Fotos»: el nombre del local con sus sellos y el corazón de favorito, cuánto se tarda en
 * llegar, si está abierto y las fotos de sus dos tapas con sus estrellas. La tarjeta abre el local y
 * cada foto se amplía (y ahí se valora).
 */
@Component({
  selector: 'app-galeria',
  imports: [EstadoHorario, Favorito, FotoTapa, Icono, Sello],
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
              <figure>
                <button appFotoTapa [local]="local.number" [tapa]="tapa"></button>
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
  `,
})
export class Galeria {
  readonly locales = input.required<readonly Local[]>();
  readonly estados = input<ReadonlyMap<number, Estado>>(new Map());
  readonly llegadas = input<ReadonlyMap<number, Llegada>>(new Map());
  readonly ahora = input(new Date());
  readonly abrir = output<number>();

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
}
