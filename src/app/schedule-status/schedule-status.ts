import { Component, computed, input } from '@angular/core';

import { Arrival, Status, statusBadge } from '../venues';

/** "cierra en…" / "abre en…", in red if it closes before you can get there (styles in styles.scss). */
@Component({
  selector: 'app-schedule-status',
  template: '{{ badge().text }}',
  host: {
    '[class]': "'schedule-status ' + badge().kind",
    '[attr.title]': 'badge().warning || null',
  },
})
export class ScheduleStatus {
  readonly status = input.required<Status>();
  readonly now = input.required<Date>();
  readonly arrival = input<Arrival | null | undefined>(null);

  protected readonly badge = computed(() => statusBadge(this.status(), this.now(), this.arrival()));
}
