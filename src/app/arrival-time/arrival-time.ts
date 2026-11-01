import { Component, booleanAttribute, computed, input } from '@angular/core';

import { Icon, createIcon } from '../icon/icon';
import { Arrival, formatDistance, formatDuration } from '../venues';

/**
 * How long it takes to get to a venue, with the icon of the mode: on foot or by car (styles in
 * styles/_badges.scss). The distance goes next to it or, if there's no room, in the tooltip.
 */
@Component({
  selector: 'app-arrival-time',
  imports: [Icon],
  template: `
    <app-icon [name]="arrival().mode" />
    {{ text() }}
  `,
  host: {
    class: 'arrival-time',
    '[attr.title]': 'detail()',
  },
})
export class ArrivalTime {
  readonly arrival = input.required<Arrival>();
  /** With the distance next to the time. */
  readonly distance = input(false, { transform: booleanAttribute });

  protected readonly text = computed(() => {
    const { minutes, meters } = this.arrival();
    const time = formatDuration(minutes);
    return this.distance() ? `${time} · ${formatDistance(meters)}` : time;
  });

  protected readonly detail = computed(() => {
    const { mode, meters } = this.arrival();
    if (this.distance()) return null;
    return `≈ ${formatDistance(meters)} en línea recta, ${mode === 'walking' ? 'a pie' : 'en coche'}`;
  });
}

/** The same as a loose element, without the distance, for the map's popups. */
export function createArrivalTime({ mode, minutes }: Arrival): HTMLElement {
  const time = document.createElement('span');
  time.className = 'arrival-time';
  time.append(createIcon(mode), formatDuration(minutes));
  return time;
}
