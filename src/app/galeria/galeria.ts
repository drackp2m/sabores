import { Component, computed, input, output } from '@angular/core';

import { EstadoHorario } from '../estado-horario/estado-horario';
import { Icono } from '../icono/icono';
import { Estado, Llegada, Local, formatearDistancia, formatearDuracion } from '../locales';
import { Sello, selloGluten } from '../sello/sello';

/**
 * Vista «Fotos»: el nombre del local con sus sellos, cuánto se tarda en llegar, si está abierto y
 * las fotos de sus dos tapas.
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
          <button type="button" (click)="abrir.emit(local.number)">
            <span class="cabeza">
              <span class="numero">{{ local.number }}</span>
              <span class="titulo">
                <span class="nombre">
                  {{ local.name }}
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
            </span>
            <span class="fotos">
              @for (tapa of local.tapas; track tapa.number) {
                <span class="foto">
                  <img
                    [src]="'data/' + tapa.photo"
                    [alt]="tapa.name"
                    [title]="tapa.name"
                    loading="lazy"
                    width="690"
                    height="439"
                  />
                </span>
              }
            </span>
          </button>
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

    li > button {
      flex-direction: column;
      align-items: stretch;
      gap: 0.6rem;
      width: 100%;
      height: auto;
      padding: 0.6rem;
      border: 1px solid var(--borde);
      border-radius: var(--radio);
      background: var(--superficie);
      color: var(--texto);
      text-align: left;
      white-space: normal;

      &:hover {
        border-color: var(--borde-control);
        background: var(--superficie);
      }
    }

    .cabeza {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .titulo {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-width: 0;
    }

    .nombre {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.25rem 0.4rem;
      font-size: 1rem;
      font-weight: 700;
      line-height: 1.2;
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

    .numero {
      flex: none;
      display: grid;
      place-items: center;
      width: 1.6rem;
      height: 1.6rem;
      border-radius: 50%;
      background: var(--acento);
      color: #fff;
      font-size: 0.75rem;
    }

    .fotos {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem;
    }

    // Al pasar por encima, las fotos se acercan un poco dentro de su hueco, sin mover nada más.
    .foto {
      overflow: hidden;
      border-radius: 8px;
      background: var(--borde);
    }

    img {
      display: block;
      width: 100%;
      height: auto;
      aspect-ratio: 690 / 439;
      object-fit: cover;
      transition: transform 0.3s ease-out;

      button:is(:hover, :focus-visible) & {
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
