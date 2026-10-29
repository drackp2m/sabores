import { Component, computed, input } from '@angular/core';

import { Estado, Llegada, pastillaEstado } from '../locales';

/** "cierra en…" / "abre en…", en rojo si cierra antes de que dé tiempo a llegar (estilos en styles.scss). */
@Component({
  selector: 'app-estado-horario',
  template: '{{ pastilla().texto }}',
  host: {
    '[class]': "'estado-horario ' + pastilla().tipo",
    '[attr.title]': 'pastilla().aviso || null',
  },
})
export class EstadoHorario {
  readonly estado = input.required<Estado>();
  readonly ahora = input.required<Date>();
  readonly llegada = input<Llegada | null | undefined>(null);

  protected readonly pastilla = computed(() =>
    pastillaEstado(this.estado(), this.ahora(), this.llegada()),
  );
}
