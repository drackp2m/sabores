import { MarkerPin } from './pin';

/** The map button's icon, with its top as two quarters of a circle, and the circle in its head. */
const PIN =
  'M12 21.5C12 21.5 5.25 15.65 5.25 10.25C5.25 6.522 8.272 3.5 12 3.5' +
  'C15.728 3.5 18.75 6.522 18.75 10.25C18.75 15.65 12 21.5 12 21.5Z' +
  'M12 7.75a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0 -5Z';

describe('MarkerPin', () => {
  /** A 10 px dot with a 2 px edge, and a 26 px pin: 24 units in 26 px. */
  const create = () => new MarkerPin(10, 2, 26);
  const outline = (pin: MarkerPin) => pin.element.querySelector('path')!.getAttribute('d');
  const hole = (pin: MarkerPin) =>
    ['--hole-y', '--hole-r'].map((name) => pin.element.style.getPropertyValue(name));

  it('starts as the dot round the point, stroked in the middle of its edge, without the circle', () => {
    const pin = create();
    // A radius of 6 px, (10 + 2) / 2: 5.538 units, down from the tip at 21.5.
    expect(outline(pin)).toMatch(/^M12 27\.038C/);
    expect(outline(pin)!.match(/M/g)!.length).toBe(1);
    expect(hole(pin)).toEqual(['21.5', '0']);
  });

  it('grows into the pin, with the circle open in its head', async () => {
    const pin = create();
    pin.grow();
    expect(outline(pin)).not.toBe(PIN);
    await vi.waitFor(() => expect(outline(pin)).toBe(PIN));
    expect(hole(pin)).toEqual(['10.25', '2.5']);
  });

  it('not animated, it’s the pin at once', () => {
    const pin = create();
    pin.grow(false);
    expect(outline(pin)).toBe(PIN);
  });

  it('shrinks back into a dot of the size asked for, and then it’s done', async () => {
    const pin = create();
    pin.grow(false);
    const done = vi.fn();
    pin.shrink(12, done);
    expect(done).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(done).toHaveBeenCalledOnce());
    // (12 + 2) / 2 = 7 px: 6.462 units.
    expect(outline(pin)).toMatch(/^M12 27\.962C/);
    expect(hole(pin)).toEqual(['21.5', '0']);
  });

  it('turned back on its way, it grows again from where it is, and isn’t done', async () => {
    const pin = create();
    pin.grow(false);
    const done = vi.fn();
    pin.shrink(10, done);
    await new Promise((r) => requestAnimationFrame(r));
    const between = outline(pin);
    expect(between).not.toBe(PIN);

    pin.grow();
    expect(outline(pin)).toBe(between);
    await vi.waitFor(() => expect(outline(pin)).toBe(PIN));
    await new Promise((r) => setTimeout(r, 350));
    expect(done).not.toHaveBeenCalled();
  });

  it('with reduced motion, it changes at once', () => {
    const media = vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const pin = create();
    pin.grow();
    expect(outline(pin)).toBe(PIN);
    const done = vi.fn();
    pin.shrink(10, done);
    expect(done).toHaveBeenCalledOnce();
    media.mockRestore();
  });
});
