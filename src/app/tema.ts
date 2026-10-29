import { Injectable, effect, signal } from '@angular/core';

export type Tema = 'claro' | 'oscuro' | 'sistema';

/** La misma clave la lee index.html antes de pintar, para no ver un destello del otro tema. */
const CLAVE_TEMA = 'ruta-tapas:tema';

/**
 * Tema de la aplicación: claro, oscuro o el del sistema. Se aplica con data-tema en <html> (los
 * colores de cada uno están en styles.scss) y se recuerda para la próxima visita.
 */
@Injectable({ providedIn: 'root' })
export class Temas {
  readonly tema = signal<Tema>(leerTema());

  constructor() {
    effect(() => {
      const tema = this.tema();
      const raiz = document.documentElement;
      if (tema === 'sistema') delete raiz.dataset['tema'];
      else raiz.dataset['tema'] = tema;
      try {
        localStorage.setItem(CLAVE_TEMA, tema);
      } catch {
        // Sin almacenamiento (modo privado…): se queda solo para esta visita.
      }
    });
  }
}

function leerTema(): Tema {
  try {
    const tema = localStorage.getItem(CLAVE_TEMA);
    return tema === 'claro' || tema === 'oscuro' ? tema : 'sistema';
  } catch {
    return 'sistema';
  }
}
