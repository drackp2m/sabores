import { Component, effect, inject, input, output, signal } from '@angular/core';

import { Icon, IconName } from '../icon/icon';
import { Theme, Themes } from '../theme';
import { Viewer } from '../viewer/viewer';

/** The list's two views: with all the details, or only the name and the tapas' photos. */
export type View = 'details' | 'photos';

const THEMES: readonly { theme: Theme; name: string; icon: IconName }[] = [
  { theme: 'light', name: 'Claro', icon: 'sun' },
  { theme: 'dark', name: 'Oscuro', icon: 'moon' },
  { theme: 'system', name: 'Sistema', icon: 'system' },
];

/**
 * The page's header, always in sight: the name, and the menu with the view and the theme. The view is
 * App's, which changes it (on a phone, as a transition: view-switch.ts); the theme, the menu's own.
 */
@Component({
  selector: 'app-header',
  imports: [Icon],
  host: {
    role: 'banner',
    '(document:keydown.escape)': 'menuOpen.set(false)',
  },
  template: `
    <div class="content">
      <h1>Sabores <span class="edition">17ª edición</span></h1>
      <button
        type="button"
        class="menu-button"
        aria-controls="menu"
        [attr.aria-label]="menuOpen() ? 'Cerrar el menú' : 'Abrir el menú'"
        [attr.aria-expanded]="menuOpen()"
        (click)="toggleMenu()"
      >
        <!-- Its own, not an <app-icon>: its strokes turn one by one into the cross (see below). -->
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16" />
          <path d="M4 12h16" />
          <path d="M4 18h16" />
        </svg>
      </button>

      <div class="menu-slot">
        @if (menuOpen()) {
          <nav
            id="menu"
            class="menu"
            aria-label="Menú"
            animate.enter="entering"
            animate.leave="leaving"
          >
            <div class="group">
              <span id="view-label">Vista</span>
              <div class="segments" role="group" aria-labelledby="view-label">
                <button
                  type="button"
                  title="Lista con todos los detalles"
                  [class.active]="view() === 'details'"
                  [attr.aria-pressed]="view() === 'details'"
                  (click)="chooseView('details')"
                >
                  <app-icon name="list" />Detalles
                </button>
                <button
                  type="button"
                  title="Solo el nombre y las fotos de las tapas"
                  [class.active]="view() === 'photos'"
                  [attr.aria-pressed]="view() === 'photos'"
                  (click)="chooseView('photos')"
                >
                  <app-icon name="photos" />Fotos
                </button>
              </div>
            </div>

            <div class="group">
              <span id="theme-label">Tema</span>
              <div class="segments" role="group" aria-labelledby="theme-label">
                @for (option of themes; track option.theme) {
                  <button
                    type="button"
                    [class.active]="theme.theme() === option.theme"
                    [attr.aria-pressed]="theme.theme() === option.theme"
                    (click)="theme.theme.set(option.theme)"
                  >
                    <app-icon [name]="option.icon" />{{ option.name }}
                  </button>
                }
              </div>
            </div>
          </nav>
        }
      </div>
    </div>
  `,
  styles: `
    @use 'sass:math';
    @use 'media';

    // Sticky, above what scrolls. The border, in the background color, sets it apart from what passes
    // beneath in its same color (buttons, venue numbers).
    :host {
      position: sticky;
      top: 0;
      z-index: 1100; // Above the map's buttons (1000) and the floating ones (app.scss).
      display: block;
      border-bottom: 1px solid var(--background);
      background: var(--brand);
      color: #fff;
      padding: env(safe-area-inset-top, 0px) var(--gutter-right) 0 var(--gutter-left);

      // Out of what scrolls, in the place left for it above (app.scss).
      @include media.touch {
        position: fixed;
        inset-inline: 0;
      }
    }

    // As wide as the page's content.
    .content {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      max-width: 1280px;
      height: var(--header-height);
      margin-inline: auto;
    }

    h1 {
      display: flex;
      flex: 1;
      align-items: baseline;
      gap: 0.5rem;
      min-width: 0;
      font-size: 1.3rem;
      white-space: nowrap;
    }

    // Next to the name, smaller and softer.
    .edition {
      position: relative;
      bottom: 0.02rem;
      overflow: hidden;
      font-size: 1rem;
      font-weight: 500;
      opacity: 0.85;
      text-overflow: ellipsis;
    }

    .menu-button {
      width: 2.5rem;
      color: #fff;
      margin-right: -0.5rem; // The icon, aligned with the edge like the rest of the content.
      padding: 0;
      border-color: transparent;
      background: transparent;
      font-size: 1.4rem;

      @media (hover: hover) {
        &:hover:not(:disabled) {
          border-color: transparent;
          background: rgb(255 255 255 / 0.15);
        }
      }

      // The same size and strokes as an <app-icon>.
      svg {
        flex: none;
        width: 1.15em;
        height: 1.15em;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
      }
    }

    // From the center of the cross to its corners, on each axis: the strokes are 16 long.
    $corner: math.div(8px, math.sqrt(2));

    // Its three strokes become the cross as the menu opens, while the whole icon turns half a turn.
    // The first one lowers its right end to the bottom right corner, turning on the left one, and the
    // third one raises its left end to the top left corner, turning on the right one: they meet on the
    // same diagonal, with the ends they turn on moving a little to its corners. The middle one turns
    // 45° back within the icon (forward, it would end up parallel to the other two): 135° on screen,
    // so all of them turn clockwise there. Calmer than the menu, with half a turn to give (at its
    // pace, it was abrupt), and on closing, in reverse, the curve too.
    .menu-button {
      --turn: 0.3s ease-in;

      svg,
      path {
        transition:
          rotate var(--turn),
          translate var(--turn);
      }

      // The point each stroke turns on (x y in the viewBox), which goes along with it.
      path:nth-child(1) {
        transform-origin: 4px 6px;
      }

      path:nth-child(2) {
        transform-origin: 12px 12px;
      }

      path:nth-child(3) {
        transform-origin: 20px 18px;
      }

      &[aria-expanded='true'] {
        --turn: 0.4s ease-out;

        svg {
          rotate: 180deg;
        }

        path:nth-child(1) {
          translate: (12px - $corner - 4px) (12px - $corner - 6px);
          rotate: 45deg;
        }

        path:nth-child(2) {
          rotate: -45deg;
        }

        path:nth-child(3) {
          translate: (12px + $corner - 20px) (12px + $corner - 18px);
          rotate: 45deg;
        }
      }
    }

    // Where the menu opens, under the button: what goes above it (the menu on its way up, its shadow)
    // stays behind the header. The cut, below the header's border, doesn't move: animated along with
    // the menu, Safari moved them out of step.
    .menu-slot {
      position: absolute;
      top: 100%;
      right: 0;
      clip-path: inset(1px -100vw -100vh);
    }

    // Dropdown, in the page's colors. It comes down from behind the header and goes back up behind it,
    // fading (menu-drop, in styles/_view-switch.scss: on a phone, choosing a view also takes it away
    // that way).
    .menu {
      display: grid;
      grid-template-columns: minmax(0, 1fr); // Within the maximum width, even if it's a tight fit.
      gap: 0.9rem;
      width: max-content;
      max-width: calc(100vw - var(--gutter-left) - var(--gutter-right));
      margin-top: 0.25rem;
      padding: 0.9rem;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--text);
      box-shadow: var(--shadow-raised);

      &.entering {
        animation: menu-drop 0.25s ease-out;
      }

      // Reversed, the curve too: it speeds up on its way in.
      &.leaving {
        animation: menu-drop 0.2s ease-out reverse;
      }
    }

    .group {
      display: grid;
      gap: 0.3rem;

      > span {
        font-size: 0.8rem;
        color: var(--muted);
      }

      // On narrow phones (or with large text), the buttons share the menu's width instead of sticking
      // out of it.
      .segments button {
        flex: 1 1 auto;
        gap: 0.3rem;
        min-width: 0;
        padding-inline: 0.5rem;
      }
    }

    // While the venue's map goes full screen or back (map.ts), it goes up with the map's top edge, and
    // what it says goes away in the first quarter of the way and comes back in the last one. Without
    // the map on its way, the variables don't exist and nothing moves.
    :host {
      translate: 0 calc(var(--map-large) * var(--map-rise));
    }

    .content {
      opacity: max(0, 1 - 4 * var(--map-large));
    }

    @include media.reduced-motion {
      .menu {
        animation: none !important;
      }

      .menu-button svg,
      .menu-button path {
        transition: none;
      }
    }
  `,
})
export class Header {
  protected readonly theme = inject(Themes);
  private readonly viewer = inject(Viewer);
  protected readonly themes = THEMES;

