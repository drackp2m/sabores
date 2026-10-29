import {
  Component,
  ElementRef,
  Injectable,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { Almacen } from '../almacen';
import { Estrellas, FRASES } from '../estrellas/estrellas';
import { Tapa, claveTapa } from '../locales';

export interface FotoAmpliada {
  src: string;
  alt: string;
  /** La tapa, para valorarla: el número de su local y el suyo. */
  local: number;
  tapa: number;
  /** Miniatura (con sus estrellas) desde la que se amplía y a la que vuelve, y el foco al cerrar. */
  origen: HTMLElement;
}

/** Foto que se está viendo en grande. */
@Injectable({ providedIn: 'root' })
export class Visor {
  readonly foto = signal<FotoAmpliada | null>(null);
  /** Cierra la foto; el visor lo sustituye por su cierre con animación. */
  cerrar: () => void = () => this.foto.set(null);

  ampliar(origen: HTMLElement, local: number, tapa: Tapa): void {
    this.foto.set({ src: `data/${tapa.photo}`, alt: tapa.name, local, tapa: tapa.number, origen });
  }
}

const DURACION = 380;
/** Radio de las esquinas de la foto grande. */
const RADIO = 12;

/**
 * Foto ampliada: crece desde su miniatura hasta el centro del espacio bajo la cabecera (que sigue a
 * la vista) mientras aparece el fondo, desenfocado y sin color, y al cerrar (pinchando en cualquier
 * sitio o con Escape) hace el mismo recorrido al revés. Sus estrellas van con ella, en grande, a
 * quedarse debajo para valorarla (también con las teclas del 0 al 5), con lo que dice la valoración.
 */
@Component({
  selector: 'app-visor-fotos',
  imports: [Estrellas],
  template: `
    @if (visor.foto(); as foto) {
      <!-- Sin scroll de la página mientras se ve la foto; pinchar en cualquier sitio (menos en las estrellas) la cierra. -->
      <div
        #dialogo
        class="visor"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        [attr.aria-label]="foto.alt"
        (click)="cerrar()"
        (wheel)="$event.preventDefault()"
        (touchmove)="$event.preventDefault()"
      >
        <div #fondo class="fondo"></div>
        <div class="centro">
          <img #imagen [src]="foto.src" [alt]="foto.alt" width="690" height="439" />
          <app-estrellas
            #estrellas
            editable
            [valor]="valor()"
            [(previa)]="previa"
            (valorar)="valorar(foto, $event)"
            (click)="$event.stopPropagation()"
          />
          <!-- Todas las frases en fila; la que toca, en el centro y con margen para quedarse sola. -->
          <p #frase class="frase" aria-hidden="true">
            <span #cinta class="cinta">
              @for (texto of frases; track $index) {
                <span [class.activa]="$index === mostrada()">{{ texto }}</span>
              }
            </span>
          </p>
        </div>
      </div>
    }
  `,
  host: {
    '(document:keydown.escape)': 'cerrar()',
    '(document:keydown)': 'teclear($event)',
  },
  styles: `
    // Bajo la cabecera (su alto, la zona segura y su borde), que no se tapa; por encima de lo demás,
    // botones flotantes incluidos. Contenedor de tamaño, para medir la foto con lo que queda libre.
    .visor {
      position: fixed;
      inset: calc(var(--alto-cabecera) + env(safe-area-inset-top, 0px) + 1px) 0 0;
      z-index: 1090;
      container-type: size;
      outline: none;
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

    // La foto, con las estrellas y la frase debajo, en el centro de lo que queda libre.
    .centro {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    // Lo más grande posible, con sitio debajo para las estrellas y la frase (6,5rem), sin pasar de
    // 1,25 veces el tamaño real de las fotos (690×439).
    img {
      --ancho: min(92cqw, (88cqh - 6.5rem) * 690 / 439, 860px);
      flex: none;
      width: var(--ancho);
      height: calc(var(--ancho) * 439 / 690);
      border-radius: ${RADIO}px;
      object-fit: cover;
      box-shadow: var(--sombra-foto); // Más marcada en oscuro (styles.scss).
      transform-origin: 0 0;
      will-change: transform;
    }

    // Las de la miniatura, en grande (son del tamaño de la letra).
    app-estrellas {
      margin-top: 1rem;
      font-size: 2.1rem;
      transform-origin: 0 0;
      will-change: transform;
    }

    // Más finas que en las miniaturas: en grande, la línea de siempre se ve gruesa.
    app-estrellas {
      --trazo-icono: 1.1;
    }

    // Una línea a la vista, que se difumina por los lados. --pasos (las frases que pasan) lo pone
    // la cinta: cuantas más pasan, más tarda, para que se lleguen a ver.
    .frase {
      --duracion: calc(0.25s + var(--pasos, 1) * 0.07s);
      --curva: cubic-bezier(0.3, 0.2, 0.2, 1);
      container-type: inline-size;
      width: min(92cqw, 24rem);
      height: 1.5em;
      margin: 0.5rem 0 0;
      overflow: hidden;
      color: #fff;
      font-size: 1.1rem;
      font-weight: 700;
      line-height: 1.5;
      text-shadow: 0 1px 8px rgb(0 0 0 / 0.6);
      mask-image: linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent);
    }

    // Cada frase ocupa lo justo, y la que toca, con medio ancho de margen a cada lado, se queda sola.
    // Al cambiar, su margen se abre mientras el de la anterior se cierra y la cinta se desplaza (en
    // el constructor) para dejarla en el centro: las de en medio pasan por él.
    .cinta {
      display: flex;
      width: max-content;
      transition: transform var(--duracion) var(--curva);

      span {
        flex: none;
        padding-inline: 0.4em;
        white-space: nowrap;
        transition: margin var(--duracion) var(--curva);
      }

      .activa {
        margin-inline: 50cqw;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .cinta,
      .cinta span {
        transition: none;
      }
    }
  `,
})
export class VisorFotos {
  protected readonly visor = inject(Visor);
  protected readonly almacen = inject(Almacen);
  protected readonly claveTapa = claveTapa;
  protected readonly frases = FRASES;
  /** Las estrellas de la foto que se está viendo. */
  protected readonly valor = computed(() => {
    const foto = this.visor.foto();
    return (foto && this.almacen.valoraciones().get(claveTapa(foto.local, foto.tapa))) || 0;
  });
  /** La estrella bajo el ratón, para ver su frase antes de marcarla. */
  protected readonly previa = signal(0);
  protected readonly mostrada = computed(() => this.previa() || this.valor());

  private readonly fondo = viewChild<ElementRef<HTMLElement>>('fondo');
  private readonly imagen = viewChild<ElementRef<HTMLElement>>('imagen');
  private readonly estrellas = viewChild('estrellas', { read: ElementRef<HTMLElement> });
  private readonly frase = viewChild<ElementRef<HTMLElement>>('frase');
  private readonly cinta = viewChild<ElementRef<HTMLElement>>('cinta');
  private readonly dialogo = viewChild<ElementRef<HTMLElement>>('dialogo');
  private cerrando = false;

  constructor() {
    this.visor.cerrar = () => void this.cerrar();

    // En cuanto la foto grande está en la página (antes de pintarla), arranca la ampliación.
    afterRenderEffect(() => {
      const imagen = this.imagen();
      const foto = this.visor.foto();
      if (!imagen || !foto) return;
      foto.origen.style.visibility = 'hidden';
      // El foco, en el diálogo: Escape lo cierra, y al cerrar vuelve a la miniatura.
      this.dialogo()!.nativeElement.focus({ preventScroll: true });
      this.animar(foto, true);
    });

    // La cinta de frases se desplaza lo que miden las de antes de la que toca y la mitad de ella:
    // su margen izquierdo (media línea) la deja en el centro. Al abrir, ya en su sitio.
    let anterior: number | null = null;
    afterRenderEffect(() => {
      const cinta = this.cinta()?.nativeElement;
      const mostrada = this.mostrada();
      if (!cinta) {
        anterior = null;
        return;
      }
      // Antes de medir, que medir aplica los estilos y arrancan las transiciones de los márgenes.
      const pasos = Math.max(1, Math.abs(mostrada - (anterior ?? mostrada)));
      cinta.parentElement!.style.setProperty('--pasos', String(pasos));
      const anchos = [...cinta.children].map((frase) => (frase as HTMLElement).offsetWidth);
      const desplazamiento =
        anchos.slice(0, mostrada).reduce((a, b) => a + b, 0) + anchos[mostrada] / 2;
      if (anterior === null) cinta.style.transition = 'none';
      cinta.style.transform = `translateX(${-desplazamiento}px)`;
      if (anterior === null) {
        void cinta.offsetWidth;
        cinta.style.transition = '';
      }
      anterior = mostrada;
    });
  }

  protected valorar(foto: FotoAmpliada, estrellas: number): void {
    this.almacen.valorar(foto.local, foto.tapa, estrellas);
  }

  /** Con la foto abierta, las teclas del 1 al 5 la valoran y el 0 quita la valoración. */
  protected teclear(evento: KeyboardEvent): void {
    const foto = this.visor.foto();
    if (!foto || this.cerrando || evento.ctrlKey || evento.metaKey || evento.altKey) return;
    if (/^[0-5]$/.test(evento.key)) this.valorar(foto, Number(evento.key));
  }

  protected async cerrar(): Promise<void> {
    const foto = this.visor.foto();
    if (!foto || this.cerrando) return;
    this.cerrando = true;
    await this.animar(foto, false);
    foto.origen.style.visibility = '';
    foto.origen.focus({ preventScroll: true });
    this.visor.foto.set(null);
    this.previa.set(0);
    this.cerrando = false;
  }

  /**
   * De la miniatura a la foto grande (abrir) o al revés. Se invierten los fotogramas y no la
   * animación (direction: 'reverse'), que también invertiría la curva: así siempre arranca rápido y
   * frena al llegar.
   */
  private animar(foto: FotoAmpliada, abrir: boolean): Promise<unknown> {
    const imagen = this.imagen()!.nativeElement;
    const reducido = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // La miniatura ya no está (al valorar la última tapa de un local con el filtro de «Alguna sin
    // probar», p. ej.): sin sitio al que volver, se desvanece.
    if (!foto.origen.isConnected) {
      return this.dialogo()!.nativeElement.animate([{}, { opacity: 0 }], {
        duration: reducido ? 0 : 200,
        fill: 'both',
      }).finished;
    }
    const desde = foto.origen.getBoundingClientRect();
    const hasta = imagen.getBoundingClientRect();
    const escalaX = desde.width / hasta.width;
    const escalaY = desde.height / hasta.height;
    // El radio también se escala: se compensa para que en pantalla sea el de la miniatura (y no
    // cambie de golpe al llegar), en cada eje por separado porque la escala no es la misma.
    const radio = parseFloat(getComputedStyle(foto.origen).borderTopLeftRadius) || 0;
    // La del tema en uso, ya resuelta (las animaciones no siempre resuelven variables CSS).
    const sombra = getComputedStyle(imagen).boxShadow;
    const opciones: KeyframeAnimationOptions = {
      duration: reducido ? 0 : DURACION,
      easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      fill: 'both',
    };
    const sentido = (fotogramas: Keyframe[]) => (abrir ? fotogramas : fotogramas.reverse());
    const animaciones = [
      imagen.animate(
        sentido([
          {
            transform: sobre(desde, hasta),
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
      // La frase aparece cuando las estrellas casi han llegado, y al cerrar se va enseguida.
      this.frase()!.nativeElement.animate([{ opacity: 0, transform: 'translateY(-0.5rem)' }, {}], {
        duration: reducido ? 0 : abrir ? 260 : 120,
        delay: abrir && !reducido ? DURACION * 0.55 : 0,
        easing: abrir ? 'ease-out' : 'ease-in',
        direction: abrir ? 'normal' : 'reverse',
        fill: 'both',
      }),
    ];
    const estrellas = this.estrellas()!.nativeElement;
    const estrellasOrigen = foto.origen.querySelector('app-estrellas');
    if (estrellasOrigen) {
      const desdeEstrellas = estrellasOrigen.getBoundingClientRect();
      animaciones.push(
        estrellas.animate(
          sentido([
            { transform: sobre(desdeEstrellas, estrellas.getBoundingClientRect()) },
            { transform: 'none' },
          ]),
          opciones,
        ),
      );
    }
    return Promise.all(animaciones.map((animacion) => animacion.finished));
  }
}

/** Mueve y escala (desde la esquina) lo que está en «hasta» para que quede justo encima de «desde». */
function sobre(desde: DOMRect, hasta: DOMRect): string {
  const escalaX = desde.width / hasta.width;
  const escalaY = desde.height / hasta.height;
  return `translate(${desde.left - hasta.left}px, ${desde.top - hasta.top}px) scale(${escalaX}, ${escalaY})`;
}
