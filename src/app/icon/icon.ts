import { Component, input } from '@angular/core';

/**
 * Strokes of each icon in a 24×24 viewBox, with a line of 2 (or --icon-stroke) and rounded ends. No
 * fill, unless --icon-fill provides one (the rated star, the favorites' heart).
 */
const ICONS = {
  pin: [
    'M12 21.5s-6.75-5.85-6.75-11.25a6.75 6.75 0 0 1 13.5 0c0 5.4-6.75 11.25-6.75 11.25z',
    'M12 7.75a2.5 2.5 0 1 1 0 5a2.5 2.5 0 1 1 0-5z',
  ],
  phone: [
    'M6.5 3h2.75l1.5 4.25-2.1 1.5a11.5 11.5 0 0 0 6.6 6.6l1.5-2.1 4.25 1.5v2.75a2 2 0 0 1-2 2C10.6 19.5 4.5 13.4 4.5 5a2 2 0 0 1 2-2z',
  ],
  instagram: [
    'M7.75 3h8.5A4.75 4.75 0 0 1 21 7.75v8.5A4.75 4.75 0 0 1 16.25 21h-8.5A4.75 4.75 0 0 1 3 16.25v-8.5A4.75 4.75 0 0 1 7.75 3z',
    'M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8z',
    'M17.25 6.75h.01',
  ],
  walking: [
    'M13.5 2.5a1.75 1.75 0 1 1 0 3.5a1.75 1.75 0 1 1 0-3.5z',
    'M12.5 8.25l1 6.25',
    'M13.5 14.5L10.75 21',
    'M13.5 14.5l2.5 2.75V21',
    'M8.25 12.75l1.75-3.5 2.5-1 3 3 2.5 1',
  ],
  driving: ['M4 17v-4.5L6.25 7h11.5L20 12.5V17z', 'M4 12.5h16', 'M7 17v2.5', 'M17 17v2.5'],
  back: ['M19 12H5', 'M11 18l-6-6 6-6'],
  list: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4.5 6h.01', 'M4.5 12h.01', 'M4.5 18h.01'],
  photos: [
    'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
    'M8.5 7.5a1.5 1.5 0 1 1 0 3a1.5 1.5 0 1 1 0-3z',
    'M21 15l-5-5L5 20',
  ],
  location: [
    'M12 5a7 7 0 1 1 0 14a7 7 0 1 1 0-14z',
    'M12 2v3',
    'M12 19v3',
    'M2 12h3',
    'M19 12h3',
    'M12 11.5v1',
  ],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  north: ['M12 3.5l6 17-6-4-6 4z'],
  up: ['M12 19V5', 'M5 12l7-7 7 7'],
  down: ['M12 5v14', 'M19 12l-7 7-7-7'],
  sun: [
    'M12 8a4 4 0 1 1 0 8a4 4 0 1 1 0-8z',
    'M12 2v2',
    'M12 20v2',
    'M4.93 4.93l1.41 1.41',
    'M17.66 17.66l1.41 1.41',
    'M2 12h2',
    'M20 12h2',
    'M4.93 19.07l1.41-1.41',
    'M17.66 6.34l1.41-1.41',
  ],
  moon: ['M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z'],
  system: [
    'M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
    'M8 20h8',
    'M12 16v4',
  ],
  expand: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
  collapse: ['M4 14h6v6', 'M20 10h-6V4', 'M14 10l7-7', 'M3 21l7-7'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  star: [
    'M12 2.9L14.44 9.54L21.51 9.81L15.95 14.18L17.88 20.99L12 17.05L6.12 20.99L8.05 14.18L2.49 9.81L9.56 9.54z',
  ],
  heart: [
    'M12 20.25C7.2 16.9 3 13.3 3 9.1C3 6.3 5.1 4.25 7.75 4.25c1.8 0 3.3.95 4.25 2.5c.95-1.55 2.45-2.5 4.25-2.5C18.9 4.25 21 6.3 21 9.1c0 4.2-4.2 7.8-9 11.15z',
  ],
  // A diagonal ear of wheat, crossed out perpendicularly.
  glutenFree: [
    'M3 21L17 7',
    'M6 18C4.8 17 4.8 15 6 13.8C7.2 15 7.2 17 6 18z',
    'M6 18C7 16.8 9 16.8 10.2 18C9 19.2 7 19.2 6 18z',
    'M9 15C7.8 14 7.8 12 9 10.8C10.2 12 10.2 14 9 15z',
    'M9 15C10 13.8 12 13.8 13.2 15C12 16.2 10 16.2 9 15z',
    'M14.5 9.5C13.3 8.5 13.3 6.5 14.5 5.3C15.7 6.5 15.7 8.5 14.5 9.5z',
    'M14.5 9.5C15.5 8.3 17.5 8.3 18.7 9.5C17.5 10.7 15.5 10.7 14.5 9.5z',
    'M17 7C17.3 5.6 18.6 4.2 20.3 3.7C19.8 5.4 18.4 6.7 17 7z',
    'M3.5 3.5l17 17',
  ],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof ICONS;

/** The star's stroke, to draw several in a single <svg> (tapa-photo.ts). */
export const STAR_PATH = ICONS.star[0];

const SVG = 'http://www.w3.org/2000/svg';

/** Those of each icon's <svg>, as in Icon's template: the strokes of its <symbol> inherit them. */
const ATTRIBUTES = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': 'true',
};

let sprite: SVGSVGElement | undefined;

/**
 * The strokes of all the icons, just once on the page (one <symbol> per icon): each icon is a <use>
 * pointing at its own.
 */
function addSprite(): void {
  if (sprite?.isConnected) return;
  if (!sprite) {
    sprite = document.createElementNS(SVG, 'svg');
    sprite.setAttribute('aria-hidden', 'true');
    sprite.style.cssText = 'position: absolute; width: 0; height: 0; overflow: hidden';
    for (const [name, strokes] of Object.entries(ICONS)) {
      const symbol = document.createElementNS(SVG, 'symbol');
      symbol.id = `icon-${name}`;
      for (const d of strokes) {
        const stroke = document.createElementNS(SVG, 'path');
        stroke.setAttribute('d', d);
        symbol.append(stroke);
      }
      sprite.append(symbol);
    }
  }
  document.body.prepend(sprite);
}

@Component({
  selector: 'app-icon',
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <use [attr.href]="'#icon-' + name()" />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: 1.15em;
      height: 1.15em;
    }

    svg {
      width: 100%;
      height: 100%;
      fill: var(--icon-fill, none);
      stroke-width: var(--icon-stroke, 2);
    }
  `,
})
export class Icon {
  readonly name = input.required<IconName>();

  constructor() {
    addSprite();
  }
}

/** The same icon as a loose element, for DOM created outside Angular (the map's popups). */
export function createIcon(name: IconName): SVGSVGElement {
  addSprite();
  const svg = document.createElementNS(SVG, 'svg');
  for (const [attribute, value] of Object.entries(ATTRIBUTES)) svg.setAttribute(attribute, value);
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', `#icon-${name}`);
  svg.append(use);
  return svg;
}
