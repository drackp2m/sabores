import { Component, computed, inject, input } from '@angular/core';

import { Clock } from '../clock';
import { TapasRoute } from '../tapas-route';
import { statusBadge } from '../venues';

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
  /** The venue's number. */
  readonly venue = input.required<number>();

  private readonly tapasRoute = inject(TapasRoute);
  private readonly clock = inject(Clock);

  /** Every minute there are new statuses, but only the badges whose text changes get updated. */
  protected readonly badge = computed(
    () =>
      statusBadge(
        this.tapasRoute.statuses().get(this.venue())!,
        this.clock.now(),
        this.tapasRoute.arrivals().get(this.venue()),
      ),
    { equal: (a, b) => a.text === b.text && a.kind === b.kind && a.warning === b.warning },
  );
}
