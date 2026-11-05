import { TestBed } from '@angular/core/testing';

import { Arrival } from '../venues';
import { ArrivalTime } from './arrival-time';

const WALK: Arrival = { meters: 1200, minutes: 16, mode: 'walking' };

describe('ArrivalTime', () => {
  function create(arrival: Arrival, distance: boolean): HTMLElement {
    const fixture = TestBed.createComponent(ArrivalTime);
    fixture.componentRef.setInput('arrival', arrival);
    fixture.componentRef.setInput('distance', distance);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('shows the time, with the distance in the tooltip', () => {
    const element = create(WALK, false);
    expect(element.textContent!.trim()).toBe('16 min');
    expect(element.title).toBe('≈ 1,2 km en línea recta, a pie');
    expect(element.querySelector('use')!.getAttribute('href')).toBe('#icon-walking');
  });

  it('says it is by car', () => {
    const element = create({ ...WALK, mode: 'driving' }, false);
    expect(element.title).toBe('≈ 1,2 km en línea recta, en coche');
  });

  it('shows the distance next to the time, with no tooltip', () => {
    const element = create(WALK, true);
    expect(element.textContent!.trim()).toBe('16 min · 1,2 km');
    expect(element.hasAttribute('title')).toBe(false);
  });
});
