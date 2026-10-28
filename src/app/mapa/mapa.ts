import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import * as L from 'leaflet';

import { Local } from '../locales';

const CASTELLON: L.LatLngExpression = [39.986, -0.037];

/** Mapa de OpenStreetMap con un marcador por local; se ajusta a los locales filtrados. */
@Component({
  selector: 'app-mapa',
  template: '<div #contenedor class="contenedor"></div>',
  styles: `
    :host {
      display: block;
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

  private readonly contenedor = viewChild.required<ElementRef<HTMLElement>>('contenedor');
  private readonly mapa = signal<L.Map | undefined>(undefined);
  private readonly capa = new L.FeatureGroup();
  private readonly marcadores = new Map<number, L.CircleMarker>();

  constructor() {
    afterNextRender(() => {
      const mapa = new L.Map(this.contenedor().nativeElement, { center: CASTELLON, zoom: 14 });
      new L.TileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapa);
      this.capa.addTo(mapa);
      this.mapa.set(mapa);
    });

    inject(DestroyRef).onDestroy(() => this.mapa()?.remove());

    effect(() => {
      const mapa = this.mapa();
      if (mapa) this.pintar(mapa, this.locales());
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
      }).bindPopup(popup(local));
      marcador.addTo(this.capa);
      this.marcadores.set(local.number, marcador);
    }
    if (this.marcadores.size) {
      mapa.fitBounds(this.capa.getBounds(), { padding: [30, 30], maxZoom: 16 });
    }
  }
}

function popup(local: Local): HTMLElement {
  const div = document.createElement('div');
  const titulo = document.createElement('strong');
  titulo.textContent = `${local.number}. ${local.name}`;
  div.append(titulo, document.createElement('br'), local.address);
  for (const tapa of local.tapas) {
    div.append(document.createElement('br'), `· ${tapa.name}`);
  }
  return div;
}
