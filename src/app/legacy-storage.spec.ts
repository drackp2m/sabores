import { legacyTheme, legacyView, translateSetting } from './legacy-storage';

describe('translateSetting', () => {
  it('brings over the filters, with their old values', () => {
    const filters = {
      texto: 'queso',
      dia: 'friday',
      desde: '12:00',
      hasta: '',
      sinGluten: 'optional',
      bebida: 'Cerveza',
      rutaDeSabor: true,
      favoritos: false,
      probadas: 'pendientes',
    };
    expect(translateSetting('filtros', filters)).toEqual([
      'filters',
      {
        text: 'queso',
        day: 'friday',
        from: '12:00',
        to: '',
        glutenFree: 'optional',
        drink: 'Cerveza',
        flavorRoute: true,
        favorites: false,
        tried: 'pending',
      },
    ]);
  });

  it('keeps filters saved before some of them existed partial, for the app to complete', () => {
    expect(translateSetting('filtros', { texto: 'a', probadas: '' })).toEqual([
      'filters',
      { text: 'a', tried: '' },
    ]);
  });

  it('translates the values of the other settings', () => {
    expect(translateSetting('orden', 'cercania')).toEqual(['sort', 'nearest']);
    expect(translateSetting('orden', 'cierre')).toEqual(['sort', 'closing']);
    expect(translateSetting('orden', 'numero')).toEqual(['sort', 'number']);
    expect(translateSetting('vista', 'fotos')).toEqual(['view', 'photos']);
    expect(translateSetting('vista', 'detalles')).toEqual(['view', 'details']);
    expect(translateSetting('medio', 'pie')).toEqual(['travelMode', 'walking']);
    expect(translateSetting('medio', 'coche')).toEqual(['travelMode', 'driving']);
    expect(translateSetting('fuente', 'ubicacion')).toEqual(['source', 'geolocation']);
    expect(translateSetting('fuente', 'direccion')).toEqual(['source', 'address']);
  });

  it('keeps empty values as they are', () => {
    expect(translateSetting('medio', '')).toEqual(['travelMode', '']);
    expect(translateSetting('fuente', null)).toEqual(['source', null]);
  });

  it('brings over the last address', () => {
    expect(
      translateSetting('direccion', { lat: 39.9, lng: -0.04, etiqueta: 'Herrero 49' }),
    ).toEqual(['address', { lat: 39.9, lng: -0.04, label: 'Herrero 49' }]);
  });

  it('leaves alone what it doesn’t know', () => {
    expect(translateSetting('filters', {})).toBeUndefined();
  });
});

describe('legacy local storage', () => {
  beforeEach(() => localStorage.clear());

  it('reads the chosen theme', () => {
    expect(legacyTheme()).toBeNull();
    localStorage.setItem('ruta-tapas:tema', 'oscuro');
    expect(legacyTheme()).toBe('dark');
    localStorage.setItem('ruta-tapas:tema', 'claro');
    expect(legacyTheme()).toBe('light');
    localStorage.setItem('ruta-tapas:tema', 'sistema');
    expect(legacyTheme()).toBeNull();
  });

  it('reads the chosen view', () => {
    expect(legacyView()).toBe('details');
    localStorage.setItem('ruta-tapas:vista', 'fotos');
    expect(legacyView()).toBe('photos');
  });
});
