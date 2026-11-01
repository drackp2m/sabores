import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Clock } from '../clock';
import { TapasRoute } from '../tapas-route';
import { Arrival, Status } from '../venues';
import { ScheduleStatus } from './schedule-status';

describe('ScheduleStatus', () => {
  const statuses = signal<ReadonlyMap<number, Status>>(new Map());
  const arrivals = signal<ReadonlyMap<number, Arrival>>(new Map());
  const now = signal(new Date(2026, 9, 15, 12, 0));

  beforeEach(() => {
    arrivals.set(new Map());
    TestBed.configureTestingModule({
      providers: [
        { provide: TapasRoute, useValue: { statuses, arrivals } },
        { provide: Clock, useValue: { now } },
      ],
    });
  });

  async function create(status: Status) {
    statuses.set(new Map([[7, status]]));
    const fixture = TestBed.createComponent(ScheduleStatus);
    fixture.componentRef.setInput('venue', 7);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('follows the minutes left, in the color they call for', async () => {
    const { fixture, el } = await create({ open: true, minutes: 31 });
    expect(el.textContent).toBe('cierra en 31 min');
    expect(el.classList).toContain('open');

    statuses.set(new Map([[7, { open: true, minutes: 30 }]]));
    await fixture.whenStable();
    expect(el.textContent).toBe('cierra en 30 min');
    expect(el.classList).toContain('soon');
    expect(el.classList).not.toContain('open');
  });

  it('warns if it closes before you can get there', async () => {
    const { fixture, el } = await create({ open: true, minutes: 40 });
    arrivals.set(new Map([[7, { meters: 5000, minutes: 50, mode: 'walking' }]]));
    await fixture.whenStable();
    expect(el.classList).toContain('late');
    expect(el.title).toBe('Cierra antes de que llegues: tardas 50 min');
  });

  it('with a new status that reads the same, there is nothing to update', async () => {
    const { fixture } = await create({ open: true, minutes: 200, untilClosing: true });
    const badge = () => fixture.componentInstance['badge']();
    const before = badge();

    statuses.set(new Map([[7, { open: true, minutes: 199, untilClosing: true }]]));
    expect(badge()).toBe(before);
  });
});
