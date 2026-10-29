import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { catchError, map, of } from 'rxjs';

import { Galeria } from './galeria/galeria';
import { Icono, NombreIcono } from './icono/icono';
import { LocalCard } from './local-card/local-card';
import {
  DIAS,
  DatosRuta,
  Dia,
  Filtros,
  Llegada,
  claveCierre,
  diaDe,
  estadoHorario,
  filtrarLocales,
  llegadaDesde,
  ordenarBebidas,
  ordenarPor,
  tiposDeBebida,
} from './locales';
import { Mapa } from './mapa/mapa';
import { OrigenPanel } from './origen/origen';
import { Sello } from './sello/sello';
import { Tema, Temas } from './tema';
import { Visor, VisorFotos } from './visor/visor';
import { Ubicacion } from './ubicacion';

type Vista = 'detalles' | 'fotos';
type Orden = 'numero' | 'cercania' | 'cierre';

/** Igual que en app.scss: lista a la izquierda y mapa a la derecha. */
const ESCRITORIO = '(min-width: 960px)';
/** Igual que en styles.scss: en pantallas táctiles hace scroll app-root; en el resto, el documento. */
const TACTIL = '(hover: none) and (pointer: coarse)';
const CLAVE_VISTA = 'ruta-tapas:vista';

const TEMAS: readonly { tema: Tema; nombre: string; icono: NombreIcono }[] = [
  { tema: 'claro', nombre: 'Claro', icono: 'sol' },
  { tema: 'oscuro', nombre: 'Oscuro', icono: 'luna' },
  { tema: 'sistema', nombre: 'Sistema', icono: 'sistema' },
];

@Component({
  selector: 'app-root',
  imports: [FormsModule, Galeria, Icono, LocalCard, Mapa, OrigenPanel, Sello, VisorFotos],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '(window:popstate)': 'alNavegar($event)',
    // Safari en iOS ignora user-scalable=no: el pellizco para hacer zoom se bloquea aquí.
    '(document:gesturestart)': '$event.preventDefault()',
    '(document:keydown.escape)': 'menuAbierto.set(false)',
    '(document:click)': 'cerrarMenuFuera($event)',
  },
})
export class App {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly ubicacion = inject(Ubicacion);
  protected readonly tema = inject(Temas);
  private readonly visor = inject(Visor);
  protected readonly dias = DIAS;
  protected readonly temas = TEMAS;

  protected readonly menuAbierto = signal(false);
  /** El botón de subir, cuando ya no se ve el mapa (en la vista de fotos, el principio de la galería). */
  protected readonly verSubir = signal(false);

  /** undefined mientras carga; null si no se ha podido cargar. */
  protected readonly datos = toSignal(
    inject(HttpClient)
      .get<DatosRuta>('data/locales.json')
      .pipe(
        map((datos): DatosRuta => ({ ...datos, locales: ordenarBebidas(datos.locales) })),
        catchError(() => of(null)),
      ),
  );

  protected readonly texto = signal('');
  protected readonly dia = signal<Dia | ''>('');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly sinGluten = signal<Filtros['sinGluten']>('');
  protected readonly bebida = signal('');
  protected readonly rutaDeSabor = signal(false);

  protected readonly orden = signal<Orden>('numero');
  protected readonly vista = signal<Vista>(leerVista());
  /** Local abierto desde la vista de fotos. */
  protected readonly detalle = signal<number | null>(null);
  /** Local cuyo marcador se acaba de pinchar, para resaltarlo en la lista. */
  protected readonly destacado = signal<number | null>(null);
  protected readonly ahora = signal(new Date());

  protected readonly bebidas = computed(() => tiposDeBebida(this.datos()?.locales ?? []));

  protected readonly filtrados = computed(() =>
    filtrarLocales(this.datos()?.locales ?? [], {
      texto: this.texto(),
      dia: this.dia(),
      desde: this.desde(),
      hasta: this.hasta(),
      sinGluten: this.sinGluten(),
      bebida: this.bebida(),
      rutaDeSabor: this.rutaDeSabor(),
    }),
  );

  /** Estado del horario de cada local ahora mismo. */
  protected readonly estados = computed(() => {
    const datos = this.datos();
    const ahora = this.ahora();
    return new Map(
      (datos?.locales ?? []).map((l) => [l.number, estadoHorario(l.schedule, ahora, datos!.event)]),
    );
  });

  /** Tiempo de llegada a cada local desde el punto de partida. */
  protected readonly llegadas = computed(() => {
    const origen = this.ubicacion.origen();
    const medio = this.ubicacion.medio() || undefined;
    const llegadas = new Map<number, Llegada>();
    for (const local of origen ? (this.datos()?.locales ?? []) : []) {
      if (local.location) llegadas.set(local.number, llegadaDesde(origen!, local.location, medio));
    }
    return llegadas;
  });

  protected readonly visibles = computed(() => {
    const locales = this.filtrados();
    switch (this.orden()) {
      case 'cercania': {
        const llegadas = this.llegadas();
        return llegadas.size
          ? ordenarPor(locales, (l) => llegadas.get(l.number)?.metros ?? Infinity)
          : locales;
      }
      case 'cierre': {
        const estados = this.estados();
        return ordenarPor(locales, (l) => claveCierre(estados.get(l.number)!));
      }
      default:
        return locales;
    }
  });

