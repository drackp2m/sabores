import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Icono } from '../icono/icono';
import { Ubicacion } from '../ubicacion';

/** Elige el punto de partida: la ubicación del navegador o una dirección escrita a mano. */
@Component({
  selector: 'app-origen',
  imports: [FormsModule, Icono],
  template: `
    @if (ubicacion.origen(); as origen) {
      <p class="desde">
        <app-icono nombre="ubicacion" />
        <span
          >Desde <strong>{{ origen.etiqueta }}</strong></span
        >
        <select aria-label="Cómo llegar" [(ngModel)]="ubicacion.medio">
          <option value="">Según la distancia</option>
          <option value="pie">A pie</option>
          <option value="coche">En coche</option>
        </select>
        <button type="button" class="secundario" (click)="ubicacion.quitar()">
          <app-icono nombre="cerrar" /> Quitar
        </button>
      </p>
    } @else {
      <form (ngSubmit)="ubicacion.buscar(direccion())">
        <button
          type="button"
          (click)="ubicacion.usarMiUbicacion()"
          [disabled]="ubicacion.buscando()"
        >
          <app-icono nombre="ubicacion" /> Mi ubicación
        </button>
        <input
          type="search"
          name="direccion"
          placeholder="o escribe una dirección…"
          aria-label="Dirección de partida"
          [(ngModel)]="direccion"
        />
        <button
          type="submit"
          class="secundario"
          [disabled]="ubicacion.buscando() || !direccion().trim()"
        >
          Buscar
        </button>
      </form>
      @if (ubicacion.buscando()) {
        <p class="mensaje">Buscando…</p>
      } @else if (ubicacion.error(); as error) {
        <p class="mensaje error">{{ error }}</p>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    form,
    .desde {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
    }

    input {
      flex: 1 1 14rem;
    }

    .desde {
      color: var(--suave);

      strong {
        color: var(--texto);
      }
    }

    .mensaje {
      margin: 0.4rem 0 0;
      font-size: 0.85rem;
      color: var(--suave);
    }

    .error {
      color: var(--acento);
    }
  `,
})
export class OrigenPanel {
  protected readonly ubicacion = inject(Ubicacion);
  protected readonly direccion = signal('');
}
