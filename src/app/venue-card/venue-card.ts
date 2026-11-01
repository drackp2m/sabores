import {
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { Clock } from '../clock';
import { Collapsible } from '../collapsible/collapsible';
import { Favorite } from '../favorite/favorite';
import { Icon } from '../icon/icon';
import { ScheduleStatus } from '../schedule-status/schedule-status';
import { Seal, glutenSeal } from '../seal/seal';
import { TapaPhoto } from '../tapa-photo/tapa-photo';
import { TapasRoute } from '../tapas-route';
import {
  Venue,
  WEEKDAYS,
  Weekday,
  formatDistance,
  formatDuration,
  formatSlots,
  splitSlots,
  weekdayOf,
} from '../venues';

@Component({
  selector: 'app-venue-card',
  imports: [Collapsible, Favorite, Icon, ScheduleStatus, Seal, TapaPhoto],
  templateUrl: './venue-card.html',
  styleUrl: './venue-card.scss',
})
export class VenueCard {
  readonly venue = input.required<Venue>();
  /** Day chosen in the filters, to highlight its schedule. */
  readonly day = input<Weekday | ''>('');
  readonly showOnMap = output<void>();

  private readonly tapasRoute = inject(TapasRoute);
  private readonly clock = inject(Clock);
  protected readonly weekdays = WEEKDAYS;
  /** To highlight today in the schedule. */
  protected readonly today = computed(() => weekdayOf(this.clock.now()));
  /** Each day with its slots split into columns (morning · afternoon). */
  protected readonly week = computed(() =>
    WEEKDAYS.map((day) => ({ ...day, ...splitSlots(this.venue().schedule[day.id]) })),
  );
  /**
   * What was asked for: the arrow turns as soon as it's pressed, even though on closing the schedule
   * stays open until it has finished folding.
   */
  protected readonly scheduleOpen = signal(false);
  /** The seven days are created the first time it opens, and then they stay. */
  protected readonly scheduleCreated = signal(false);
  protected readonly glutenSeal = glutenSeal;
  private readonly injector = inject(Injector);
  private folding = false;

  protected readonly daySchedule = computed(() => {
    const day = WEEKDAYS.find((d) => d.id === this.day());
    return day && { name: day.name, slots: formatSlots(this.venue().schedule[day.id]) };
  });

  protected readonly drinks = computed(() =>
    this.venue()
      .drinks.map((d) => d.name)
      .join(' · '),
  );

  protected readonly arrivalText = computed(() => {
    const arrival = this.tapasRoute.arrivals().get(this.venue().number);
    if (!arrival) return undefined;
    const onFoot = arrival.mode === 'walking';
    return {
      text: formatDuration(arrival.minutes),
      mode: arrival.mode,
      detail: `≈ ${formatDistance(arrival.meters)} en línea recta, ${onFoot ? 'a pie' : 'en coche'}`,
    };
  });

  /**
   * Opens the schedule making room little by little, while each day appears a bit after the one
   * before; on closing, the room just folds away.
   */
  protected toggleSchedule(event: Event, details: HTMLDetailsElement): void {
    const open = !details.open || this.folding;
    this.scheduleOpen.set(open);
    this.scheduleCreated.set(true);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    event.preventDefault();
    const list = details.querySelector('dl');
    if (list) this.animateSchedule(details, list, open);
    else {
      // The first time, as soon as it's on the page (before it gets painted).
      afterNextRender(() => this.animateSchedule(details, details.querySelector('dl')!, open), {
        injector: this.injector,
      });
    }
  }

  private animateSchedule(details: HTMLDetailsElement, list: HTMLElement, open: boolean): void {
    // If pressed halfway through, it continues from the height it has at that moment.
    const from = details.open ? list.getBoundingClientRect().height : 0;
    for (const animation of list.getAnimations({ subtree: true })) animation.cancel();

    if (open) {
      this.folding = false;
      details.open = true;
      const to = list.getBoundingClientRect().height;
      list.animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: 400,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      });
      // All the cells in a row (data-row) come in at once.
      [...list.children].forEach((cell) =>
        cell.animate([{ opacity: 0 }, {}], {
          duration: 320,
          delay: 60 + Number((cell as HTMLElement).dataset['row']) * 45,
          easing: 'ease-out',
          fill: 'backwards',
        }),
      );
    } else {
      this.folding = true;
      list.animate([{ height: `${from}px` }, { height: '0px' }], {
        duration: 300,
        easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      }).onfinish = () => {
        details.open = false;
        this.folding = false;
      };
    }
  }
}
