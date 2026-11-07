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
import { TapasRoute } from '../tapas-route';
import { VenueHeader } from '../venue-header/venue-header';
import {
  Venue,
  WEEKDAYS,
  Weekday,
  formatSlots,
  isWithdrawn,
  splitSlots,
  unchanged,
  weekdayOf,
  withdrawalNotice,
} from '../venues';

/**
 * The venues whose schedule is open, and how it's shown, for the visit: the card in the list and the
 * one in the venue view are different ones, and it stays as it was left from one to the other.
 */
@Injectable({ providedIn: 'root' })
export class OpenSchedules {
  private readonly open = new Set<number>();
  /** The schedules switched with the exclamation mark, with what «Horarios revisados» was then. */
  private readonly switched = new Map<number, { corrected: boolean; reviewedHours: boolean }>();

  has(venue: number): boolean {
    return this.open.has(venue);
  }

  set(venue: number, open: boolean): void {
    if (open) this.open.add(venue);
    else this.open.delete(venue);
  }

  /** Corrected or not: as «Horarios revisados» says, unless switched since it last changed. */
  corrected(venue: number, reviewedHours: boolean): boolean {
    const switched = this.switched.get(venue);
    return switched?.reviewedHours === reviewedHours ? switched.corrected : reviewedHours;
  }

  setCorrected(venue: number, corrected: boolean, reviewedHours: boolean): void {
    this.switched.set(venue, { corrected, reviewedHours });
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
  /** See VenueHeader. */
  readonly mapButton = input(true);
  readonly showOnMap = output<void>();

  private readonly clock = inject(Clock);
  private readonly openSchedules = inject(OpenSchedules);
  private readonly tapasRoute = inject(TapasRoute);
  protected readonly weekdays = WEEKDAYS;
  /**
   * What the reviewed hours take away from the guide's schedule (TapasRoute.changes): with it, the
   * exclamation mark between «Horario de tapas» and its status. Null if nothing.
   */
  protected readonly changes = computed(
    () => this.tapasRoute.changes().get(this.venue().number) ?? null,
  );
  /**
   * Whether the schedule shows the corrections: as «Horarios revisados» says, until the exclamation
   * mark switches it.
   */
  protected readonly corrected = linkedSignal(() =>
    this.openSchedules.corrected(this.venue().number, this.tapasRoute.reviewedHours()),
  );
  /** The notice under the schedule: which one it is, and pressing it switches to the other. */
  protected readonly notice = computed(() =>
    this.corrected()
      ? 'Estás viendo el horario revisado. Pulsa este aviso para ver el horario original.'
      : 'El horario original no coincide con el horario revisado. Pulsa este aviso para ver la revisión.',
  );
  /** If it's going to withdraw from the route, from when: once it has, the ribbon says so. */
  protected readonly withdrawal = computed(() =>
    withdrawalNotice(this.venue(), this.tapasRoute.today()),
  );
  protected readonly withdrawn = computed(() => isWithdrawn(this.venue(), this.tapasRoute.today()));
  /** To highlight today in the schedule. */
  protected readonly today = computed(() => weekdayOf(this.clock.now()));
  /**
   * Each day with its slots split into columns (morning · afternoon). Without changes, venue().schedule
   * is still the guide's.
   */
  protected readonly week = computed(() => {
    const changes = this.changes();
    const corrected = this.corrected();
    return WEEKDAYS.map((day) => ({
      ...day,
      ...splitSlots(changes?.[day.id] ?? unchanged(this.venue().schedule[day.id]), corrected),
    }));
  });
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

  /** The notice under the schedule: switches it between the guide's and the corrected one. */
  protected toggleCorrected(): void {
    const corrected = !this.corrected();
    this.corrected.set(corrected);
    this.openSchedules.setCorrected(
      this.venue().number,
      corrected,
      this.tapasRoute.reviewedHours(),
    );
  }

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
    if (details.querySelector('.schedule')) this.animateSchedule(details, open);
    else {
      // The first time, as soon as it's on the page (before it gets painted).
      afterNextRender(() => this.animateSchedule(details, open), { injector: this.injector });
    }
  }

  /** Line by line: each day and, below them, the note about the reviewed hours. */
  private animateSchedule(details: HTMLDetailsElement, open: boolean): void {
    details.open = true;
    const schedule = details.querySelector<HTMLElement>('.schedule')!;
    const lines = [...schedule.querySelectorAll('.day, .notice')];
    const height = schedule.getBoundingClientRect().height;
    this.unfolding.play(
      schedule,
      0,
      height,
      open,
      () => {
        details.open = !this.folding;
        this.folding = false;
      },
      lines,
    );
  }
}
