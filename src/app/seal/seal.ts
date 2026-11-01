import { Component, computed, input } from '@angular/core';

import { Icon } from '../icon/icon';
import { Tapa } from '../venues';

export type SealKind = 'gluten-free' | 'on-request' | 'flavor-route';

const DESCRIPTIONS: Record<SealKind, string> = {
  'gluten-free': 'Sin gluten',
  'on-request': 'Sin gluten bajo petición',
  'flavor-route': 'Castelló Ruta de Sabor',
};

/** The gluten-free seal that matches some tapas: the best one any of them has. */
export function glutenSeal(tapas: readonly Tapa[]): SealKind | null {
  if (tapas.some((t) => t.glutenFree === 'yes')) return 'gluten-free';
  if (tapas.some((t) => t.glutenFree === 'optional')) return 'on-request';
  return null;
}

/** A seal's icon: crossed-out wheat (green gluten-free, amber on request) or the route's logo. */
@Component({
  selector: 'app-seal',
  imports: [Icon],
  template: `
    @if (kind() === 'flavor-route') {
      <img src="flavor-route.svg" alt="" width="173" height="113" />
    } @else {
      <app-icon name="glutenFree" />
    }
  `,
  host: {
    role: 'img',
    '[class]': 'kind()',
    '[attr.aria-label]': 'description()',
    '[title]': 'description()',
  },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      align-items: center;
      font-size: 1.05em;
    }

    :host(.gluten-free) {
      color: var(--green);
    }

    :host(.on-request) {
      color: var(--amber);
    }

    img {
      width: auto;
      height: 1em;
    }
  `,
})
export class Seal {
  readonly kind = input.required<SealKind>();

  protected readonly description = computed(() => DESCRIPTIONS[this.kind()]);
}
