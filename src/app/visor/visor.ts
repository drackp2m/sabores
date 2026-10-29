import {
  Component,
  ElementRef,
  Injectable,
  afterRenderEffect,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { Icono } from '../icono/icono';

export interface FotoAmpliada {
  src: string;
  alt: string;
  /** Miniatura desde la que se amplía y a la que vuelve (y el foco, al cerrar). */
  origen: HTMLElement;
}

/** Foto que se está viendo en grande. */
@Injectable({ providedIn: 'root' })
export class Visor {
  readonly foto = signal<FotoAmpliada | null>(null);
}

const DURACION = 380;
/** Radio de las esquinas de la foto grande. */
const RADIO = 12;

/**
 * Foto ampliada: crece desde su miniatura hasta el centro mientras aparece el fondo, desenfocado y
 * sin color, y al cerrar (X, Escape o pinchando fuera) hace el mismo recorrido al revés.
 */
@Component({
  selector: 'app-visor-fotos',
  imports: [Icono],
  template: `
    @if (visor.foto(); as foto) {
      <!-- Sin scroll de la página mientras se ve la foto. -->
      <div
        class="visor"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="foto.alt"
        (wheel)="$event.preventDefault()"
        (touchmove)="$event.preventDefault()"
      >
        <div #fondo class="fondo" (click)="cerrar()"></div>
        <img #imagen [src]="foto.src" [alt]="foto.alt" width="690" height="439" />
        <button #boton type="button" class="cerrar" aria-label="Cerrar" (click)="cerrar()">
          <app-icono nombre="cerrar" />
        </button>
      </div>
    }
  `,
  host: { '(document:keydown.escape)': 'cerrar()' },
  styles: `
    .visor {
      position: fixed;
      inset: 0;
      z-index: 1200; // Por encima de la cabecera.
    }

    .fondo {
      position: absolute;
      inset: 0;
      background: rgb(42 33 27 / 0.35);
      backdrop-filter: blur(10px) grayscale(0.5);
      -webkit-backdrop-filter: blur(10px) grayscale(0.5);
      touch-action: none;
      will-change: opacity;
    }

    // Lo más grande posible sin pasar de 1,25 veces el tamaño real de las fotos (690×439).
    img {
      --ancho: min(92vw, 85dvh * 690 / 439, 860px);
      position: absolute;
      inset: 0;
      width: var(--ancho);
      height: calc(var(--ancho) * 439 / 690);
      margin: auto;
      border-radius: ${RADIO}px;
      object-fit: cover;
      box-shadow: var(--sombra-foto); // Más marcada en oscuro (styles.scss).
      transform-origin: 0 0;
      will-change: transform;
    }

    .cerrar {
      position: absolute;
      top: calc(1rem + env(safe-area-inset-top, 0px));
      right: var(--margen-derecho);
      width: 2.75rem;
      height: 2.75rem;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: var(--superficie);
      color: var(--texto);
      font-size: 1.25rem;
      box-shadow: 0 4px 14px rgb(0 0 0 / 0.25);

      &:hover:not(:disabled) {
        border: 0;
        background: var(--acento-suave);
      }
    }
  `,
})
export class VisorFotos {
  protected readonly visor = inject(Visor);

  private readonly fondo = viewChild<ElementRef<HTMLElement>>('fondo');
  private readonly imagen = viewChild<ElementRef<HTMLElement>>('imagen');
  private readonly boton = viewChild<ElementRef<HTMLElement>>('boton');
  private cerrando = false;

  constructor() {
    // En cuanto la foto grande está en la página (antes de pintarla), arranca la ampliación.
    afterRenderEffect(() => {
      const imagen = this.imagen();
      const foto = this.visor.foto();
      if (!imagen || !foto) return;
      foto.origen.style.visibility = 'hidden';
      this.boton()!.nativeElement.focus({ preventScroll: true });
      this.animar(foto, true);
    });
  }

  protected async cerrar(): Promise<void> {
    const foto = this.visor.foto();
    if (!foto || this.cerrando) return;
    this.cerrando = true;
    await this.animar(foto, false);
    foto.origen.style.visibility = '';
    foto.origen.focus({ preventScroll: true });
    this.visor.foto.set(null);
    this.cerrando = false;
  }

  /**
   * De la miniatura a la foto grande (abrir) o al revés. Se invierten los fotogramas y no la
   * animación (direction: 'reverse'), que también invertiría la curva: así siempre arranca rápido y
   * frena al llegar.
   */
  private animar(foto: FotoAmpliada, abrir: boolean): Promise<unknown> {
    const imagen = this.imagen()!.nativeElement;
    const desde = foto.origen.getBoundingClientRect();
    const hasta = imagen.getBoundingClientRect();
    const escalaX = desde.width / hasta.width;
    const escalaY = desde.height / hasta.height;
    // El radio también se escala: se compensa para que en pantalla sea el de la miniatura (y no
    // cambie de golpe al llegar), en cada eje por separado porque la escala no es la misma.
    const radio = parseFloat(getComputedStyle(foto.origen).borderTopLeftRadius) || 0;
    // La del tema en uso, ya resuelta (las animaciones no siempre resuelven variables CSS).
    const sombra = getComputedStyle(imagen).boxShadow;
    const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const opciones: KeyframeAnimationOptions = {
      duration: reducido ? 0 : DURACION,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      fill: 'both',
    };
    const sentido = (fotogramas: Keyframe[]) => (abrir ? fotogramas : fotogramas.reverse());
    return Promise.all(
      [
        imagen.animate(
          sentido([
            {
              transform: `translate(${desde.left - hasta.left}px, ${desde.top - hasta.top}px)
                scale(${escalaX}, ${escalaY})`,
              borderRadius: `${radio / escalaX}px / ${radio / escalaY}px`,
              // La sombra aparece al despegar y se va al volver, sin desaparecer de golpe al final.
              boxShadow: 'none',
            },
            { transform: 'none', boxShadow: sombra, borderRadius: `${RADIO}px` },
          ]),
          opciones,
        ),
        // Solo opacidad: animar el desenfoque en sí va a saltos en el móvil.
        this.fondo()!.nativeElement.animate(sentido([{ opacity: 0 }, {}]), opciones),
        this.boton()!.nativeElement.animate(sentido([{ opacity: 0 }, {}]), opciones),
      ].map((animacion) => animacion.finished),
    );
  }
}
