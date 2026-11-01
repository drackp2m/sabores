import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';

import { Estado, Local } from '../locales';
import { Mapa } from './mapa';

// jsdom no tiene ResizeObserver ni scrollIntoView (enfocar).
globalThis.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;
Element.prototype.scrollIntoView ??= () => {};

function local(number: number): Local {
  return {
    number,
    name: `LOCAL ${number}`,
    subtitle: null,
    address: 'C/ MAYOR, 1',
    phone: null,
    instagram: null,
    drinks: [],
    notes: [],
    schedule: {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      saturday: [],
      sunday: [],
    },
    tapas: [],
    location: { lat: 39.98 + number / 1000, lng: -0.04 },
  };
}

const [UNO, DOS, TRES] = [1, 2, 3].map(local);

describe('Mapa', () => {
  // En jsdom el mapa no tiene tamaño: solo se cuenta cuántas veces se encuadra.
  let encuadrar: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    encuadrar = vi.spyOn(L.Map.prototype, 'fitBounds').mockReturnThis();
  });
  afterEach(() => encuadrar.mockRestore());

  async function crear(locales: Local[]) {
    const fixture = TestBed.createComponent(Mapa);
    fixture.componentRef.setInput('locales', locales);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const cambiar = async (nombre: string, valor: unknown) => {
      fixture.componentRef.setInput(nombre, valor);
      await fixture.whenStable();
    };
    const marcador = (numero: number) =>
      el.querySelector<HTMLElement>(`.leaflet-marker-icon[title^="${numero}."]`);
    return { fixture, el, cambiar, marcador };
  }

  it('con los mismos locales en otro orden no vuelve a crear los marcadores ni encuadra', async () => {
    const { cambiar, marcador } = await crear([UNO, DOS, TRES]);
    expect(encuadrar).toHaveBeenCalledTimes(1);
    const antes = [1, 2, 3].map(marcador);

    await cambiar('locales', [TRES, UNO, DOS]);
    await cambiar('locales', [UNO, DOS, TRES]);
    expect(encuadrar).toHaveBeenCalledTimes(1);
    [1, 2, 3].forEach((numero, i) => expect(marcador(numero)).toBe(antes[i]));
  });

  it('al filtrar, quita y añade solo los que cambian y vuelve a encuadrar', async () => {
    const { el, cambiar, marcador } = await crear([UNO, DOS]);
    const dos = marcador(2);

    await cambiar('locales', [DOS, TRES]);
    expect(encuadrar).toHaveBeenCalledTimes(2);
    expect(marcador(1)).toBeNull();
    expect(marcador(2)).toBe(dos);
    expect(marcador(3)).not.toBeNull();
    expect(el.querySelectorAll('.leaflet-marker-icon').length).toBe(2);
  });

  it('el popup abierto sigue abierto mientras su local siga en el mapa', async () => {
    const { fixture, el, cambiar } = await crear([UNO, DOS, TRES]);
    fixture.componentInstance.enfocar(2);
    await fixture.whenStable();
    const popup = () => el.querySelector('.leaflet-popup strong')?.textContent;
    expect(popup()).toBe('2. LOCAL 2');

    await cambiar('locales', [TRES, DOS, UNO]);
    expect(popup()).toBe('2. LOCAL 2');
    await cambiar('locales', [UNO, TRES]);
    expect(popup()).toBeUndefined();
  });

  it('pinta cada marcador del color de su estado, también los que se añaden', async () => {
    const abierto: Estado = { abierto: true, minutos: 120 };
    const pronto: Estado = { abierto: true, minutos: 20 };
    const cerrado: Estado = { abierto: false, minutos: 60 };
    /** El del local 1, el del 2… */
    const estados = (...lista: Estado[]) => new Map(lista.map((estado, i) => [i + 1, estado]));
    const { cambiar, marcador } = await crear([UNO]);
    await cambiar('estados', estados(abierto, cerrado));
    expect(marcador(1)!.classList).toContain('abierto');

    await cambiar('locales', [UNO, DOS]);
    expect(marcador(2)!.classList).toContain('cerrado');
    await cambiar('estados', estados(pronto, cerrado));
    expect(marcador(1)!.classList).toContain('pronto');
    expect(marcador(1)!.classList).not.toContain('abierto');
    expect(encuadrar).toHaveBeenCalledTimes(2);
  });
});
