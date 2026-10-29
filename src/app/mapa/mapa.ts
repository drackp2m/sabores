import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';

import { crearIcono } from '../icono/icono';
import { Coordenadas, Estado, Llegada, Local, formatearDuracion, pastillaEstado } from '../locales';

const CASTELLON: L.LatLngExpression = [39.986, -0.037];

/**
 * Pantalla táctil (sin ratón): un dedo hace scroll de la página y el mapa se mueve con dos, al
 * pellizcar (Leaflet desplaza el mapa con el punto medio entre los dedos mientras hace zoom).
 */
const TACTIL = globalThis.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false;

/** Mapa de OpenStreetMap con un marcador por local; se ajusta a los locales filtrados. */
@Component({
  selector: 'app-mapa',
  template: `
    <div #contenedor class="contenedor" (touchmove)="avisar($event)"></div>
    <p class="aviso" [class.visible]="aviso()" aria-hidden="true">
      Usa dos dedos para mover el mapa
    </p>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
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
  /** Número del local cuyo marcador se ha pinchado. */
  readonly seleccionar = output<number>();

  private readonly contenedor = viewChild.required<ElementRef<HTMLElement>>('contenedor');
  private readonly mapa = signal<L.Map | undefined>(undefined);
  protected readonly aviso = signal(false);
  private ocultarAviso?: ReturnType<typeof setTimeout>;
  private readonly capa = new L.FeatureGroup();
  private readonly marcadores = new Map<number, L.CircleMarker>();
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
      this.capa.addTo(mapa);
      this.mapa.set(mapa);
    });

    inject(DestroyRef).onDestroy(() => {
      this.mapa()?.remove();
      clearTimeout(this.ocultarAviso);
    });

    effect(() => {
      const mapa = this.mapa();
      if (mapa) this.pintar(mapa, this.locales());
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
    if (!TACTIL || evento.touches.length !== 1) return;
    this.aviso.set(true);
    clearTimeout(this.ocultarAviso);
    this.ocultarAviso = setTimeout(() => this.aviso.set(false), 1200);
  }

  private pintar(mapa: L.Map, locales: readonly Local[]): void {
    this.capa.clearLayers();
    this.marcadores.clear();
    for (const local of locales) {
      if (!local.location) continue;
      const marcador = new L.CircleMarker([local.location.lat, local.location.lng], {
        radius: 9,
        color: '#fff',
        weight: 2,
        fillColor: '#b4441b',
        fillOpacity: 0.9,
      })
        // El contenido se genera al abrirlo, con el estado del horario de ese momento.
        .bindPopup(() => this.popup(local), { minWidth: 240, maxWidth: 240 })
        .on('click', () => this.seleccionar.emit(local.number))
        .on('mouseover', () => marcador.bringToFront());
      marcador.addTo(this.capa);
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
