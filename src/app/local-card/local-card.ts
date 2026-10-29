import { Component, computed, inject, input, output } from '@angular/core';

import { EstadoHorario } from '../estado-horario/estado-horario';
import { Icono } from '../icono/icono';
import {
  DIAS,
  Dia,
  Estado,
  Llegada,
  Local,
  Tapa,
  formatearDistancia,
  formatearDuracion,
  formatearFranjas,
} from '../locales';
import { Plegable } from '../plegable/plegable';
import { Sello, selloGluten } from '../sello/sello';
import { Visor } from '../visor/visor';

@Component({
  selector: 'app-local-card',
  imports: [EstadoHorario, Icono, Plegable, Sello],
  templateUrl: './local-card.html',
  styleUrl: './local-card.scss',
})
export class LocalCard {
  readonly local = input.required<Local>();
  /** Día elegido en los filtros, para destacar su horario. */
  readonly dia = input<Dia | ''>('');
  /** Estado del horario ahora mismo. */
  readonly estado = input<Estado>();
  readonly ahora = input(new Date());
  /** Tiempo de llegada desde el punto de partida, si se ha elegido. */
  readonly llegada = input<Llegada | null>(null);
  readonly verEnMapa = output<void>();

  protected readonly dias = DIAS;
  protected readonly formatearFranjas = formatearFranjas;
  protected readonly selloGluten = selloGluten;
  private readonly visor = inject(Visor);

  protected readonly horarioDia = computed(() => {
    const dia = DIAS.find((d) => d.id === this.dia());
    return dia && { nombre: dia.nombre, franjas: formatearFranjas(this.local().schedule[dia.id]) };
  });

  protected readonly bebidas = computed(() =>
    this.local()
      .drinks.map((b) => b.name)
      .join(' · '),
  );

  protected readonly textoLlegada = computed(() => {
    const llegada = this.llegada();
    if (!llegada) return undefined;
    const aPie = llegada.modo === 'pie';
    return {
      texto: formatearDuracion(llegada.minutos),
      modo: llegada.modo,
      detalle: `≈ ${formatearDistancia(llegada.metros)} en línea recta, ${aPie ? 'a pie' : 'en coche'}`,
    };
  });

  protected ampliar(evento: Event, tapa: Tapa): void {
    this.visor.foto.set({
      src: `data/${tapa.photo}`,
      alt: tapa.name,
      origen: evento.currentTarget as HTMLElement,
    });
  }
}
