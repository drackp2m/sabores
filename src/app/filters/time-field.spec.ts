import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, disabled, form } from '@angular/forms/signals';

import { TimeField } from './time-field';

@Component({
  imports: [FormField, TimeField],
  template: `<app-time-field label="Hasta" [placeholder]="placeholder()" [formField]="field" />`,
})
class Host {
  readonly time = signal('');
  readonly off = signal(false);
  readonly placeholder = signal('');
  readonly field = form(this.time, (time) => disabled(time, () => this.off()));
}

describe('TimeField', () => {
  async function create() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('input')!;
    return {
      fixture,
      host: fixture.componentInstance,
      el,
      input,
      type: async (value: string) => {
        input.value = value;
        input.dispatchEvent(new Event('input'));
        await fixture.whenStable();
      },
    };
  }

  /** What a half-typed time looks like: the browser gives no value, and setting it wipes the text. */
  function halfTyped(input: HTMLInputElement) {
    const wipe = vi.fn();
    Object.defineProperty(input, 'value', { configurable: true, get: () => '', set: wipe });
    return wipe;
  }

  it('keeps the field and the form in sync', async () => {
    const { fixture, host, input, type } = await create();
    expect(input.getAttribute('aria-label')).toBe('Hasta');

    await type('20:30');
    expect(host.time()).toBe('20:30');

    host.time.set('21:00');
    await fixture.whenStable();
    expect(input.value).toBe('21:00');
  });

  it('follows the form when disabled', async () => {
    const { fixture, host, input } = await create();
    expect(input.disabled).toBe(false);

    host.off.set(true);
    await fixture.whenStable();
    expect(input.disabled).toBe(true);
  });

  it('shows the placeholder only while it has no time, hiding the empty field', async () => {
    const { fixture, host, el, input, type } = await create();
    expect(el.querySelector('span')).toBeNull();

    host.placeholder.set('00:00');
    await fixture.whenStable();
    expect(el.querySelector('span')!.textContent).toBe('00:00');
    expect(input.classList).toContain('implied');

    await type('20:30');
    expect(el.querySelector('span')).toBeNull();
    expect(input.classList).not.toContain('implied');
  });

  it('counts a half-typed time as empty, without wiping what has been typed', async () => {
    const { fixture, host, input } = await create();
    host.time.set('20:30');
    await fixture.whenStable();

    const wipe = halfTyped(input);
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(host.time()).toBe('');
    expect(wipe).not.toHaveBeenCalled();
  });

  it('drops a half-typed time when disabled', async () => {
    const { fixture, host, input } = await create();
    const wipe = halfTyped(input);
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(wipe).not.toHaveBeenCalled();

    host.off.set(true);
    await fixture.whenStable();
    expect(wipe).toHaveBeenCalledExactlyOnceWith('');
  });
});
