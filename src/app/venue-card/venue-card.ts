import {
  Component,
  Injectable,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';

import { Unfolding } from '../animate-height';
import { Clock } from '../clock';
import { Collapsible } from '../collapsible/collapsible';
import { Favorite } from '../favorite/favorite';
import { Icon } from '../icon/icon';
import { reducedMotion } from '../media';
import { ScheduleStatus } from '../schedule-status/schedule-status';
import { Seal, glutenSeal } from '../seal/seal';
import { TapaPhoto } from '../tapa-photo/tapa-photo';
import { VenueHeader } from '../venue-header/venue-header';
import { Venue, WEEKDAYS, Weekday, formatSlots, splitSlots, weekdayOf } from '../venues';

/**
 * The venues whose schedule is open, for the visit: the card in the list and the one in the venue view
 * are different ones, and it stays as it was left from one to the other.
 */
@Injectable({ providedIn: 'root' })
export class OpenSchedules {
  private readonly open = new Set<number>();

  has(venue: number): boolean {
    return this.open.has(venue);
  }

  set(venue: number, open: boolean): void {
    if (open) this.open.add(venue);
    else this.open.delete(venue);
  }
}

@Component({
  selector: 'app-venue-card',
  imports: [Collapsible, Favorite, Icon, ScheduleStatus, Seal, TapaPhoto, VenueHeader],
  templateUrl: './venue-card.html',
  styleUrl: './venue-card.scss',
})
export class VenueCard {
  readonly venue = input.required<Venue>();
  /** Day chosen in the filters, to highlight its schedule. */
  readonly day = input<Weekday | ''>('');
  readonly showOnMap = output<void>();

  private readonly clock = inject(Clock);
  private readonly openSchedules = inject(OpenSchedules);
  protected readonly weekdays = WEEKDAYS;
  /** To highlight today in the schedule. */
  protected readonly today = computed(() => weekdayOf(this.clock.now()));
  /** Each day with its slots split into columns (morning · afternoon). */
  protected readonly week = computed(() =>
    WEEKDAYS.map((day) => ({ ...day, ...splitSlots(this.venue().schedule[day.id]) })),
  );
  /** Whether the schedule starts open: as it was left in the venue's other card. */
  protected readonly startsOpen = computed(() => this.openSchedules.has(this.venue().number));
  /**
   * What was asked for: the arrow turns as soon as it's pressed, even though on closing the schedule
   * stays open until it has finished folding.
   */
  protected readonly scheduleOpen = linkedSignal(() => this.startsOpen());
  /** The seven days are created the first time it opens, and then they stay. */
  protected readonly scheduleCreated = linkedSignal(() => this.startsOpen());
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

  /**
   * Opens the schedule making room day by day, with each one appearing as soon as it fits; on closing,
   * the same backwards.
   */
  protected toggleSchedule(event: Event, details: HTMLDetailsElement): void {
    const open = !details.open || this.folding;
    this.openSchedules.set(this.venue().number, open);
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
