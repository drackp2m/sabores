import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, of } from 'rxjs';

import { LocalCard } from './local-card/local-card';
import { DIAS, DatosRuta, Dia, Filtros, diaDe, filtrarLocales } from './locales';
import { Mapa } from './mapa/mapa';

@Component({
  selector: 'app-root',
  imports: [FormsModule, LocalCard, Mapa],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly dias = DIAS;

  /** undefined mientras carga; null si no se ha podido cargar. */
  protected readonly datos = toSignal(
    inject(HttpClient)
      .get<DatosRuta>('data/locales.json')
      .pipe(catchError(() => of(null))),
  );

  protected readonly texto = signal('');
  protected readonly dia = signal<Dia | ''>('');
  protected readonly hora = signal('');
  protected readonly sinGluten = signal<Filtros['sinGluten']>('');
  protected readonly rutaDeSabor = signal(false);

  protected readonly filtrados = computed(() =>
    filtrarLocales(this.datos()?.locales ?? [], {
      texto: this.texto(),
      dia: this.dia(),
      hora: this.hora(),
      sinGluten: this.sinGluten(),
      rutaDeSabor: this.rutaDeSabor(),
    }),
  );

  protected readonly periodo = computed(() => {
    const evento = this.datos()?.event;
    if (!evento) return '';
    const fecha = (iso: string) =>
      new Date(`${iso}T00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
    return `del ${fecha(evento.startDate)} al ${fecha(evento.endDate)}`;
  });

  /** Locales que sirven tapas ahora mismo. */
  protected ahora(): void {
    const fecha = new Date();
    this.dia.set(diaDe(fecha));
    this.hora.set(fecha.toTimeString().slice(0, 5));
  }

  protected limpiar(): void {
    this.texto.set('');
    this.dia.set('');
    this.hora.set('');
    this.sinGluten.set('');
    this.rutaDeSabor.set(false);
  }
}
