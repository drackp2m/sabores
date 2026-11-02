import { Injectable, computed, effect, signal } from '@angular/core';

import { legacyTheme } from './legacy-storage';
import { systemDark } from './media';

export type Theme = 'light' | 'dark' | 'system';

/** index.html reads the same key before painting, to avoid a flash of the other theme. */
const THEME_KEY = 'tapas-route:theme';

/**
 * The app's theme: light, dark or the system's. It is applied with data-theme on <html> (the colors
 * of each are in styles/_theme.scss) and remembered for the next visit.
 */
@Injectable({ providedIn: 'root' })
export class Themes {
  readonly theme = signal<Theme>(readTheme());
  private readonly systemDark = signal(systemDark().matches);
  /** Whether what's showing is dark: for what the styles can't reach, like the map's own colors. */
  readonly dark = computed(() => {
    const theme = this.theme();
    return theme === 'system' ? this.systemDark() : theme === 'dark';
  });

  constructor() {
    systemDark().addEventListener('change', ({ matches }) => this.systemDark.set(matches));

    effect(() => {
      const theme = this.theme();
      const root = document.documentElement;
      if (theme === 'system') delete root.dataset['theme'];
      else root.dataset['theme'] = theme;
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        // No storage (private mode…): it just lasts for this visit.
      }
    });
  }
}

function readTheme(): Theme {
  try {
    const theme = localStorage.getItem(THEME_KEY) ?? legacyTheme();
    return theme === 'light' || theme === 'dark' ? theme : 'system';
  } catch {
    return 'system';
  }
}
