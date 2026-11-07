import { reducedMotion } from '../media';

const SVG = 'http://www.w3.org/2000/svg';

/** In the 24 units of the icon: its tip, on the point, where the dot is centered. */
const TIP_X = 12;
const TIP_Y = 21.5;
/**
 * The map button's icon (pin, in icon.ts) as four curves from its tip, round to the left: each one,
 * its two handles and its end. Its top is the arc of the icon, as two quarters of a circle.
 */
const PIN = [
  [12, 21.5],
  [12, 21.5, 5.25, 15.65, 5.25, 10.25],
  [5.25, 6.522, 8.272, 3.5, 12, 3.5],
  [15.728, 3.5, 18.75, 6.522, 18.75, 10.25],
  [18.75, 15.65, 12, 21.5, 12, 21.5],
].flat();
/** The circle in its head, see-through. */
const HOLE_Y = 10.25;
const HOLE_RADIUS = 2.5;
/** For a quarter of a circle as a curve: how far its handles go, by its radius. */
const KAPPA = 0.5523;

/** In ms: out of the dot, with a little bounce at the end; back into it, smoothly. */
const GROW_TIME = 450;
const SHRINK_TIME = 300;

/** A dot of that radius around the tip, as the same four curves as the pin, from its bottom. */
function dot(radius: number): number[] {
  const k = KAPPA * radius;
  const [x, y] = [TIP_X, TIP_Y];
  return [
    [x, y + radius],
    [x - k, y + radius, x - radius, y + k, x - radius, y],
    [x - radius, y - k, x - k, y - radius, x, y - radius],
    [x + k, y - radius, x + radius, y - k, x + radius, y],
    [x + radius, y + k, x + k, y + radius, x, y + radius],
  ].flat();
}

function easeOutBack(t: number): number {
  const s = 1.3;
  return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}

function round(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * The pin of the venue the route goes to, in its marker (styles/_map.scss). It grows out of the
 * venue's dot and shrinks back into it: its outline goes from one shape to the other, and the circle
 * in its head opens in the middle of the dot and goes up to its place. Its color follows with a
 * transition (the styles). Turned back on its way, it goes back from where it is.
 */
export class MarkerPin {
  readonly element = document.createElementNS(SVG, 'svg');
  private readonly outline = document.createElementNS(SVG, 'path');
  /** From the dot (0) to the pin (1): beyond it, on the bounce. */
  private progress = 0;
  /** Where it's going: the pin, or back into the dot. */
  private target = 0;
  /** The dot's radius, in the icon's units: to the middle of its white edge, where it's stroked. */
  private radius: number;
  private frame = 0;
  private done?: () => void;

  /**
   * With the dot of the marker: its fill's diameter and its white edge, in px, and the pin's size
   * (its 24 units), also in px.
   */
  constructor(
    dot: number,
    private readonly edge: number,
    private readonly size: number,
  ) {
    this.radius = this.units(dot);
    this.element.setAttribute('viewBox', '0 0 24 24');
    this.element.setAttribute('aria-hidden', 'true');
    this.element.append(this.outline);
    this.draw();
  }

  /** Into the pin, at once if not animated. */
  grow(animate = true): void {
    if (this.target === 1) return;
    this.go(1, animate ? GROW_TIME : 0, easeOutBack);
  }

  /** Back into a dot of that diameter (in px), and then done (it's taken out of the marker). */
  shrink(dot: number, done: () => void): void {
    this.radius = this.units(dot);
    this.done = done;
    if (this.target === 1) this.go(0, SHRINK_TIME, easeInOut);
    else if (this.progress === 0) done();
  }

  /** Its marker went away: it stays as it is. */
  stop(): void {
    cancelAnimationFrame(this.frame);
    this.done = undefined;
  }

  /** A dot's diameter in px, as the radius to stroke it at, in the icon's units. */
  private units(dot: number): number {
    return ((dot + this.edge) / 2) * (24 / this.size);
  }

  private go(target: number, time: number, ease: (t: number) => number): void {
    cancelAnimationFrame(this.frame);
    if (target === 1) this.done = undefined;
    this.target = target;
    const from = this.progress;
    const duration = reducedMotion() ? 0 : time * Math.min(1, Math.abs(target - from));
    const start = performance.now();
    const step = (elapsed: number) => {
      const t = duration ? Math.min(1, elapsed / duration) : 1;
      this.progress = t === 1 ? target : from + (target - from) * ease(t);
      this.draw();
      if (t < 1) this.frame = requestAnimationFrame(() => step(performance.now() - start));
      else this.done?.();
    };
    // At once, from where it is, not from another reading of the clock: turned back near its end,
    // with a fraction of a millisecond left to go, a few µs would already be part of the way.
    step(0);
  }

  /**
   * The outline, between the dot and the pin; inside, the circle (filled evenodd, the map shows
   * through it), from nothing in the middle of the dot to its place. The styles' mask follows it:
   * the shadow doesn't get into it.
   */
  private draw(): void {
    const p = this.progress;
    const from = dot(this.radius);
    const points = from.map((value, i) => round(value + (PIN[i] - value) * p));
    let d = `M${points[0]} ${points[1]}`;
    for (let i = 2; i < points.length; i += 6) d += `C${points.slice(i, i + 6).join(' ')}`;
    d += 'Z';
    const y = TIP_Y + (HOLE_Y - TIP_Y) * p;
    const r = HOLE_RADIUS * Math.max(0, (p - 0.3) / 0.7);
    if (r > 0.05) {
      d += `M${TIP_X} ${round(y - r)}a${round(r)} ${round(r)} 0 1 1 0 ${round(2 * r)}`;
      d += `a${round(r)} ${round(r)} 0 1 1 0 ${round(-2 * r)}Z`;
    }
    this.outline.setAttribute('d', d);
    this.element.style.setProperty('--hole-y', round(y));
    this.element.style.setProperty('--hole-r', round(r));
  }
}
