import { Component, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';

import { Icon } from '../icon/icon';
import { UserLocation } from '../user-location';

/** Chooses the starting point: the browser's location or an address typed by hand. */
@Component({
  selector: 'app-origin',
  imports: [FormField, Icon],
  template: `
    @if (location.origin(); as origin) {
      <p class="from">
        <app-icon name="location" />
        <span
          >Desde <strong>{{ origin.label }}</strong></span
        >
        <select aria-label="Cómo llegar" [formField]="travelMode">
          <option value="">Según la distancia</option>
          <option value="walking">A pie</option>
          <option value="driving">En coche</option>
        </select>
        <button type="button" class="secondary" (click)="location.clear()">
          <app-icon name="close" /> Quitar
        </button>
      </p>
    } @else {
      <form (submit)="search($event)">
        <button type="button" (click)="location.useMyLocation()" [disabled]="location.searching()">
          <app-icon name="location" /> Mi ubicación
        </button>
        <input
          type="search"
          placeholder="o escribe una dirección…"
          aria-label="Dirección de partida"
          [formField]="addressField"
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
  protected readonly addressField = form(this.address);
  protected readonly travelMode = form(this.location.travelMode);

  /** So that the browser doesn't send the form and reload the page. */
  protected search(event: Event): void {
    event.preventDefault();
    this.location.search(this.address());
  }
}