  protected readonly localDetalle = computed(() =>
    this.datos()?.locales.find((l) => l.number === this.detalle()),
  );
  protected readonly soloDetalle = computed(() => {
    const local = this.localDetalle();
    return local ? [local] : [];
  });

  /** Scroll de la galería al abrir un local, para dejarla igual al volver. */
  private posicionGaleria = 0;

  constructor() {
    const reloj = setInterval(() => this.ahora.set(new Date()), 30_000);
    this.destroyRef.onDestroy(() => clearInterval(reloj));

    // A mano y pasivo: con un listener de Angular, cada evento de scroll repasaría toda la vista. En
    // los dos sitios que pueden hacer scroll: app-root o el documento.
    afterNextRender(() => {
      const alHacerScroll = () => this.verSubir.set(this.pasadoElMapa());
      for (const objetivo of [this.host, window]) {
        objetivo.addEventListener('scroll', alHacerScroll, { passive: true });
        this.destroyRef.onDestroy(() => objetivo.removeEventListener('scroll', alHacerScroll));
      }
    });
  }

  /** Lo que hace scroll: app-root en pantallas táctiles, el documento en el resto (ver styles.scss). */
  private get desplazador(): Element {
    if (globalThis.matchMedia?.(TACTIL).matches) return this.host;
    return document.scrollingElement ?? document.documentElement;
  }

  /**
   * Si el principio de los resultados y el mapa (en el móvil va encima de la lista; en escritorio,
   * a su lado, así que hay que bajar lo que mide) han quedado por encima de la cabecera.
   */
  private pasadoElMapa(): boolean {
    const resultados = this.host.querySelector<HTMLElement>('.resultados, app-galeria');
    if (!resultados || this.detalle() !== null) return false;
    const mapa = resultados.querySelector<HTMLElement>('app-mapa');
    const final = resultados.getBoundingClientRect().top + (mapa?.offsetHeight ?? 0);
    return final < this.host.querySelector('.cabecera')!.getBoundingClientRect().bottom;
  }

  protected subir(): void {
    const suave = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.desplazador.scrollTo({ top: 0, behavior: suave ? 'smooth' : 'auto' });
  }

  /** Al abrir el menú, si hay una foto ampliada, se cierra (la cabecera queda por encima de ella). */
  protected alternarMenu(): void {
    const abrir = !this.menuAbierto();
    this.menuAbierto.set(abrir);
    if (abrir) this.visor.cerrar();
  }

  /** Pinchar fuera del menú lo cierra (el botón del menú ya lo abre y cierra por su cuenta). */
  protected cerrarMenuFuera(evento: MouseEvent): void {
    const objetivo = evento.target as Element | null;
    if (objetivo?.closest('.menu, .boton-menu')) return;
    this.menuAbierto.set(false);
  }

  /** Locales que sirven tapas ahora mismo. */
  protected abiertoAhora(): void {
    const fecha = new Date();
    this.dia.set(diaDe(fecha));
    this.desde.set(fecha.toTimeString().slice(0, 5));
    this.hasta.set('');
  }

  protected limpiar(): void {
    this.texto.set('');
    this.dia.set('');
    this.desde.set('');
    this.hasta.set('');
    this.sinGluten.set('');
    this.bebida.set('');
    this.rutaDeSabor.set(false);
  }

  /** Para ordenar por cercanía hace falta un punto de partida: si no lo hay, pide la ubicación. */
  protected ordenar(orden: Orden): void {
    this.orden.set(orden);
    if (orden === 'cercania' && !this.ubicacion.origen()) this.ubicacion.usarMiUbicacion();
  }

  protected cambiarVista(vista: Vista): void {
    this.menuAbierto.set(false);
    if (this.detalle() !== null) history.back();
    else if (vista !== this.vista()) this.desplazador.scrollTo({ top: 0 });
    this.vista.set(vista);
    guardarVista(vista);
  }

  /** En escritorio, al pinchar un marcador lleva la lista hasta su ficha. */
  protected mostrarEnLista(numero: number): void {
    if (!matchMedia(ESCRITORIO).matches) return;
    document
      .getElementById(`local-${numero}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.destacado.set(numero);
    setTimeout(() => this.destacado.update((n) => (n === numero ? null : n)), 1600);
  }

  /** Abre un local en una entrada nueva del historial: el botón «atrás» del navegador vuelve a la galería. */
  protected abrir(numero: number): void {
    this.posicionGaleria = this.desplazador.scrollTop;
    history.pushState({ local: numero }, '');
    this.detalle.set(numero);
    this.desplazador.scrollTo({ top: 0 });
  }

  protected volver(): void {
    history.back();
  }

  protected alNavegar(event: PopStateEvent): void {
    const numero = (event.state as { local?: number } | null)?.local ?? null;
    this.detalle.set(numero);
    const top = numero === null && this.vista() === 'fotos' ? this.posicionGaleria : 0;
    afterNextRender(() => this.desplazador.scrollTo({ top }), { injector: this.injector });
  }
}

function leerVista(): Vista {
  try {
    return localStorage.getItem(CLAVE_VISTA) === 'fotos' ? 'fotos' : 'detalles';
  } catch {
    return 'detalles';
  }
}

function guardarVista(vista: Vista): void {
  try {
    localStorage.setItem(CLAVE_VISTA, vista);
  } catch {
    // Sin almacenamiento (modo privado…): se queda solo para esta visita.
  }
}
