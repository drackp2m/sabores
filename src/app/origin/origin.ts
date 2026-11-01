import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Icon } from '../icon/icon';
import { UserLocation } from '../user-location';

/** Chooses the starting point: the browser's location or an address typed by hand. */
@Component({
  selector: 'app-origin',
  imports: [FormsModule, Icon],
  template: `
    @if (location.origin(); as origin) {
      <p class="from">
        <app-icon name="location" />
        <span
          >Desde <strong>{{ origin.label }}</strong></span
        >
        <select aria-label="Cómo llegar" [(ngModel)]="location.travelMode">
          <option value="">Según la distancia</option>
          <option value="walking">A pie</option>
          <option value="driving">En coche</option>
        </select>
        <button type="button" class="secondary" (click)="location.clear()">
          <app-icon name="close" /> Quitar
        </button>
      </p>
    } @else {
      <form (ngSubmit)="location.search(address())">
        <button type="button" (click)="location.useMyLocation()" [disabled]="location.searching()">
          <app-icon name="location" /> Mi ubicación
        </button>
        <input
          type="search"
          name="address"
          placeholder="o escribe una dirección…"
          aria-label="Dirección de partida"
          [(ngModel)]="address"
        />
        <button
          type="submit"
          class="secondary"
          [disabled]="location.searching() || !address().trim()"
        >
          Buscar
        </button>
      </form>
      @if (location.searching()) {
        <p class="message">Buscando…</p>
      } @else if (location.error(); as error) {
        <p class="message error">{{ error }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    form,
    .from {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
    }

    input {
      flex: 1 1 14rem;
    }

    .from {
      color: var(--muted);

      strong {
        color: var(--text);
      }
    }

    .message {
      margin: 0.4rem 0 0;
      font-size: 0.85rem;
      color: var(--muted);
    }

    .error {
      color: var(--accent);
    }
  `,
})
export class OriginPanel {
  protected readonly location = inject(UserLocation);
  protected readonly address = signal('');
}
