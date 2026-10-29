import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';

import { Icono, crearIcono } from '../icono/icono';
import { Coordenadas, Estado, Llegada, Local, formatearDuracion, pastillaEstado } from '../locales';
import { buscarCamino, enlaceComoLlegar } from '../ruta';

const CASTELLON: L.LatLngExpression = [39.986, -0.037];

/**
 * Pantalla táctil (sin ratón): un dedo hace scroll de la página y el mapa se mueve con dos, al
 * pellizcar (Leaflet desplaza el mapa con el punto medio entre los dedos mientras hace zoom).
 */
const TACTIL = globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;

/**
 * Marcador de un local: un punto pequeño (styles.scss) en el centro de una zona de 1,875rem para
 * pincharlo. En rem, como el resto; Leaflet lo quiere en píxeles, así que se calcula al pintar.
 */
function iconoLocal(rem: number): L.DivIcon {
  const lado = Math.round(1.875 * rem);
  return new L.DivIcon({
    className: 'marcador-local',
    iconSize: [lado, lado],
    popupAnchor: [0, -Math.round(0.35 * rem)],
  });
}

/** Píxeles de 1rem (menos en pantallas estrechas, ver styles.scss). */
function remEnPx(): number {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * Mapa de OpenStreetMap con un marcador por local; se ajusta a los locales filtrados. Con punto de
 * partida, dibuja el camino hasta el local elegido (o el seleccionado en el mapa, que se resalta).
 * Se puede ampliar a toda la pantalla y abrir el local en la app de mapas.
 */
@Component({
  selector: 'app-mapa',
  imports: [Icono],
  template: `
    <div class="marco" [class.grande]="grande()">
      <div #contenedor class="contenedor" (touchmove)="avisar($event)"></div>
      <div class="botones">
        <button
          type="button"
          class="secundario icono ampliar"
          [title]="grande() ? 'Reducir el mapa' : 'Ampliar el mapa'"
          [attr.aria-label]="grande() ? 'Reducir el mapa' : 'Ampliar el mapa'"
          (click)="grande.set(!grande())"
        >
          <app-icono [nombre]="grande() ? 'reducir' : 'ampliar'" />
        </button>
        @if (enlaceExterno(); as enlace) {
          <a
            class="secundario icono"
            [href]="enlace"
            target="_blank"
            rel="noopener"
            title="Cómo llegar en la app de mapas"
            aria-label="Cómo llegar en la app de mapas"
          >
            <app-icono nombre="externo" />
          </a>
        }
      </div>
      <p class="aviso" [class.visible]="aviso()" aria-hidden="true">
        Usa dos dedos para mover el mapa
      </p>
    </div>
  `,
  host: { '(document:keydown.escape)': 'grande.set(false)' },
  styles: `
    :host {
      display: block;
    }

    // El hueco del mapa se queda en la página; al ampliarlo, solo el marco pasa a ocupar la pantalla.
    .marco {
      position: relative;
      height: 100%;

      // Solo en el móvil: en escritorio el mapa ya es grande, y al ir sticky (ver app.scss) quedaría
      // por debajo de la cabecera y del resto de la página.
      @media (max-width: 959.98px) {
        &.grande {
          position: fixed;
          inset: 0;
          z-index: 1150; // Por encima de la cabecera y de los botones flotantes.
          padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
            env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
          background: var(--fondo);

          .contenedor {
            border: 0;
            border-radius: 0;
          }
        }
      }
    }

    @media (min-width: 960px) {
      .ampliar {
        display: none;
      }
    }

    // Arriba a la derecha, como los controles de Leaflet (que están a la izquierda).
    .botones {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1000;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;

      .grande & {
        top: calc(10px + env(safe-area-inset-top, 0px));
        right: calc(10px + env(safe-area-inset-right, 0px));
      }

      .icono {
        width: 2.25rem;
        height: 2.25rem;
        box-shadow: 0 1px 5px rgb(0 0 0 / 0.25);
      }

      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--marca);
        border-radius: 0.5rem;
        background: var(--superficie);
        color: var(--marca);
        font-size: 1.1rem;

        &:hover {
          background: var(--acento-suave);
        }
      }
    }

    // Por encima de los controles de Leaflet, sin captar los toques.
    .aviso {
      position: absolute;
      inset: 0;
      z-index: 1000;
      display: grid;
      place-items: center;
      margin: 0;
      padding: 1rem;
      border-radius: var(--radio);
      background: rgb(0 0 0 / 0.45);
      color: #fff;
      font-weight: 600;
      text-align: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s;

      &.visible {
        opacity: 1;
      }
    }

    .contenedor {
      height: 100%;
      border: 1px solid var(--borde);
      border-radius: var(--radio);
    }
  `,
})
export class Mapa {
  readonly locales = input.required<readonly Local[]>();
  /** Punto de partida, si se ha elegido. */
  readonly origen = input<Coordenadas | null>(null);
  /** Estado del horario y tiempo de llegada a cada local, para el popup. */
  readonly estados = input<ReadonlyMap<number, Estado>>(new Map());
  readonly llegadas = input<ReadonlyMap<number, Llegada>>(new Map());
  readonly ahora = input(new Date());
  /** Local al que dibujar siempre el camino (en la ficha); si no, el del popup abierto. */
  readonly rutaHacia = input<number | null>(null);
  /** Número del local cuyo marcador se ha pinchado. */
  readonly seleccionar = output<number>();

  /** A toda la pantalla. */
  protected readonly grande = signal(false);
  /**
   * Local seleccionado al abrir su popup. Al cerrarlo (con su botón o pinchando fuera) sigue
   * seleccionado, con su camino; pinchar fuera otra vez lo deselecciona.
   */
  private readonly seleccionado = signal<number | null>(null);
  /** Si al pinchar en el mapa había un popup abierto (ese clic solo lo cierra). */
  private habiaPopup = false;
  private readonly activo = computed(() => this.rutaHacia() ?? this.seleccionado());
  private readonly destino = computed(() => {
    const numero = this.activo();
    return this.locales().find((local) => local.number === numero && local.location);
  });

  protected readonly enlaceExterno = computed(() => {
    const local = this.destino();
    if (!local?.location) return null;
    return enlaceComoLlegar(local.location, local.name, this.llegadas().get(local.number)?.modo);
  });

  private readonly contenedor = viewChild.required<ElementRef<HTMLElement>>('contenedor');
  private readonly mapa = signal<L.Map | undefined>(undefined);
  protected readonly aviso = signal(false);
  private ocultarAviso?: ReturnType<typeof setTimeout>;
  private readonly capa = new L.FeatureGroup();
  private readonly capaCamino = new L.FeatureGroup();
  private readonly marcadores = new Map<number, L.Marker>();
  private readonly marcadorOrigen = new L.CircleMarker(CASTELLON, {
    radius: 7,
    color: '#fff',
    weight: 3,
    fillColor: '#2563eb',
    fillOpacity: 1,
  }).bindTooltip('Punto de partida');

  constructor() {
    afterNextRender(() => {
      // Sin zoom con la rueda: al hacer scroll por la página, pasar por encima del mapa no lo mueve.
      const mapa = new L.Map(this.contenedor().nativeElement, {
        center: CASTELLON,
        zoom: 14,
        scrollWheelZoom: false,
        dragging: !TACTIL,
      });
      new L.TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapa);
      // El camino, por debajo de los marcadores.
      mapa.createPane('camino').style.zIndex = '350';
      // Antes de que el popup se cierre con el mismo clic (también en preclick, pero se registra
      // después).
      mapa.on(
        'preclick',
        () => (this.habiaPopup = !!mapa.getContainer().querySelector('.leaflet-popup')),
      );
      mapa.on('click', () => {
        if (!this.habiaPopup) this.seleccionado.set(null);
      });
      this.capaCamino.addTo(mapa);
      this.capa.addTo(mapa);
      this.mapa.set(mapa);
    });

    // Al ampliar o reducir, Leaflet tiene que volver a medir; ampliado, se mueve con un dedo (no hay
    // página que desplazar).
    afterRenderEffect(() => {
      const mapa = this.mapa();
      const grande = this.grande();
      if (!mapa) return;
      mapa.invalidateSize();
      if (grande || !TACTIL) mapa.dragging.enable();
      else mapa.dragging.disable();
    });

    // Camino por calles hasta el local, con el mismo medio (a pie o en coche) que el tiempo de llegada.
    effect((onCleanup) => {
      const mapa = this.mapa();
      const origen = this.origen();
      const local = this.destino();
      const llegada = local && this.llegadas().get(local.number);
      const fijo = this.rutaHacia() !== null;
      this.capaCamino.clearLayers();
      if (!mapa || !origen || !local?.location || !llegada) return;
      let vigente = true;
      onCleanup(() => (vigente = false));
      void buscarCamino(origen, local.location, llegada.modo).then((camino) => {
        if (!vigente || !camino) return;
        const linea = new L.Polyline(camino, {
          pane: 'camino',
          color: '#2563eb',
          weight: 5,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round',
          // A pie, punteado; en coche, continuo.
          dashArray: llegada.modo === 'pie' ? '1 9' : undefined,
          interactive: false,
        }).addTo(this.capaCamino);
        // En la ficha, que se vea el camino entero; con un popup abierto no se mueve el mapa.
        if (fijo) {
          mapa.fitBounds(linea.getBounds().extend([origen.lat, origen.lng]), {
            padding: [30, 30],
            maxZoom: 17,
          });
        }
      });
    });

    inject(DestroyRef).onDestroy(() => {
      this.mapa()?.remove();
      clearTimeout(this.ocultarAviso);
    });

    effect(() => {
      const mapa = this.mapa();
      const locales = this.locales();
      if (mapa) untracked(() => this.pintar(mapa, locales));
    });

    // El activo, dorado (como las estrellas) y por encima de los demás.
    effect(() => {
      const activo = this.activo();
      this.mapa(); // Tras pintar los marcadores.
      for (const [numero, marcador] of this.marcadores) {
        marcador.getElement()?.classList.toggle('activo', numero === activo);
        marcador.setZIndexOffset(numero === activo ? 1000 : 0);
      }
    });

    effect(() => {
      const mapa = this.mapa();
      const origen = this.origen();
      if (!mapa) return;
      if (origen) this.marcadorOrigen.setLatLng([origen.lat, origen.lng]).addTo(mapa);
      else this.marcadorOrigen.remove();
    });
  }

  /** Centra el mapa en un local y abre su ficha. */
  enfocar(numero: number): void {
    const mapa = this.mapa();
    const marcador = this.marcadores.get(numero);
    if (!mapa || !marcador) return;
    this.contenedor().nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    mapa.setView(marcador.getLatLng(), 17);
    marcador.openPopup();
  }

  /** Al intentar mover el mapa con un dedo, recuerda que son dos (y la página sigue haciendo scroll). */
  protected avisar(evento: TouchEvent): void {
    if (!TACTIL || this.grande() || evento.touches.length !== 1) return;
    this.aviso.set(true);
    clearTimeout(this.ocultarAviso);
    this.ocultarAviso = setTimeout(() => this.aviso.set(false), 1200);
  }

  private pintar(mapa: L.Map, locales: readonly Local[]): void {
    this.capa.clearLayers();
    this.marcadores.clear();
    // Si el seleccionado ya no está entre los filtrados, deja de estarlo.
    const seleccionado = this.seleccionado();
    if (!locales.some((l) => l.number === seleccionado && l.location)) this.seleccionado.set(null);
    const rem = remEnPx();
    const icono = iconoLocal(rem);
    const anchoPopup = Math.round(15 * rem);
    for (const local of locales) {
      if (!local.location) continue;
      const marcador = new L.Marker([local.location.lat, local.location.lng], {
        icon: icono,
        title: `${local.number}. ${local.name}`,
        riseOnHover: true,
      })
        // El contenido se genera al abrirlo, con el estado del horario de ese momento.
        .bindPopup(() => this.popup(local), { minWidth: anchoPopup, maxWidth: anchoPopup })
        .on('click', () => this.seleccionar.emit(local.number))
        .on('popupopen', () => this.seleccionado.set(local.number));
      marcador.addTo(this.capa);
      if (local.number === this.activo()) marcador.getElement()?.classList.add('activo');
      this.marcadores.set(local.number, marcador);
    }
    if (this.marcadores.size) {
      mapa.fitBounds(this.capa.getBounds(), { padding: [30, 30], maxZoom: 16 });
    }
  }

  /**
   * Nombre, dirección, tiempo de llegada, estado del horario y fotos de las tapas (estilos en
   * styles.scss: Leaflet lo pinta fuera del componente).
   */
  private popup(local: Local): HTMLElement {
    const div = document.createElement('div');
    div.className = 'popup-local';
    const titulo = document.createElement('strong');
    titulo.textContent = `${local.number}. ${local.name}`;
    const direccion = document.createElement('span');
    direccion.textContent = local.address;
    div.append(titulo, direccion);
    const fila = document.createElement('div');
    fila.className = 'popup-estado';
    const llegada = this.llegadas().get(local.number);
    if (llegada) {
      const tiempo = document.createElement('span');
      tiempo.className = 'popup-llegada';
      tiempo.append(crearIcono(llegada.modo), formatearDuracion(llegada.minutos));
      fila.append(tiempo);
    }
    const estado = this.estados().get(local.number);
    if (estado) {
      const { texto, tipo, aviso } = pastillaEstado(estado, this.ahora(), llegada);
      const pastilla = document.createElement('span');
      pastilla.className = `estado-horario ${tipo}`;
      pastilla.textContent = texto;
      if (aviso) pastilla.title = aviso;
      fila.append(pastilla);
    }
    if (fila.childElementCount) div.append(fila);
    const tapas = document.createElement('div');
    tapas.className = 'popup-tapas';
    for (const tapa of local.tapas) {
      const figura = document.createElement('figure');
      const img = document.createElement('img');
      img.src = `data/${tapa.photo}`;
      img.alt = '';
      img.width = 690;
      img.height = 439;
      const nombre = document.createElement('figcaption');
      nombre.textContent = tapa.name;
      figura.append(img, nombre);
      tapas.append(figura);
    }
    div.append(tapas);
    return div;
  }
}
