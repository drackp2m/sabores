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

import { Unfolding } from '../animate-height';
import { ArrivalTime } from '../arrival-time/arrival-time';
import { Clock } from '../clock';
import { Collapsible } from '../collapsible/collapsible';
import { Favorite } from '../favorite/favorite';
import { Icon } from '../icon/icon';
import { reducedMotion } from '../media';
import { ScheduleStatus } from '../schedule-status/schedule-status';
import { Seal, glutenSeal } from '../seal/seal';
import { TapaPhoto } from '../tapa-photo/tapa-photo';
import { TapasRoute } from '../tapas-route';
import { Venue, WEEKDAYS, Weekday, formatSlots, splitSlots, weekdayOf } from '../venues';

@Component({
  selector: 'app-venue-card',
  imports: [ArrivalTime, Collapsible, Favorite, Icon, ScheduleStatus, Seal, TapaPhoto],
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
  private readonly unfolding = new Unfolding();
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

  protected readonly arrival = computed(() => this.tapasRoute.arrivals().get(this.venue().number));

  /**
   * Opens the schedule making room day by day, with each one appearing as soon as it fits; on closing,
   * the same backwards.
   */
  protected toggleSchedule(event: Event, details: HTMLDetailsElement): void {
    const open = !details.open || this.folding;
    this.scheduleOpen.set(open);
    this.scheduleCreated.set(true);
    if (reducedMotion()) return;
    event.preventDefault();
    this.folding = !open;
    if (this.unfolding.turnBack()) return;
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
    details.open = true;
    this.unfolding.play(list, 0, list.getBoundingClientRect().height, open, () => {
      details.open = !this.folding;
      this.folding = false;
    });
  }
}