  /** The list's view, App's. */
  readonly view = input.required<View>();
  /** One chosen in the menu, which closes. */
  readonly viewSelect = output<View>();

  protected readonly menuOpen = signal(false);

  constructor() {
    // Clicking outside the menu closes it; it only listens while open: otherwise, every click
    // anywhere on the page would check the view again.
    effect((onCleanup) => {
      if (!this.menuOpen()) return;
      const onClick = (event: MouseEvent) => this.closeMenuOutside(event);
      document.addEventListener('click', onClick);
      onCleanup(() => document.removeEventListener('click', onClick));
    });
  }

  /** Opening the menu closes any enlarged photo (the header stays above it). */
  protected toggleMenu(): void {
    const open = !this.menuOpen();
    this.menuOpen.set(open);
    if (open) this.viewer.close();
  }

  /**
   * Closed first: on a phone, the new view arrives as a transition in which the menu goes back up
   * (view-switch.ts).
   */
  protected chooseView(view: View): void {
    this.menuOpen.set(false);
    this.viewSelect.emit(view);
  }

  /** The menu button already opens and closes it on its own. */
  private closeMenuOutside(event: MouseEvent): void {
    const target = event.target as Element | null;
    if (target?.closest('.menu, .menu-button')) return;
    this.menuOpen.set(false);
  }
}
