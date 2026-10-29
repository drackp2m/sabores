import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';

import { Almacen } from './almacen';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(),
    // Valoraciones, favoritos y filtros guardados, antes de mostrar nada.
    provideAppInitializer(() => inject(Almacen).cargar()),
  ],
};
