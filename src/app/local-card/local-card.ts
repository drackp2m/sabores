import { Component, computed, input, output } from '@angular/core';

import { DIAS, Dia, Local, formatearFranjas } from '../locales';

@Component({
  selector: 'app-local-card',
  templateUrl: './local-card.html',
  styleUrl: './local-card.scss',
})
export class LocalCard {
  readonly local = input.required<Local>();
  /** Día elegido en los filtros, para destacar su horario. */
  readonly dia = input<Dia | ''>('');
  readonly verEnMapa = output<void>();

  protected readonly dias = DIAS;
  protected readonly formatearFranjas = formatearFranjas;

  protected readonly horarioDia = computed(() => {
    const dia = DIAS.find((d) => d.id === this.dia());
    return dia && { nombre: dia.nombre, franjas: formatearFranjas(this.local().schedule[dia.id]) };
  });
}
