import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { UserLocation } from '../user-location';
import { OriginPanel } from './origin';

describe('OriginPanel', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  async function create() {
    const fixture = TestBed.createComponent(OriginPanel);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('searches for what was typed without leaving the page', async () => {
    const search = vi.spyOn(TestBed.inject(UserLocation), 'search').mockResolvedValue();
    const { fixture, el } = await create();
    const submit = el.querySelector<HTMLButtonElement>('button[type=submit]')!;
    expect(submit.disabled).toBe(true);

    const input = el.querySelector('input')!;
    input.value = 'Herrero 49';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(submit.disabled).toBe(false);

    const event = new Event('submit', { cancelable: true });
    el.querySelector('form')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(search).toHaveBeenCalledExactlyOnceWith('Herrero 49');
  });

  it('chooses how to get there', async () => {
    const location = TestBed.inject(UserLocation);
    location.origin.set({ lat: 39.98, lng: -0.03, label: 'Casa' });
    const { fixture, el } = await create();

    const mode = el.querySelector('select')!;
    expect(mode.value).toBe('');
    mode.value = 'driving';
    mode.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(location.travelMode()).toBe('driving');
  });
});
