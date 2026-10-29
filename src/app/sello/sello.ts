import { Component, computed, input } from '@angular/core';

import { Icono } from '../icono/icono';
import { Tapa } from '../locales';

export type TipoSello = 'sin-gluten' | 'bajo-peticion' | 'ruta';

const DESCRIPCIONES: Record<TipoSello, string> = {
  'sin-gluten': 'Sin gluten',
  'bajo-peticion': 'Sin gluten bajo petición',
  ruta: 'Castelló Ruta de Sabor',
};

/** Sello de sin gluten que corresponde a unas tapas: el mejor que tenga alguna. */
export function selloGluten(tapas: readonly Tapa[]): TipoSello | null {
  if (tapas.some((t) => t.glutenFree === 'yes')) return 'sin-gluten';
  if (tapas.some((t) => t.glutenFree === 'optional')) return 'bajo-peticion';
  return null;
}

/** Icono de un sello: espiga tachada (verde sin gluten, ámbar bajo petición) o logo de la Ruta de Sabor. */
@Component({
  selector: 'app-sello',
  imports: [Icono],
  template: `
    @if (tipo() === 'ruta') {
      <img src="ruta-sabor.svg" alt="" width="173" height="113" />
    } @else {
      <app-icono nombre="sinGluten" />
    }
  `,
  host: {
    role: 'img',
    '[class]': 'tipo()',
    '[attr.aria-label]': 'descripcion()',
    '[title]': 'descripcion()',
  },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      align-items: center;
      font-size: 1.05em;
    }

    :host(.sin-gluten) {
      color: var(--verde);
    }

    :host(.bajo-peticion) {
      color: var(--ambar);
    }

    img {
      width: auto;
      height: 1em;
    }
  `,
})
export class Sello {
  readonly tipo = input.required<TipoSello>();

  protected readonly descripcion = computed(() => DESCRIPCIONES[this.tipo()]);
}
