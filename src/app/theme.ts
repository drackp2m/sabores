import { Injectable, effect, signal } from '@angular/core';

import { legacyTheme } from './legacy-storage';

export type Theme = 'light' | 'dark' | 'system';

/** index.html reads the same key before painting, to avoid a flash of the other theme. */
const THEME_KEY = 'tapas-route:theme';

/**
 * The app's theme: light, dark or the system's. It is applied with data-theme on <html> (the colors
 * of each are in styles.scss) and remembered for the next visit.
 */
@Injectable({ providedIn: 'root' })
export class Themes {
  readonly theme = signal<Theme>(readTheme());

  constructor() {
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
