/** Fast at first and slowing down on arrival. */
export const SETTLE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
/**
 * A gentle start and slowing down on arrival: for what grows, whose first frames have to be seen.
 * With SETTLE it would already be halfway there by the third frame.
 */
export const GLIDE = 'cubic-bezier(0.4, 0, 0.1, 1)';

/** The average pace of the effect: what each line adds to it, so it looks the same whatever the content. */
const LINE_TIME = 70;
/** What a line takes to appear or to disappear, at the average pace. */
const LINE_FADE = 160;
/** From 0, a steady pace, to almost 1: how much slower it goes at the ends and faster halfway. */
const ACCELERATION = 0.6;
/** Points of the height's curve. */
const HEIGHT_STEPS = 32;

/**
 * Turns a moment at a steady pace into the real one, accelerating while the height grows. It never
 * stops at the ends, unlike a cubic-bezier: with the height slowing down that much, the last line would
 * come much later than the rest. As it never goes backwards, neither do the lines overtake each other.
 */
function accelerated(time: number, growing: number): number {
  if (time >= growing) return time;
  const wave = (ACCELERATION * growing) / (2 * Math.PI);
  return time + wave * Math.sin((2 * Math.PI * time) / growing);
}

/** The lines that don't fit in the element's height, with where they end. */
function linesBelow(element: HTMLElement, height: number, lines: readonly Element[]) {
  const { top } = element.getBoundingClientRect();
  return lines
    .map((line) => ({ line, bottom: line.getBoundingClientRect().bottom - top }))
    .filter(({ bottom }) => bottom > height + 1);
}

/**
 * The effect is laid out at a steady pace and everything goes through `accelerated`: the height, and
 * the start and end of each line, which adapt to the acceleration. Each line starts appearing just as
 * the edge has gone past it, so it never cuts one that can be seen. Backwards, each line has just
 * disappeared when the edge gets to it.
 *
 * All the animations run from start to end, with what each one waits for in its keyframes and not in
 * delays: without a change of phase halfway through there's nothing to go wrong when turning back,
 * and with an end delay the browser wouldn't take the opacity off the main thread.
 */
function timeline(
  element: HTMLElement,
  from: number,
  to: number,
  direction: PlaybackDirection,
  allLines: readonly Element[],
): Animation[] {
  const lines = linesBelow(element, from, allLines);
  const growing = lines.length * LINE_TIME;
  const total = growing + LINE_FADE;
  const offset = (time: number) => Math.min(1, accelerated(time, growing) / total);
  const timing: KeyframeAnimationOptions = { duration: total, direction, fill: 'both' };

  const heights = Array.from({ length: HEIGHT_STEPS + 1 }, (_, step) => {
    const way = step / HEIGHT_STEPS;
    return { height: `${from + way * (to - from)}px`, offset: offset(way * growing) };
  });
  const animations = [element.animate([...heights, { height: `${to}px`, offset: 1 }], timing)];
  for (const { line, bottom } of lines) {
    const start = (growing * (bottom - from)) / (to - from);
    const fade: Keyframe[] = [
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: offset(start), easing: 'ease-in-out' },
      { opacity: 1, offset: offset(start + LINE_FADE) },
      { opacity: 1, offset: 1 },
    ];
    animations.push(line.animate(fade, timing));
  }
  return animations;
}

/**
 * Opens an element by lines (its children, or those given, even deeper down) and closes it with the
 * same effect played backwards.
 */
export class Unfolding {
  private animations: Animation[] = [];

  /** If it's halfway through, it goes back the way it came. Returns whether it was. */
  turnBack(): boolean {
    for (const animation of this.animations) animation.reverse();
    return this.animations.length > 0;
  }

  /** `done` leaves the element as it has to stay: until then, the last frame holds. */
  play(
    element: HTMLElement,
    from: number,
    to: number,
    open: boolean,
    done: () => void,
    lines: readonly Element[] = [...element.children],
  ): void {
    const animations = timeline(element, from, to, open ? 'normal' : 'reverse', lines);
    animations[0].onfinish = () => {
      done();
      for (const animation of animations) animation.cancel();
      this.animations = [];
    };
    this.animations = animations;
  }
}
