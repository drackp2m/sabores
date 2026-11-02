import { Component, computed, inject, input, model } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';

import { Icon } from '../icon/icon';
import { Seal } from '../seal/seal';
import { TapasRoute } from '../tapas-route';
import { Filters, NO_FILTERS, TimeRange, WEEKDAYS, drinkTypes, timeOf, weekdayOf } from '../venues';
import { TimeField } from './time-field';

/** The filters' form. App keeps their values: this goes away in the venue view, and they stay. */
@Component({
  selector: 'app-filters',
  imports: [FormField, Icon, Seal, TimeField],
  template: `
    <section aria-label="Filtros">
      <div class="content">
        <label class="field text">
          <span>Buscar</span>
          <input
            type="search"
            placeholder="Nº, local, tapa, ingrediente, calle…"
            [formField]="form.text"
          />
        </label>

        <label class="field">
          <span>Día</span>
          <select [formField]="form.day">
            <option value="">Cualquiera</option>
            @for (d of weekdays; track d.id) {
              <option [value]="d.id">{{ d.name }}</option>
            }
          </select>
        </label>

        <div class="field time" role="group" aria-labelledby="time-label">
          <span id="time-label">Hora</span>
          <div class="range">
            <app-time-field label="Desde" [placeholder]="range().from" [formField]="form.from" />
            <span aria-hidden="true">–</span>
            <app-time-field label="Hasta" [placeholder]="range().to" [formField]="form.to" />
          </div>
        </div>

        <label class="field">
          <span>Sin gluten</span>
          <select [formField]="form.glutenFree">
            <option value="">Indiferente</option>
            <option value="yes">Sin gluten</option>
            <option value="optional">Bajo petición</option>
          </select>
        </label>

        <label class="field">
          <span>Bebida</span>
          <select [formField]="form.drink">
            <option value="">Cualquiera</option>
            @for (d of drinks(); track d.type) {
              <option [value]="d.type">{{ d.type }} ({{ d.venues }})</option>
            }
          </select>
        </label>

        <label class="field">
          <span>Probadas</span>
          <select title="Las tapas con estrellas cuentan como probadas" [formField]="form.tried">
            <option value="">Indiferente</option>
            <option value="none">Ninguna probada</option>
            <option value="some">Alguna probada</option>
            <option value="pending">Alguna sin probar</option>
            <option value="all">Todas probadas</option>
          </select>
        </label>

        <div class="field only" role="group" aria-labelledby="only-label">
          <span id="only-label">Mostrar solo</span>
          <div class="checkboxes">
            <label class="control">
              <input type="checkbox" [formField]="form.favorites" />
              <app-icon class="heart" name="heart" />
              Favoritos
            </label>
            <label class="control" title="Castelló Ruta de Sabor">
              <input type="checkbox" [formField]="form.flavorRoute" />
              <app-seal kind="flavor-route" aria-hidden="true" />
              Ruta de Sabor
            </label>
          </div>
        </div>

        <div class="actions">
          <button type="button" (click)="openNow()">Abierto ahora</button>
          <button type="button" class="secondary" (click)="filters.set(noFilters)">Limpiar</button>
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    section {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 0.75rem var(--gutter-right) 0.75rem var(--gutter-left);
    }

    // The width, the same as .content in app.scss.
    .content {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 0.75rem;
      max-width: 1280px;
      margin-inline: auto;
    }

    // Two fields per row on phones (day and time; gluten-free and drink) and as many as fit on desktop.
    .field {
      display: flex;
      flex: 1 1 8rem;
      flex-direction: column;
      gap: 0.2rem;
      min-width: 0;
      font-size: 0.8rem;
      color: var(--muted);

      &.text {
        flex: 2 1 16rem;
      }

      &.time {
        flex: 1 1 12.5rem; // Next to the day, also on a 375 px phone.
      }

      &.only {
        flex: 1 1 auto;
      }
    }

    // Both checkboxes, on the same row if they fit, sharing the width (on desktop, up to 15rem); if
    // not, each on its own.
    .checkboxes {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;

      .control {
        flex: 1 1 auto;
        max-width: 15rem;
      }
    }

    .heart {
      color: var(--heart);
      --icon-fill: currentColor;
    }

    .range {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      color: var(--muted);

      app-time-field {
        flex: 1;
      }
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      margin-left: auto;
    }
  `,
})
export class FiltersPanel {
  readonly filters = model.required<Filters>();
  /** The one that applies: an end left blank shows what it's replaced with. */
  readonly range = input.required<TimeRange>();

  private readonly tapasRoute = inject(TapasRoute);
  protected readonly weekdays = WEEKDAYS;
  protected readonly noFilters = NO_FILTERS;
  protected readonly drinks = computed(() => drinkTypes(this.tapasRoute.venues()));

  protected readonly form = form(this.filters);

  /** Venues serving tapas right now: the same time in both ends. */
  protected openNow(): void {
    const date = new Date();
    const time = timeOf(date);
    this.filters.update((filters) => ({
      ...filters,
      day: weekdayOf(date),
      from: time,
      to: time,
    }));
  }
}
